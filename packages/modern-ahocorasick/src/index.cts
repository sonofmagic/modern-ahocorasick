/* eslint-disable ts/no-redeclare, ts/no-namespace, no-restricted-syntax -- CommonJS constructor/type merging requires an export assignment and ambient namespace. */
import type Matcher from './index.js' with { 'resolution-mode': 'import' }
import type * as Types from './types.js' with { 'resolution-mode': 'import' }

// Declaration-only facade for the direct CommonJS constructor export.
// tsc emits this file; tsdown builds both runtime formats from index.ts.
declare const AhoCorasick: typeof Matcher
type AhoCorasick<T = unknown> = Matcher<T>
declare namespace AhoCorasick {
  type Boundary = Types.Boundary
  type BoundaryContext = Types.BoundaryContext
  type MatcherOptions = Types.MatcherOptions
  type Matcher<T = unknown> = Types.Matcher<T>
  type Token<T = unknown> = Types.Token<T>
  type StreamOptions = Types.StreamOptions
  type MatchStream<T = unknown> = Types.MatchStream<T>
  type JsonValue = Types.JsonValue
  type SerializeOptions<T> = Types.SerializeOptions<T>
  type DeserializeOptions<T> = Types.DeserializeOptions<T>
  type PatternInput<T = unknown> = Types.PatternInput<T>
  type Match<T = unknown> = Types.Match<T>
  type MatchStrategy = Types.MatchStrategy
  type SearchOptions = Types.SearchOptions
  type BoundaryOptions = Types.BoundaryOptions
  type QueryOptions = Types.QueryOptions
  type CompileStats = Types.CompileStats
  type ReplaceOptions = Types.ReplaceOptions
  type Replacement<T = unknown> = Types.Replacement<T>
}
export = AhoCorasick
