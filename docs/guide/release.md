# 版本发布方案（Release Guide）

> 适用对象：men（门）Agent 团队维护者
> 版本载体：根目录 `package.json` + `CHANGELOG.md` + git tag

---

## 一、版本号约定（SemVer 2.0.0）

| 版本段 | 含义 | 示例 |
|--------|------|------|
| major（主版本） | 不兼容的架构 / 行为变更 | 0.1.0 → 1.0.0 |
| minor（次版本） | 向后兼容的功能新增 | 0.1.0 → 0.2.0 |
| patch（修订号） | 向后兼容的缺陷修复 | 0.1.0 → 0.1.1 |

约束：

- 版本号必须形如 `X.Y.Z`（`^\d+\.\d+\.\d+$`），不允许 pre-release / build metadata
- 0.x 阶段：minor 表示功能迭代，patch 表示修复；何时升 1.0.0 由维护者决定

## 二、一键发布流程

```bash
npm run release            # patch（默认）: 0.1.0 → 0.1.1
npm run release:minor      # 0.1.1 → 0.2.0
npm run release:major      # 0.2.0 → 1.0.0
```

`scripts/release.mjs` 自动完成：

1. 读取 `package.json` 的 `version` 并校验 SemVer（非法退出码 2）
2. bump 版本号并写回 `package.json`
3. 在 `CHANGELOG.md` 的 `## [Unreleased]` 下插入 `## [vX.Y.Z] - <今天日期>`，并将 Unreleased 节中已整理的条目迁移到新版本节
4. `git add` + `git commit -m "chore(release): vX.Y.Z"` + `git tag vX.Y.Z`
5. **不自动 push** — 维护者确认后手动 `git push && git push --tags`

预览模式（不写任何文件）：

```bash
node scripts/release.mjs --dry-run --json
```

## 三、手动 fallback（脚本不可用时的兜底）

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

## 四、git tag 与 GitHub Release 关联

- `release.mjs` 打的 tag 是轻量 tag（lightweight）；push 到 GitHub 后，在仓库 Releases 页面 **Draft a new release** → 选择 `vX.Y.Z` tag 发布
- GitHub Release 正文建议引用 CHANGELOG 对应节的条目
- 若 tag 打错：`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z` 删除后重打

## 五、发布后 checklist

- [ ] `npm run verify` 通过（退出码 0）
- [ ] `npm run release` 输出确认（版本号 + CHANGELOG 位置正确）
- [ ] `git push` + `git push --tags`
- [ ] GitHub Releases 已发布 `vX.Y.Z`
- [ ] （可选）`npm publish` 发布 `@fakevis/men` — 确认 `files` 白名单覆盖 `.opencode/`、`.pi/`、`scripts/`、`docs/` 等路径

## 六、开源发布准备

1. **内网 IP / 密钥必须走 `.env`**：内网数据源（192.168.31.x）、Embedding 服务地址、API key 一律放 `.env`
2. **License 与署名**：Apache-2.0 LICENSE 已在根目录
3. **双 Harness 兼容**：发布包需包含 `.pi/` 和 `prompts/` 目录，`.opencode/package.json` 已包含在发布包内
