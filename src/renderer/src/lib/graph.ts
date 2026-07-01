import type { Commit } from '@shared/types'
import { branding } from '../branding'

const PALETTE = branding.graphColors

export interface GraphRoute {
  fromCol: number
  toCol: number
  color: string
  /** true when this edge belongs to the current branch's first-parent chain */
  current?: boolean
}

export interface GraphRow {
  hash: string
  col: number
  color: string
  /** true when this commit sits on the current branch's first-parent chain */
  current: boolean
  /** lanes from the row above that bend into this commit node */
  incoming: GraphRoute[]
  /** lanes leaving this node downward (to its parents) */
  outgoing: GraphRoute[]
  /** lanes that pass straight through this row without touching the node */
  passing: { col: number; color: string; current?: boolean }[]
}

export interface GraphLayout {
  rows: GraphRow[]
  /** total number of columns used (graph width in lanes) */
  width: number
}

type Lane = { target: string; color: string; current: boolean } | null

function firstNull(arr: Lane[]): number {
  for (let i = 0; i < arr.length; i++) if (!arr[i]) return i
  return arr.length
}

function trimTrailingNulls(arr: Lane[]): Lane[] {
  let end = arr.length
  while (end > 0 && !arr[end - 1]) end--
  return arr.slice(0, end)
}

/**
 * Lane-assignment + edge-routing for a commit DAG.
 *
 * Commits must be in newest-first order where every parent appears *after* all
 * of its children (git log --date-order guarantees this). We walk top→bottom
 * maintaining a set of "lanes", each flowing toward the next commit it expects.
 *
 * When `currentTip` is given, the first-parent chain starting from it is flagged
 * as `current` on rows and edges so the UI can highlight the active branch line.
 */
export function computeGraph(commits: Commit[], currentTip?: string | null): GraphLayout {
  // First-parent chain of the current branch (tip → root along parents[0]).
  const chain = new Set<string>()
  if (currentTip) {
    const byHash = new Map(commits.map((c) => [c.hash, c]))
    let h: string | undefined = currentTip
    while (h && byHash.has(h) && !chain.has(h)) {
      chain.add(h)
      h = byHash.get(h)!.parents[0]
    }
  }

  let lanes: Lane[] = []
  let colorCounter = 0
  const nextColor = (): string => PALETTE[colorCounter++ % PALETTE.length]
  const rows: GraphRow[] = []
  let width = 1

  for (const c of commits) {
    const lanesAbove = lanes.slice()
    const onChain = chain.has(c.hash)

    // Which column does this commit live in?
    let myCol = lanesAbove.findIndex((l) => l && l.target === c.hash)
    let color: string
    if (myCol === -1) {
      myCol = firstNull(lanesAbove) // brand-new branch tip / head
      color = nextColor()
    } else {
      color = lanesAbove[myCol]!.color
    }

    // Edges coming down from above that merge into this node.
    const incoming: GraphRoute[] = []
    lanesAbove.forEach((l, col) => {
      if (l && l.target === c.hash) {
        incoming.push({ fromCol: col, toCol: myCol, color: l.color, current: l.current })
      }
    })

    // Compute lanes flowing below this row.
    const lanesBelow: Lane[] = lanesAbove.slice()
    lanesAbove.forEach((l, col) => {
      if (l && l.target === c.hash) lanesBelow[col] = null // they merged into myCol
    })

    const outgoing: GraphRoute[] = []
    if (c.parents.length > 0) {
      // First-parent edge continues the (possibly current) branch line.
      const fpCurrent = onChain && chain.has(c.parents[0])
      lanesBelow[myCol] = { target: c.parents[0], color, current: fpCurrent }
      outgoing.push({ fromCol: myCol, toCol: myCol, color, current: fpCurrent })
      for (let i = 1; i < c.parents.length; i++) {
        const pcol = firstNull(lanesBelow)
        const pcolor = nextColor()
        lanesBelow[pcol] = { target: c.parents[i], color: pcolor, current: false }
        outgoing.push({ fromCol: myCol, toCol: pcol, color: pcolor, current: false })
      }
    } else {
      lanesBelow[myCol] = null // root commit closes its lane
    }

    // Lanes that just pass through untouched.
    const passing: { col: number; color: string; current?: boolean }[] = []
    lanesAbove.forEach((l, col) => {
      if (l && l.target !== c.hash && lanesBelow[col] && lanesBelow[col]!.target === l.target) {
        passing.push({ col, color: l.color, current: l.current })
      }
    })

    const usedCols = [
      myCol,
      ...incoming.map((r) => r.fromCol),
      ...outgoing.map((r) => r.toCol),
      ...passing.map((p) => p.col),
      lanesBelow.length - 1
    ]
    width = Math.max(width, ...usedCols.map((n) => n + 1))

    rows.push({ hash: c.hash, col: myCol, color, current: onChain, incoming, outgoing, passing })
    lanes = trimTrailingNulls(lanesBelow)
  }

  return { rows, width }
}
