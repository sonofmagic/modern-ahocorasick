import assert from 'node:assert/strict'
import V1 from 'modern-ahocorasick-v1'
import V2 from 'modern-ahocorasick-v2'
import { compare, normalizer, reference, selection } from '../../../scripts/benchmark-versions-utils.mjs'

it('historical end indices become original UTF-16 exclusive ranges', () => {
  const patterns = ['猫', '😀', 'e\u0301', '👨‍👩‍👧‍👦', '\r\n']
  const text = patterns.join(' ')
  assert.equal(compare(normalizer('v2', patterns)(new V2(patterns).search(text), text), reference(patterns, text), true).correct, true)
  assert.deepEqual(normalizer('v1', ['猫'])([[2, ['猫']]], 'ab猫'), [{ pattern: '猫', patternIndex: 0, start: 2, end: 3, data: undefined }])
})

it('duplicates and nested suffixes retain actual multiplicity', () => {
  const patterns = ['a', 'aa', 'a']
  const text = 'aaa'
  for (const [variant, Constructor] of [['v1', V1], ['v2', V2]] as const) {
    const normalize = normalizer(variant, patterns)
    assert.equal(compare(normalize(new Constructor(patterns).search(text), text), reference(patterns, text), true).correct, true)
    const missingDuplicate = normalize([[0, ['a']]], 'a')
    assert.equal(missingDuplicate.length, 1)
    assert.equal(compare(missingDuplicate, reference(patterns, 'a'), true).correct, false)
    assert.throws(() => normalize([[0, ['a', 'a', 'a']]], 'a'), /excess/)
  }
})

it('oracle and comparison expose v1 Unicode defects, including false presence', () => {
  const cases: [string[], string][] = [
    [['😀'], '😀'],
    [['👨‍👩‍👧‍👦'], '👨‍👩‍👧‍👦'],
    [['e'], 'e\u0301'],
    [['\r', '\n'], '\r\n'],
  ]
  for (const [patterns, text] of cases) {
    const expected = reference(patterns, text)
    const matcher = new V1(patterns)
    const checks = compare(normalizer('v1', patterns)(matcher.search(text), text), expected, matcher.match(text))
    assert.equal(checks.correct, false)
    assert.notEqual(checks.presence, checks.expectedPresence)
    const v2 = new V2(patterns)
    assert.equal(compare(normalizer('v2', patterns)(v2.search(text), text), expected, v2.match(text)).correct, true)
  }
})

it('current ranges remain independent native results; empty search is valid', () => {
  const result = reference(['a'], 'a')
  assert.equal(normalizer('current', ['a'])(result, 'a'), result)
  assert.equal(compare([], reference(['a'], 'b'), false).correct, true)
})

it('selection rejects unknown, empty, and duplicate entries', () => {
  assert.deepEqual(selection(undefined, ['a', 'b'], 'test'), ['a', 'b'])
  assert.deepEqual(selection('b', ['a', 'b'], 'test'), ['b'])
  for (const value of ['', 'c', 'a,a']) {
    assert.throws(() => selection(value, ['a', 'b'], 'test'), /Invalid/)
  }
})
