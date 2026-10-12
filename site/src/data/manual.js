/**
 * manual.js — Wiki 手册统一目录（唯一事实来源）
 * 侧栏导航、手册封面、章节分页均由此驱动。
 */

export const MANUAL = {
  title: 'Men Wiki 手册',
  url: 'https://men.cgartlab.com',
  chapters: [
    { slug: 'overview',     title: '概览',     group: '入门', desc: 'Men 是什么、能做什么、怎么工作' },
    { slug: 'install',      title: '安装',     group: '入门', desc: 'npm 一行安装（npx @cgartlab/men）与前置要求' },
    { slug: 'configure',    title: '配置',     group: '入门', desc: '配置文件、模型分配与技能路径' },
    { slug: 'quickstart',   title: '快速上手', group: '入门', desc: '从零跑通第一个任务，含三个实战案例' },
    { slug: 'agents',       title: '角色说明', group: '参考', desc: '6 个角色各管什么、怎么配合' },
    { slug: 'protocols',    title: '协议规范', group: '参考', desc: '10 步流程、5 项自动检查与经验积累' },
    { slug: 'bot-mode',     title: 'Bot Mode 群组', group: '参考', desc: '多 Bot 群组里怎么避免七嘴八舌' },
    { slug: 'architecture', title: '架构设计', group: '参考', desc: '团队结构、任务流转与验证体系' },
    { slug: 'governance',   title: '治理',     group: '管理', desc: '谁管什么、怎么做决策、怎么发布' },
    { slug: 'releases',     title: '路线图',   group: '管理', desc: '版本历史、里程碑与发布流程' },
  ],
};

export function chapterBySlug(slug) {
  return MANUAL.chapters.find((c) => c.slug === slug) ?? null;
}
