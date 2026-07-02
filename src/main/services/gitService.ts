import { simpleGit, SimpleGit } from 'simple-git'
import { promises as fs } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'
import { parseUnifiedDiff } from './diffParser'
import type {
  RepoInfo,
  Commit,
  CommitRef,
  RepoStatus,
  FileChange,
  Branch,
  Remote,
  Stash,
  Tag,
  DiffFile,
  CommitOptions,
  CloneOptions,
  PushOptions,
  MergeState,
  MergeOperation,
  UndoInfo,
  RebaseCommit,
  RebaseTodoItem
} from '@shared/types'

const FIELD = '\x1f'
const RECORD = '\x1e'
// Emit whole files (all context) in diffs so the editor shows the full code
// with the changes highlighted, not just the changed hunks.
const FULL_CONTEXT = '-U100000'

/** Caches one SimpleGit instance per repository path. */
const cache = new Map<string, SimpleGit>()

function git(repoPath: string): SimpleGit {
  let g = cache.get(repoPath)
  if (!g) {
    g = simpleGit(repoPath, { binary: 'git', maxConcurrentProcesses: 4 })
    cache.set(repoPath, g)
  }
  return g
}

function parseRefs(raw: string, remoteNames: Set<string>): CommitRef[] {
  if (!raw.trim()) return []
  const refs: CommitRef[] = []
  for (const token of raw.split(',').map((t) => t.trim())) {
    if (!token) continue
    if (token.startsWith('HEAD -> ')) {
      refs.push({ name: token.slice(8), type: 'head' })
      refs.push({ name: 'HEAD', type: 'HEAD' })
    } else if (token === 'HEAD') {
      refs.push({ name: 'HEAD', type: 'HEAD' })
    } else if (token.startsWith('tag: ')) {
      refs.push({ name: token.slice(5), type: 'tag' })
    } else if (token === 'refs/stash' || token === 'stash') {
      refs.push({ name: 'stash', type: 'stash' })
    } else if (token.includes('/') && remoteNames.has(token.slice(0, token.indexOf('/')))) {
      // A slash alone doesn't mean remote — local branches can be named
      // "feature/x". It's remote only when the first segment is a real remote.
      refs.push({ name: token, type: 'remote' })
    } else {
      refs.push({ name: token, type: 'head' })
    }
  }
  return refs
}

/**
 * Turn a git remote URL into a browsable https base URL, or null if it can't be
 * mapped. Handles scp-like (git@host:owner/repo.git), ssh:// and git:// forms,
 * strips any embedded credentials and the trailing ".git".
 */
