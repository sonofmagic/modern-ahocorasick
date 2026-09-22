import { defineConfig } from 'vitepress'

import { nav, sidebar } from './navigation.js'

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
        nav: nav('en'),
        sidebar: sidebar('en'),
        darkModeSwitchLabel: 'Appearance',
        lightModeSwitchTitle: 'Switch to light theme',
        darkModeSwitchTitle: 'Switch to dark theme',
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'modern-ahocorasick',
      description: '逐字素扫描的多模式文本匹配。',
      themeConfig: {
        nav: nav('zh'),
        sidebar: sidebar('zh'),
        outline: { label: '本页内容', level: [2, 3] },
        docFooter: { prev: '上一页', next: '下一页' },
        darkModeSwitchLabel: '主题',
        lightModeSwitchTitle: '切换到亮色主题',
        darkModeSwitchTitle: '切换到暗色主题',
        sidebarMenuLabel: '目录',
        returnToTopLabel: '返回顶部',
      },
    },
  },
  themeConfig: {
    outline: { level: [2, 3] },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/icelib/modern-ahocorasick',
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
