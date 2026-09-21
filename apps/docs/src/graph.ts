/** Read-only display model, independent of the Vue renderer and scan trace. */
export interface GraphNode {
  id: number
  prefix: string
  ownPatternIndices: number[]
  failure: number
  output: string[]
  patternIndices: number[]
  terminal: boolean
  edges: { label: string, target: number }[]
}