export function toWebUrl(remote: string): string | null {
  let u = remote.trim()
  if (!u) return null
  const scp = u.match(/^[^@]+@([^:/]+):(.+)$/) // git@host:owner/repo(.git)
  if (scp) {
    u = `https://${scp[1]}/${scp[2]}`
  } else if (u.startsWith('ssh://')) {
    u = 'https://' + u.slice('ssh://'.length)
  } else if (u.startsWith('git://')) {
    u = 'https://' + u.slice('git://'.length)
  }
  if (!/^https?:\/\//.test(u)) return null
  u = u.replace(/:\/\/[^/@]+@/, '://') // drop user[:pass]@ credentials
  u = u.replace(/\.git$/, '').replace(/\/+$/, '')
  return u
}

function kindFromStatus(index: string, workingDir: string): FileChange['kind'] {
  if (index === '?' || workingDir === '?') return 'untracked'
  const c = index !== ' ' && index !== '' ? index : workingDir
  switch (c) {
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'U':
      return 'conflicted'
    default:
      return 'modified'
  }
}

export const gitService = {
  async isRepo(repoPath: string): Promise<boolean> {
    try {
      return await git(repoPath).checkIsRepo()
    } catch {
      return false
    }
  },

  async openRepo(repoPath: string): Promise<RepoInfo> {
    const g = git(repoPath)
    const isRepo = await g.checkIsRepo()
    if (!isRepo) throw new Error('The selected folder is not a Git repository.')
    let currentBranch = ''
    let isDetached = false
    try {
      currentBranch = (await g.revparse(['--abbrev-ref', 'HEAD'])).trim()
      if (currentBranch === 'HEAD') {
        isDetached = true
        currentBranch = (await g.revparse(['--short', 'HEAD'])).trim()
      }
    } catch {
      currentBranch = '(no commits)'
    }
    return { path: repoPath, name: basename(repoPath), currentBranch, isDetached }
  },

  async cloneRepo(opts: CloneOptions): Promise<string> {
    const target = join(opts.directory, deriveRepoName(opts.url))
    await simpleGit().clone(opts.url, target)
    return target
  },

  async initRepo(repoPath: string): Promise<RepoInfo> {
    await simpleGit(repoPath).init()
    return this.openRepo(repoPath)
  },

  /**
   * Search history for commits whose changed file names contain the query.
   * (Message/author/hash/ref-name matching is done cheaply on the client from
   * already-loaded data.) Returns matching commit hashes.
   */
  async searchCommits(repoPath: string, query: string): Promise<string[]> {
    const q = query.trim()
    if (!q) return []
    const hashes = new Set<string>()

    // Changed file names: --name-only, filtered here (case-insensitive substring).
    try {
      const out = await git(repoPath).raw(['log', '--all', `--format=${RECORD}%H`, '--name-only'])
      const ql = q.toLowerCase()
      for (const block of out.split(RECORD)) {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
        if (lines.length === 0) continue
        const hash = lines[0]
        if (lines.slice(1).some((f) => f.toLowerCase().includes(ql))) hashes.add(hash)
      }
    } catch {
      /* ignore */
    }
    return [...hashes]
  },

  async getCommits(repoPath: string, limit = 500): Promise<Commit[]> {
    const format =
      ['%H', '%h', '%P', '%an', '%ae', '%aI', '%s', '%b', '%D'].join(FIELD) + RECORD

    // `git log --all` only reaches the most recent stash (refs/stash); older
    // stashes live in the stash reflog, which --all does not traverse. Pass every
    // stash commit hash explicitly so all of them appear in the graph.
    let stashShas: string[] = []
    try {
      const raw = await git(repoPath).raw(['stash', 'list', '--format=%H'])
      stashShas = raw.split('\n').map((s) => s.trim()).filter(Boolean)
    } catch {
      stashShas = []
    }
    const stashSet = new Set(stashShas)

    // Remote names, so a "<remote>/<branch>" ref is classified as remote while a
    // local branch that merely contains a slash (e.g. "feature/x") stays local.
    let remoteNames = new Set<string>()
    try {
      const raw = await git(repoPath).raw(['remote'])
      remoteNames = new Set(raw.split('\n').map((s) => s.trim()).filter(Boolean))
    } catch {
      remoteNames = new Set()
    }

    let out: string
    try {
      out = await git(repoPath).raw([
        'log',
        '--all',
        ...stashShas,
        '--date-order',
        `--pretty=format:${format}`,
        '-n',
        String(limit)
      ])
    } catch {
      return [] // empty repo / no commits yet
    }
    const commits: Commit[] = []
    for (const record of out.split(RECORD)) {
      const r = record.replace(/^\n/, '')
      if (!r.trim()) continue
      const f = r.split(FIELD)
      const refs = parseRefs(f[8] || '', remoteNames)
      // Only the top stash carries the refs/stash decoration; tag the rest too.
      if (stashSet.has(f[0]) && !refs.some((ref) => ref.type === 'stash')) {
        refs.push({ name: 'stash', type: 'stash' })
      }
      commits.push({
        hash: f[0],
        shortHash: f[1],
        parents: f[2].trim() ? f[2].trim().split(' ') : [],
        author: f[3],
        authorEmail: f[4],
        date: f[5],
        subject: f[6],
        body: (f[7] || '').trim(),
        refs,
        pushed: false
      })
    }
    // Mark commits reachable from any remote-tracking ref as "pushed".
    try {
      const remoteOut = await git(repoPath).raw(['rev-list', '--remotes'])
      const remote = new Set(
        remoteOut
          .split('\n')
          .map((h) => h.trim())
          .filter(Boolean)
      )
      for (const c of commits) c.pushed = remote.has(c.hash)
    } catch {
      // no remotes / no remote refs — everything stays unpushed
    }

    // Each stash commit carries two internal helper parents created by
    // `git stash`: "index on …" and "untracked files on …". Hide those and keep
    // only the WIP entry, trimming the stash commit down to its base parent so
    // the graph draws a single clean edge into real history.
    if (stashSet.size === 0) return commits
    const stashHelpers = new Set<string>()
    for (const c of commits) {
      if (stashSet.has(c.hash)) {
        for (const p of c.parents.slice(1)) stashHelpers.add(p)
      }
    }
    return commits
      .filter((c) => !stashHelpers.has(c.hash))
      .map((c) => (stashSet.has(c.hash) ? { ...c, parents: c.parents.slice(0, 1) } : c))
  },

  async getStatus(repoPath: string): Promise<RepoStatus> {
    const s = await git(repoPath).status()
    const staged: FileChange[] = []
    const unstaged: FileChange[] = []
    const conflictedSet = new Set(s.conflicted)

    for (const file of s.files) {
      const index = file.index || ' '
      const working = file.working_dir || ' '
      const isUntracked = index === '?' && working === '?'

      // Conflicted (unmerged) files are surfaced only via `conflicted` — never
      // as staged/unstaged — so they can't be staged until the conflict is
      // resolved through the merge editor.
      if (conflictedSet.has(file.path) || index === 'U' || working === 'U') continue

      if (isUntracked) {
        unstaged.push({
          path: file.path,
          index: '?',
          workingDir: '?',
          staged: false,
          kind: 'untracked'
        })
        continue
      }
      if (index !== ' ' && index !== '') {
        staged.push({
          path: file.path,
          index,
          workingDir: working,
          staged: true,
          kind: kindFromStatus(index, ' ')
        })
      }
      if (working !== ' ' && working !== '') {
        unstaged.push({
          path: file.path,
          index,
          workingDir: working,
          staged: false,
          kind: kindFromStatus(' ', working)
        })
      }
    }

    return {
      current: s.current || '',
      tracking: s.tracking || null,
      ahead: s.ahead,
      behind: s.behind,
      staged,
      unstaged,
      conflicted: s.conflicted,
      isClean: s.isClean()
    }
  },

  async getBranches(repoPath: string): Promise<Branch[]> {
    const fmt = [
      '%(refname)',
      '%(refname:short)',
      '%(objectname:short)',
      '%(upstream:short)',
      '%(upstream:track)',
      '%(HEAD)'
    ].join(FIELD)
    let out: string
    try {
      out = await git(repoPath).raw([
        'for-each-ref',
        `--format=${fmt}`,
        'refs/heads',
        'refs/remotes'
      ])
    } catch {
      return []
    }
    const branches: Branch[] = []
    for (const line of out.split('\n')) {
      if (!line.trim()) continue
      const [fullRef, name, commit, upstream, track, head] = line.split(FIELD)
      const isRemote = fullRef.startsWith('refs/remotes/')
      if (isRemote && name.endsWith('/HEAD')) continue // skip remote HEAD pointer
      let ahead = 0
      let behind = 0
      const m = track?.match(/ahead (\d+)/)
      const b = track?.match(/behind (\d+)/)
      if (m) ahead = parseInt(m[1], 10)
      if (b) behind = parseInt(b[1], 10)
      branches.push({
        name,
        current: head === '*',
        isRemote,
        upstream: upstream || null,
        ahead,
        behind,
        commit,
        label: name
      })
    }
    return branches
  },

  async getRemotes(repoPath: string): Promise<Remote[]> {
    const remotes = await git(repoPath).getRemotes(true)
    return remotes.map((r) => ({
      name: r.name,
      fetch: r.refs.fetch || '',
      push: r.refs.push || r.refs.fetch || ''
    }))
  },

  /** Browsable https base URL of `origin` (or the first remote), or null. */
  async remoteWebUrl(repoPath: string): Promise<string | null> {
    const remotes = await git(repoPath).getRemotes(true)
    if (remotes.length === 0) return null
    const chosen = remotes.find((r) => r.name === 'origin') ?? remotes[0]
    return toWebUrl(chosen.refs.fetch || chosen.refs.push || '')
  },

  async getStashes(repoPath: string): Promise<Stash[]> {
    let out: string
    try {
      out = await git(repoPath).raw(['stash', 'list', `--format=%gd${FIELD}%H${FIELD}%s`])
    } catch {
      return []
    }
    const stashes: Stash[] = []
    out
      .split('\n')
      .filter((l) => l.trim())
      .forEach((line, i) => {
        const [, hash, message] = line.split(FIELD)
        stashes.push({ index: i, hash: hash || '', message: message || line })
      })
    return stashes
  },

  async getTags(repoPath: string): Promise<Tag[]> {
    let out: string
    try {
      out = await git(repoPath).raw([
        'for-each-ref',
        `--format=%(refname:short)${FIELD}%(objectname)`,
        'refs/tags'
      ])
    } catch {
      return []
    }
    return out
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const [name, hash] = line.split(FIELD)
        return { name, hash }
      })
  },

  async getCommitDiff(repoPath: string, hash: string): Promise<DiffFile[]> {
    const g = git(repoPath)
    let parents: string[] = []
    try {
      const rev = (await g.raw(['rev-list', '--parents', '-n', '1', hash])).trim()
      parents = rev.split(' ').slice(1)
    } catch {
      parents = []
    }
    let patch: string
    if (parents.length === 0) {
      patch = await g.raw([
        'diff-tree',
        '-p',
        '-r',
        '--no-commit-id',
        '--root',
        '--no-color',
        '-M',
        FULL_CONTEXT,
        hash
      ])
    } else {
      // diff against first parent (handles normal & merge commits sensibly)
      patch = await g.raw(['diff', '--no-color', '-M', FULL_CONTEXT, `${parents[0]}`, hash])
    }
    return parseUnifiedDiff(patch)
  },

  async getWorkingDiff(
    repoPath: string,
    filePath: string,
    opts: { staged: boolean; untracked: boolean }
  ): Promise<DiffFile[]> {
    if (opts.untracked) {
      // Build an all-additions diff by reading the file directly.
      try {
        const content = await fs.readFile(join(repoPath, filePath), 'utf8')
        return [syntheticAddedFile(filePath, content)]
      } catch {
        return []
      }
    }
    const args = ['diff', '--no-color', '-M', FULL_CONTEXT]
    if (opts.staged) args.push('--cached')
    args.push('--', filePath)
    const patch = await git(repoPath).raw(args)
    return parseUnifiedDiff(patch)
  },

  // --- mutations -----------------------------------------------------------

  async stage(repoPath: string, files: string[]): Promise<void> {
    await git(repoPath).add(files)
  },

  async unstage(repoPath: string, files: string[]): Promise<void> {
    try {
      await git(repoPath).raw(['reset', 'HEAD', '--', ...files])
    } catch {
      // no HEAD yet (pre-initial-commit): un-add from index
      await git(repoPath).raw(['rm', '--cached', '-r', '--', ...files])
    }
  },

  async stageAll(repoPath: string): Promise<void> {
    await git(repoPath).raw(['add', '-A'])
  },

  async unstageAll(repoPath: string): Promise<void> {
    try {
      await git(repoPath).reset(['HEAD'])
    } catch {
      await git(repoPath).raw(['rm', '--cached', '-r', '.'])
    }
  },

  async discard(repoPath: string, file: FileChange): Promise<void> {
    if (file.kind === 'untracked') {
      await fs.rm(join(repoPath, file.path), { force: true })
    } else {
      await git(repoPath).checkout(['--', file.path])
    }
  },

  async commit(repoPath: string, opts: CommitOptions): Promise<void> {
    const options: Record<string, null> = {}
    if (opts.amend) options['--amend'] = null
    await git(repoPath).commit(opts.message, undefined, options)
  },

  /**
   * Reword the message of the current HEAD commit, message-only. `--amend`
   * keeps the original author (name/email/date); `--only` with an empty
   * pathspec keeps the commit's tree, so any staged changes are left untouched
   * (not folded into the commit). `--allow-empty` covers an empty HEAD commit.
   * No env overrides are needed, so simple-git's PAGER/EDITOR guards don't apply.
   */
  async rewordHead(repoPath: string, message: string): Promise<void> {
    await git(repoPath).raw(['commit', '--amend', '--only', '--allow-empty', '-m', message, '--'])
  },

  async push(repoPath: string, opts: PushOptions): Promise<string> {
    const args: string[] = ['push']
    if (opts.force) args.push('--force-with-lease')
    if (opts.setUpstream) args.push('--set-upstream')
    if (opts.remote) args.push(opts.remote)
    if (opts.branch) args.push(opts.branch)
    return git(repoPath).raw(args)
  },

  async pull(repoPath: string, remote?: string, branch?: string): Promise<string> {
    const res = await git(repoPath).pull(remote, branch)
    return JSON.stringify(res.summary)
  },

  /** Fetch + fast-forward only (fails if the branch has diverged; never merges). */
  async pullFastForward(repoPath: string): Promise<void> {
    await git(repoPath).raw(['pull', '--ff-only'])
  },

  async fetch(repoPath: string): Promise<void> {
    await git(repoPath).fetch(['--all', '--prune'])
  },

  async checkoutBranch(repoPath: string, name: string, isRemote = false): Promise<void> {
    // For a remote branch create/switch to a local tracking branch.
    if (isRemote) {
      const local = name.split('/').slice(1).join('/')
      try {
        await git(repoPath).checkout(['-b', local, '--track', name])
      } catch {
        await git(repoPath).checkout(local)
      }
      return
    }
    await git(repoPath).checkout(name)
  },

  async createBranch(repoPath: string, name: string, checkout: boolean): Promise<void> {
    if (checkout) await git(repoPath).checkoutLocalBranch(name)
    else await git(repoPath).branch([name])
  },

  async deleteBranch(repoPath: string, name: string, force: boolean): Promise<void> {
    await git(repoPath).deleteLocalBranch(name, force)
  },

  /** Rename a local branch. Purely local — the remote is left untouched. */
  async renameBranch(repoPath: string, oldName: string, newName: string): Promise<void> {
    await git(repoPath).raw(['branch', '-m', oldName, newName])
  },

  /** Delete a branch on its remote. `remoteRef` is like "origin/feature/x". */
  async deleteRemoteBranch(repoPath: string, remoteRef: string): Promise<void> {
    const slash = remoteRef.indexOf('/')
    if (slash < 0) throw new Error(`Invalid remote branch ref: ${remoteRef}`)
    const remote = remoteRef.slice(0, slash)
    const branch = remoteRef.slice(slash + 1)
    await git(repoPath).raw(['push', remote, '--delete', branch])
  },

  async mergeBranch(repoPath: string, name: string): Promise<string> {
    const res = await git(repoPath).merge([name])
    return JSON.stringify(res)
  },

  async checkoutCommit(repoPath: string, hash: string): Promise<void> {
    await git(repoPath).checkout(hash)
  },

  async resetTo(repoPath: string, hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
    await git(repoPath).raw(['reset', `--${mode}`, hash])
  },

  async revertCommit(repoPath: string, hash: string): Promise<void> {
    await git(repoPath).raw(['revert', '--no-edit', hash])
  },

  /**
   * Describe the last operation that moved the current branch tip, read from
   * the branch's own reflog. Using the branch reflog (not HEAD's) means plain
   * checkouts — which don't change the branch — are ignored, so undo only ever
   * targets commit/reset/merge/rebase/amend-style actions. null when there's
   * nothing to undo or HEAD is detached.
   */
  async lastBranchAction(repoPath: string): Promise<UndoInfo | null> {
    const g = git(repoPath)
    let branch = ''
    try {
      branch = (await g.raw(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
    } catch {
      branch = ''
    }
    if (!branch) return null
    let raw = ''
    try {
      raw = await g.raw(['reflog', 'show', `--format=%gs${FIELD}%h${FIELD}%s`, '-n', '2', branch])
    } catch {
      return null
    }
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) return null // fewer than 2 entries: nothing before the current tip
    const action = lines[0].split(FIELD)[0]
    const prev = lines[1].split(FIELD)
    return { branch, action, target: prev[1], subject: prev[2] ?? '' }
  },

  /**
   * Undo that last action by moving the current branch back to its previous
   * tip with `git reset --soft` — pointer-only, so the index and working tree
   * are never touched and no work can be lost (an undone commit's changes come
   * back as staged, ready to re-commit).
   */
  async undoLastBranchAction(repoPath: string): Promise<void> {
    const g = git(repoPath)
    let branch = ''
    try {
      branch = (await g.raw(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
    } catch {
      branch = ''
    }
    if (!branch) throw new Error('Cannot undo in a detached HEAD state.')
    await g.raw(['reset', '--soft', `${branch}@{1}`])
  },

  async cherryPick(repoPath: string, hash: string): Promise<void> {
    await git(repoPath).raw(['cherry-pick', hash])
  },

  /**
   * A sensible default base for interactive-rebasing the current branch: the
   * fork point from its upstream, or from the default branch (main/master).
   * null when it can't be determined (e.g. no upstream and already on main).
   */
  async rebaseBase(repoPath: string): Promise<string | null> {
    const g = git(repoPath)
    const head = (await g.raw(['rev-parse', 'HEAD'])).trim()
    // Prefer the upstream fork point.
    try {
      const up = (await g.raw(['rev-parse', '--verify', '-q', '@{upstream}'])).trim()
      if (up) {
        const mb = (await g.raw(['merge-base', 'HEAD', '@{upstream}'])).trim()
        if (mb && mb !== head) return mb
      }
    } catch {
      /* no upstream */
    }
    // Fall back to the fork point from the default branch.
    for (const base of ['main', 'master']) {
      try {
        const b = (await g.raw(['rev-parse', '--verify', '-q', base])).trim()
        if (b && b !== head) {
          const mb = (await g.raw(['merge-base', 'HEAD', base])).trim()
          if (mb && mb !== head) return mb
        }
      } catch {
        /* branch doesn't exist */
      }
    }
    return null
  },

  /** The commits in `onto`..HEAD, oldest first — the range an interactive rebase edits. */
  async getRebaseCommits(repoPath: string, onto: string): Promise<RebaseCommit[]> {
    const fmt = ['%H', '%h', '%s'].join(FIELD)
    let out = ''
    try {
      out = await git(repoPath).raw(['log', '--reverse', `--format=${fmt}`, `${onto}..HEAD`])
    } catch {
      return []
    }
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [hash, shortHash, subject] = l.split(FIELD)
        return { hash, shortHash, subject: subject ?? '' }
      })
  },

  /**
   * Run an interactive rebase onto `onto` with a scripted todo (reorder / drop /
   * squash / fixup). The todo is fed through GIT_SEQUENCE_EDITOR by copying a
   * temp file over git's todo, and GIT_EDITOR is neutralised so squash keeps the
   * auto-combined message without prompting. Env is set on this process (not via
   * simple-git's .env(), which blocks EDITOR/SEQUENCE_EDITOR). If it stops on a
   * conflict, the rebase stays in progress and the merge editor takes over.
   */
  async rebaseInteractive(repoPath: string, onto: string, todo: RebaseTodoItem[]): Promise<void> {
    const lines = todo.filter((t) => t.action !== 'drop').map((t) => `${t.action} ${t.hash}`)
    if (lines.length === 0) throw new Error('Nothing to rebase — every commit was dropped.')
    if (todo.filter((t) => t.action !== 'drop')[0].action !== 'pick') {
      throw new Error('The first kept commit must be "pick" (nothing to squash into).')
    }
    const todoPath = join(tmpdir(), `shgc-rebase-todo-${Date.now()}`)
    await fs.writeFile(todoPath, lines.join('\n') + '\n', 'utf8')
    const prevSeq = process.env.GIT_SEQUENCE_EDITOR
    const prevEd = process.env.GIT_EDITOR
    process.env.GIT_SEQUENCE_EDITOR = `cp ${JSON.stringify(todoPath)}`
    process.env.GIT_EDITOR = 'true'
    try {
      await git(repoPath).raw(['rebase', '-i', onto])
    } finally {
      if (prevSeq === undefined) delete process.env.GIT_SEQUENCE_EDITOR
      else process.env.GIT_SEQUENCE_EDITOR = prevSeq
      if (prevEd === undefined) delete process.env.GIT_EDITOR
      else process.env.GIT_EDITOR = prevEd
      await fs.unlink(todoPath).catch(() => {})
    }
  },

  /**
   * Which conflict-producing operation (if any) is mid-flight, plus the list of
   * files still unmerged. Detected from the repo's in-progress markers so we
   * know whether to continue/abort a merge, rebase, cherry-pick or revert.
   */
  async mergeState(repoPath: string): Promise<MergeState> {
    const g = git(repoPath)
    const refExists = async (ref: string): Promise<boolean> => {
      // NOTE: `git rev-parse -q --verify <missing>` exits non-zero but prints
      // nothing, and simple-git resolves it to an empty string rather than
      // throwing — so we must check for a returned hash, not rely on a throw.
      try {
        const out = (await g.raw(['rev-parse', '-q', '--verify', ref])).trim()
        return out.length > 0
      } catch {
        return false
      }
    }
    const pathExists = async (name: string): Promise<boolean> => {
      try {
        const rel = (await g.raw(['rev-parse', '--git-path', name])).trim()
        const abs = rel.startsWith('/') ? rel : join(repoPath, rel)
        await fs.access(abs)
        return true
      } catch {
        return false
      }
    }
    let operation: MergeState['operation'] = null
    if ((await pathExists('rebase-merge')) || (await pathExists('rebase-apply'))) operation = 'rebase'
    else if (await refExists('MERGE_HEAD')) operation = 'merge'
    else if (await refExists('CHERRY_PICK_HEAD')) operation = 'cherry-pick'
    else if (await refExists('REVERT_HEAD')) operation = 'revert'

    let conflicted: string[] = []
    try {
      const out = await g.raw(['diff', '--name-only', '--diff-filter=U'])
      conflicted = out.split('\n').map((s) => s.trim()).filter(Boolean)
    } catch {
      conflicted = []
    }
    return { operation, conflicted }
  },

  /** Resolve one conflicted file by taking our side or theirs, then stage it. */
  async resolveConflict(repoPath: string, file: string, side: 'ours' | 'theirs'): Promise<void> {
    const g = git(repoPath)
    await g.raw(['checkout', `--${side}`, '--', file])
    await g.raw(['add', '--', file])
  },

  /** Mark a file as resolved by staging whatever is currently in the tree. */
  async markConflictResolved(repoPath: string, file: string): Promise<void> {
    await git(repoPath).raw(['add', '--', file])
  },

  /** Raw working-tree content of a conflicted file (with the conflict markers). */
  async readConflictText(repoPath: string, file: string): Promise<string> {
    return fs.readFile(join(repoPath, file), 'utf8')
  },

  /** Write the resolved content for a conflicted file and stage it. */
  async resolveConflictWith(repoPath: string, file: string, content: string): Promise<void> {
    await fs.writeFile(join(repoPath, file), content, 'utf8')
    await git(repoPath).raw(['add', '--', file])
  },

  /** Abort the in-progress merge/rebase/cherry-pick/revert. */
  async abortOperation(repoPath: string, op: MergeOperation): Promise<void> {
    await git(repoPath).raw([op, '--abort'])
  },

  /**
   * Continue the in-progress operation after conflicts are staged. rebase/merge
   * --continue open an editor for the commit message; neutralise it with a
   * no-op editor set on THIS process (inherited by the git child) — not via
   * simple-git's .env(), which would trip its "allowUnsafeEditor" guard on an
   * EDITOR/GIT_EDITOR value.
   */
  async continueOperation(repoPath: string, op: MergeOperation): Promise<void> {
    const prev = process.env.GIT_EDITOR
    process.env.GIT_EDITOR = 'true'
    try {
      await git(repoPath).raw([op, '--continue'])
    } finally {
      if (prev === undefined) delete process.env.GIT_EDITOR
      else process.env.GIT_EDITOR = prev
    }
  },

  async createTag(repoPath: string, name: string, hash?: string): Promise<void> {
    const args = ['tag', name]
    if (hash) args.push(hash)
    await git(repoPath).raw(args)
  },

  async deleteTag(repoPath: string, name: string): Promise<void> {
    await git(repoPath).raw(['tag', '-d', name])
  },

  async stashSave(repoPath: string, message: string): Promise<void> {
    const args = ['stash', 'push', '--include-untracked']
    if (message) args.push('-m', message)
    await git(repoPath).raw(args)
  },

  async stashApply(repoPath: string, index: number): Promise<void> {
    await git(repoPath).raw(['stash', 'apply', `stash@{${index}}`])
  },

  async stashPop(repoPath: string, index: number): Promise<void> {
    await git(repoPath).raw(['stash', 'pop', `stash@{${index}}`])
  },

  async stashDrop(repoPath: string, index: number): Promise<void> {
    await git(repoPath).raw(['stash', 'drop', `stash@{${index}}`])
  },

  /**
   * Rename a stash's message. Git has no in-place rename, so we recreate the
   * stash commit with a new subject (preserving its tree and all parents, hence
   * apply/pop keep working), store it, then drop the original. The renamed entry
   * moves to the top of the stack (stash@{0}).
   */
  async stashRename(repoPath: string, index: number, message: string): Promise<void> {
    const g = git(repoPath)
    const ref = `stash@{${index}}`
    const sha = (await g.raw(['rev-parse', ref])).trim()
    const tree = (await g.raw(['rev-parse', `${ref}^{tree}`])).trim()
    const revList = (await g.raw(['rev-list', '--parents', '-n', '1', sha])).trim()
    const parents = revList.split(/\s+/).slice(1) // drop the commit's own hash
    const args = ['commit-tree', tree]
    for (const p of parents) args.push('-p', p)
    args.push('-m', message)
    const newSha = (await g.raw(args)).trim()
    await g.raw(['stash', 'store', '-m', message, newSha])
    // `stash store` prepended the new entry, shifting the original down by one.
    await g.raw(['stash', 'drop', `stash@{${index + 1}}`])
  },

  async addRemote(repoPath: string, name: string, url: string): Promise<void> {
    await git(repoPath).addRemote(name, url)
  },

  async removeRemote(repoPath: string, name: string): Promise<void> {
    await git(repoPath).removeRemote(name)
  },

  async getUserConfig(repoPath: string): Promise<{ name: string; email: string }> {
    const g = git(repoPath)
    const name = (await g.raw(['config', 'user.name']).catch(() => '')).trim()
    const email = (await g.raw(['config', 'user.email']).catch(() => '')).trim()
    return { name, email }
  },

  async setUserConfig(repoPath: string, name: string, email: string): Promise<void> {
    const g = git(repoPath)
    if (name) await g.raw(['config', 'user.name', name])
    if (email) await g.raw(['config', 'user.email', email])
  }
}

// --- helpers ---------------------------------------------------------------

function deriveRepoName(url: string): string {
  const clean = url.replace(/\.git$/, '').replace(/\/$/, '')
  const parts = clean.split(/[/:]/)
  return parts[parts.length - 1] || 'repository'
}

function syntheticAddedFile(path: string, content: string): DiffFile {
  const lines = content.split('\n')
  // drop a trailing empty element produced by a final newline
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return {
    oldPath: path,
    newPath: path,
    status: 'added',
    isBinary: false,
    additions: lines.length,
    deletions: 0,
    hunks: [
      {
        header: `@@ -0,0 +1,${lines.length} @@`,
        lines: lines.map((content, i) => ({
          type: 'add' as const,
          content,
          oldLine: null,
          newLine: i + 1
        }))
      }
    ]
  }
}
