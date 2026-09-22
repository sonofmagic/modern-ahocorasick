import { readFileSync } from 'node:fs'
import { caseFold } from '../src/case-folding'
import DynamicDictionary from '../src/dynamic'
import FastAhoCorasick from '../src/fast'
import AhoCorasick from '../src/index'
import { fromMap, keep, mask, once, remove } from '../src/replace'
import UnicodeAhoCorasick from '../src/unicode'
import UnicodeFastAhoCorasick from '../src/unicode-fast'

describe.each([AhoCorasick, FastAhoCorasick])('%s exact backend', (Constructor) => {
  it('filters boundaries before overlap selection in every operation', () => {
    const matcher = new Constructor(['cat', 'cat-', 'at', 'cat'], { boundary: 'ascii' })
    const text = 'cat-x cat cat2 !cat!'
    expect(matcher.search(text).map(m => m.pattern)).toEqual(['cat', 'cat', 'cat', 'cat', 'cat', 'cat'])
    expect(matcher.count(text)).toBe(6)
    expect(matcher.match('scatter')).toBe(false)
    expect(matcher.replace(text, 'X')).toBe('X-x X cat2 !X!')
    expect(matcher.tokenize(text).map(token => token.text).join('')).toBe(text)
  })
  it('supports Unicode, whitespace, ASCII edge and custom boundary predicates', () => {
    expect(new Constructor(['cat'], { boundary: 'unicode' }).count('猫cat cat_ cat😀cat cat')).toBe(3)
    expect(new Constructor(['cat'], { boundary: 'whitespace' }).count('cat! cat\tcat\n')).toBe(2)
    expect(new Constructor(['!cat!'], { boundary: 'ascii-edge' }).match('a!cat!z')).toBe(true)
    const matcher = new Constructor(['cat'], { boundary: ({ left, right }) => left === '[' && right === ']' })
    expect(matcher.search('[cat] cat').map(m => [m.start, m.end])).toEqual([[1, 4]])
  })
  it('distinguishes global longest priority and uses original grapheme lengths', () => {
    const matcher = new Constructor(['ab', 'bcdef', 'f', 'ab'])
    expect(matcher.search('abcdef', { strategy: 'leftmost-longest' }).map(m => m.pattern)).toEqual(['ab', 'f'])
    expect(matcher.search('abcdef', { strategy: 'longest-first' }).map(m => m.pattern)).toEqual(['bcdef'])
    expect(matcher.replace('abcdef', 'X', { strategy: 'longest-first' })).toBe('aX')
    const unicode = new Constructor(['👨‍👩‍👧‍👦a', 'abc'])
    expect(unicode.search('👨‍👩‍👧‍👦abc', { strategy: 'longest-first' }).map(m => m.pattern)).toEqual(['abc'])
  })
})
describe.each([UnicodeAhoCorasick, UnicodeFastAhoCorasick])('%s full folding', (Constructor) => {
  it('maps expansions to complete original graphemes and retains duplicate entries', () => {
    const matcher = new Constructor(['ss', 'ß', 's', 'STRASSE'])
    expect(matcher.search('ß').map(m => [m.pattern, m.start, m.end])).toEqual([['ss', 0, 1], ['ß', 0, 1]])
    expect(matcher.replace('😀Straße', (match, original) => `${match.pattern}:${original}`)).toBe('😀STRASSE:Straße')
    expect(new Constructor(['i']).match('İ')).toBe(false)
    expect(new Constructor(['i\u0307']).search('İ')[0]).toMatchObject({ start: 0, end: 1 })
    expect(new Constructor(['é']).match('e\u0301')).toBe(false)
    expect(new Constructor(['σ']).count('Σςσ')).toBe(3)
    expect(new Constructor(['s']).count('ß')).toBe(0)
    expect(new Constructor(['ff']).match('ﬃ')).toBe(false)
    expect(new Constructor(['ffi']).match('ﬃ')).toBe(true)
  })
})
it('uses every official Unicode 17.0 full/common case-fold mapping', () => {
  const source = readFileSync(new URL('./fixtures/CaseFolding-17.0.0.txt', import.meta.url), 'utf8')
  let count = 0
  for (const line of source.split('\n')) {
    const [code, status, mapping] = line.split('#')[0].split(';').map(value => value.trim())
    if (status !== 'C' && status !== 'F') {
      continue
    }
    const expected = String.fromCodePoint(...mapping.split(' ').map(value => Number.parseInt(value, 16)))
    expect(caseFold(String.fromCodePoint(Number.parseInt(code, 16)), false)).toBe(expected)
    count++
  }
  expect(count).toBe(1585)
})
it('keeps dynamic IDs stable and compiled snapshots isolated', () => {
  const dictionary = new DynamicDictionary([{ pattern: 'cat', data: 1 }])
  const old = dictionary.compile()
  const duplicate = dictionary.add({ pattern: 'cat', data: 2 })
  const dog = dictionary.add('dog')
  dictionary.delete(0)
  const next = dictionary.compile()
  expect(next.ids).toEqual([duplicate, dog])
  expect(next.matcher.search('cat')[0]).toMatchObject({ data: 2, patternIndex: 0 })
  expect(old.matcher.search('cat')[0].data).toBe(1)
  expect(dictionary.compile()).toBe(next)
  expect(Object.isFrozen(next.ids)).toBe(true)
  dictionary.clear()
  expect(dictionary.compile().matcher.count('catdog')).toBe(0)
  expect(dictionary.add('new')).toBeGreaterThan(dog)
  const folding = new DynamicDictionary(['SS'], {}, patterns => new UnicodeAhoCorasick(patterns))
  expect(folding.compile().matcher.match('ß')).toBe(true)
})

