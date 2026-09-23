// Exercise an otherwise impractically large occurrence total without huge inputs.
vi.mock('../src/internal', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/internal')>()
  return {
    ...original,
    buildAutomaton: (...args: Parameters<typeof original.buildAutomaton>) => {
      const compiled = original.buildAutomaton(...args)
      const state = compiled.compact.roots[compiled.compact.symbols.get('a')!]
      compiled.counts = new Proxy(compiled.counts, {
        get: (target, key) => {
          if (key === String(state)) {
            return Number.MAX_SAFE_INTEGER
          }
          const value = Reflect.get(target, key)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      return compiled
    },
  }
})

it('rejects an inexact count instead of silently rounding it', async () => {
  const { default: AhoCorasick } = await import('../src/index')
  const matcher = new AhoCorasick(['a'])
  expect(matcher.count('a')).toBe(Number.MAX_SAFE_INTEGER)
  expect(matcher.count('a猫')).toBe(Number.MAX_SAFE_INTEGER)
  expect(() => matcher.count('aa')).toThrow(RangeError)
  expect(() => matcher.count('aa猫')).toThrow(RangeError)
  expect(() => matcher.count('a猫a')).toThrow(RangeError)
  // Cross the startup probe and carry an exact total from ASCII into ICU.
  expect(matcher.count('axxxxxxxx猫')).toBe(Number.MAX_SAFE_INTEGER)
  expect(() => matcher.count('axxxxxxxx猫a')).toThrow(RangeError)
})
