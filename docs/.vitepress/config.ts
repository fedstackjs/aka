import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Aka Ranker',
  description: 'Ranker for all contests',
  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],
  themeConfig: {
    logo: '/aka.svg',

    nav: [
      { text: '首页', link: '/' },
      { text: '开始使用', link: '/getting-started' }
    ],

    sidebar: [
      {
        text: '开始使用',
        items: [
          { text: '开始使用', link: '/getting-started' },
          { text: '配置说明', link: '/config' }
        ]
      },
      {
        text: '排行榜类型',
        items: [
          { text: '排行榜：Basic', link: '/type/basic' },
          { text: '排行榜：Plus', link: '/type/plus' },
          { text: '排行榜：ACM', link: '/type/acm' }
        ]
      }
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/fedstackjs/aka' }],

    editLink: {
      pattern: 'https://github.com/fedstackjs/aka/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    footer: {
      message: 'Released under the AGPL-3.0 License.',
      copyright: 'Copyright © 2022-present FedStack'
    }
  }
})
