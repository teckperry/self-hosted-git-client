import { create } from 'zustand'
import { api, call } from '../lib/ipc'
import { applyBranding, type ThemeMode } from '../branding'
import type {
  RepoInfo,
  RecentRepo,
  Commit,
  RepoStatus,
  Branch,
  Remote,
  Stash,
  Tag,
  DiffFile,
  FileChange,
  PushOptions
} from '@shared/types'

export type Selection =
  | { type: 'commit'; hash: string }
  | { type: 'wip' }
  | null

export interface Toast {
  kind: 'info' | 'success' | 'error'
  message: string
}

interface AppState {
  // session
  repo: RepoInfo | null
  recentRepos: RecentRepo[]
  loadingRepo: boolean
  busy: boolean
  busyLabel: string
  toast: Toast | null
  theme: ThemeMode
  sidebarOpen: boolean

  // repo data
  commits: Commit[]
  status: RepoStatus | null
  branches: Branch[]
  remotes: Remote[]
  stashes: Stash[]
  tags: Tag[]

  // selection / diff
  selection: Selection
  commitDiff: DiffFile[]
  selectedFilePath: string | null // active file in commit diff
  workingDiff: DiffFile[]
  workingFile: { path: string; staged: boolean } | null
  loadingDiff: boolean

  // actions
  setTheme: (t: ThemeMode) => void
  toggleSidebar: () => void
  showToast: (t: Toast | null) => void
  loadRecent: () => Promise<void>
  pickAndOpenRepo: () => Promise<void>
  pickAndCloneRepo: (url: string) => Promise<void>
  pickAndInitRepo: () => Promise<void>
  openRepoByPath: (path: string) => Promise<void>
  removeRecent: (path: string) => Promise<void>
  closeRepo: () => void
  refreshAll: () => Promise<void>

  selectCommit: (hash: string) => Promise<void>
  selectWip: () => Promise<void>
  selectCommitFile: (path: string) => void
  selectWorkingFile: (file: FileChange) => Promise<void>

  run: (label: string, fn: () => Promise<unknown>, successMsg?: string) => Promise<void>
  stage: (paths: string[]) => Promise<void>
  unstage: (paths: string[]) => Promise<void>
  stageAll: () => Promise<void>
  unstageAll: () => Promise<void>
  discard: (file: FileChange) => Promise<void>
  commit: (message: string, amend: boolean) => Promise<void>
  push: (opts: PushOptions) => Promise<void>
  pull: () => Promise<void>
  fetch: () => Promise<void>
  checkoutBranch: (name: string, isRemote: boolean) => Promise<void>
  createBranch: (name: string, checkout: boolean) => Promise<void>
  deleteBranch: (name: string, force: boolean) => Promise<void>
  mergeBranch: (name: string) => Promise<void>
  checkoutCommit: (hash: string) => Promise<void>
  resetTo: (hash: string, mode: 'soft' | 'mixed' | 'hard') => Promise<void>
  revertCommit: (hash: string) => Promise<void>
  cherryPick: (hash: string) => Promise<void>
  createTag: (name: string, hash?: string) => Promise<void>
  stashSave: (message: string) => Promise<void>
  stashApply: (index: number) => Promise<void>
  stashPop: (index: number) => Promise<void>
  stashDrop: (index: number) => Promise<void>
  addRemote: (name: string, url: string) => Promise<void>
  removeRemote: (name: string) => Promise<void>
}

