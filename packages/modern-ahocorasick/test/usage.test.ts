import AhoCorasick from '@/index'

it('provides ranges for highlighting without emitting HTML', () => {
  const text = '😀 the cat chased the rat'
  const matches = new AhoCorasick(['cat', 'rat']).search(text)
  expect(matches.map(({ start, end }) => text.slice(start, end))).toEqual(['cat', 'rat'])
  expect(matches.map(({ start, end }) => [start, end])).toEqual([[7, 10], [22, 25]])
})

it('uses application metadata for replacement', () => {
  const ac = new AhoCorasick([
    { pattern: 'cat', data: { id: 'animal-cat', replacement: '猫' } },
    { pattern: 'dog', data: { id: 'animal-dog', replacement: '狗' } },
  ])
  expect(ac.replace('cat and dog', match => match.data!.replacement)).toBe('猫 and 狗')
})

it('allows callers to stop iteration after their first result', () => {
  const ac = new AhoCorasick(['abc', '123'])
  const first = ac.iterate('hello abc 123').next().value!
  expect(first.pattern).toBe('abc')
  expect(ac.match('hello abc world')).toBe(true)
  expect(ac.match('hello world')).toBe(false)
})
