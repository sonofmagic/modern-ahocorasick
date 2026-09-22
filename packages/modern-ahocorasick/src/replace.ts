import type { Replacement } from './types.js'
import { operationReplacement, replacementFactory } from './runtime.js'
/** Call once per replacement operation; each factory invocation owns its state. */
export function keep<T = unknown>(): Replacement<T> {
  return (_match, text) => text
}
export function remove<T = unknown>(): Replacement<T> {
  return ''
}
/** Repeat the mask once per original grapheme, not per UTF-16 code unit. */
export function mask<T = unknown>(character = '*'): Replacement<T> {
  if (typeof character !== 'string') {
    throw new TypeError('mask must be a string')
  }
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return (_match, text) => character.repeat(Array.from(segmenter.segment(text)).length)
}
export function fromMap<T = unknown>(values: ReadonlyMap<string, string> | Readonly<Record<string, string>>): Replacement<T> {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    throw new TypeError('replacement map must be an object or Map')
  }
  const map = values instanceof Map ? new Map(values) : new Map(Object.entries(values))
  if ([...map.values()].some(value => typeof value !== 'string')) {
    throw new TypeError('replacement map values must be strings')
  }
  return (match, text) => map.get(match.pattern) ?? text
}
/** Each library replacement operation receives its own once-only state. */
export function once<T = unknown>(replacement: Replacement<T>): Replacement<T> {
  if (typeof replacement !== 'string' && typeof replacement !== 'function') {
    throw new TypeError('replacement must be a string or function')
  }
  return replacementFactory(() => {
    const current = operationReplacement(replacement)
    let used = false
    return (match: Parameters<Exclude<Replacement<T>, string>>[0], text: string) => {
      if (used) {
        return text
      }
      used = true
      return typeof current === 'string' ? current : current(match, text)
    }
  })
}
