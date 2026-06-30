// ---------------------------------------------------------------------------
// Shared types used by both the Electron main process and the React renderer.
// Keep this file framework-free (no node, no DOM) so it can be imported safely
// from either side of the IPC bridge.
// ---------------------------------------------------------------------------

/** Generic result envelope used for every IPC call so errors cross the bridge cleanly. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface RepoInfo {
  path: string
  name: string
  currentBranch: string
  isDetached: boolean
}

export interface CommitRef {
  /** e.g. "main", "origin/main", "v1.0.0", "HEAD" */
  name: string
  type: 'head' | 'remote' | 'tag' | 'HEAD' | 'stash'
}

export interface Commit {
  hash: string
  shortHash: string
  parents: string[]
  author: string
  authorEmail: string
  /** ISO date string */
  date: string
  subject: string
  body: string
  refs: CommitRef[]
}

/** A working-directory / index file change. */
export interface FileChange {
  path: string
  /** original path for renames */
  origPath?: string
  /** single-letter git status: M, A, D, R, C, U, ? */
  index: string
  workingDir: string
  staged: boolean
  /** convenience high-level status */
  kind: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted'
}

export interface RepoStatus {
  current: string
  tracking: string | null
  ahead: number
  behind: number
  staged: FileChange[]
  unstaged: FileChange[]
  conflicted: string[]
  isClean: boolean
}

export interface Branch {
  name: string
  current: boolean
  isRemote: boolean
  upstream: string | null
  ahead: number
  behind: number
  commit: string
  label: string
}

export interface Remote {
  name: string
  fetch: string
  push: string
}

export interface Stash {
  index: number
  message: string
  hash: string
}

export interface Tag {
  name: string
  hash: string
}

// --- Diff model -------------------------------------------------------------

export type DiffLineType = 'context' | 'add' | 'del' | 'hunk' | 'meta'

export interface DiffLine {
  type: DiffLineType
  content: string
  oldLine: number | null
  newLine: number | null
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface DiffFile {
  oldPath: string
  newPath: string
  /** 'modified' | 'added' | 'deleted' | 'renamed' | 'binary' */
  status: string
  isBinary: boolean
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

// --- SSH --------------------------------------------------------------------

export interface SshKey {
  /** file name without extension, e.g. "id_ed25519" */
  name: string
  privatePath: string
  publicPath: string
  publicKey: string
  type: string
  comment: string
  fingerprint: string
}

export interface GenerateSshKeyOptions {
  fileName: string
  type: 'ed25519' | 'rsa'
  comment: string
  passphrase: string
}

// --- IPC payloads -----------------------------------------------------------

export interface CommitOptions {
  message: string
  amend?: boolean
}

export interface CloneOptions {
  url: string
  directory: string
}

export interface PushOptions {
  remote?: string
  branch?: string
  setUpstream?: boolean
  force?: boolean
}

export interface RecentRepo {
  path: string
  name: string
  lastOpened: number
}

/** Persisted UI session: which repos are open as tabs and which one is active. */
export interface AppSession {
  openRepos: string[]
  activeRepo: string | null
}
