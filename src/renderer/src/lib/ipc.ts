import type { IpcResult } from '@shared/types'

/** The preload-exposed API. */
export const api = window.api

/** Unwrap an IpcResult, throwing a normal Error on failure. */
export async function call<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const res = await promise
  if (!res.ok) throw new Error(res.error)
  return res.data
}