export const useStore = create<AppState>()((set, get) => ({
  repo: null,
  recentRepos: [],
  loadingRepo: false,
  busy: false,
  busyLabel: '',
  toast: null,
  theme: 'dark',
  sidebarOpen: false,

  commits: [],
  status: null,
  branches: [],
  remotes: [],
  stashes: [],
  tags: [],

  selection: null,
  commitDiff: [],
  selectedFilePath: null,
  workingDiff: [],
  workingFile: null,
  loadingDiff: false,

  setTheme: (t) => {
    applyBranding(t)
    set({ theme: t })
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  showToast: (toast) => {
    set({ toast })
    if (toast && toast.kind !== 'error') {
      setTimeout(() => {
        if (get().toast === toast) set({ toast: null })
      }, 3500)
    }
  },

  loadRecent: async () => {
    try {
      const recent = await call(api.getRecentRepos())
      set({ recentRepos: recent })
    } catch {
      /* ignore */
    }
  },

  pickAndOpenRepo: async () => {
    const dir = await call(api.selectDirectory())
    if (!dir) return
    await get().openRepoByPath(dir)
  },

  pickAndCloneRepo: async (url) => {
    const dir = await call(api.selectDirectory())
    if (!dir) return
    set({ loadingRepo: true, busyLabel: 'Cloning…' })
    try {
      const target = await call(api.cloneRepo({ url, directory: dir }))
      await get().openRepoByPath(target)
    } catch (e) {
      get().showToast({ kind: 'error', message: errMsg(e) })
    } finally {
      set({ loadingRepo: false, busyLabel: '' })
    }
  },

  pickAndInitRepo: async () => {
    const dir = await call(api.selectDirectory())
    if (!dir) return
    try {
      await call(api.initRepo(dir))
      await get().openRepoByPath(dir)
    } catch (e) {
      get().showToast({ kind: 'error', message: errMsg(e) })
    }
  },

  openRepoByPath: async (path) => {
    set({ loadingRepo: true })
    try {
      const repo = await call(api.openRepo(path))
      const recent = await call(api.addRecentRepo(path))
      set({
        repo,
        recentRepos: recent,
        selection: null,
        commitDiff: [],
        workingDiff: [],
        selectedFilePath: null,
        workingFile: null
      })
      await get().refreshAll()
      // default selection: working changes if dirty, else latest commit
      const st = get().status
      if (st && !st.isClean) await get().selectWip()
      else {
        const first = get().commits[0]
        if (first) await get().selectCommit(first.hash)
      }
    } catch (e) {
      get().showToast({ kind: 'error', message: errMsg(e) })
    } finally {
      set({ loadingRepo: false })
    }
  },

  removeRecent: async (path) => {
    try {
      const recent = await call(api.removeRecentRepo(path))
      set({ recentRepos: recent })
    } catch {
      /* ignore */
    }
  },

  closeRepo: () => {
    set({
      repo: null,
      commits: [],
      status: null,
      branches: [],
      remotes: [],
      stashes: [],
      tags: [],
      selection: null,
      commitDiff: [],
      workingDiff: [],
      selectedFilePath: null,
      workingFile: null
    })
    get().loadRecent()
  },

  refreshAll: async () => {
    const repo = get().repo
    if (!repo) return
    const p = repo.path
    const [commits, status, branches, remotes, stashes, tags] = await Promise.all([
      call(api.getCommits(p, 800)).catch(() => [] as Commit[]),
      call(api.getStatus(p)).catch(() => null),
      call(api.getBranches(p)).catch(() => [] as Branch[]),
      call(api.getRemotes(p)).catch(() => [] as Remote[]),
      call(api.getStashes(p)).catch(() => [] as Stash[]),
      call(api.getTags(p)).catch(() => [] as Tag[])
    ])
    // keep repo header in sync (current branch may have changed)
    let repoInfo = repo
    try {
      repoInfo = await call(api.openRepo(p))
    } catch {
      /* ignore */
    }
    set({ commits, status, branches, remotes, stashes, tags, repo: repoInfo })

    // revalidate current selection
    const sel = get().selection
    if (sel?.type === 'commit' && !commits.find((c) => c.hash === sel.hash)) {
      set({ selection: null, commitDiff: [], selectedFilePath: null })
    }
  },

  selectCommit: async (hash) => {
    set({ selection: { type: 'commit', hash }, loadingDiff: true, workingFile: null, workingDiff: [] })
    const repo = get().repo
    if (!repo) return
    try {
      const diff = await call(api.getCommitDiff(repo.path, hash))
      set({
        commitDiff: diff,
        selectedFilePath: diff[0]?.newPath ?? null,
        loadingDiff: false
      })
    } catch (e) {
      set({ commitDiff: [], selectedFilePath: null, loadingDiff: false })
      get().showToast({ kind: 'error', message: errMsg(e) })
    }
  },

  selectWip: async () => {
    set({ selection: { type: 'wip' }, commitDiff: [], selectedFilePath: null, workingFile: null, workingDiff: [] })
    const repo = get().repo
    if (!repo) return
    try {
      const status = await call(api.getStatus(repo.path))
      set({ status })
      // auto-select first changed file
      const first = status.unstaged[0] || status.staged[0]
      if (first) await get().selectWorkingFile(first)
    } catch (e) {
      get().showToast({ kind: 'error', message: errMsg(e) })
    }
  },

  selectCommitFile: (path) => set({ selectedFilePath: path }),

  selectWorkingFile: async (file) => {
    const repo = get().repo
    if (!repo) return
    set({
      workingFile: { path: file.path, staged: file.staged },
      loadingDiff: true
    })
    try {
      const diff = await call(
        api.getWorkingDiff(repo.path, file.path, {
          staged: file.staged,
          untracked: file.kind === 'untracked'
        })
      )
      set({ workingDiff: diff, loadingDiff: false })
    } catch (e) {
      set({ workingDiff: [], loadingDiff: false })
      get().showToast({ kind: 'error', message: errMsg(e) })
    }
  },

  run: async (label, fn, successMsg) => {
    if (get().busy) return
    set({ busy: true, busyLabel: label })
    try {
      await fn()
      await get().refreshAll()
      // refresh active diff context
      const sel = get().selection
      if (sel?.type === 'wip') {
        const wf = get().workingFile
        const st = get().status
        const match =
          wf && [...(st?.staged ?? []), ...(st?.unstaged ?? [])].find((f) => f.path === wf.path)
        if (match) await get().selectWorkingFile(match)
        else set({ workingDiff: [], workingFile: null })
      }
      if (successMsg) get().showToast({ kind: 'success', message: successMsg })
    } catch (e) {
      get().showToast({ kind: 'error', message: errMsg(e) })
    } finally {
      set({ busy: false, busyLabel: '' })
    }
  },

  stage: (paths) => get().run('Staging…', () => call(api.stage(get().repo!.path, paths))),
  unstage: (paths) => get().run('Unstaging…', () => call(api.unstage(get().repo!.path, paths))),
  stageAll: () => get().run('Staging all…', () => call(api.stageAll(get().repo!.path))),
  unstageAll: () => get().run('Unstaging all…', () => call(api.unstageAll(get().repo!.path))),
  discard: (file) =>
    get().run('Discarding…', () => call(api.discard(get().repo!.path, file)), 'Changes discarded'),

  commit: (message, amend) =>
    get().run(
      'Committing…',
      async () => {
        await call(api.commit(get().repo!.path, { message, amend }))
      },
      'Commit created'
    ).then(async () => {
      // after committing, move selection to the new HEAD commit
      const head = get().commits[0]
      if (head && get().status?.isClean) await get().selectCommit(head.hash)
    }),

  push: (opts) =>
    get().run('Pushing…', () => call(api.push(get().repo!.path, opts)), 'Push complete'),
  pull: () => get().run('Pulling…', () => call(api.pull(get().repo!.path)), 'Pull complete'),
  fetch: () => get().run('Fetching…', () => call(api.fetch(get().repo!.path)), 'Fetch complete'),

  checkoutBranch: (name, isRemote) =>
    get().run(
      `Checking out ${name}…`,
      () => call(api.checkoutBranch(get().repo!.path, name, isRemote)),
      `Switched to ${name}`
    ),
  createBranch: (name, checkout) =>
    get().run(
      'Creating branch…',
      () => call(api.createBranch(get().repo!.path, name, checkout)),
      `Branch ${name} created`
    ),
  deleteBranch: (name, force) =>
    get().run(
      'Deleting branch…',
      () => call(api.deleteBranch(get().repo!.path, name, force)),
      `Branch ${name} deleted`
    ),
  mergeBranch: (name) =>
    get().run('Merging…', () => call(api.mergeBranch(get().repo!.path, name)), `Merged ${name}`),
  checkoutCommit: (hash) =>
    get().run('Checking out commit…', () => call(api.checkoutCommit(get().repo!.path, hash))),
  resetTo: (hash, mode) =>
    get().run(`Reset --${mode}…`, () => call(api.resetTo(get().repo!.path, hash, mode)), 'Reset complete'),
  revertCommit: (hash) =>
    get().run('Reverting…', () => call(api.revertCommit(get().repo!.path, hash)), 'Revert created'),
  cherryPick: (hash) =>
    get().run('Cherry-picking…', () => call(api.cherryPick(get().repo!.path, hash)), 'Cherry-pick complete'),
  createTag: (name, hash) =>
    get().run('Creating tag…', () => call(api.createTag(get().repo!.path, name, hash)), `Tag ${name} created`),
  stashSave: (message) =>
    get().run('Stashing…', () => call(api.stashSave(get().repo!.path, message)), 'Stash saved'),
  stashApply: (index) =>
    get().run('Applying stash…', () => call(api.stashApply(get().repo!.path, index)), 'Stash applied'),
  stashPop: (index) =>
    get().run('Popping stash…', () => call(api.stashPop(get().repo!.path, index)), 'Stash applied'),
  stashDrop: (index) =>
    get().run('Dropping stash…', () => call(api.stashDrop(get().repo!.path, index)), 'Stash dropped'),
  addRemote: (name, url) =>
    get().run('Adding remote…', () => call(api.addRemote(get().repo!.path, name, url)), 'Remote added'),
  removeRemote: (name) =>
    get().run('Removing remote…', () => call(api.removeRemote(get().repo!.path, name)), 'Remote removed')
}))

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
