import type { AsyncReplacement, AsyncStreamOptions, AsyncTokenStreamOptions } from '../stream.js'
import type { Matcher } from '../types.js'
import { addAbortSignal, Duplex } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { iterateChunksAsync, replaceChunksAsync, tokenizeChunksAsync } from '../stream.js'
/** Decode bytes incrementally. String chunks are already decoded original text. */
async function* decode(source: AsyncIterable<string | Uint8Array>): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8')
  for await (const chunk of source) {
    if (typeof chunk === 'string') {
      const tail = decoder.end()
      if (tail) {
        yield tail
      }
      yield chunk
    }
    else if (chunk instanceof Uint8Array) {
      const text = decoder.write(chunk)
      if (text) {
        yield text
      }
    }
    else {
      throw new TypeError('Node streams accept string or Uint8Array chunks')
    }
  }
  const tail = decoder.end()
  if (tail) {
    yield tail
  }
}
function transform<R>(run: (source: AsyncIterable<string>, signal: AbortSignal) => AsyncIterable<R>, options?: AsyncStreamOptions): Duplex {
  const controller = new AbortController()
  const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
  // Duplex.from pulls this generator according to the readable side's demand.
  const duplex = Duplex.from(async function* (source: AsyncIterable<string | Uint8Array>) {
    yield* run(decode(source), signal)
  })
  // Cancel before Duplex.from waits for its generator to return. Waiting for
  // 'close' deadlocks if the generator is awaiting an unfinished callback.
  const destroy = duplex._destroy.bind(duplex)
  duplex._destroy = (error, callback) => {
    controller.abort(error ?? new DOMException('Stream destroyed', 'AbortError'))
    destroy(error, callback)
  }
  if (options?.signal) {
    addAbortSignal(options.signal, duplex)
  }
  return duplex
}
export function createMatchTransform<T>(matcher: Matcher<T>, options?: AsyncStreamOptions): Duplex {
  return transform((source, signal) => iterateChunksAsync(matcher, source, { ...options, signal }), options)
}
export function createTokenTransform<T>(matcher: Matcher<T>, options?: AsyncTokenStreamOptions): Duplex {
  return transform((source, signal) => tokenizeChunksAsync(matcher, source, { ...options, signal }), options)
}
export function createReplaceTransform<T>(matcher: Matcher<T>, replacement: AsyncReplacement<T>, options?: AsyncTokenStreamOptions): Duplex {
  return transform((source, signal) => replaceChunksAsync(matcher, source, replacement, { ...options, signal }), options)
}
