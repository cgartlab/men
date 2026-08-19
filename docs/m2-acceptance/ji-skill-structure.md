# ji-skill-structure — Skill 目录结构检查报告

> **检查人**：ji（记，代码与工程执行者）
> **检查日期**：2026-08-15
> **检查范围**：`D:\github-repos\men\.opencode\skills\`
> **检查依据**：M2 验收测试 + `ji-l1-verify` skill（L1 机械验证规范）

## 结论

**13/13 skill 结构完整，全部通过。** 每个 skill 均含合法 `SKILL.md`（frontmatter 含 `name` + `description`），无缺失、无格式错误。无辅助文件（`scripts/` 等）——属正常情况，非缺陷。

## 目录树

```
.opencode/skills/
├── chi-invest/          → SKILL.md
├── chi-judge/           → SKILL.md
├── ji-frontend-design/  → SKILL.md
├── ji-github/           → SKILL.md
├── ji-l1-verify/        → SKILL.md
├── si-content-write/    → SKILL.md
├── si-knowledge/        → SKILL.md
├── si-plan-compose/     → SKILL.md
├── xun-factcheck/       → SKILL.md
├── xun-rss-scan/        → SKILL.md
├── xun-search/          → SKILL.md
├── yi-design/           → SKILL.md
└── yi-imagegen/         → SKILL.md
```

## 逐 skill 状态表

| # | Skill | SKILL.md 存在 | frontmatter（name） | frontmatter（description） | 辅助文件 | 行数 | 大小 | 状态 |
|---|-------|:---:|:---:|:---:|:---:|---:|---:|:---:|
| 1 | chi-invest | ✅ | ✅ | ✅ | 无 | 49 | 1,570 B | ✅ |
| 2 | chi-judge | ✅ | ✅ | ✅ | 无 | 69 | 2,303 B | ✅ |
| 3 | ji-frontend-design | ✅ | ✅ | ✅ | 无 | 123 | 4,522 B | ✅ |
| 4 | ji-github | ✅ | ✅ | ✅ | 无 | 114 | 2,848 B | ✅ |
| 5 | ji-l1-verify | ✅ | ✅ | ✅ | 无 | 123 | 3,605 B | ✅ |
| 6 | si-content-write | ✅ | ✅ | ✅ | 无 | 38 | 1,200 B | ✅ |
| 7 | si-knowledge | ✅ | ✅ | ✅ | 无 | 32 | 1,106 B | ✅ |
| 8 | si-plan-compose | ✅ | ✅ | ✅ | 无 | 47 | 1,357 B | ✅ |
| 9 | xun-factcheck | ✅ | ✅ | ✅ | 无 | 91 | 2,991 B | ✅ |
| 10 | xun-rss-scan | ✅ | ✅ | ✅ | 无 | 97 | 2,659 B | ✅ |
| 11 | xun-search | ✅ | ✅ | ✅ | 无 | 65 | 2,479 B | ✅ |
| 12 | yi-design | ✅ | ✅ | ✅ | 无 | 77 | 3,391 B | ✅ |
| 13 | yi-imagegen | ✅ | ✅ | ✅ | 无 | 68 | 2,466 B | ✅ |

**汇总**：通过 13 / 13，失败 0 / 13。

## 检查明细

### SKILL.md 存在性

- 遍历 13 个子目录，`SKILL.md` 全部存在（`Test-Path` / `Get-ChildItem` 双重确认）
- 无缺失、无空文件（最小 `si-knowledge` 1,106 B，非空）

### Frontmatter 合法性

- 全部 13 个文件以 `---` 开头包裹 YAML frontmatter（第 1 行 `---`，第 4 行附近闭合）
- 必填字段 `name`：13/13 存在，且与目录名一致
- 必填字段 `description`：13/13 存在，非空字符串
- 引号风格：9 个无引号、4 个双引号包裹（含英文引号内含撇号场景，如 `ji-frontend-design`、`ji-github`、`ji-l1-verify`）——YAML 均合法
- 无无效 YAML 语法（如未闭合引号、tab 缩进）

### 辅助文件

- 13/13 均无辅助文件（无 `scripts/`、`reference/`、`assets/` 等子目录）
- 说明：当前 skill 均为纯规范类，不需要脚本辅助；不视为问题，仅记录

## 发现的问题清单

**无。** 0 个问题。

| 严重度 | 数量 | 说明 |
|--------|------|------|
| 🔴 阻断（缺失/损坏） | 0 | — |
| 🟡 警告（格式不规范） | 0 | — |
| 🔵 观察（非缺陷） | 0 | — |

## 附注

- 个别 skill 正文引用了内网地址（`192.168.31.x` 等），属本地优先架构的正常配置，非结构问题
- 本报告为 M2 验收测试产物，由 ji 独立完成，未经过 chi 评审（按 M2 流程，评审属后续环节）

---

*报告生成方式：`read` + `glob` + `Get-ChildItem` 遍历，人工核对 frontmatter 字段。*
