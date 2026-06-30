import { app } from 'electron'
import { promises as fs } from 'fs'
import { join, basename } from 'path'
import type { RecentRepo } from '@shared/types'

// Tiny JSON-file persistence for app-level state (recent repositories, etc.).
// Lives in the per-user Electron userData directory.

interface PersistedState {
  recentRepos: RecentRepo[]
}

const FILE = () => join(app.getPath('userData'), 'state.json')
const MAX_RECENT = 15

let state: PersistedState = { recentRepos: [] }
let loaded = false

async function load(): Promise<void> {
  if (loaded) return
  try {
    const txt = await fs.readFile(FILE(), 'utf8')
    state = { recentRepos: [], ...JSON.parse(txt) }
  } catch {
    state = { recentRepos: [] }
  }
  loaded = true
}

async function save(): Promise<void> {
  try {
    await fs.writeFile(FILE(), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    // ignore persistence failures
  }
}

export const store = {
  async getRecentRepos(): Promise<RecentRepo[]> {
    await load()
    return [...state.recentRepos].sort((a, b) => b.lastOpened - a.lastOpened)
  },

  async addRecentRepo(path: string, now: number): Promise<RecentRepo[]> {
    await load()
    const existing = state.recentRepos.filter((r) => r.path !== path)
    existing.unshift({ path, name: basename(path), lastOpened: now })
    state.recentRepos = existing.slice(0, MAX_RECENT)
    await save()
    return this.getRecentRepos()
  },

  async removeRecentRepo(path: string): Promise<RecentRepo[]> {
    await load()
    state.recentRepos = state.recentRepos.filter((r) => r.path !== path)
    await save()
    return this.getRecentRepos()
  }
}
