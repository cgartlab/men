# 版本发布方案（Release Guide）

> 适用对象：men（门）Agent 团队维护者
> 版本载体：根目录 `package.json` + `CHANGELOG.md` + git tag + GitHub Releases + npm

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
- **发布前必须先 `git init`**（见第六节），否则 `release.mjs` 跳过 git tag

## 二、一键发布流程

### 本地准备（始终执行）

```bash
npm run release            # patch（默认）
npm run release:minor      # 0.2.1 → 0.3.0
npm run release:major      # 0.1.0 → 1.0.0
```

`scripts/release.mjs` 自动完成：

1. 读取 `package.json` 的 `version` 并校验 SemVer（非法退出码 2）
2. bump 版本号并写回 `package.json`
3. 在 `CHANGELOG.md` 的 `## [Unreleased]` 下插入 `## [vX.Y.Z] - <今天日期>`，并将 Unreleased 节中已整理的条目迁移到新版本节（空节按 `### Added / Changed / Fixed` 占位）
4. 同步版本号到 JSON 文件（`opencode.json`、`package-lock.json`、`site/package.json`）和文本文件（`configure.astro`、`AGENTS.md`、`milestones.md`、`governance.md`、`knowledge/README.md`）
5. 若已 `git init`：`git add` + `git commit -m "chore(release): vX.Y.Z"` + `git tag vX.Y.Z`

### 推送与发布（flag 控制）

```bash
# 仅本地准备（默认行为，不推送不发布）
npm run release

# 本地准备 + git push
node scripts/release.mjs --push

# 本地准备 + git push + GitHub Release
node scripts/release.mjs --push --gh-release

# 本地准备 + git push + npm publish
node scripts/release.mjs --push --npm

# 全部（= --push + --gh-release + --npm）
npm run release:all
```

**`--push`**：`git push origin HEAD` + `git push origin --tags`

**`--gh-release`**：
1. 用 `scripts/release-notes.mjs` 从 CHANGELOG.md 提取当前版本的 release notes
2. 从 CHANGELOG 提取发布主题（blockquote `> ...`）
3. `gh release create vX.Y.Z --title "vX.Y.Z — <主题>" --notes-file <notes>`

**`--npm`**：`npm publish`（需已登录或 `NPM_TOKEN` 环境变量）

**`--all`**：同时启用 `--push` + `--gh-release` + `--npm`

### 站点发布页自动更新

当使用 `--push` 或 `--gh-release` 时，`scripts/update-release-page.mjs` 自动更新 `site/src/pages/docs/releases.astro`：

- 版本历史表：在 `<tbody>` 首行前插入新版本行
- 当前版本亮点：替换为新版本的主题和要点
- infobox 日期：更新为发布日期
- 版本计数：N → N+1
- 版本列表：追加新版本号

### 预览模式

```bash
node scripts/release.mjs --dry-run --push --gh-release --npm   # 输出所有将执行的步骤
```

## 三、手动 fallback（脚本不可用时的兜底）

1. 编辑 `package.json`：`"version": "X.Y.Z"`
2. 编辑 `CHANGELOG.md`：在 `## [Unreleased]` 下插入新版本节
3. 依次执行：

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

4. 创建 GitHub Release：

```bash
gh release create vX.Y.Z --title "vX.Y.Z — <主题>" --notes-file release-notes.md
```

5. 发布 npm（可选）：

```bash
npm publish
```

## 四、git tag 与 GitHub Release 关联

- `release.mjs` 打的 tag 是轻量 tag（lightweight）
- 使用 `--gh-release` 时，脚本自动调用 `gh release create` 创建 GitHub Release
- Release 正文使用 `release-notes.mjs` 提取的**只含当前版本**内容，不粘贴整个 CHANGELOG.md
- 若 tag 打错：`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z` 删除后重打

## 五、发布后 checklist

- [ ] `npm run verify` 通过（`node scripts/verify.mjs men` 退出码 0）
- [ ] `npm run release` 输出确认（版本号 + CHANGELOG 位置正确）
- [ ] `git push` + `git push --tags`（或使用 `--push` flag）
- [ ] GitHub Releases 已发布 `vX.Y.Z`（或使用 `--gh-release` flag）
- [ ] Release notes 只含当前版本内容（用 release-notes.mjs 提取，不含历史版本）
- [ ] `site/src/pages/docs/releases.astro` 已更新（使用 `--push`/`--gh-release` 时自动更新）
- [ ] README「快速开始」与 `install.sh` / `install.ps1` 中的 URL 已是真实地址
- [ ] （可选）`npm publish` 发布 `@cgartlab/men`（或使用 `--npm` flag）—— 发布前确认 `files` 白名单覆盖运行资产
- [ ] 新增文件已同步到 `docs/guide/quickstart.md`（如需）

## 六、开源发布准备（重要）

1. **必须先 `git init`**：非 git 仓库时 `release.mjs` 会跳过 tag，版本发布不完整。`git init` → `git add` → 首次 commit → 关联 remote
2. **内网 IP / 密钥必须走 `.env`**：
   - 内网数据源（192.168.31.x）、Embedding 服务地址、API key 一律放 `.env`（由 `.env.example` 模板生成，已被 `.gitignore` 排除）
   - 仓库中禁止出现真实密钥（`verify.mjs` 的 secrets 扫描会拦截）
   - MCP 服务器一律在 `opencode.json` 中声明，禁止写死内网地址与密钥
3. **占位 URL 替换清单**（已过时）：占位符已在代码与文档中硬编码为真实地址，发布时无需再替换
4. **License 与署名**：MIT LICENSE 已在根目录，确认 `package.json` 的 `"license": "MIT"` 一致