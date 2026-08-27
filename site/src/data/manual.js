/**
 * manual.js — Wiki 手册统一目录（唯一事实来源）
 * 侧栏导航、手册封面、章节分页均由此驱动。
 */

export const MANUAL = {
  title: 'men（门）Wiki 手册',
  url: 'https://men.cgartlab.com',
  chapters: [
    { slug: 'overview',     title: '概览',     group: '入门', desc: '系统定义、设计原则与团队组成' },
    { slug: 'install',      title: '安装',     group: '入门', desc: 'npm 一行安装（npx @cgartlab/men）与前置要求' },
    { slug: 'configure',    title: '配置',     group: '入门', desc: 'opencode.json、模型分配与 MCP 服务' },
    { slug: 'quickstart',   title: '快速上手', group: '入门', desc: '30 分钟跑通第一个任务' },
    { slug: 'agents',       title: '角色说明', group: '参考', desc: '六个角色的职责边界与路由判定' },
    { slug: 'protocols',    title: '协议规范', group: '参考', desc: '编排协议、机械验证与事件审计' },
    { slug: 'architecture', title: '架构设计', group: '参考', desc: '协作拓扑、编排流程与设计决策' },
    { slug: 'governance',   title: '治理',     group: '管理', desc: '权限、决策机制与安全合规' },
    { slug: 'releases',     title: '路线图',   group: '管理', desc: '版本历史、里程碑与发布流程' },
  ],
};

export function chapterBySlug(slug) {
  return MANUAL.chapters.find((c) => c.slug === slug) ?? null;
}
