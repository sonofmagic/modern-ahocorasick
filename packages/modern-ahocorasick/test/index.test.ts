import AhoCorasick from '@/index'

const testCases = [
  {
    keywords: ['hero', 'heroic'],
    text: 'hero',
    expected: [[3, ['hero']]],
  },
  {
    keywords: ['hero', 'heroic', 'heroism'],
    text: 'the hero performed a heroic act of heroism',
    expected: [
      // "hero" is a substring of "heroic" and "heroism", so we should find it 3 times
      [7, ['hero']],
      [24, ['hero']],
      [26, ['heroic']],
      [38, ['hero']],
      [41, ['heroism']],
    ],
  },
  {
    keywords: ['keyword1', 'keyword2', 'etc'],
    text: 'should find keyword1 at position 19 and keyword2 at position 30.',
    expected: [
      [19, ['keyword1']],
      [47, ['keyword2']],
    ],
  },
  {
    keywords: ['he', 'she', 'his', 'hers'],
    text: 'she was expecting his visit',
    expected: [
      [2, ['he', 'she']],
      [20, ['his']],
    ],
  },
  {
    keywords: ['çp?', 'éâà'],
    text: 'éâàqwfwéâéeqfwéâàqef àéçp?ẃ wqqryht cp?',
    expected: [
      [2, ['éâà']],
      [16, ['éâà']],
      [25, ['çp?']],
    ],
  },
  {
    keywords: ['**', '666', 'his', 'n', '\\', '\n'],
    text: '\n & 666 ==! \n',
    expected: [
      [0, ['\n']],
      // [20, ['his']]
      [6, ['666']],
      [12, ['\n']],
    ],
  },
  {
    keywords: ['Федеральной', 'ной', 'idea'],
    text: '! Федеральной I have no idea what this means.',
    expected: [
      [12, ['Федеральной', 'ной']],
      [27, ['idea']],
    ],
  },
  // {
  //   keywords: ['bla', '😁', '😀', '😀😁😀'],
  //   text: 'Bla 😁 bla 😀 1 😀 - 😀😁😀-',
  //   expected: [
  //     [5, ['😁']],
  //     [9, ['bla']],
  //     [12, ['😀']],
  //     [17, ['😀']],
  //     [22, ['😀']],
  //     [24, ['😁']],
  //     [26, ['😀', '😀😁😀']]
  //   ]
  // },
  {
    keywords: ['bla', '😁', '😀', '°□°', 'w', '┻━┻'],
    text: '-  (╯°□°）╯︵ ┻━┻ ',
    expected: [
      [7, ['°□°']],
      [14, ['┻━┻']],
    ],
  },
  {
    keywords: ['.com.au', '.com'],
    text: 'www.yahoo.com',
    expected: [[12, ['.com']]],
  },
  // not matched
  {
    keywords: ['.com.au', '.com'],
    text: 'www.example.org',
    expected: [],
  },
  // surrogate pair
  // U+20BAF: 𠮟
  {
    keywords: ['𠮟', '𠮟る'],
    text: '人を𠮟る',
    expected: [[2, ['𠮟']], [3, ['𠮟る']]],
  },
  // grapheme cluster
  // family: 👨‍👩‍👧‍👦
  // codepoints: 1F468 200D 1F469 200D 1F467 200D 1F466
  {
    keywords: ['👨‍👩‍👧‍👦'],
    text: '😁👨‍👩‍👧‍👦😀',
    expected: [[1, ['👨‍👩‍👧‍👦']]],
  },
] as {
  keywords: string[]
  text: string
  expected: [number, string[]][]
}[]

describe('original v2 matching corpus with v3 ranges', () => {
  for (const { keywords, text, expected } of testCases) {
    it(`searches and matches ${keywords.join(', ')}`, () => {
      const segments = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text))
      const matches = expected.flatMap(([position, patterns]) => {
        const end = segments[position].index + segments[position].segment.length
        return patterns.map(pattern => ({ pattern, patternIndex: keywords.indexOf(pattern), start: end - pattern.length, end, data: undefined }))
      }).sort((a, b) => a.end - b.end || b.pattern.length - a.pattern.length || a.patternIndex - b.patternIndex)
      const matcher = new AhoCorasick(keywords)
      expect(matcher.search(text)).toEqual(matches)
      expect([...matcher.iterate(text)]).toEqual(matches)
      expect(matcher.match(text)).toBe(matches.length > 0)
      for (const match of matches) {
        expect(text.slice(match.start, match.end)).toBe(match.pattern)
      }
    })
  }
})
