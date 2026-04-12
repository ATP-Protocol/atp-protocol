// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'ATP — Agent Trust Protocol',
  tagline: 'Govern the action. Prove it happened.',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://atp-protocol.org',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  organizationName: 'ATP-Protocol',
  projectName: 'atp-protocol',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is in Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl:
            'https://github.com/ATP-Protocol/atp-protocol/tree/main/docs/',
        },
        blog: {
          showReadingTime: true,
          editUrl:
            'https://github.com/ATP-Protocol/atp-protocol/tree/main/blog/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/atp-social-card.jpg',
      navbar: {
        title: 'ATP',
        logo: {
          alt: 'ATP Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docsSidebar',
            position: 'left',
            label: 'Spec',
          },
          {
            type: 'docSidebar',
            sidebarId: 'sdkSidebar',
            position: 'left',
            label: 'SDK',
          },
          {
            type: 'docSidebar',
            sidebarId: 'gatewaySidebar',
            position: 'left',
            label: 'Gateway',
          },
          {
            type: 'docSidebar',
            sidebarId: 'conformanceSidebar',
            position: 'left',
            label: 'Conformance',
          },
          {href: 'https://github.com/ATP-Protocol/atp-protocol', label: 'GitHub', position: 'right'},
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Specification',
                to: '/docs/spec/overview',
              },
              {
                label: 'Quick Start',
                to: '/docs/quick-start',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'GitHub Discussions',
                href: 'https://github.com/ATP-Protocol/atp-protocol/discussions',
              },
              {
                label: 'Issues',
                href: 'https://github.com/ATP-Protocol/atp-protocol/issues',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/ATP-Protocol/atp-protocol',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} ATP Protocol. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
    }),
};

export default config;
