import type { Match, StreamOptions } from '@/index'
import AhoCorasick from '@/index'

const text = 'she aaa\r\n👨‍👩‍👧‍👦e\u0301 🇨🇳🇺🇸🇨 👍🏽\rnext\ncat!dogx dog\ncat_dog\u2028猫猫\u2029end'
const patterns = ['she', 'he', 'a', 'aa', 'a', '\r', '\n', '\r\n', '👨‍👩‍👧‍👦', '👨', 'e\u0301', 'e', '🇨🇳', '🇨', '👍🏽', 'cat!dog', 'cat', 'dog', 'cat_dog', '猫', 'dog\ncat_dog']

function scan(ac: AhoCorasick, chunks: string[], options: StreamOptions) {
  const stream = ac.createStream(options)
  const result: Match[] = []
  for (const chunk of chunks) {
    result.push(...stream.write(chunk))
  }
  result.push(...stream.finish())
  return result
}

describe.each(['all', 'leftmost-first', 'leftmost-longest'] as const)('%s streaming', (strategy) => {
  it.each([false, true])('equals whole-input matching under every two-way UTF-16 split (wholeWord=%s)', (wholeWord) => {
    const ac = new AhoCorasick(patterns)
    const options = { strategy, wholeWord, locale: 'en' }
    const expected = ac.search(text, options)
    for (let split = 0; split <= text.length; split++) {
      expect(scan(ac, [text.slice(0, split), text.slice(split)], options), `split ${split}`).toEqual(expected)
    }
    for (let width = 1; width <= 15; width++) {
      const chunks = Array.from({ length: Math.ceil(text.length / width) }, (_, i) => text.slice(i * width, (i + 1) * width))
      expect(scan(ac, chunks, options), `width ${width}`).toEqual(expected)
    }
  })

  it('handles long empty windows, dense suffixes, EOF and independently interleaved streams', () => {
    const ac = new AhoCorasick(['a', 'aaaa', 'aa', 'b', 'bcdef'])
    const input = `${'x'.repeat(2000)}${'a'.repeat(500)}bcdefb`
    expect(scan(ac, input.split(''), { strategy })).toEqual(ac.search(input, { strategy }))
    const first = ac.createStream({ strategy })
    const second = ac.createStream({ strategy })
    const one = [...first.write('aaa'), ...first.write('a')]
    const two = second.write('bcdef')
    expect([...one, ...first.finish()]).toEqual(ac.search('aaaa', { strategy }))
    expect([...two, ...second.finish()]).toEqual(ac.search('bcdef', { strategy }))
  })
})

it('delays unsettled graphemes and emits matches before EOF', () => {
  const ac = new AhoCorasick(['cat', 'e', 'e\u0301', '👩‍😀'])
  const stream = ac.createStream()
  expect(stream.write('cat')).toEqual([])
  expect(stream.write('!e')).toEqual(ac.search('cat!'))
  expect(stream.write('\u0301')).toEqual([])
  expect(stream.finish()).toEqual([{ pattern: 'e\u0301', patternIndex: 2, start: 4, end: 6, data: undefined }])
  expect(scan(ac, ['👩‍', '\uD83D', '\uDE00', '!'], {})).toEqual(ac.search('👩‍😀!'))
})

it('settles whole-word matches at newlines while retaining cross-line phrases', () => {
  const ac = new AhoCorasick(['cat', 'cat\ndog', 'dog'])
  const stream = ac.createStream({ wholeWord: true, locale: 'en' })
  expect(stream.write('cat')).toEqual([])
  expect(stream.write('\n')).toEqual(ac.search('cat\n', { wholeWord: true, locale: 'en' }))
  expect(stream.write('dog')).toEqual([])
  expect(stream.finish().map(hit => [hit.pattern, hit.start, hit.end])).toEqual([['cat\ndog', 0, 7], ['dog', 4, 7]])
})

it('bounds unsettled tails, cancels explicitly and rejects use after close', () => {
  const ac = new AhoCorasick(['e\u0301'])
  for (const options of [{ maxBufferedUnits: 2 }, { wholeWord: true, maxBufferedUnits: 2 }]) {
    const stream = ac.createStream(options)
    stream.write('e\u0301')
    expect(() => stream.write('\u0301')).toThrow(RangeError)
    expect(() => stream.finish()).toThrow(/cancelled/)
  }
  const stream = ac.createStream()
  expect(() => stream.write(1 as never)).toThrow(TypeError)
  stream.cancel()
  stream.cancel()
  expect(() => stream.write('e')).toThrow(/cancelled/)
  expect(() => stream.finish()).toThrow(/cancelled/)
  const finished = ac.createStream()
  expect(finished.finish()).toEqual([])
  expect(() => finished.finish()).toThrow(/finished/)
  for (const maxBufferedUnits of [0, -1, 1.5, Infinity, Number.NaN]) {
    expect(() => ac.createStream({ maxBufferedUnits })).toThrow(RangeError)
  }
  expect(() => ac.createStream({ strategy: 'unknown' } as never)).toThrow(TypeError)
  expect(scan(new AhoCorasick([]), ['abc', ''], {})).toEqual([])
})

it('returns independent matches and snapshots stream options', () => {
  const ac = new AhoCorasick(['a'])
  const options: StreamOptions = { strategy: 'all' }
  const stream = ac.createStream(options)
  options.wholeWord = true
  const [hit] = stream.write('aa')
  hit.end = 100
  expect(stream.finish()[0].start).toBe(1)
})
