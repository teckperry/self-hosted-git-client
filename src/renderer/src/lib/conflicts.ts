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

/** A reference to one line of a conflict hunk, from either side. */
export interface LineRef {
  side: 'ours' | 'theirs'
  /** index into that side's line array */
  index: number
}

/** Per-conflict ordered selection of lines to keep (order = result order). */
export type Selection = LineRef[]

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

/** Assemble the final file text from the per-hunk ordered line selections. */
export function assembleResult(
  parts: MergePart[],
  selections: Selection[]
): { text: string; unresolved: number } {
  const out: string[] = []
  let ci = 0
  let unresolved = 0
  for (const p of parts) {
    if (p.kind === 'context') {
      out.push(...p.lines)
    } else {
      const sel = selections[ci] ?? []
      if (sel.length === 0) unresolved++
      for (const ref of sel) {
        const src = ref.side === 'ours' ? p.ours : p.theirs
        if (ref.index < src.length) out.push(src[ref.index])
      }
      ci++
    }
  }
  return { text: out.join('\n'), unresolved }
}
