/* eslint-disable ts/no-redeclare, ts/no-namespace, no-restricted-syntax -- CommonJS constructor/type merging requires an export assignment and ambient namespace. */
import type Matcher from './text.js' with { 'resolution-mode': 'import' }
import type * as Text from './text.js' with { 'resolution-mode': 'import' }
import type * as Types from './types.js' with { 'resolution-mode': 'import' }

declare const TextMatcher: typeof Matcher
type TextMatcher<T = unknown> = Matcher<T>
declare namespace TextMatcher {
  type TextOptions = Text.TextOptions
  type PatternInput<T = unknown> = Types.PatternInput<T>
  type Token<T = unknown> = Types.Token<T>
  type Match<T = unknown> = Types.Match<T>
  type BoundaryOptions = Types.BoundaryOptions
  type QueryOptions = Types.QueryOptions
  type SearchOptions = Types.SearchOptions
  type ReplaceOptions = Types.ReplaceOptions
  type Replacement<T = unknown> = Types.Replacement<T>
  type StreamOptions = Text.StreamOptions
  type TokenStreamOptions = Text.TokenStreamOptions
  type MatchStream<T = unknown> = Types.MatchStream<T>
  type TokenStreamHandle<T = unknown> = Text.TokenStreamHandle<T>
  type TextSerializeOptions<T = unknown> = Text.TextSerializeOptions<T>
  type TextDeserializeOptions<T = unknown> = Text.TextDeserializeOptions<T>
}
export = TextMatcher
