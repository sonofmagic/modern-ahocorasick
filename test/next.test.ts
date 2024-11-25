import AhoCorasick from '@/index' // 根据实际文件路径调整
import { describe, expect, it } from 'vitest'

describe('ahoCorasick', () => {
  describe('initialization', () => {
    it('should initialize with an empty keyword list', () => {
      const ac = new AhoCorasick([])
      expect(ac.gotoFn).toBeDefined()
      expect(ac.output).toBeDefined()
      expect(ac.failure).toBeDefined()
    })

    it('should initialize with a non-empty keyword list', () => {
      const keywords = ['he', 'she', 'his', 'hers']
      const ac = new AhoCorasick(keywords)
      expect(ac.gotoFn).toBeDefined()
      expect(ac.output).toBeDefined()
      expect(ac.failure).toBeDefined()
    })
  })

  describe('search functionality', () => {
    it('should find all keywords in the input string', () => {
      const keywords = ['he', 'she', 'his', 'hers']
      const ac = new AhoCorasick(keywords)
      const results = ac.search('ushers')

      expect(results).toEqual([
        [3, ['she', 'he']],
        [5, ['hers']],
      ])
    })

    it('should return an empty array if no keywords are found', () => {
      const keywords = ['he', 'she', 'his']
      const ac = new AhoCorasick(keywords)
      const results = ac.search('xyz')

      expect(results).toEqual([])
    })

    it.skip('should handle special characters and emojis', () => {
      const keywords = ['😊', '👍', '🎉']
      const ac = new AhoCorasick(keywords)
      const results = ac.search('Hello 😊👍🎉 world!')

      expect(results).toEqual([
        [6, ['😊']],
        [7, ['👍']],
        [8, ['🎉']],
      ])
    })

    it('should handle overlapping keywords', () => {
      const keywords = ['a', 'ab', 'abc']
      const ac = new AhoCorasick(keywords)
      const results = ac.search('abc')

      expect(results).toEqual([
        [0, ['a']],
        [1, ['ab']],
        [2, ['abc']],
      ])
    })
  })

  describe('match functionality', () => {
    it('should return true if any keyword exists in the input string', () => {
      const keywords = ['he', 'she', 'his', 'hers']
      const ac = new AhoCorasick(keywords)

      expect(ac.match('ushers')).toBe(true)
    })

    it('should return false if no keyword exists in the input string', () => {
      const keywords = ['he', 'she', 'his']
      const ac = new AhoCorasick(keywords)

      expect(ac.match('xyz')).toBe(false)
    })

    it.skip('should handle special characters and emojis', () => {
      const keywords = ['😊', '👍', '🎉']
      const ac = new AhoCorasick(keywords)

      expect(ac.match('Hello 😊')).toBe(true)
      expect(ac.match('Hello world')).toBe(false)
    })
  })

  describe('edge Cases', () => {
    it('should handle an empty input string', () => {
      const keywords = ['he', 'she']
      const ac = new AhoCorasick(keywords)

      const results = ac.search('')
      expect(results).toEqual([])
      expect(ac.match('')).toBe(false)
    })

    it('should handle empty keywords', () => {
      const ac = new AhoCorasick([])
      const results = ac.search('hello world')

      expect(results).toEqual([])
      expect(ac.match('hello world')).toBe(false)
    })

    it('should handle a single character input', () => {
      const keywords = ['a', 'b', 'c']
      const ac = new AhoCorasick(keywords)

      const results = ac.search('a')
      expect(results).toEqual([[0, ['a']]])
      expect(ac.match('a')).toBe(true)
      expect(ac.match('z')).toBe(false)
    })

    it('should handle duplicate keywords', () => {
      const keywords = ['a', 'a', 'b']
      const ac = new AhoCorasick(keywords)

      const results = ac.search('a')
      expect(results).toEqual([[0, ['a', 'a']]])
    })

    it('should handle case-sensitive matches', () => {
      const keywords = ['a', 'A']
      const ac = new AhoCorasick(keywords)

      const results = ac.search('Aa')
      expect(results).toEqual([
        [0, ['A']],
        [1, ['a']],
      ])
    })
  })
})
