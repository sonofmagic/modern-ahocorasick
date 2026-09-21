import AhoCorasick from '@/index'

describe('usage', () => {
  it('example 1', () => {
    const keywords = ['cat', 'bat', 'rat']
    const ac = new AhoCorasick(keywords)

    const text = 'the cat chased the rat while a bat flew by'
    const matches = ac.search(text)

    expect(matches).toEqual([
      [6, ['cat']],
      [21, ['rat']],
      [33, ['bat']],
    ])
  })

  it('example 2', () => {
    const ac = new AhoCorasick(['abc', '123'])
    expect(ac.match('hello abc world')).toBe(true)
    expect(ac.match('hello world')).toBe(false)
  })

  it('example 3', () => {
    const keywords = ['hello', 'world']
    const ac = new AhoCorasick(keywords.map(k => k.toLowerCase()))

    const text = 'Hello World'
    const matches = ac.search(text.toLowerCase())
    expect(matches).toEqual([
      [4, ['hello']],
      [10, ['world']],
    ])
  })
})