it('supports cancellable async compilation and dynamic snapshot persistence', async () => {
  const dictionary = new DynamicDictionary([{ pattern: 'cat', data: { id: 1 } }])
  const snapshot = await dictionary.compileAsync()
  expect(snapshot.ids).toEqual([0])
  const serialized = dictionary.serialize()
  const restored = DynamicDictionary.deserialize<{ id: number }>(serialized)
  expect(restored.compile().matcher.search('cat')[0]?.data).toEqual({ id: 1 })
  const controller = new AbortController()
  controller.abort()
  await expect(dictionary.compileAsync({ signal: controller.signal })).rejects.toBeDefined()
})
it('implements literal replacement helpers without changing original text semantics', () => {
  const matcher = new AhoCorasick(['cat', 'dog', '👨‍👩‍👧‍👦'])
  expect(matcher.replace('cat dog', keep())).toBe('cat dog')
  expect(matcher.replace('cat dog', remove())).toBe(' ')
  expect(matcher.replace('cat 👨‍👩‍👧‍👦', mask())).toBe('*** *')
  expect(matcher.replace('cat dog', fromMap({ cat: '$&' }))).toBe('$& dog')
  for (let run = 0; run < 2; run++) {
    expect(matcher.replace('cat cat', once('X'))).toBe('X cat')
  }
})
it('compares the double array to the exact reference across seeded dictionaries', () => {
  let seed = 0xC0FFEE
  const random = (bound: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % bound
  }
  const alphabet = ['a', 'b', '猫', '😀', 'e\u0301', '\r\n']
  const word = (length: number) => Array.from({ length }, () => alphabet[random(alphabet.length)]).join('')
  for (let trial = 0; trial < 100; trial++) {
    const patterns = Array.from({ length: random(30) }, () => word(random(5) + 1))
    const text = word(50)
    const reference = new AhoCorasick(patterns)
    const fast = new FastAhoCorasick(patterns)
    for (const strategy of ['all', 'leftmost-first', 'leftmost-longest', 'longest-first'] as const) {
      expect(fast.search(text, { strategy })).toEqual(reference.search(text, { strategy }))
    }
  }
})

it('resets composed replacement helpers for each operation', () => {
  const matcher = new AhoCorasick(['cat'])
  const replacement = once(once('X'))
  expect(matcher.replace('cat cat', replacement)).toBe('X cat')
  expect(matcher.replace('cat cat', replacement)).toBe('X cat')
})
