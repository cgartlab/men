/**
 * opencode-men — @opencode-ai/plugin 本地类型声明（编译期仅用）
 *
 * 背景：@opencode-ai/plugin v1.18.18 仅安装在 .opencode/node_modules/
 * （由 install.mjs 管理，见 scripts/install.mjs），而 src/ 由根 tsconfig.json
 * 编译，模块解析从 src/ 向上找不到该包。运行时由 OpenCode 在 .opencode 环境
 * 解析真实包；此文件仅为让根 tsc --noEmit 通过而声明最小 API 子集。
 *
 * 真实类型权威来源：.opencode/node_modules/@opencode-ai/plugin/dist/*.d.ts
 * 本声明只覆盖 plugin.ts 实际使用到的面（PluginInput / tool / ToolResult）。
 */

declare module "@opencode-ai/plugin" {
  export type ToolContext = {
    sessionID: string;
    messageID: string;
    agent: string;
    directory: string;
    worktree: string;
    abort: AbortSignal;
    metadata(input: { title?: string; metadata?: Record<string, any> }): void;
    ask(input: any): Promise<void>;
  };

  export type ToolResult =
    | string
    | {
        title?: string;
        output: string;
        metadata?: Record<string, any>;
        attachments?: Array<{ type: "file"; mime: string; url: string; filename?: string }>;
      };

  export type ToolInput<Args> = {
    description: string;
    args: Args;
    execute(args: Args, context: ToolContext): Promise<ToolResult>;
  };

  export function tool<Args extends Record<string, any>>(input: ToolInput<Args>): ToolInput<Args>;
  export namespace tool {
    const schema: {
      string(): { describe(description: string): any };
    };
  }

  export type PluginInput = {
    client: unknown;
    project: { name?: string } | null;
    directory: string;
    worktree: string;
    experimental_workspace: { register(type: string, adapter: unknown): void };
    serverUrl: URL;
  };

  export type PluginOptions = Record<string, unknown>;

  export type Hooks = {
    dispose?: () => Promise<void>;
    tool?: Record<string, ToolInput<Record<string, any>>>;
    "shell.env"?: (
      input: { cwd: string; sessionID?: string; callID?: string },
      output: { env: Record<string, string> }
    ) => Promise<void>;
  };

  export type Plugin = (
    input: PluginInput,
    options?: PluginOptions
  ) => Promise<Hooks>;
}
