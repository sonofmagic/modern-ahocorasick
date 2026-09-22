import { Buffer } from 'node:buffer'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import DynamicDictionary from '../src/dynamic'
import FastAhoCorasick from '../src/fast'
import AhoCorasick from '../src/index'
import { createMatchStream, createReplaceStream, createTokenStream, iterateChunks, iterateChunksAsync, replaceChunks, replaceChunksAsync, tokenizeChunks } from '../src/stream'
import { markdown, protectedText, urls } from '../src/stream/filters'
import { createReplaceTransform as nodeReplace } from '../src/stream/node'
import { createReplaceTransform as webReplace } from '../src/stream/web'
import UnicodeAhoCorasick from '../src/unicode'

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = []
  for await (const item of source) {
    result.push(item)
  }
  return result
}
const samples = [
  { text: 'aab!👨‍👩‍👧‍👦e\u0301?🇺🇸🇬🇧\r\nz', patterns: ['a', 'ab', 'aab', 'b', '👨‍👩‍👧‍👦', 'e\u0301', 'e', '🇺🇸', '🇬🇧', '\r', '\n', '\r\n', 'z'] },
  { text: 'a\u{1D165}b', patterns: ['a', 'a\u{1D165}', 'b'] },
  { text: '😀Straße SS ß İΣς', patterns: ['STRASSE', 'ss', 'ß', 's', 'i\u0307', 'σ'] },
]
describe.each([AhoCorasick, UnicodeAhoCorasick, FastAhoCorasick])('%s chunk parity', (Constructor) => {
  it('agrees with whole input at every UTF-16 split and one-unit chunking', () => {
    for (const { patterns, text } of samples) {
      for (const boundary of ['none', 'unicode', 'ascii', 'whitespace'] as const) {
        const matcher = new Constructor(patterns, { boundary })
        const chunkings = Array.from({ length: text.length + 1 }, (_, index) => [text.slice(0, index), '', text.slice(index)])
        chunkings.push(text.split(''))
        for (const chunks of chunkings) {
          for (const strategy of ['all', 'leftmost-first', 'leftmost-longest'] as const) {
            expect([...iterateChunks(matcher, chunks, { strategy })]).toEqual(matcher.search(text, { strategy }))
            if (strategy !== 'all') {
              expect([...replaceChunks(matcher, chunks, 'X', { strategy })].join('')).toBe(matcher.replace(text, 'X', { strategy }))
              const tokens = [...tokenizeChunks(matcher, chunks, { strategy })]
              expect(tokens.map(token => token.text).join('')).toBe(text)
              expect(tokens.filter(token => token.type === 'match').map(token => token.match)).toEqual(matcher.search(text, { strategy }))
            }
          }
        }
      }
    }
  })
})
it('keeps results independent, validates lifecycle and releases failed sessions', () => {
  const matcher = new AhoCorasick(['cat'])
  const session = createMatchStream(matcher)
  expect(session.write('')).toEqual([])
  expect([...session.write('cat'), ...session.end()]).toEqual(matcher.search('cat'))
  expect(session.end()).toEqual([])
  expect(() => session.write('cat')).toThrow('ended')
  session.destroy()
  expect(() => session.end()).toThrow('destroyed')
  expect(() => createMatchStream(matcher, { strategy: 'longest-first' as never })).toThrow()
  const bounded = createMatchStream(matcher, { maxBufferLength: 32 })
  expect(() => bounded.write(`a${'\u0301'.repeat(40)}`)).toThrow(RangeError)
  expect(() => bounded.write('cat')).toThrow('destroyed')
  const tiny = createMatchStream(matcher, { maxBufferLength: 16 })
  expect(tiny.write('x'.repeat(50000))).toEqual([])
  tiny.end()
  const throwing = createReplaceStream(matcher, () => {
    throw new Error('callback')
  })
  throwing.write('cat')
  expect(() => throwing.end()).toThrow('callback')
})
it('returns a replaceable preview and confirms each match only once', () => {
  const matcher = new AhoCorasick(['cat', 'category'])
  const session = createTokenStream(matcher)
  const confirmed = session.write('a cat')
  expect(session.preview().text).toBe('a cat')
  expect(session.preview().tokens.filter(token => token.type === 'match')).toHaveLength(1)
  confirmed.push(...session.write('egory!'), ...session.end())
  expect(confirmed.map(token => token.text).join('')).toBe('a category!')
  expect(confirmed.filter(token => token.type === 'match').map(token => token.match.pattern)).toEqual(['category'])
  expect(session.preview().text).toBe('')
})
it('protects URL, heading, inline and fenced syntax regardless of chunk boundaries', () => {
  const matcher = new AhoCorasick(['cat'])
  const examples = [
    { text: 'cat https://cat.test/cat cat', expected: 'X https://cat.test/cat X', filter: urls() },
    { text: '# cat\ncat `cat` cat\n```ts\ncat\n```\ncat', expected: '# cat\nX `cat` X\n```ts\ncat\n```\nX', filter: markdown() },
    { text: 'cat `cat', expected: 'X `X', filter: markdown() },
    { text: '~~~\ncat', expected: '~~~\ncat', filter: markdown() },
    { text: '`cat` https://cat cat', expected: '`cat` https://cat X', filter: protectedText({ urls: true, markdown: true }) },
  ]
  for (const { text, expected, filter } of examples) {
    const chunkings = [text.split(''), ...Array.from({ length: text.length + 1 }, (_, index) => [text.slice(0, index), text.slice(index)])]
    for (const chunks of chunkings) {
      expect([...replaceChunks(matcher, chunks, 'X', { filter })].join('')).toBe(expected)
    }
  }
  expect([...replaceChunks(new AhoCorasick(['a`cat`b']), ['a`cat`b'], 'X', { filter: markdown() })].join('')).toBe('a`cat`b')
})
it('supports async callbacks in source order and closes sources on early exit', async () => {
  const matcher = new AhoCorasick(['cat'])
  const calls: number[] = []
  const result = await collect(replaceChunksAsync(matcher, ['cat ', 'cat'], async (match) => {
    calls.push(match.start)
    await Promise.resolve()
    return 'X'
  }))
  expect(result.join('')).toBe('X X')
  expect(calls).toEqual([0, 4])
  let returned = false
  async function* source() {
    try {
      yield 'cat'.repeat(100)
      yield 'never'
    }
    finally {
      returned = true
    }
  }
  const early = iterateChunksAsync(matcher, source())
  await early.next()
  await early.return?.()
  expect(returned).toBe(true)
})
it('cancels a pending source and yields to the task queue during long no-hit scans', async () => {
  const matcher = new AhoCorasick(['cat'])
  const controller = new AbortController()
  let returned = false
  const source = {
    [Symbol.asyncIterator]() {
      return this
    },
    next: () => new Promise<IteratorResult<string>>(() => { }),
    return: async () => {
      returned = true
      return { done: true as const, value: undefined }
    },
  }
  const iterator = iterateChunksAsync(matcher, source, { signal: controller.signal })
  const next = iterator.next()
  controller.abort(new Error('cancelled'))
  await expect(next).rejects.toThrow('cancelled')
  expect(returned).toBe(true)
  const scanning = new AbortController()
  setTimeout(() => scanning.abort(new Error('yielded')), 0)
  await expect(collect(iterateChunksAsync(matcher, ['x'.repeat(100000)], { signal: scanning.signal, yieldEvery: 512 }))).rejects.toThrow('yielded')
})
it('integrates Node byte decoding and Web stream backpressure with async replacement', async () => {
  const matcher = new AhoCorasick(['猫', 'cat'])
  const bytes = Buffer.from('猫cat猫')
  const output: string[] = []
  await pipeline(Readable.from(Array.from(bytes, byte => Buffer.from([byte]))), nodeReplace(matcher, async () => 'X'), new Writable({
    write(chunk, _encoding, done) {
      output.push(String(chunk))
      done()
    },
  }))
  expect(output.join('')).toBe('XXX')
  const input = new ReadableStream<string>({ start(controller) {
    controller.enqueue('猫ca')
    controller.enqueue('t猫')
    controller.close()
  } })
  const transformed = input.pipeThrough(webReplace(matcher, async () => 'X'))
  expect((await collect(transformed as unknown as AsyncIterable<string>)).join('')).toBe('XXX')
})
it('isolates once replacement state across operations and simultaneous streams', async () => {
  const { once } = await import('../src/replace')
  const matcher = new AhoCorasick(['cat'])
  const replacement = once('X')
  expect(matcher.replace('cat cat', replacement)).toBe('X cat')
  expect(matcher.replace('cat cat', replacement)).toBe('X cat')
  const a = createReplaceStream(matcher, replacement)
  const b = createReplaceStream(matcher, replacement)
  const aParts = a.write('cat cat')
  const bParts = b.write('cat cat')
  expect([...aParts, ...a.end()].join('')).toBe('X cat')
  expect([...bParts, ...b.end()].join('')).toBe('X cat')
})
it('does not truncate or spread a high-output group into function arguments', () => {
  const matcher = new AhoCorasick(Array.from<string>({ length: 150000 }).fill('x'))
  const stream = createMatchStream(matcher)
  stream.write('x')
  expect(stream.end()).toHaveLength(150000)
})
it('propagates Web cancellation and aborts an in-flight write without hanging', async () => {
  const matcher = new AhoCorasick(['cat'])
  const pair = webReplace(matcher, 'X')
  const writer = pair.writable.getWriter()
  const write = writer.write('cat '.repeat(5000))
  const rejection = expect(write).rejects.toThrow('stop')
  await writer.abort(new Error('stop'))
  await rejection
  await expect(pair.readable.getReader().read()).rejects.toThrow('stop')
  const cancelled = webReplace(matcher, 'X')
  const pending = cancelled.writable.getWriter().write('cat '.repeat(5000))
  const pendingRejection = expect(pending).rejects.toThrow('cancel')
  await cancelled.readable.cancel(new Error('cancel'))
  await pendingRejection
})

