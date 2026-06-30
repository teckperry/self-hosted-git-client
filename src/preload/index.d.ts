import type { GitApi } from './index'

declare global {
  interface Window {
    api: GitApi
  }
}

export {}
