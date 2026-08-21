# 贡献指南

感谢你对 **men（门）Agent 团队** 项目的关注！欢迎通过 Issue 和 PR 参与贡献。

---

## 欢迎贡献的类型

| 类型 | 说明 |
|------|------|
| **文档优化** | README / docs / guide 的错别字、表述改进、翻译 |
| **脚本增强** | `scripts/` 下验证、门禁、安装等脚本的 bugfix 或功能扩展 |
| **Agent 定义** | 角色能力边界修正、技能触发精度优化、红线补充 |
| **Bug 修复** | 任何已确认 bug 的修复 |
| **功能提案** | 先开 Issue 讨论，确认方向后再提交 PR |

---

## 开发环境

- **Node.js ≥ 18**（`@opencode-ai/plugin` engines 要求）
- 已安装 [OpenCode](https://opencode.ai/) CLI
- 克隆仓库并安装依赖：

```bash
git clone https://github.com/cgartlab/men.git
cd men
cd .opencode && npm install && cd ..
```

---

## 分支命名

```
dev-xxx       # 功能开发
write-xxx     # 文档/内容写作
fix-xxx       # Bug 修复
chore-xxx     # 杂务（配置、工具链、CI 等）
```

示例：`fix/verify-mjs-null-check`、`docs/readme-badges`

---

## 提交规范

采用 **Conventional Commits**：

```
<type>(<scope>): <description>
```

**Type**：
- `feat` — 新功能
- `fix` — Bug 修复
- `docs` — 文档变更
- `chore` — 杂务/配置
- `refactor` — 重构（不改变功能）

**Scope**：`skills` / `scripts` / `docs` / `agent` / `config` / `github`

示例：
```
fix(scripts): 修复 verify.mjs 在空目录下的空指针
docs(readme): 更新徽章与项目结构树
feat(agent): 新增 xun 角色 RSS 扫描能力
```

---

## PR 流程

1. **Fork** 本仓库到你的账户
2. **创建分支** — 按上述命名规范
3. **提交改动** — 遵循 Conventional Commits
4. **自审清单**：
   - [ ] 所有新增/修改文件存在且非空
   - [ ] `node scripts/verify.mjs .` 运行通过（退出码 0）
   - [ ] Agent 定义编辑遵守「全员红线」逐字一致
   - [ ] README / 相关文档已同步更新
5. **Push** 到你的 Fork
6. **提交 PR** — 描述清楚改动内容与动机

---

## 验证要求

**提交 PR 前必须运行**：

```bash
node scripts/verify.mjs .
```

五项机械检查全部通过（退出码 0）才算合格：
1. Agent 定义完整性
2. 技能文件存在性
3. 脚本语法检查
4. 配置文件一致性
5. 事件日志格式

---

## Agent 定义编辑规则

编辑 `.opencode/agent/*.md` 时必须遵守：

1. **先 read 再 edit** — 禁止直接覆写
2. **保留 YAML frontmatter** — `description` / `mode` / `model` 不可缺
3. **`CHARTER_CHECK` 字段** — 每个 agent 必须有，含四项子字段
4. **全员红线** — 6 个 agent 必须**逐字一致**（复制粘贴，不修改）
5. **不擅自引入新范式** — 改动前先读现有代码库风格

---

## 行为准则

本项目遵循 [行为准则](CODE_OF_CONDUCT.md)。参与贡献即表示你同意遵守其条款。
