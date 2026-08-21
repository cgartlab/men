---
id: pattern-verdict-revision-needed
type: anti-pattern
created: 2026-08-21
status: active
source: ultrawork-20260815-213941
---

# 模式：Verdict 需要修改（REVISION_NEEDED）

## 模式

在 ultrawork 编排流程中，chi judge 对 si 撰写的正文给出了 REVISION_NEEDED 判定：

```
chi verdict=REVISION_NEEDED: 7PASS/2PARTIAL
- V6: 裸 URL ×6 在参考资料节
- V9: 图片占位 ×7 草稿标记
```

chi judge 对 9 项标准中的 7 项给出 PASS，但 2 项 PARTIAL（需修复）。men 随后调度 fixer 角色修正 V6（裸 URL → 格式规范），V9 需用户决策。

## 关键发现

1. **chi judge 能精准定位问题**：REVISION_NEEDED 判定附带具体问题列表（V6/V9），可追溯
2. **自动修复可行**：V6（裸 URL）是机械问题，fixer 角色可零人工干预修复
3. **用户决策阻塞点**：V9（图片占位）需要用户确认图片资源后才能完成
4. **Partial 状态保留**：PARTIAL 状态不阻塞最终交付，但标记为未完全达标

## 优化建议

- 在 chi judge 规则中为 PARTIAL 添加自动修复分支（对于机械可修复项）
- 在 men 流程中增加"用户决策待确认"队列，避免 PARTIAL 项被遗忘
- 建议 V9 类问题在 /ultrawork REPORT 中明确标注"⚠️ 待用户决策"

## 来源

- sid: ultrawork-20260815-213941
- events.jsonl: `men.verdict-received` 事件
- learn.mjs 自动提取：`errors/error-2026-08-21T13-45-54-985Z.md`