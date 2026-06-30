import type { DiffFile, DiffHunk, DiffLine } from '@shared/types'

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

function stripPrefix(p: string): string {
  let s = p.trim()
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1)
  if (s === '/dev/null') return s
  if (s.startsWith('a/') || s.startsWith('b/')) return s.slice(2)
  return s
}

/**
 * Parse a unified git diff (output of `git diff` / `git diff-tree -p`) into a
 * structured list of files, hunks and lines with old/new line numbers.
 */
export function parseUnifiedDiff(patch: string): DiffFile[] {
  if (!patch || !patch.trim()) return []
  const lines = patch.split('\n')
  const files: DiffFile[] = []

  let file: DiffFile | null = null
  let hunk: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0

  const pushFile = (): void => {
    if (file) {
      if (hunk) file.hunks.push(hunk)
      files.push(file)
    }
    hunk = null
  }

  for (const raw of lines) {
    if (raw.startsWith('diff --git ')) {
      pushFile()
      // Try to recover paths from the header; refined by ---/+++ lines later.
      const m = raw.match(/^diff --git a\/(.+) b\/(.+)$/)
      file = {
        oldPath: m ? m[1] : '',
        newPath: m ? m[2] : '',
        status: 'modified',
        isBinary: false,
        additions: 0,
        deletions: 0,
        hunks: []
      }
      continue
    }
    if (!file) continue

    if (raw.startsWith('new file mode')) {
      file.status = 'added'
      continue
    }
    if (raw.startsWith('deleted file mode')) {
      file.status = 'deleted'
      continue
    }
    if (raw.startsWith('rename from ')) {
      file.status = 'renamed'
      file.oldPath = stripPrefix(raw.slice('rename from '.length))
      continue
    }
    if (raw.startsWith('rename to ')) {
      file.status = 'renamed'
      file.newPath = stripPrefix(raw.slice('rename to '.length))
      continue
    }
    if (raw.startsWith('Binary files') || raw.startsWith('GIT binary patch')) {
      file.isBinary = true
      continue
    }
    if (raw.startsWith('--- ')) {
      const p = stripPrefix(raw.slice(4))
      if (p !== '/dev/null') file.oldPath = p
      continue
    }
    if (raw.startsWith('+++ ')) {
      const p = stripPrefix(raw.slice(4))
      if (p !== '/dev/null') file.newPath = p
      continue
    }
    if (raw.startsWith('index ') || raw.startsWith('old mode') || raw.startsWith('new mode') || raw.startsWith('similarity index') || raw.startsWith('dissimilarity index') || raw.startsWith('copy from') || raw.startsWith('copy to')) {
      continue
    }

    const hm = raw.match(HUNK_RE)
    if (hm) {
      if (hunk) file.hunks.push(hunk)
      oldLine = parseInt(hm[1], 10)
      newLine = parseInt(hm[3], 10)
      hunk = { header: raw, lines: [] }
      continue
    }

    if (!hunk) continue

    if (raw.startsWith('\\')) {
      // "\ No newline at end of file" — informational
      continue
    }

    const marker = raw[0]
    const content = raw.slice(1)
    let line: DiffLine
    if (marker === '+') {
      line = { type: 'add', content, oldLine: null, newLine }
      newLine++
      file.additions++
    } else if (marker === '-') {
      line = { type: 'del', content, oldLine, newLine: null }
      oldLine++
      file.deletions++
    } else {
      line = { type: 'context', content, oldLine, newLine }
      oldLine++
      newLine++
    }
    hunk.lines.push(line)
  }

  pushFile()

  // Normalize paths: if a path is still empty use the other side.
  for (const f of files) {
    if (!f.oldPath) f.oldPath = f.newPath
    if (!f.newPath) f.newPath = f.oldPath
  }
  return files
}
