import type { CompileStats, Match, MatchStrategy, PatternInput, QueryOptions, Replacement, ReplaceOptions, SearchOptions } from '..'
import { expectError, expectType } from 'tsd'
import AhoCorasick from '..'

const inputs: readonly PatternInput<{ id: string }>[] = ['he', { pattern: 'she', data: { id: 'person' } }]
const matcher = new AhoCorasick(inputs)
expectType<Match<{ id: string }>[]>(matcher.search('she'))
expectType<IterableIterator<Match<{ id: string }>>>(matcher.iterate('she'))
expectType<boolean>(matcher.match('she'))
expectType<number>(matcher.count('she'))
expectType<number[]>(matcher.countByPattern('she'))
expectError(matcher.countByPattern(123))
expectType<string>(matcher.replace('she', (match, text) => {
  expectType<{ id: string } | undefined>(match.data)
  expectType<string>(text)
  return text
}))
const strategy: MatchStrategy = 'leftmost-first'
const options: SearchOptions = { strategy }
const replaceOptions: ReplaceOptions = { strategy }
const replacement: Replacement<{ id: string }> = match => match.pattern
expectType<Match<{ id: string }>[]>(matcher.search('she', options))
expectType<IterableIterator<Match<{ id: string }>>>(matcher.iterate('she', options))
expectType<string>(matcher.replace('she', replacement, replaceOptions))
expectType<Match<unknown>[]>(new AhoCorasick(['he'] as const).search('he'))
expectType<Match<{ id: number }>[]>(new AhoCorasick([{ pattern: 'a', data: { id: 1 } }]).search('a'))
expectError(new AhoCorasick([123]))
expectError(matcher.search(123))
expectError(matcher.count(123))
expectError(matcher.iterate('she', { strategy: 'unknown' }))
expectError(matcher.search('she', { strategy: 'unknown' }))
expectError(matcher.replace('she', '', { strategy: 'all' }))
expectError(matcher.replace('she', () => 123))
expectError(matcher.gotoFn)
expectError(matcher.failure)
expectError(matcher.output)
expectError(matcher._buildTables([]))

expectType<number[]>(matcher.countByPattern('she', { wholeWord: true, locale: 'en' }))
expectType<number>(matcher.count('she', { wholeWord: true }))
expectType<boolean>(matcher.match('she', { wholeWord: true }))
const stream = matcher.createStream({ strategy: 'leftmost-longest', maxBufferedUnits: 4096 })
expectType<Match<{ id: string }>[]>(stream.write('she'))
expectType<Match<{ id: string }>[]>(stream.finish())
expectType<void>(stream.cancel())
expectError(matcher.createStream({ maxBufferedUnits: '1' }))
expectError(matcher.search('she', { wholeWord: 'yes' }))
expectType<string>(matcher.serialize())
expectType<AhoCorasick<unknown>>(AhoCorasick.deserialize(matcher.serialize()))
expectType<AhoCorasick<Date>>(AhoCorasick.deserialize('serialized', { decodeData: value => new Date(String(value)) }))
expectType<string>(new AhoCorasick([{ pattern: 'a', data: new Date() }]).serialize({ encodeData: date => date.toISOString() }))
expectError(matcher.serialize({ encodeData: () => undefined }))

const range: QueryOptions = { start: 0, end: 3, anchored: true }
expectType<CompileStats>(matcher.getStats())
expectType<number>(matcher.count('she', range))
expectType<boolean>(matcher.match('she', range))
expectType<number[]>(matcher.countByPattern('she', range))
expectError(matcher.getStats().stateCount = 0)
expectError(matcher.search('she', { start: '0' }))
expectError(matcher.createStream(range))
