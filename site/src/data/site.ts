/**
 * site.ts — 站点元信息单一来源
 * 版本号以 site/package.json 为准（发布时随仓库同步），禁止在组件内硬编码。
 */
import pkg from '../../package.json';

export const SITE = {
  name: 'men（门）Agent 团队',
  version: `v${pkg.version}`,
  repo: 'https://github.com/cgartlab/men',
  repoLabel: 'cgartlab/men',
  license: 'MIT',
  brand: 'CG 艺术实验室 · cgartlab.com',
  url: 'https://men.cgartlab.com',
} as const;
