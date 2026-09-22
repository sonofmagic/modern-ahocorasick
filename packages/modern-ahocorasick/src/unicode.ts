import { caseFold } from './case-folding.js'
import AhoCorasick from './index.js'
import { defineProfile } from './runtime.js'
/** Opt-in folding; results always retain original dictionary strings and text ranges. */
export default class UnicodeAhoCorasick<T = unknown> extends AhoCorasick<T> {
}
defineProfile(UnicodeAhoCorasick, { units: segment => Array.from(caseFold(segment, false)) })
