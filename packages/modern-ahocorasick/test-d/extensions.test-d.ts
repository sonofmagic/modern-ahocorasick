/* eslint-disable antfu/no-import-dist -- These tests verify emitted declarations; packed tests verify public subpaths. */
import type { Match, Token } from '..'
import { expectError, expectType } from 'tsd'
import AhoCorasick from '..'
import DynamicDictionary from '../dist/dynamic'
import { createMatchStream, createReplaceStream, createReplaceStreamAsync, createTokenStream, iterateChunksAsync } from '../dist/stream'
import UnicodeAhoCorasick from '../dist/unicode'

const matcher = new AhoCorasick([{ pattern: 'cat', data: { id: 1 } }], { boundary: 'unicode' })
expectType<Token<{ id: number }>[]>(matcher.tokenize('cat'))
expectType<Match<{ id: number }>[]>(matcher.search('cat', { strategy: 'longest-first', wholeWord: true }))
expectError(matcher.tokenize('cat', { strategy: 'all' }))
expectError(matcher.createStream({ strategy: 'longest-first' }))
expectError(new AhoCorasick(['cat'], { boundary: () => 'yes' }))
expectType<Match<{ id: number }>[]>(createMatchStream(matcher).write('cat'))
expectType<Token<{ id: number }>[]>(createTokenStream(matcher).preview().tokens)
expectType<Promise<string[]>>(createReplaceStreamAsync(matcher, async match => String(match.data?.id)).end())
expectType<AsyncIterableIterator<Match<{ id: number }>>>(iterateChunksAsync(matcher, ['cat']))
expectError(createMatchStream(matcher, { strategy: 'longest-first' }))
expectError(createReplaceStream(matcher, async () => 'X'))
expectError(createReplaceStream(matcher, 'X', { strategy: 'all' }))
const dictionary = new DynamicDictionary([{ pattern: 'SS', data: 1 }], {}, (patterns, options) => new UnicodeAhoCorasick(patterns, options))
expectType<readonly number[]>(dictionary.compile().ids)
expectType<number[]>(dictionary.compile().matcher.countByPattern('ß'))
