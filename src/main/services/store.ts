import { app } from 'electron'
import { promises as fs } from 'fs'
import { join, basename } from 'path'
import type { RecentRepo, AppSession } from '@shared/types'

// Tiny JSON-file persistence for app-level state (recent repositories, open
// tabs, …). Lives in the per-user Electron userData directory.

interface PersistedState {
  recentRepos: RecentRepo[]
  openRepos: string[]
  activeRepo: string | null
}

const FILE = () => join(app.getPath('userData'), 'state.json')
const MAX_RECENT = 15

// Screenshot/demo mode (used to generate the README pictures): seed the
// session with the given repo and never read from or write to the user's
// real state file.
const DEMO_REPO = process.env.SCREENSHOT_REPO

const emptyState = (): PersistedState => ({ recentRepos: [], openRepos: [], activeRepo: null })

let state: PersistedState = emptyState()
let loaded = false

async function load(): Promise<void> {
  if (loaded) return
  if (DEMO_REPO) {
    state = { recentRepos: [], openRepos: [DEMO_REPO], activeRepo: DEMO_REPO }
    loaded = true
    return
  }
  try {
    const txt = await fs.readFile(FILE(), 'utf8')
    state = { ...emptyState(), ...JSON.parse(txt) }
  } catch {
    state = emptyState()
  }
  loaded = true
}

async function save(): Promise<void> {
  if (DEMO_REPO) return
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
  },

  async getSession(): Promise<AppSession> {
    await load()
    return { openRepos: state.openRepos ?? [], activeRepo: state.activeRepo ?? null }
  },

  async setSession(openRepos: string[], activeRepo: string | null): Promise<void> {
    await load()
    state.openRepos = openRepos
    state.activeRepo = activeRepo
    await save()
  }
}
