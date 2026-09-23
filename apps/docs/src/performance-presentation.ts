export interface BenchmarkTableCell {
  text: string
  value?: number
  title?: string
}

export interface BenchmarkTableRow {
  key: string
  cells: BenchmarkTableCell[]
}

export const scenarioLabels: Record<string, [string, string]> = {
  'ascii-tiny': ['Tiny ASCII', '极短 ASCII'],
  'crlf': ['CRLF', 'CRLF'],
  'ascii-combining': ['ASCII + combining', 'ASCII + 组合字符'],
  'unicode-start': ['Unicode at start', 'Unicode 开头'],
  'ascii-prefix': ['ASCII prefix', 'ASCII 前缀'],
  'ascii-early-unicode': ['Early Unicode', '较早出现 Unicode'],
  'ordinary': ['Ordinary text', '普通文本'],
  'sparse': ['No matches', '无命中'],
  'unicode': ['Mixed Unicode', '混合 Unicode'],
  'shared-prefix': ['Shared prefixes', '共享前缀'],
  'dense-suffix': ['Dense suffixes', '密集后缀'],
  'output-heavy-miss': ['High-output, no hit', '高输出词典 · 无命中'],
  'output-heavy-sparse': ['High-output, sparse', '高输出词典 · 稀疏'],
  'duplicates': ['Duplicate patterns', '重复词条'],
  'early-hit': ['Early hit', '靠前命中'],
  'late-hit': ['Late hit', '靠后命中'],
  'large-dictionary': ['10k patterns', '1 万词条'],
  'long-text': ['Long text', '长文本'],
  'chinese': ['Chinese', '中文'],
  'emoji': ['Emoji', 'Emoji'],
  'zwj': ['ZWJ sequences', 'ZWJ 序列'],
  'combining': ['Combining marks', '组合字符'],
}
