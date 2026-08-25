import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  server: { port: 4399 },
  preview: { port: 4399 },
  site: 'https://men.cgartlab.com',
  base: '/',
  output: 'static',
  integrations: [
    icon({
      include: {
        lucide: [
          'copy', 'check', 'terminal', 'github', 'arrow-right', 'arrow-up-right',
          'door-open', 'brain', 'code', 'shield-check', 'palette', 'search',
          'git-branch', 'zap', 'file-text', 'bar-chart-3', 'shield', 'book-open',
          'users', 'settings', 'play', 'circle-check', 'circle-x',
          'message-square', 'download', 'refresh-cw',
          'pen-tool', 'code-2', 'scale', 'shield-alert', 'activity', 'lock', 'file-code',
          'chevron-left', 'chevron-right',
        ],
      },
    }),
  ],
});