it('preserves v3.1 whole-word and persistence contracts when composing new streams', () => {
  const text = 'cat\ndog cat_dog\nStraße cats! 猫\n'
  for (const Constructor of [AhoCorasick, FastAhoCorasick, UnicodeAhoCorasick]) {
    for (const boundary of ['none', 'unicode'] as const) {
      const matcher = new Constructor(['cat', 'cat\ndog', 'dog', 'STRASSE', '猫'], { boundary })
      for (const strategy of ['all', 'leftmost-first', 'leftmost-longest'] as const) {
        const options = { strategy, wholeWord: true, locale: 'en' }
        expect([...iterateChunks(matcher, text.split(''), options)]).toEqual(matcher.search(text, options))
        const old = matcher.createStream(options)
        const hits = []
        for (const chunk of text.split('')) {
          hits.push(...old.write(chunk))
        }
        hits.push(...old.finish())
        expect(hits).toEqual(matcher.search(text, options))
        expect(() => old.finish()).toThrow()
      }
    }
  }
  const original = new AhoCorasick(['cat', 'cat\ndog', 'dog'])
  const restored = AhoCorasick.deserialize(original.serialize())
  expect([...iterateChunks(restored, text.split(''))]).toEqual(original.search(text))
  expect(restored.countByPattern(text)).toEqual(original.countByPattern(text))
  const fast = new FastAhoCorasick(['cat', 'dog'])
  expect(AhoCorasick.deserialize(fast.serialize()).search(text)).toEqual(fast.search(text))
  expect(() => new UnicodeAhoCorasick(['SS']).serialize()).toThrow(TypeError)
})

