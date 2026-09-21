import type { SearchOptions } from '@/index'
import AhoCorasick from '@/index'

const options = { wholeWord: true, locale: 'en' } as const

it('matches complete words and phrases, preserving punctuation and underscores', () => {
  const ac = new AhoCorasick(['cat', 'dog', 'New York', 'cat_dog', '!'])
  const text = 'concatenate cat cat_dog New Yorkshire New York! dog.'
  expect(ac.search(text, options).map(hit => hit.pattern)).toEqual(['cat', 'cat_dog', 'New York', 'dog'])
  expect(ac.count(text, options)).toBe(4)
  expect(ac.countByPattern(text, options)).toEqual([1, 1, 1, 1, 0])
  expect(ac.match('concatenate', options)).toBe(false)
  expect(ac.match('a cat!', options)).toBe(true)
  expect(ac.replace('cat concatenate', 'X', options)).toBe('X concatenate')
  expect(ac.search('concatenate').map(hit => hit.pattern)).toEqual(['cat'])
})

it.each(['leftmost-first', 'leftmost-longest'] as const)('filters word boundaries before %s selection', (strategy) => {
  const ac = new AhoCorasick(['cat!dog', 'cat', 'dog'])
  const text = 'cat!dogx dog'
  expect(ac.search(text, { ...options, strategy }).map(hit => hit.pattern)).toEqual(['cat', 'dog'])
  expect(ac.replace(text, 'X', { ...options, strategy })).toBe('X!dogx X')
})

it('uses Intl word segmentation for Chinese and combining sequences', () => {
  const text = '我喜欢猫，e\u0301 é!'
  const words = [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(text)].filter(part => part.isWordLike)
  const ac = new AhoCorasick(words.map(part => part.segment))
  expect(ac.search(text, { wholeWord: true, locale: 'zh' }).map(hit => [hit.start, hit.end]))
    .toEqual(words.map(part => [part.index, part.index + part.segment.length]))
  expect(new AhoCorasick(['e']).match('e\u0301', options)).toBe(false)
})

it('preserves duplicates, empty-input behavior and independent option snapshots', () => {
  const ac = new AhoCorasick(['cat', 'cat'])
  expect(ac.countByPattern('cat concatenate cat', options)).toEqual([2, 2])
  expect(ac.count('', options)).toBe(0)
  expect(ac.countByPattern('', options)).toEqual([0, 0])
  expect(new AhoCorasick([]).match('cat', options)).toBe(false)
  const mutable: SearchOptions = { ...options }
  const iterator = ac.iterate('cat concatenate', mutable)
  mutable.wholeWord = false
  expect([...iterator]).toHaveLength(2)
})

it('validates boundary arguments immediately in every query', () => {
  const ac = new AhoCorasick(['cat'])
  for (const options of [null, [], { wholeWord: 1 }, { locale: 1 }]) {
    for (const method of ['search', 'iterate', 'match', 'count', 'countByPattern'] as const) {
      expect(() => ac[method]('cat', options as unknown as SearchOptions)).toThrow(TypeError)
    }
    expect(() => ac.replace('cat', 'X', options as never)).toThrow(TypeError)
  }
  expect(() => ac.iterate('cat', { locale: 'bad_locale' })).toThrow(RangeError)
})
