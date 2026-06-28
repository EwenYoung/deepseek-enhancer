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
  },
  srcDir: 'src',
  outDir: 'dist',
});
