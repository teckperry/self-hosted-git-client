import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { Channels } from '@shared/ipc'
import type {
  IpcResult,
  FileChange,
  CommitOptions,
  CloneOptions,
  PushOptions,
  GenerateSshKeyOptions
} from '@shared/types'
import { gitService } from './services/gitService'
import { sshService } from './services/sshService'
import { store } from './services/store'

/** Wrap a handler so every IPC call returns a typed { ok, data | error } envelope. */
function handle<T>(
  channel: string,
  fn: (...args: any[]) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (_evt, ...args): Promise<IpcResult<T>> => {
    try {
      const data = await fn(...args)
      return { ok: true, data }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
      return { ok: false, error: cleanGitError(message) }
    }
  })
}

/** Make raw git/cli stderr a bit friendlier for the UI. */
function cleanGitError(msg: string): string {
  return msg
    .replace(/^Error:\s*/i, '')
    .replace(/\n+/g, '\n')
    .trim()
}

export function registerIpcHandlers(): void {
  // --- app / dialogs ---
  handle(Channels.selectDirectory, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : res.filePaths[0]
  })
  handle(Channels.openExternal, async (url: string) => {
    await shell.openExternal(url)
  })
  handle(Channels.getRecentRepos, () => store.getRecentRepos())
  handle(Channels.addRecentRepo, (path: string) => store.addRecentRepo(path, Date.now()))
  handle(Channels.removeRecentRepo, (path: string) => store.removeRecentRepo(path))
  handle(Channels.getSession, () => store.getSession())
  handle(Channels.setSession, (openRepos: string[], activeRepo: string | null) =>
    store.setSession(openRepos, activeRepo)
  )

  // --- repo lifecycle ---
  handle(Channels.openRepo, (path: string) => gitService.openRepo(path))
  handle(Channels.cloneRepo, (opts: CloneOptions) => gitService.cloneRepo(opts))
  handle(Channels.initRepo, (path: string) => gitService.initRepo(path))

  // --- reads ---
  handle(Channels.getCommits, (path: string, limit?: number) =>
    gitService.getCommits(path, limit)
  )
  handle(Channels.getStatus, (path: string) => gitService.getStatus(path))
  handle(Channels.getBranches, (path: string) => gitService.getBranches(path))
  handle(Channels.getRemotes, (path: string) => gitService.getRemotes(path))
  handle(Channels.getStashes, (path: string) => gitService.getStashes(path))
  handle(Channels.getTags, (path: string) => gitService.getTags(path))
  handle(Channels.getCommitDiff, (path: string, hash: string) =>
    gitService.getCommitDiff(path, hash)
  )
  handle(
    Channels.getWorkingDiff,
    (path: string, file: string, opts: { staged: boolean; untracked: boolean }) =>
      gitService.getWorkingDiff(path, file, opts)
  )

  // --- mutations ---
  handle(Channels.stage, (path: string, files: string[]) => gitService.stage(path, files))
  handle(Channels.unstage, (path: string, files: string[]) => gitService.unstage(path, files))
  handle(Channels.stageAll, (path: string) => gitService.stageAll(path))
  handle(Channels.unstageAll, (path: string) => gitService.unstageAll(path))
  handle(Channels.discard, (path: string, file: FileChange) => gitService.discard(path, file))
  handle(Channels.commit, (path: string, opts: CommitOptions) => gitService.commit(path, opts))
  handle(Channels.push, (path: string, opts: PushOptions) => gitService.push(path, opts))
  handle(Channels.pull, (path: string, remote?: string, branch?: string) =>
    gitService.pull(path, remote, branch)
  )
  handle(Channels.fetch, (path: string) => gitService.fetch(path))

  handle(Channels.checkoutBranch, (path: string, name: string, isRemote: boolean) =>
    gitService.checkoutBranch(path, name, isRemote)
  )
  handle(Channels.createBranch, (path: string, name: string, checkout: boolean) =>
    gitService.createBranch(path, name, checkout)
  )
  handle(Channels.deleteBranch, (path: string, name: string, force: boolean) =>
    gitService.deleteBranch(path, name, force)
  )
  handle(Channels.mergeBranch, (path: string, name: string) =>
    gitService.mergeBranch(path, name)
  )

  handle(Channels.checkoutCommit, (path: string, hash: string) =>
    gitService.checkoutCommit(path, hash)
  )
  handle(Channels.resetTo, (path: string, hash: string, mode: 'soft' | 'mixed' | 'hard') =>
    gitService.resetTo(path, hash, mode)
  )
  handle(Channels.revertCommit, (path: string, hash: string) =>
    gitService.revertCommit(path, hash)
  )
  handle(Channels.cherryPick, (path: string, hash: string) => gitService.cherryPick(path, hash))
  handle(Channels.createTag, (path: string, name: string, hash?: string) =>
    gitService.createTag(path, name, hash)
  )

  handle(Channels.stashSave, (path: string, message: string) =>
    gitService.stashSave(path, message)
  )
  handle(Channels.stashApply, (path: string, index: number) => gitService.stashApply(path, index))
  handle(Channels.stashPop, (path: string, index: number) => gitService.stashPop(path, index))
  handle(Channels.stashDrop, (path: string, index: number) => gitService.stashDrop(path, index))
  handle(Channels.stashRename, (path: string, index: number, message: string) =>
    gitService.stashRename(path, index, message)
  )

  handle(Channels.addRemote, (path: string, name: string, url: string) =>
    gitService.addRemote(path, name, url)
  )
  handle(Channels.removeRemote, (path: string, name: string) =>
    gitService.removeRemote(path, name)
  )

  handle(Channels.getUserConfig, (path: string) => gitService.getUserConfig(path))
  handle(Channels.setUserConfig, (path: string, name: string, email: string) =>
    gitService.setUserConfig(path, name, email)
  )

  // --- ssh ---
  handle(Channels.listSshKeys, () => sshService.listKeys())
  handle(Channels.generateSshKey, (opts: GenerateSshKeyOptions) => sshService.generateKey(opts))
  handle(Channels.deleteSshKey, (name: string) => sshService.deleteKey(name))
}
