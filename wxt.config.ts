import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'deepseek-enhancer',
    description: 'DeepSeek 网页端增强插件',
    version: '0.1.0',
    permissions: ['storage'],
    host_permissions: [
      'https://chat.deepseek.com/*',
      'https://api.deepseek.com/*',
      'https://api.tavily.com/*',
    ],
    icons: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    web_accessible_resources: [
      {
        resources: ['content-scripts/main-world.js'],
        matches: ['https://chat.deepseek.com/*'],
      },
    ],
  },
  srcDir: 'src',
  outDir: 'dist',
  publicDir: 'src/public',
});
