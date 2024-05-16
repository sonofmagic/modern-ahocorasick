export default class AhoCorasick {
  gotoFn: Record<number, Record<string, number>>
  output: Record<number, string[]>
  failure: Record<number, number>
  constructor(keywords: string[]) {
    const { failure, gotoFn, output } = this._buildTables(keywords)

    this.gotoFn = gotoFn
    this.output = output
    this.failure = failure
  }

  _buildTables(keywords: string[]) {
    const gotoFn: Record<number, Record<string, number>> = {
      0: {},
    }
    const output: Record<number, string[]> = {}

    let state = 0
    for (const word of keywords) {
      let curr = 0
      for (const l of word) {
        if (gotoFn[curr] && l in gotoFn[curr]) {
          curr = gotoFn[curr][l]
        }
        else {
          state++
          gotoFn[curr][l] = state
          gotoFn[state] = {}
          curr = state
          output[state] = []
        }
      }

      output[curr].push(word)
    }

    const failure: Record<number, number> = {}
    const xs: number[] = []

    // f(s) = 0 for all states of depth 1 (the ones from which the 0 state can transition to)
    for (const l in gotoFn[0]) {
      const state = gotoFn[0][l]
      failure[state] = 0
      xs.push(state)
    }

    while (xs.length > 0) {
      const r = xs.shift()
      if (r !== undefined) {
        for (const l in gotoFn[r]) {
          const s = gotoFn[r][l]
          xs.push(s)

          // set state = f(r)
          let state = failure[r]
          while (state > 0 && !(l in gotoFn[state])) {
            state = failure[state]
          }

          if (l in gotoFn[state]) {
            const fs = gotoFn[state][l]
            failure[s] = fs
            output[s] = [...output[s], ...output[fs]]
          }
          else {
            failure[s] = 0
          }
        }
      }
      // for each symbol a such that g(r, a) = s
    }

    return {
      gotoFn,
      output,
      failure,
    }
  }

  search(str: string) {
    let state = 0
    const results: [number, string[]][] = []

    for (let i = 0; i < str.length; i++) {
      const l = str[i]
      while (state > 0 && !(l in this.gotoFn[state])) {
        state = this.failure[state]
      }
      // 使用 object ，表情符号出现问题
      if (!(l in this.gotoFn[state])) {
        continue
      }

      state = this.gotoFn[state][l]

      if (this.output[state].length > 0) {
        const foundStrs = this.output[state]
        results.push([i, foundStrs])
      }
    }

    return results
  }
}
