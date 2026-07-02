// Parse a conflicted file's text (with git's `<<<<<<< ======= >>>>>>>` markers,
// optionally the diff3 `|||||||` base section) into an ordered list of parts:
// shared context blocks and conflict hunks. Used by the merge resolver to show
// ours/theirs side by side and assemble the chosen result.

export interface ContextBlock {
  kind: 'context'
  lines: string[]
}

export interface ConflictHunk {
  kind: 'conflict'
  ours: string[]
  theirs: string[]
  /** the common ancestor lines, only present with diff3 conflict style */
  base: string[] | null
}

export type MergePart = ContextBlock | ConflictHunk

/** Which side(s) of a conflict hunk to keep, in the result (ours before theirs). */
export interface Choice {
  ours: boolean
  theirs: boolean
}

export function parseConflicts(text: string): MergePart[] {
  const lines = text.split('\n')
  const parts: MergePart[] = []
  let ctx: string[] = []
  const flush = (): void => {
    if (ctx.length) parts.push({ kind: 'context', lines: ctx })
    ctx = []
  }
  let i = 0
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      flush()
      i++ // skip the "<<<<<<< ours" marker
      const ours: string[] = []
      while (i < lines.length && !lines[i].startsWith('|||||||') && !lines[i].startsWith('=======')) {
        ours.push(lines[i++])
      }
      let base: string[] | null = null
      if (i < lines.length && lines[i].startsWith('|||||||')) {
        base = []
        i++ // skip the "|||||||" marker
        while (i < lines.length && !lines[i].startsWith('=======')) base.push(lines[i++])
      }
      if (i < lines.length && lines[i].startsWith('=======')) i++ // skip "======="
      const theirs: string[] = []
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) theirs.push(lines[i++])
      if (i < lines.length && lines[i].startsWith('>>>>>>>')) i++ // skip ">>>>>>> theirs"
      parts.push({ kind: 'conflict', ours, theirs, base })
    } else {
      ctx.push(lines[i++])
    }
  }
  flush()
  return parts
}

export function conflictCount(parts: MergePart[]): number {
  return parts.filter((p) => p.kind === 'conflict').length
}

/** Assemble the final file text from the per-hunk choices. */
export function assembleResult(
  parts: MergePart[],
  choices: Choice[]
): { text: string; unresolved: number } {
  const out: string[] = []
  let ci = 0
  let unresolved = 0
  for (const p of parts) {
    if (p.kind === 'context') {
      out.push(...p.lines)
    } else {
      const ch = choices[ci] ?? { ours: false, theirs: false }
      if (ch.ours) out.push(...p.ours)
      if (ch.theirs) out.push(...p.theirs)
      if (!ch.ours && !ch.theirs) unresolved++
      ci++
    }
  }
  return { text: out.join('\n'), unresolved }
}
