import { expectType } from 'tsd'
import AhoCorasick from '..'

const matcher = new AhoCorasick(['he', 'she'])
expectType<[number, string[]][]>(matcher.search('she'))
expectType<boolean>(matcher.match('she'))
expectType<Record<number, Record<string, number>>>(matcher.gotoFn)
expectType<Record<number, string[]>>(matcher.output)
expectType<Record<number, number>>(matcher.failure)
