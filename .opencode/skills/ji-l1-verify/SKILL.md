---
name: ji-l1-verify
description: "Use when verifying completed code by running typecheck, lint, or test commands. 触发关键词：验证、检查代码、跑测试、gate、typecheck、lint、test、验证、确认代码能跑。Don't call when the user wants to review PR semantics (use chi-judge), or when the task is writing new code without verification intent."
---

# ji-l1-verify — L1 机械验证

当此 skill 激活时，代码完成后必须按四级验证栈顺序执行。L1 机械检查优先，L2 人工审查在后。

## 触发词

- 验证 / 验证代码 / 检查一下
- 跑测试 / 跑 typecheck / 跑 lint
- gate / 过了 gate 吗
- 确认代码能跑

## 四级验证栈

| 级别 | 工具 | 说明 | 触发条件 |
|------|------|------|----------|
| **L1 检查器** | typecheck / lint / test | 机械优先，退出码 0 = 通过 | 每次代码改动后必须执行 |
| **L2 AI 审查** | chi（持） | Fresh context 独立评审 PR | L1 通过后才触发 |
| **L3 流程** | Git Hooks + CI | pre-push / commit-msg / 分支命名 | push 时自动 |
| **L4 人工** | human merge gate | 最终合并由人决定 | PR 合并时 |

## L1 命令执行规范

### 命令白名单

gate 只允许以下命令类型：

| 类型 | 示例 |
|------|------|
| typecheck | `tsc --noEmit` / `astro check` |
| lint | `eslint .` / `biome check` |
| test | `vitest run` / `bun test` |

**禁止**：构建工具（`webpack` / `vite build`）、部署命令、数据库迁移、外部 API 调用。

### 执行方式

**必须使用 argv 数组执行命令，不使用 shell**：

```javascript
// 正确：argv 数组
spawn("bun", ["test"])
spawn("npx", ["eslint", "."])
spawn("bun", ["run", "typecheck"])

// 错误：shell 字符串
spawn("bun test", { shell: true })
spawn("npx eslint . && bun test")
```

原因：argv 数组能正确处理参数中的空格和特殊字符，避免 shell 注入。

### 退出码判定

- **退出码 0** = 通过
- **退出码非 0** = 失败，记录错误信息，不继续后续步骤
- 不接受"应该没问题"——必须有机械证据

## 不要触发

- 用户要求做代码审查/语义评审（由 chi-judge 负责）
- 用户要求写新代码但尚未完成（L1 验证在代码完成后）
- 用户要求做 UI 视觉评审（由 yi 负责）

## L1 执行流程

```
1. 确定验证命令
   ├── 有 package.json → 读取 scripts 字段
   └── 无 package.json → 报告"无可用验证命令"

2. 执行 typecheck（如有）
   └── 通过 → 继续 / 失败 → 报告错误，停止

3. 执行 lint（如有）
   └── 通过 → 继续 / 失败 → 报告错误，停止

4. 执行 test（如有）
   └── 通过 → L1 通过 / 失败 → 报告错误，停止

5. L1 全部通过 → 报告结果
```

## 完成标准

代码交付后必须确认：

1. **能跑** — 构建/运行命令退出码 0
2. **有输出** — 产物文件存在且非空
3. **不报错** — 无 console error、无 lint error、无 test failure

## 连续失败处理

连续 **5 次** L1 验证失败后：

1. 停止重试
2. 报告"卡住"状态，附上最近一次失败的完整错误信息
3. 建议：回退最近改动、检查依赖版本、或向 si（思）请求调整 plan
4. 不进入 L2——L1 不通，L2 无意义

## 错误信息记录

失败时记录：

- 命令名称（typecheck/lint/test）
- 退出码
- 关键错误行（前 10 行 + 最后 10 行）
- 失败文件列表

格式：

```
[L1 FAIL] typecheck → exit 2
  Error: Cannot find name 'xxx' (src/foo.ts:42:10)
  ...
```

## Anti-Patterns

- ❌ 不跳过 L1 直接推给 L2
- ❌ 不用 shell 字符串执行命令（必须用 argv）
- ❌ 不接受"应该没问题"作为验证结果
- ❌ 连续失败不止损，无限重试
- ❌ 用 LLM 自评代替机械检查（"我觉得代码没问题" = 无验证）
- ❌ 把构建/部署命令混入 gate（gate 只允许 typecheck/lint/test）
