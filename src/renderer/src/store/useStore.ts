import { create } from 'zustand'
import { api, call } from '../lib/ipc'
import { applyBranding, type ThemeMode } from '../branding'
import { loadPrefs, savePrefs } from '../lib/prefs'
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
  PushOptions,
  UpdateInfo
} from '@shared/types'

/** Debounce handle for the git-backed part of the search (filenames + code). */
let searchDebounce: ReturnType<typeof setTimeout> | null = null

export type Selection =
  | { type: 'commit'; hash: string }
  | { type: 'wip' }
  | null

/** How the full-page diff editor renders a file's changes. */
export type DiffViewMode = 'inline' | 'split'

export interface Toast {
  kind: 'info' | 'success' | 'error'
  message: string
}

interface AppState {
  // session
  repo: RepoInfo | null
  tabs: RepoInfo[]
  recentRepos: RecentRepo[]
  loadingRepo: boolean
  busy: boolean
  busyLabel: string
  toast: Toast | null
  /** set when a normal push was rejected (non-fast-forward); holds the opts to retry with force */
  pushRejected: PushOptions | null
  theme: ThemeMode
  /** background auto-fetch interval in minutes; 0 disables it */
  autoFetchMinutes: number
  sidebarOpen: boolean
  focusZone: 'commits' | 'files'
  // update notification
  update: UpdateInfo | null
  updateDownloading: boolean
  /** When true, the full-page diff editor replaces the commit graph. */
  editorOpen: boolean
  diffViewMode: DiffViewMode
  // search (Cmd/Ctrl+F): highlight matching commits, dim the rest
  searchOpen: boolean
  searchQuery: string
  /** hashes of matching commits, or null when no search is active */
  searchMatches: Set<string> | null
  /** true while the git-backed (file-name) pass is still running */
  searchLoading: boolean
  // in-editor code search (Cmd/Ctrl+F while the diff editor is open)
  editorSearchOpen: boolean
  editorSearchQuery: string

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
  setAutoFetchMinutes: (n: number) => void
  toggleSidebar: () => void
  setFocusZone: (zone: 'commits' | 'files') => void
  openEditor: () => void
  closeEditor: () => void
  setDiffViewMode: (mode: DiffViewMode) => void
  navigateCommits: (dir: -1 | 1) => void
  navigateFiles: (dir: -1 | 1) => void
  showToast: (t: Toast | null) => void
  openSearch: () => void
  closeSearch: () => void
  setSearchQuery: (q: string) => void
  openEditorSearch: () => void
  closeEditorSearch: () => void
  setEditorSearchQuery: (q: string) => void
  checkForUpdate: () => Promise<void>
  downloadUpdate: () => Promise<void>
  dismissUpdate: () => void
  loadRecent: () => Promise<void>
  pickAndOpenRepo: () => Promise<void>
  pickAndCloneRepo: (url: string) => Promise<void>
  pickAndInitRepo: () => Promise<void>
  openRepoByPath: (path: string) => Promise<void>
  activateRepo: (info: RepoInfo) => Promise<void>
  switchTab: (path: string) => Promise<void>
  closeTab: (path: string) => void
  restoreSession: () => Promise<void>
  persistSession: () => void
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
  dismissPushRejected: () => void
  pull: () => Promise<void>
  fetch: () => Promise<void>
  /** Silent background fetch (no busy/toast) to keep ahead/behind fresh. */
  autoFetch: () => Promise<void>
  checkoutBranch: (name: string, isRemote: boolean) => Promise<void>
  createBranch: (name: string, checkout: boolean) => Promise<void>
  deleteBranch: (name: string, force: boolean) => Promise<void>
  renameBranch: (oldName: string, newName: string) => Promise<void>
  deleteRemoteBranch: (remoteRef: string) => Promise<void>
  mergeBranch: (name: string) => Promise<void>
  checkoutCommit: (hash: string) => Promise<void>
  rewordHead: (message: string) => Promise<void>
  openOnRemote: (kind: 'commit' | 'branch' | 'repo', ref?: string) => Promise<void>
  resetTo: (hash: string, mode: 'soft' | 'mixed' | 'hard') => Promise<void>
  revertCommit: (hash: string) => Promise<void>
  cherryPick: (hash: string) => Promise<void>
  createTag: (name: string, hash?: string) => Promise<void>
  deleteTag: (name: string) => Promise<void>
  stashSave: (message: string) => Promise<void>
  stashApply: (index: number) => Promise<void>
  stashPop: (index: number) => Promise<void>
  stashDrop: (index: number) => Promise<void>
  stashRename: (index: number, message: string) => Promise<void>
  addRemote: (name: string, url: string) => Promise<void>
  removeRemote: (name: string) => Promise<void>
}

