import type { DefaultTheme } from 'vitepress'

export type DocsLocale = 'en' | 'zh'

interface DocsPage {
  path: string
  en: string
  zh: string
}
interface DocsGroup {
  en: string
  zh: string
  collapsed: boolean
  items: DocsPage[]
}

/** One route and bilingual label per topic, shared by both locale sidebars. */
export const docsGroups: DocsGroup[] = [
  {
    en: 'Start here',
    zh: '开始使用',
    collapsed: false,
    items: [
      { path: 'getting-started', en: 'Getting started', zh: '快速开始' },
      { path: 'guide/choosing', en: 'Choose an API and entry', zh: '能力与入口选择' },
      { path: 'guide/migration', en: 'Migration', zh: '版本与第三方迁移' },
    ],
  },
  {
    en: 'API reference',
    zh: 'API 参考',
    collapsed: false,
    items: [
      { path: 'api', en: 'Overview', zh: '概览' },
      { path: 'api/constructor', en: 'Constructor and metadata', zh: '构造函数与元数据' },
      { path: 'api/search', en: 'Search and iteration', zh: '搜索与惰性迭代' },
      { path: 'api/count', en: 'Presence and counting', zh: '存在性与计数' },
      { path: 'api/replace', en: 'Replacement and tokens', zh: '替换与分词' },
      { path: 'api/options', en: 'Strategies, boundaries and ranges', zh: '策略、边界与范围' },
      { path: 'api/persistence', en: 'Compiled dictionaries', zh: '保存与加载编译词库' },
      { path: 'api/stats', en: 'Compilation statistics', zh: '编译统计' },
    ],
  },
  {
    en: 'Unicode',
    zh: 'Unicode',
    collapsed: true,
    items: [
      { path: 'unicode', en: 'Graphemes and UTF-16 indices', zh: '字素与 UTF-16 索引' },
      { path: 'unicode/normalization', en: 'Normalization and TextMatcher', zh: '归一化与 TextMatcher' },
      { path: 'unicode/case-folding', en: 'Full case folding', zh: '完整大小写折叠' },
    ],
  },
  {
    en: 'Extensions',
    zh: '扩展能力',
    collapsed: true,
    items: [
      { path: 'extensions', en: 'Overview', zh: '概览' },
      { path: 'extensions/dynamic', en: 'Dynamic dictionaries', zh: '动态词典' },
      { path: 'extensions/replacement-helpers', en: 'Replacement helpers', zh: '替换工具' },
      { path: 'extensions/performance', en: 'Backends and performance', zh: '后端选择与性能' },
    ],
  },
  {
    en: 'Streams',
    zh: '流式处理',
    collapsed: true,
    items: [
      { path: 'stream/core', en: 'Core createStream', zh: '核心 createStream' },
      { path: 'stream/sessions', en: 'Sessions, iterables and previews', zh: '增量会话、迭代与预览' },
      { path: 'stream/async', en: 'Async processing and cancellation', zh: '异步处理与取消' },
      { path: 'stream/filters', en: 'Protected text filters', zh: '受保护文本过滤' },
      { path: 'stream/adapters', en: 'Node and Web streams', zh: 'Node/Web 适配' },
    ],
  },
  {
    en: 'Examples',
    zh: '实战示例',
    collapsed: true,
    items: [
      { path: 'examples', en: 'Basic queries', zh: '场景索引与基础查询' },
      { path: 'examples/highlighting', en: 'Safe highlighting', zh: '安全高亮' },
      { path: 'examples/replacement', en: 'Metadata-driven replacement', zh: '元数据驱动替换' },
    ],
  },
  {
    en: 'Learn and explore',
    zh: '原理与工具',
    collapsed: true,
    items: [
      { path: 'algorithm', en: 'How it works', zh: '算法原理' },
      { path: 'visualization', en: 'Workbench', zh: '交互工作台' },
      { path: 'workbench/guide', en: 'Workbench guide', zh: '工作台使用说明' },
      { path: 'contributing', en: 'Develop the documentation', zh: '本地开发文档站' },
    ],
  },
]

export function sidebar(locale: DocsLocale) {
  const prefix = locale === 'zh' ? '/zh' : ''
  return docsGroups.map(group => ({
    text: group[locale],
    collapsed: group.collapsed,
    items: group.items.map(page => ({ text: page[locale], link: `${prefix}/${page.path}` })),
  }))
}

export function nav(locale: DocsLocale): DefaultTheme.NavItem[] {
  const prefix = locale === 'zh' ? '/zh' : ''
  const groups = sidebar(locale)
  return [
    { text: locale === 'zh' ? '指南' : 'Guide', items: groups[0].items },
    { text: 'API', items: groups[1].items, activeMatch: `${prefix}/api(?:/|$)` },
    {
      text: locale === 'zh' ? '扩展与流式' : 'Extensions & streams',
      items: [groups[3], groups[4]].map(group => ({ text: group.text, items: group.items })),
    },
    { text: locale === 'zh' ? '工作台' : 'Workbench', link: `${prefix}/visualization` },
  ]
}
