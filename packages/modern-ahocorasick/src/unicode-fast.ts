import { caseFold } from './case-folding.js'
import { doubleArray } from './double-array.js'
import AhoCorasick from './index.js'
import { defineProfile } from './runtime.js'

export default class UnicodeFastAhoCorasick<T = unknown> extends AhoCorasick<T> {
}
defineProfile(UnicodeFastAhoCorasick, {
  units: segment => Array.from(caseFold(segment, false)),
  backend: doubleArray,
})
