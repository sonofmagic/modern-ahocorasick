// cjs
const AhoCorasick = require('modern-ahocorasick')
// esm
// import AhoCorasick from 'modern-ahocorasick'

const ac = new AhoCorasick(['keyword1', 'keyword2', 'etc'])
const results = ac.search('should find keyword1 at position 19 and keyword2 at position 47.')

console.log(results)
// [ [ 19, [ 'keyword1' ] ], [ 47, [ 'keyword2' ] ] ]
