---
id: pattern-multitask-wave-parallel
type: pattern
created: 2026-08-21
status: active
source: M3 orchestration
---

# 模式：多任务 Wave 并行编排

## 模式

M3 编排验收中验证了 ultrawork 三路并行能力：

| Wave | 任务 | 角色 | 状态 |
|------|------|------|------|
| 1 | 撰写 AI 生图工具系列第二篇正文 | si (si-content-write) | ✅ 13.8KB |
| 1 | 查 3 条 AI 生图行业新闻 | xun (xun-search) | ✅ 6036B |
| 1 | 查当前黄金价格 | xun (xun-search) | ✅ 2993B |
| 3 | V6 裸 URL 格式修复 | fixer | ✅ 修复完成 |

Wave 1 三路完全并行，Wave 3 为修复轮次。总执行时间 <3 分钟。

## 关键发现

1. **并行安全**：3 路同时执行，无资源竞争，产出文件互不冲突
2. **fixer 角色价值**：对于机械可修复问题（裸 URL、占位符），fixer 可在独立 wave 中完成修复，无需用户介入
3. **Wave 依赖清晰**：Wave 2（无）→ Wave 3（修复依赖 Wave 1 输出）
4. **事件可追溯**：每个 wave 的 dispatch 事件独立记录，支持完整回放

## 优化建议

- fixer 角色应作为标准 subagent 纳入角色表（当前是临时创建）
- Wave 3 可考虑自动触发（当 Wave 1 产物有可机械修复项时）
- 建议为每个 Wave 产物添加摘要文件，方便 chi judge 快速定位问题

## 来源

- sid: ultrawork-20260815-213941
- 验收文档: `docs/m3-orchestration/`
- learn.mjs 自动提取