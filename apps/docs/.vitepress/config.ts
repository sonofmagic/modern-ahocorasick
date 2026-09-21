import { defineConfig } from 'vitepress'

const pages = [
  'getting-started',
  'api',
  'algorithm',
  'unicode',
  'examples',
  'visualization',
]
const en = [
  'Getting started',
  'API',
  'How it works',
  'Unicode & indices',
  'Examples',
  'Visualizer',
]
const zh = [
  '快速开始',
  'API',
  '算法原理',
  'Unicode 与索引',
  '使用示例',
  '交互可视化',
]
function links(prefix: string, labels: string[]) {
  return pages.map((page, index) => ({
    text: labels[index],
    link: `${prefix}/${page}`,
  }))
}
export default defineConfig({
  title: 'modern-ahocorasick',
  description: 'Exact multi-pattern text matching, one grapheme at a time.',
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]],
  cleanUrls: true,
  lastUpdated: true,
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/getting-started' },
          { text: 'Visualizer', link: '/visualization' },
        ],
        sidebar: links('', en),
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'modern-ahocorasick',
      description: '逐字素扫描的多模式文本匹配。',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/getting-started' },
          { text: '可视化', link: '/zh/visualization' },
        ],
        sidebar: links('/zh', zh),
        outline: { label: '本页内容' },
        docFooter: { prev: '上一页', next: '下一页' },
        darkModeSwitchLabel: '主题',
        sidebarMenuLabel: '目录',
        returnToTopLabel: '返回顶部',
      },
    },
  },
  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/sonofmagic/modern-ahocorasick',
      },
    ],
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索', buttonAriaLabel: '搜索文档' },
              modal: {
                noResultsText: '没有找到结果',
                resetButtonTitle: '清除搜索',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },
    footer: {
      message: 'MIT · Based on BrunoRB/ahocorasick',
      copyright: 'modern-ahocorasick by SonOfMagic',
    },
  },
})