it('supports asynchronous imperative replacement and rejects concurrent writes', async () => {
  const { createReplaceStreamAsync } = await import('../src/stream')
  const matcher = new AhoCorasick(['cat'])
  const session = createReplaceStreamAsync(matcher, async (_match, text) => text.toUpperCase())
  const first = session.write('a cat and ca')
  await expect(session.write('t')).rejects.toThrow('pending')
  const output = [...await first, ...await session.write('t!'), ...await session.end()]
  expect(output.join('')).toBe('a CAT and CAT!')
  expect(await session.end()).toEqual([])
  await expect(session.write('x')).rejects.toThrow('ended')

  const controller = new AbortController()
  const blocked = createReplaceStreamAsync(matcher, () => new Promise<string>(() => {}), { signal: controller.signal })
  await blocked.write('cat')
  const ending = blocked.end()
  controller.abort(new Error('cancel callback'))
  await expect(ending).rejects.toThrow('cancel callback')
})

it('destroys Node adapters while a replacement callback is still pending', async () => {
  const matcher = new AhoCorasick(['cat'])
  let entered!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const stream = nodeReplace(matcher, () => {
    entered()
    return new Promise<string>(() => {})
  })
  const errors: unknown[] = []
  stream.on('error', error => errors.push(error))
  const closed = new Promise<void>((resolve) => {
    stream.once('close', resolve)
  })
  stream.resume()
  stream.end('cat')
  await started
  const reason = new Error('stop pending callback')
  stream.destroy(reason)
  await closed
  expect(stream.closed).toBe(true)
  expect(errors).toEqual([reason])
})

