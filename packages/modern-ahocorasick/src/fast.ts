import { doubleArray } from './double-array.js'
import AhoCorasick from './index.js'
import { defineProfile } from './runtime.js'
/** Optional double-array backend. Construction/retained memory trade off against scans. */
export default class FastAhoCorasick<T = unknown> extends AhoCorasick<T> {
}
defineProfile(FastAhoCorasick, { backend: doubleArray })
