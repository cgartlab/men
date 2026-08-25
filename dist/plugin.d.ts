/**
 * opencode-men — OpenCode Plugin 入口
 *
 * 薄适配层：注册 agents/commands/skills 到 OpenCode Plugin API。
 * 核心逻辑在 core/，此文件只负责 adapter。
 */
export default function menPlugin(): {
    name: string;
    version: string;
    setup(api: any): Promise<void>;
};
//# sourceMappingURL=plugin.d.ts.map