export const useStore = create<AppState>()((set, get) => ({
  repo: null,
  tabs: [],
  recentRepos: [],
  loadingRepo: false,
  busy: false,
  busyLabel: '',
  toast: null,
  pushRejected: null,
  theme: loadPrefs().theme,
  autoFetchMinutes: loadPrefs().autoFetchMinutes,
  sidebarOpen: false,
  focusZone: 'commits',
  editorOpen: false,
  diffViewMode: 'inline',
  update: null,
  updateDownloading: false,
  searchOpen: false,
  searchQuery: '',
  searchMatches: null,
  searchLoading: false,
  editorSearchOpen: false,
  editorSearchQuery: '',

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
    savePrefs({ theme: t, autoFetchMinutes: get().autoFetchMinutes })
  },

  setAutoFetchMinutes: (n) => {
    set({ autoFetchMinutes: n })
    savePrefs({ theme: get().theme, autoFetchMinutes: n })
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setFocusZone: (zone) => set({ focusZone: zone }),

  openEditor: () => set({ editorOpen: true }),
  closeEditor: () => set({ editorOpen: false, editorSearchOpen: false, editorSearchQuery: '' }),

  openEditorSearch: () => set({ editorSearchOpen: true }),
  closeEditorSearch: () => set({ editorSearchOpen: false, editorSearchQuery: '' }),
  setEditorSearchQuery: (q) => set({ editorSearchQuery: q }),
  setDiffViewMode: (mode) => set({ diffViewMode: mode }),

  navigateCommits: (dir) => {
    const { commits, status, selection } = get()
    const dirty = !!status && !status.isClean
    const ids: string[] = dirty
      ? ['__wip__', ...commits.map((c) => c.hash)]
      : commits.map((c) => c.hash)
    if (ids.length === 0) return
    let idx =
      selection?.type === 'wip'
        ? ids.indexOf('__wip__')
        : selection?.type === 'commit'
          ? ids.indexOf(selection.hash)
          : -1
    idx = idx < 0 ? 0 : Math.min(Math.max(idx + dir, 0), ids.length - 1)
    const target = ids[idx]
    if (target === '__wip__') void get().selectWip()
    else void get().selectCommit(target)
  },

  navigateFiles: (dir) => {
    const { selection } = get()
    if (selection?.type === 'commit') {
      const files = get().commitDiff
      if (files.length === 0) return
      const cur = get().selectedFilePath
      let idx = files.findIndex((f) => (f.newPath || f.oldPath) === cur)
      idx = idx < 0 ? 0 : Math.min(Math.max(idx + dir, 0), files.length - 1)
      set({ editorOpen: true })
      get().selectCommitFile(files[idx].newPath || files[idx].oldPath)
    } else if (selection?.type === 'wip') {
      const st = get().status
      if (!st) return
      const files = [...st.unstaged, ...st.staged]
      if (files.length === 0) return
      const wf = get().workingFile
      let idx = wf ? files.findIndex((f) => f.path === wf.path && f.staged === wf.staged) : -1
      idx = idx < 0 ? 0 : Math.min(Math.max(idx + dir, 0), files.length - 1)
      set({ editorOpen: true })
      void get().selectWorkingFile(files[idx])
    }
  },

  showToast: (toast) => {
    set({ toast })
    if (toast && toast.kind !== 'error') {
      setTimeout(() => {
        if (get().toast === toast) set({ toast: null })
      }, 3500)
    }
  },

  openSearch: () => set({ searchOpen: true }),

  closeSearch: () => {
    if (searchDebounce) clearTimeout(searchDebounce)
    set({ searchOpen: false, searchQuery: '', searchMatches: null, searchLoading: false })
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q })
    const query = q.trim()
    if (searchDebounce) clearTimeout(searchDebounce)
    if (!query) {
      set({ searchMatches: null, searchLoading: false })
      return
    }
    // Instant client-side pass: message, author, hash, branch/tag names.
    const ql = query.toLowerCase()
    const matches = new Set<string>()
    for (const c of get().commits) {
      if (
        c.subject.toLowerCase().includes(ql) ||
        c.body.toLowerCase().includes(ql) ||
        c.author.toLowerCase().includes(ql) ||
        c.authorEmail.toLowerCase().includes(ql) ||
        c.hash.toLowerCase().includes(ql) ||
        c.shortHash.toLowerCase().includes(ql) ||
        c.refs.some((r) => r.name.toLowerCase().includes(ql))
      ) {
        matches.add(c.hash)
      }
    }
    // Client matches are ready, but the git file-name pass is still pending.
    set({ searchMatches: matches, searchLoading: true })
    // Debounced git-backed pass: changed file names.
    searchDebounce = setTimeout(async () => {
      const repo = get().repo
      if (!repo || get().searchQuery.trim() !== query) return
      try {
        const extra = await call(api.searchCommits(repo.path, query))
        if (get().searchQuery.trim() !== query) return
        const merged = new Set(get().searchMatches ?? [])
        for (const h of extra) merged.add(h)
        set({ searchMatches: merged })
      } catch {
        /* ignore search errors */
      } finally {
        // Clear the spinner only if this is still the active query.
        if (get().searchQuery.trim() === query) set({ searchLoading: false })
      }
    }, 300)
  },

  checkForUpdate: async () => {
    try {
      const info = await call(api.checkForUpdate())
      set({ update: info })
    } catch {
      /* offline or API error — ignore */
    }
  },

  downloadUpdate: async () => {
    const u = get().update
    if (!u) return
    if (!u.assetUrl) {
      // No installer matched this OS — fall back to the release page.
      api.openExternal(u.releaseUrl).catch(() => {})
      return
    }
    set({ updateDownloading: true })
    try {
      await call(api.downloadUpdate(u.assetUrl))
      get().showToast({ kind: 'success', message: 'Download complete — open the installer to update' })
    } catch (e) {
      get().showToast({ kind: 'error', message: errMsg(e) })
    } finally {
      set({ updateDownloading: false })
    }
  },

  dismissUpdate: () => set({ update: null }),

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
      const info = await call(api.openRepo(path))
      const recent = await call(api.addRecentRepo(path))
      const tabs = get().tabs.some((t) => t.path === info.path)
        ? get().tabs.map((t) => (t.path === info.path ? info : t))
        : [...get().tabs, info]
      set({ recentRepos: recent, tabs })
      await get().activateRepo(info)
      get().persistSession()
    } catch (e) {
      get().showToast({ kind: 'error', message: errMsg(e) })
    } finally {
      set({ loadingRepo: false })
    }
  },

  // Load a repo's data and make it the active tab.
  activateRepo: async (info) => {
    set({
      repo: info,
      selection: null,
      commitDiff: [],
      workingDiff: [],
      selectedFilePath: null,
      workingFile: null,
      editorOpen: false
    })
    await get().refreshAll()
    // default selection: working changes if dirty, else latest commit
    const st = get().status
    if (st && !st.isClean) await get().selectWip()
    else {
      const first = get().commits[0]
      if (first) await get().selectCommit(first.hash)
    }
  },

  switchTab: async (path) => {
    if (get().repo?.path === path) return
    const existing = get().tabs.find((t) => t.path === path)
    if (!existing) return
    set({ loadingRepo: true })
    try {
      const info = await call(api.openRepo(path)).catch(() => existing)
      set({ tabs: get().tabs.map((t) => (t.path === path ? info : t)) })
      await get().activateRepo(info)
      get().persistSession()
    } finally {
      set({ loadingRepo: false })
    }
  },

  closeTab: (path) => {
    const tabs = get().tabs.filter((t) => t.path !== path)
    const wasActive = get().repo?.path === path
    set({ tabs })
    if (wasActive) {
      if (tabs.length > 0) {
        // switchTab persists the session once the neighbor is active
        void get().switchTab(tabs[tabs.length - 1].path)
        return
      }
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
        workingFile: null,
        editorOpen: false
      })
    }
    get().persistSession()
  },

  // Reopen the repos that were open in the previous session.
  restoreSession: async () => {
    let session
    try {
      session = await call(api.getSession())
    } catch {
      return
    }
    if (!session.openRepos || session.openRepos.length === 0) return
    set({ loadingRepo: true })
    try {
      const valid: RepoInfo[] = []
      for (const p of session.openRepos) {
        try {
          valid.push(await call(api.openRepo(p)))
        } catch {
          /* repo moved or deleted — drop it from the session */
        }
      }
      set({ tabs: valid })
      if (valid.length > 0) {
        const active = valid.find((t) => t.path === session.activeRepo) ?? valid[0]
        await get().activateRepo(active)
      }
      get().persistSession() // persist the cleaned-up session
    } finally {
      set({ loadingRepo: false })
    }
  },

  persistSession: () => {
    const paths = get().tabs.map((t) => t.path)
    const active = get().repo?.path ?? null
    api.setSession(paths, active).catch(() => {})
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
      tabs: [],
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
      workingFile: null,
      editorOpen: false
    })
    get().persistSession()
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
      // after committing, return to the graph and select the new HEAD commit
      const head = get().commits[0]
      if (head && get().status?.isClean) {
        set({ editorOpen: false })
        await get().selectCommit(head.hash)
      }
    }),

  push: async (opts) => {
    if (get().busy) return
    const repo = get().repo
    if (!repo) return
    set({ busy: true, busyLabel: 'Pushing…', pushRejected: null })
    try {
      await call(api.push(repo.path, opts))
      await get().refreshAll()
      get().showToast({ kind: 'success', message: opts.force ? 'Force-pushed' : 'Push complete' })
    } catch (e) {
      const msg = errMsg(e)
      // A non-fast-forward rejection means local history diverged from the
      // remote (typically after reword/amend/rebase). Offer a safe force push
      // (--force-with-lease) rather than just reporting the failure.
      if (!opts.force && /non-fast-forward|fetch first|\brejected\b|force/i.test(msg)) {
        set({ pushRejected: opts })
      } else {
        get().showToast({ kind: 'error', message: msg })
      }
    } finally {
      set({ busy: false, busyLabel: '' })
    }
  },
  dismissPushRejected: () => set({ pushRejected: null }),
  pull: () => get().run('Pulling…', () => call(api.pull(get().repo!.path)), 'Pull complete'),
  fetch: () => get().run('Fetching…', () => call(api.fetch(get().repo!.path)), 'Fetch complete'),

  // Silent background fetch: no busy flag. Refreshes so ahead/behind and the
  // graph reflect the remote. When the fetch reveals new commits on the current
  // branch's upstream, surfaces a small info toast so the user notices.
  autoFetch: async () => {
    const repo = get().repo
    if (!repo || get().busy) return
    const before = get().status?.behind ?? 0
    try {
      await call(api.fetch(repo.path))
      await get().refreshAll()
    } catch {
      return /* offline / auth / no remote — ignore */
    }
    const st = get().status
    if (st?.tracking) {
      const gained = st.behind - before
      if (gained > 0) {
        get().showToast({
          kind: 'info',
          message: `${gained} new commit${gained === 1 ? '' : 's'} on ${st.tracking}`
        })
      }
    }
  },

  checkoutBranch: (name, isRemote) =>
    get()
      .run(
        `Checking out ${name}…`,
        () => call(api.checkoutBranch(get().repo!.path, name, isRemote)),
        `Switched to ${name}`
      )
      .then(async () => {
        // After landing on an existing branch, fast-forward it to its upstream's
        // latest (ff-only — never merges, so no conflicts). Silent if it can't
        // (diverged / offline / no upstream).
        const repo = get().repo
        const st = get().status
        if (!repo || !st || !st.tracking) return
        const wasBehind = st.behind > 0
        try {
          await call(api.pullFastForward(repo.path))
          await get().refreshAll()
          if (wasBehind) {
            get().showToast({ kind: 'success', message: `Updated ${st.current} from ${st.tracking}` })
          }
        } catch {
          /* diverged / offline — leave the pull to the user */
        }
      }),
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
  renameBranch: (oldName, newName) =>
    get().run(
      'Renaming branch…',
      () => call(api.renameBranch(get().repo!.path, oldName, newName)),
      `Branch renamed to ${newName}`
    ),
  deleteRemoteBranch: (remoteRef) =>
    get().run(
      'Deleting remote branch…',
      () => call(api.deleteRemoteBranch(get().repo!.path, remoteRef)),
      `Remote branch ${remoteRef} deleted`
    ),
  mergeBranch: (name) =>
    get().run('Merging…', () => call(api.mergeBranch(get().repo!.path, name)), `Merged ${name}`),
  checkoutCommit: (hash) =>
    get().run('Checking out commit…', () => call(api.checkoutCommit(get().repo!.path, hash))),
  rewordHead: (message) =>
    get().run('Rewording commit…', () => call(api.rewordHead(get().repo!.path, message)), 'Commit message updated'),
  openOnRemote: async (kind, ref) => {
    const repo = get().repo
    if (!repo) return
    const base = await call(api.remoteWebUrl(repo.path)).catch(() => null)
    if (!base) {
      get().showToast({ kind: 'error', message: 'No remote to open in the browser' })
      return
    }
    const url =
      kind === 'commit'
        ? `${base}/commit/${ref}`
        : kind === 'branch'
          ? `${base}/tree/${ref}`
          : base
    await call(api.openExternal(url)).catch(() => {
      get().showToast({ kind: 'error', message: 'Could not open the browser' })
    })
  },
  resetTo: (hash, mode) =>
    get().run(`Reset --${mode}…`, () => call(api.resetTo(get().repo!.path, hash, mode)), 'Reset complete'),
  revertCommit: (hash) =>
    get().run('Reverting…', () => call(api.revertCommit(get().repo!.path, hash)), 'Revert created'),
  cherryPick: (hash) =>
    get().run('Cherry-picking…', () => call(api.cherryPick(get().repo!.path, hash)), 'Cherry-pick complete'),
  createTag: (name, hash) =>
    get().run('Creating tag…', () => call(api.createTag(get().repo!.path, name, hash)), `Tag ${name} created`),
  deleteTag: (name) =>
    get().run('Deleting tag…', () => call(api.deleteTag(get().repo!.path, name)), `Tag ${name} deleted`),
  stashSave: (message) =>
    get().run('Stashing…', () => call(api.stashSave(get().repo!.path, message)), 'Stash saved'),
  stashApply: (index) =>
    get().run('Applying stash…', () => call(api.stashApply(get().repo!.path, index)), 'Stash applied'),
  stashPop: (index) =>
    get().run('Popping stash…', () => call(api.stashPop(get().repo!.path, index)), 'Stash applied'),
  stashDrop: (index) =>
    get().run('Dropping stash…', () => call(api.stashDrop(get().repo!.path, index)), 'Stash dropped'),
  stashRename: (index, message) =>
    get().run(
      'Renaming stash…',
      () => call(api.stashRename(get().repo!.path, index, message)),
      'Stash renamed'
    ),
  addRemote: (name, url) =>
    get().run('Adding remote…', () => call(api.addRemote(get().repo!.path, name, url)), 'Remote added'),
  removeRemote: (name) =>
    get().run('Removing remote…', () => call(api.removeRemote(get().repo!.path, name)), 'Remote removed')
}))

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
