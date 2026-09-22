/* eslint-disable antfu/no-import-dist -- These tests verify emitted declarations; packed tests verify the public subpath. */
import type { Match, TextOptions } from '../dist/text.js'
import { expectError, expectType } from 'tsd'
import TextMatcher from '../dist/text.js'

const options: TextOptions = { normalization: 'NFC', caseFold: true }
const matcher = new TextMatcher([{ pattern: 'é', data: 1 }], options)
expectType<Match<number>[]>(matcher.search('e\u0301'))
expectType<IterableIterator<Match<number>>>(matcher.iterate('e\u0301'))
expectType<Match<number> | undefined>(matcher.findFirst('e\u0301'))
expectType<Match<number> | undefined>(matcher.findAt('e\u0301', 0))
expectType<number[]>(matcher.countByPattern('é'))
expectType<number>(matcher.count('é'))
expectType<boolean>(matcher.match('é'))
expectType<string>(matcher.replace('é', (hit, text) => {
  expectType<number | undefined>(hit.data)
  expectType<string>(text)
  return 'X'
}))
expectType<string>(matcher.serialize())
expectType<TextMatcher<number>>(TextMatcher.deserialize<number>(matcher.serialize()))
expectType<ReturnType<typeof matcher.createStream>>(matcher.createStream())
expectError(new TextMatcher(['a'], { normalization: 'invalid' }))
expectError(new TextMatcher(['a'], { caseFold: 'en' }))
expectError(matcher.replace('é', 'X', { strategy: 'all' }))