it('closes upstream on an asynchronous callback error and pulls on consumer demand', async () => {
  let reads = 0
  let closed = false
  async function* source() {
    try {
      reads++
      yield 'cat '.repeat(20)
      reads++
      yield 'cat'
    }
    finally {
      closed = true
    }
  }
  const matcher = new AhoCorasick(['cat'])
  const iterator = replaceChunksAsync(matcher, source(), async () => 'X')
  expect(reads).toBe(0)
  expect((await iterator.next()).value).toBe('X')
  expect(reads).toBe(1)
  await iterator.return?.()
  expect(reads).toBe(1)
  expect(closed).toBe(true)
  closed = false
  await expect(collect(replaceChunksAsync(matcher, source(), async () => {
    throw new Error('callback failed')
  }))).rejects.toThrow('callback failed')
  expect(closed).toBe(true)
})

it('keeps an active stream on its compiled dictionary after dynamic edits', () => {
  const dictionary = new DynamicDictionary(['cat'])
  const snapshot = dictionary.compile()
  const active = createMatchStream(snapshot.matcher)
  const before = active.write('ca')
  dictionary.delete(snapshot.ids[0])
  dictionary.add('dog')
  const next = dictionary.compile()
  const hits = [...before, ...active.write('t dog'), ...active.end()]
  expect(hits.map(hit => hit.pattern)).toEqual(['cat'])
  expect([...iterateChunks(next.matcher, ['cat dog'])].map(hit => hit.pattern)).toEqual(['dog'])
})

it('applies the pending buffer limit to unresolved syntax and permits an explicit unlimited tail', () => {
  const matcher = new AhoCorasick(['cat'])
  const limited = createTokenStream(matcher, { filter: markdown(), maxBufferLength: 16 })
  expect(() => limited.write(`\`cat${'x'.repeat(40)}`)).toThrow(RangeError)
  const unlimited = createTokenStream(matcher, { maxBufferLength: Number.POSITIVE_INFINITY })
  const text = `a${'\u0301'.repeat(1100000)}`
  expect(unlimited.write(text)).toEqual([])
  expect(unlimited.end().map(token => token.text).join('')).toBe(text)
})
