# 安装流程交互体验问题清单（review/install-ux）

> 审查日期：2026-08-31
> 方法：si（新用户旅程视角，11 条 UX）+ ji（可执行性实测视角，15 条 IMP），合并去重后 **22 条**。
> 状态：**P0/P1/P2 全部修复**（分支 `review/install-ux`，按问题域拆分为 4 个 PR 合并回 main）。IMP-08 的 verify 增强项评估后未实施（会导致 CI 因缺少 node_modules 失败，且 install.mjs 摘要已覆盖用户可见警示）；IMP-04 curl 静默以文档提示方式处理。
> 后续加固（2026-09-03 全平台实测）：`readJsonSafe` BOM 兼容（PowerShell UTF-8 BOM 导致 --global 合并丢配置）、`--global-remove` tui.json 空数组清理、install.ps1 退出码传播（直接运行场景）、verify `extractSuccessPaths` 正则修正（`//` 匹配导致 Windows 上解析到驱动器根目录）、`@opencode-ai/plugin` fallback 版本同步 1.18.25。均已合并 main（PR #74 / #80）。

---

## P0 — 阻断使用 / 数据安全 / 必然失败

| # | 编号 | 问题 | 触发场景 | 当前行为 → 期望行为 |
|---|------|------|---------|---------------------|
| 1 | IMP-01 | Windows 官方一键 `irm …\|iex` 中脚本 `exit` 会**关闭整个 PowerShell 会话**（成功/失败都杀终端） | Windows 管道安装 | `exit` 终止会话 → 仅终止脚本逻辑（`return`/`throw`） |
| 2 | IMP-02 | 官网文档 `irm …\|iex -Dir C:\men` **必然报错**——`iex` 自己解析 `-Dir`，参数传不进脚本 | 按文档带参数管道安装 | 报参数错误且装到 `./men` → 删除示例 / 提供真实传参通道 |
| 3 | UX-02/03 | **模型未配却打印"安装成功"**：verify 只查文件结构，不查 provider 可用；新用户首启 `opencode` 即撞 `opencode-go/hy3` 不存在，且不知 CC Switch 是什么 | 无模型配置用户完成安装后首启 | 假阳性成功 → 安装器检测 opencode/模型配置并明确预警 |
| 4 | UX-04/IMP-06/07 | `npx @cgartlab/men` 在**已有项目目录**运行会**静默覆盖 opencode.json / AGENTS.md / .opencode 同名文件**，无确认、无备份 | 在已有项目目录执行一键安装 | 静默覆盖 → 检测冲突 + 备份 `.bak` / 要求 `--force` |

## P1 — 装完≠能用 / 配置正确性 / 失败不可读

| # | 编号 | 问题 | 触发场景 | 当前行为 → 期望行为 |
|---|------|------|---------|---------------------|
| 5 | IMP-08 | `.opencode` 依赖安装失败仅警告，摘要仍打印"安装成功 ✓" → `@opentui` 缺失 → **侧边栏静默不渲染** | 无网络/registry 异常 | FAIL 却报成功 → 摘要标"部分成功" + 附修复命令 |
| 6 | IMP-09 | verify 失败输出是**被截断的 JSON**，FAIL 证据恰好丢失，无修复指引 | 端到端验证某项 FAIL | JSON 堆 → 提取 FAIL 项人类可读摘要 |
| 7 | IMP-13 | `opencode.json` 的 `"version"` 字段**违反官方 schema**（`additionalProperties:false`） | 装完首启 opencode / 编辑器按 $schema 校验 | schema 非法 → 删除字段 |
| 8 | IMP-04 | `bash <(curl …)` 中 curl 失败时进程替换**静默 exit 0** | 网络/代理失败 | 静默成功 → 一键命令显式下载再执行 |
| 9 | IMP-05 | `git clone` 失败仅英文 stderr，无中文修复指引 | clone 阶段网络失败 | 英文报错 → 包裹中文引导 |
| 10 | UX-06 | 7 个 MCP 首次启动要联网 + `github-mcp-server` 要 `GITHUB_TOKEN`，**无预警** | 首次 `opencode` MCP 初始化 | 无说明 → 文档/摘要列出 MCP 就绪要求 |
| 11 | UX-08 | `.env` 复制全占位符但**无任何引导**（不知道要不要填、填哪、不填会怎样） | 安装完成后使用知识检索 | 占位符无说明 → 摘要/文档说明 .env 作用域 |
| 12 | UX-09 | onboarding-design 设计了"对话式配模型"，quickstart 却标为**"可选跳过"** | 无 CC Switch 用户按主路径走 | 设计脱节 → 配模型提升为新用户必读步骤 |
| 13 | UX-10 | 安装器**不检测 `opencode` 命令**是否安装 | 未装 OpenCode 环境 | 装完才报 command not found → 前置检测 |

## P2 — 摩擦 / 一致性

| # | 编号 | 问题 | 触发场景 | 当前行为 → 期望行为 |
|---|------|------|---------|---------------------|
| 14 | UX-01 | README 面向开发者，第一屏没有"3 秒看懂 + 30 秒跑通" | 从 README/官网第一次进来 | 术语堆砌 → 顶部加定位 + 最小 demo |
| 15 | UX-05/11 | npx"任意目录"语义误解 + 首次英文 `Ok to proceed? (y)` 提示 | 新手首次 npx | 语义落差 → 摘要首行明示"安装位置 = 当前文件夹" |
| 16 | IMP-03 | install.ps1 `#Requires -Version 5.1` 与文档"PowerShell 7+"措辞不一致 | PS 5.1 / 7 用户读文档 | 口径不一 → 统一为"5.1+（推荐 7+）" |
| 17 | IMP-07 | `.opencode/` 同名文件合并覆盖 | 已有自定义插件与 men 同名 | 静默替换 → 存在即告警 |
| 18 | IMP-10 | install.mjs 不检测 npm/git（npx 路径下 git 缺失无保护） | `node scripts/install.mjs` 直跑 | 静默落入依赖失败分支 → 低优先级可接受 |
| 19 | IMP-11 | `--global` 不检测 OpenCode 安装、不识别 CC Switch 管理、**无卸载** | 未装 OpenCode 用户注册全局 | 注册"成功"但无效 → 加存在性提示 + `--remove` |
| 20 | IMP-12 | `--global` 新功能**文档全未同步**（README/quickstart/install.astro 无） | 用户查找全局安装方式 | 无法发现 → 文档补条目 |
| 21 | IMP-14 | 安装全程**无进度反馈**（实测 28.6 秒零输出） | 完整安装等待期 | 空白终端 → 各阶段输出 `>> [n/6] 步骤` 进度行 |
| 22 | IMP-15 | `--dir` 已存在非 men 目录时错误信息无解决指引 | `--dir` 指向普通目录 | 报错无指引 → 补充"不带 --dir 运行"提示 |

---

## 最大断点（新用户旅程）

用户从 README 看到"6+1 Agent 团队"，30 秒内没看懂装完能得到什么；跑 `npx @cgartlab/men` 后一路"安装成功 ✓"，首启 `opencode` 却撞上**模型未配置**（`opencode-go/hy3` 不存在），报错完全读不懂；翻 quickstart 想补模型，发现配模型步骤被标"可选跳过"，与设计文档脱节；若在已有项目目录安装，还会发现 opencode.json 被无声覆盖。**装完 5 分钟内三个断点（模型未配却报成功、CC Switch 认知空白、已有配置被覆盖）全部踩中。**