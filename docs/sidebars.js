/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a set of docs in the sidebar
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    'intro',
    'quick-start',
    {
      label: 'Specification',
      items: [
        'spec/overview',
        'spec/contracts',
        'spec/authority',
        'spec/policy',
        'spec/approval',
        'spec/credentials',
        'spec/execution',
        'spec/evidence',
      ],
    },
  ],
  sdkSidebar: [
    {
      label: 'SDK Documentation',
      items: [
        'sdk/overview',
        'sdk/typescript',
        'sdk/python',
      ],
    },
  ],
  gatewaySidebar: [
    {
      label: 'Gateway',
      items: [
        'gateway/overview',
        'gateway/architecture',
        'gateway/deployment',
      ],
    },
  ],
  conformanceSidebar: [
    {
      label: 'Conformance',
      items: [
        'conformance/overview',
        'conformance/levels',
        'conformance/testing',
        'conformance/certification',
      ],
    },
  ],
};

module.exports = sidebars;
