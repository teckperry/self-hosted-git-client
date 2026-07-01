import { simpleGit, SimpleGit } from 'simple-git'
import { promises as fs } from 'fs'
import { join, basename } from 'path'
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
  PushOptions
} from '@shared/types'

const FIELD = '\x1f'
const RECORD = '\x1e'
// Emit whole files (all context) in diffs so the editor shows the full code
// with the changes highlighted, not just the changed hunks.
const FULL_CONTEXT = '-U100000'

/**
 * Build a child-process environment from the current one plus overrides, with
 * the variables simple-git refuses for safety removed. simple-git blocks a
 * PAGER/GIT_PAGER coming through `.env()` (a hostile pager could run arbitrary
 * commands: "Use of PAGER is not permitted without enabling allowUnsafePager"),
 * so we strip them — we never need a pager for the commands we run anyway.
 */
function childEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  delete env.PAGER
  delete env.GIT_PAGER
  return { ...env, ...overrides }
}

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

    for (const file of s.files) {
      const index = file.index || ' '
      const working = file.working_dir || ' '
      const isUntracked = index === '?' && working === '?'

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
   * Reword the message of the current HEAD commit without touching the working
   * tree or the index. Rebuilds the commit from its own tree/parents with
   * `git commit-tree`, preserving the original author (name/email/date), then
   * moves the current branch to the new commit. Works for merge commits too.
   */
  async rewordHead(repoPath: string, message: string): Promise<void> {
    const g = git(repoPath)
    const tree = (await g.raw(['rev-parse', 'HEAD^{tree}'])).trim()
    const oldHead = (await g.raw(['rev-parse', 'HEAD'])).trim()
    const parentsRaw = (await g.raw(['rev-list', '--parents', '-n', '1', 'HEAD'])).trim()
    const parents = parentsRaw.split(/\s+/).slice(1) // drop the commit's own hash
    const an = (await g.raw(['log', '-1', '--format=%an'])).trim()
    const ae = (await g.raw(['log', '-1', '--format=%ae'])).trim()
    const ad = (await g.raw(['log', '-1', '--format=%aI'])).trim()
    const args = ['commit-tree', tree]
    for (const p of parents) args.push('-p', p)
    args.push('-m', message)
    // A fresh instance so the author-preserving env doesn't leak into the
    // cached SimpleGit used by every other operation.
    const fresh = simpleGit(repoPath, { binary: 'git', maxConcurrentProcesses: 1 }).env(
      childEnv({ GIT_AUTHOR_NAME: an, GIT_AUTHOR_EMAIL: ae, GIT_AUTHOR_DATE: ad })
    )
    const newHash = (await fresh.raw(args)).trim()
    await g.raw(['update-ref', 'HEAD', newHash, oldHead])
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

  async cherryPick(repoPath: string, hash: string): Promise<void> {
    await git(repoPath).raw(['cherry-pick', hash])
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
