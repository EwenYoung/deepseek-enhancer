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
      '16': 'icons/icon.png',
      '48': 'icons/icon.png',
      '128': 'icons/icon.png',
    },
  },
  srcDir: 'src',
  outDir: 'dist',
  publicDir: 'src/public',
});
