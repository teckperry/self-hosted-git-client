import { contextBridge, ipcRenderer } from 'electron'
import { Channels } from '@shared/ipc'
import type {
  IpcResult,
  RepoInfo,
  Commit,
  RepoStatus,
  Branch,
  Remote,
  Stash,
  Tag,
  DiffFile,
  FileChange,
  CommitOptions,
  CloneOptions,
  PushOptions,
  SshKey,
  GenerateSshKeyOptions,
  RecentRepo,
  AppSession,
  UpdateInfo,
  MergeState,
  MergeOperation
} from '@shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> =>
  ipcRenderer.invoke(channel, ...args)

const api = {
  // app
  selectDirectory: () => invoke<string | null>(Channels.selectDirectory),
  openExternal: (url: string) => invoke<void>(Channels.openExternal, url),
  getRecentRepos: () => invoke<RecentRepo[]>(Channels.getRecentRepos),
  addRecentRepo: (path: string) => invoke<RecentRepo[]>(Channels.addRecentRepo, path),
  removeRecentRepo: (path: string) => invoke<RecentRepo[]>(Channels.removeRecentRepo, path),
  getSession: () => invoke<AppSession>(Channels.getSession),
  setSession: (openRepos: string[], activeRepo: string | null) =>
    invoke<void>(Channels.setSession, openRepos, activeRepo),
  checkForUpdate: () => invoke<UpdateInfo | null>(Channels.checkForUpdate),
  downloadUpdate: (url: string) => invoke<string>(Channels.downloadUpdate, url),

  // repo lifecycle
  openRepo: (path: string) => invoke<RepoInfo>(Channels.openRepo, path),
  cloneRepo: (opts: CloneOptions) => invoke<string>(Channels.cloneRepo, opts),
  initRepo: (path: string) => invoke<RepoInfo>(Channels.initRepo, path),

  // reads
  getCommits: (path: string, limit?: number) => invoke<Commit[]>(Channels.getCommits, path, limit),
  getStatus: (path: string) => invoke<RepoStatus>(Channels.getStatus, path),
  getBranches: (path: string) => invoke<Branch[]>(Channels.getBranches, path),
  getRemotes: (path: string) => invoke<Remote[]>(Channels.getRemotes, path),
  getStashes: (path: string) => invoke<Stash[]>(Channels.getStashes, path),
  getTags: (path: string) => invoke<Tag[]>(Channels.getTags, path),
  getCommitDiff: (path: string, hash: string) =>
    invoke<DiffFile[]>(Channels.getCommitDiff, path, hash),
  getWorkingDiff: (path: string, file: string, opts: { staged: boolean; untracked: boolean }) =>
    invoke<DiffFile[]>(Channels.getWorkingDiff, path, file, opts),
  searchCommits: (path: string, query: string) =>
    invoke<string[]>(Channels.searchCommits, path, query),

  // mutations
  stage: (path: string, files: string[]) => invoke<void>(Channels.stage, path, files),
  unstage: (path: string, files: string[]) => invoke<void>(Channels.unstage, path, files),
  stageAll: (path: string) => invoke<void>(Channels.stageAll, path),
  unstageAll: (path: string) => invoke<void>(Channels.unstageAll, path),
  discard: (path: string, file: FileChange) => invoke<void>(Channels.discard, path, file),
  commit: (path: string, opts: CommitOptions) => invoke<void>(Channels.commit, path, opts),
  push: (path: string, opts: PushOptions) => invoke<string>(Channels.push, path, opts),
  pull: (path: string, remote?: string, branch?: string) =>
    invoke<string>(Channels.pull, path, remote, branch),
  pullFastForward: (path: string) => invoke<void>(Channels.pullFastForward, path),
  fetch: (path: string) => invoke<void>(Channels.fetch, path),

  checkoutBranch: (path: string, name: string, isRemote: boolean) =>
    invoke<void>(Channels.checkoutBranch, path, name, isRemote),
  createBranch: (path: string, name: string, checkout: boolean) =>
    invoke<void>(Channels.createBranch, path, name, checkout),
  deleteBranch: (path: string, name: string, force: boolean) =>
    invoke<void>(Channels.deleteBranch, path, name, force),
  renameBranch: (path: string, oldName: string, newName: string) =>
    invoke<void>(Channels.renameBranch, path, oldName, newName),
  deleteRemoteBranch: (path: string, remoteRef: string) =>
    invoke<void>(Channels.deleteRemoteBranch, path, remoteRef),
  mergeBranch: (path: string, name: string) => invoke<string>(Channels.mergeBranch, path, name),

  checkoutCommit: (path: string, hash: string) => invoke<void>(Channels.checkoutCommit, path, hash),
  rewordHead: (path: string, message: string) =>
    invoke<void>(Channels.rewordHead, path, message),
  remoteWebUrl: (path: string) => invoke<string | null>(Channels.remoteWebUrl, path),
  mergeState: (path: string) => invoke<MergeState>(Channels.mergeState, path),
  resolveConflict: (path: string, file: string, side: 'ours' | 'theirs') =>
    invoke<void>(Channels.resolveConflict, path, file, side),
  markConflictResolved: (path: string, file: string) =>
    invoke<void>(Channels.markConflictResolved, path, file),
  readConflictText: (path: string, file: string) =>
    invoke<string>(Channels.readConflictText, path, file),
  resolveConflictWith: (path: string, file: string, content: string) =>
    invoke<void>(Channels.resolveConflictWith, path, file, content),
  abortOperation: (path: string, op: MergeOperation) =>
    invoke<void>(Channels.abortOperation, path, op),
  continueOperation: (path: string, op: MergeOperation) =>
    invoke<void>(Channels.continueOperation, path, op),
  resetTo: (path: string, hash: string, mode: 'soft' | 'mixed' | 'hard') =>
    invoke<void>(Channels.resetTo, path, hash, mode),
  revertCommit: (path: string, hash: string) => invoke<void>(Channels.revertCommit, path, hash),
  cherryPick: (path: string, hash: string) => invoke<void>(Channels.cherryPick, path, hash),
  createTag: (path: string, name: string, hash?: string) =>
    invoke<void>(Channels.createTag, path, name, hash),
  deleteTag: (path: string, name: string) => invoke<void>(Channels.deleteTag, path, name),

  stashSave: (path: string, message: string) => invoke<void>(Channels.stashSave, path, message),
  stashApply: (path: string, index: number) => invoke<void>(Channels.stashApply, path, index),
  stashPop: (path: string, index: number) => invoke<void>(Channels.stashPop, path, index),
  stashDrop: (path: string, index: number) => invoke<void>(Channels.stashDrop, path, index),
  stashRename: (path: string, index: number, message: string) =>
    invoke<void>(Channels.stashRename, path, index, message),

  addRemote: (path: string, name: string, url: string) =>
    invoke<void>(Channels.addRemote, path, name, url),
  removeRemote: (path: string, name: string) => invoke<void>(Channels.removeRemote, path, name),

  getUserConfig: (path: string) =>
    invoke<{ name: string; email: string }>(Channels.getUserConfig, path),
  setUserConfig: (path: string, name: string, email: string) =>
    invoke<void>(Channels.setUserConfig, path, name, email),

  // ssh
  listSshKeys: () => invoke<SshKey[]>(Channels.listSshKeys),
  generateSshKey: (opts: GenerateSshKeyOptions) => invoke<SshKey>(Channels.generateSshKey, opts),
  deleteSshKey: (name: string) => invoke<void>(Channels.deleteSshKey, name)
}

export type GitApi = typeof api

contextBridge.exposeInMainWorld('api', api)
