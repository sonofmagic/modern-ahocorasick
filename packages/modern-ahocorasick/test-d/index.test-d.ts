import type { Match, MatchStrategy, PatternInput, Replacement, ReplaceOptions, SearchOptions } from '..'
import { expectError, expectType } from 'tsd'
import AhoCorasick from '..'

const inputs: readonly PatternInput<{ id: string }>[] = ['he', { pattern: 'she', data: { id: 'person' } }]
const matcher = new AhoCorasick(inputs)
expectType<Match<{ id: string }>[]>(matcher.search('she'))
expectType<IterableIterator<Match<{ id: string }>>>(matcher.iterate('she'))
expectType<boolean>(matcher.match('she'))
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
expectType<string>(matcher.replace('she', replacement, replaceOptions))
expectType<Match<unknown>[]>(new AhoCorasick(['he'] as const).search('he'))
expectType<Match<{ id: number }>[]>(new AhoCorasick([{ pattern: 'a', data: { id: 1 } }]).search('a'))
expectError(new AhoCorasick([123]))
expectError(matcher.search(123))
expectError(matcher.search('she', { strategy: 'unknown' }))
expectError(matcher.replace('she', '', { strategy: 'all' }))
expectError(matcher.replace('she', () => 123))
expectError(matcher.gotoFn)
expectError(matcher.failure)
expectError(matcher.output)
expectError(matcher._buildTables([]))
