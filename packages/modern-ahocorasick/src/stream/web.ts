import type { AsyncReplacement, AsyncStreamOptions, AsyncTokenStreamOptions } from '../stream.js'
import type { Match, Matcher, Token } from '../types.js'
import { iterateChunksAsync, replaceChunksAsync, tokenizeChunksAsync } from '../stream.js'
/** A stream pair rather than eager enqueueing a whole input chunk into a TransformStream. */
function transform<R>(run: (source: AsyncIterable<string>, signal: AbortSignal) => AsyncIterableIterator<R>, options?: AsyncStreamOptions): ReadableWritablePair<R, string> {
  const controller = new AbortController()
  const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
  let wake: (() => void) | undefined
  let chunk: string | undefined
  let acknowledge: (() => void) | undefined
  let rejectWrite: ((error: unknown) => void) | undefined
  let resolveClose: (() => void) | undefined
  let rejectClose: ((error: unknown) => void) | undefined
  let closed = false
  let finished = false
  let removeAbort = () => {}
  let readableController: ReadableStreamDefaultController<R>
  let writableController: WritableStreamDefaultController
  function fail(error: unknown, errorWritable = true) {
    if (finished) {
      return
    }
    finished = true
    removeAbort()
    controller.abort(error)
    rejectWrite?.(error)
    rejectClose?.(error)
    rejectWrite = rejectClose = undefined
    acknowledge = resolveClose = undefined
    chunk = undefined
    wake?.()
    wake = undefined
    readableController.error(error)
    if (errorWritable) {
      writableController.error(error)
    }
  }
  function onAbort() {
    fail(signal.reason)
  }
  removeAbort = () => signal.removeEventListener('abort', onAbort)

  const source: AsyncIterable<string> = {
    async* [Symbol.asyncIterator]() {
      try {
        while (true) {
          if (signal.aborted) {
            throw signal.reason
          }
          if (chunk !== undefined) {
            const value = chunk
            chunk = undefined
            yield value
            acknowledge?.()
            acknowledge = rejectWrite = undefined
          }
          else if (closed) {
            return
          }
          else {
            await new Promise<void>((resolve) => {
              wake = resolve
            })
          }
        }
      }
      finally {
        if (!closed && !finished) {
          fail(new DOMException('Stream consumption ended', 'AbortError'))
        }
      }
    },
  }
  const iterator = run(source, signal)
  const readable = new ReadableStream<R>({
    start(value) {
      readableController = value
    },
    async pull(value) {
      try {
        const next = await iterator.next()
        if (next.done) {
          finished = true
          value.close()
          resolveClose?.()
          resolveClose = rejectClose = undefined
          signal.removeEventListener('abort', onAbort)
        }
        else {
          value.enqueue(next.value)
        }
      }
      catch (error) {
        fail(error)
      }
    },
    async cancel(reason) {
      fail(reason ?? new DOMException('Stream cancelled', 'AbortError'))
      await iterator.return?.()
      signal.removeEventListener('abort', onAbort)
    },
  })
  const writable = new WritableStream<string>({
    start(value) {
      writableController = value
      value.signal.addEventListener('abort', () => fail(value.signal.reason, false), { once: true })
    },
    write(value) {
      if (typeof value !== 'string') {
        const error = new TypeError('Web stream input must be decoded strings; use TextDecoderStream for bytes')
        fail(error)
        throw error
      }
      return new Promise<void>((resolve, reject) => {
        chunk = value
        acknowledge = resolve
        rejectWrite = reject
        wake?.()
        wake = undefined
      })
    },
    close() {
      closed = true
      return new Promise<void>((resolve, reject) => {
        resolveClose = resolve
        rejectClose = reject
        wake?.()
        wake = undefined
      })
    },
    async abort(reason) {
      fail(reason ?? new DOMException('Stream aborted', 'AbortError'))
      await iterator.return?.()
      signal.removeEventListener('abort', onAbort)
    },
  })
  if (signal.aborted) {
    onAbort()
  }
  else {
    signal.addEventListener('abort', onAbort, { once: true })
  }
  return { readable, writable }
}
export function createMatchTransform<T>(matcher: Matcher<T>, options?: AsyncStreamOptions): ReadableWritablePair<Match<T>, string> {
  return transform((source, signal) => iterateChunksAsync(matcher, source, { ...options, signal }), options)
}
export function createTokenTransform<T>(matcher: Matcher<T>, options?: AsyncTokenStreamOptions): ReadableWritablePair<Token<T>, string> {
  return transform((source, signal) => tokenizeChunksAsync(matcher, source, { ...options, signal }), options)
}
export function createReplaceTransform<T>(matcher: Matcher<T>, replacement: AsyncReplacement<T>, options?: AsyncTokenStreamOptions): ReadableWritablePair<string, string> {
  return transform((source, signal) => replaceChunksAsync(matcher, source, replacement, { ...options, signal }), options)
}
