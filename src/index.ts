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
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      const iterator = segmenter.segment(word)[Symbol.iterator]()
      let curr = 0
      for (const l of iterator) {
        const segment = l.segment
        if (gotoFn[curr] && segment in gotoFn[curr]) {
          curr = gotoFn[curr][segment]
        }
        else {
          state++
          gotoFn[curr][segment] = state
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
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const iterator = segmenter.segment(str)[Symbol.iterator]()
    let count = -1

    for (const l of iterator) {
      const segment = l.segment
      count++
      while (state > 0 && !(segment in this.gotoFn[state])) {
        state = this.failure[state]
      }
      // 使用 object ，表情符号出现问题
      if (!(segment in this.gotoFn[state])) {
        continue
      }

      state = this.gotoFn[state][segment]

      if (this.output[state].length > 0) {
        const foundStrs = this.output[state]
        results.push([count, foundStrs])
      }
    }

    return results
  }

  match(str: string) {
    let state = 0
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const iterator = segmenter.segment(str)[Symbol.iterator]()

    for (const l of iterator) {
      const segment = l.segment
      while (state > 0 && !(segment in this.gotoFn[state])) {
        state = this.failure[state]
      }
      // 使用 object ，表情符号出现问题
      if (!(segment in this.gotoFn[state])) {
        continue
      }

      state = this.gotoFn[state][segment]

      if (this.output[state].length > 0) {
        return true
      }
    }

    return false
  }
}
