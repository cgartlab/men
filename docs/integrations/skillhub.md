# SkillHub 发布集成

> 适用对象：men（门）Agent 团队维护者  
> 形态：本地脚本 + GitHub Actions `workflow_dispatch`  
> 依据：SkillHub CLI 教程 `https://skillhub.cn/tutorials#publish-via-cli`，访问日期 2026-09-12

## 1. 发布目标

当前默认发布 `.opencode/skills/men-status/SKILL.md` 对应 Skill。SkillHub 要求每个 `SKILL.md` frontmatter 包含：

```yaml
slug: cgartlab-men-status
displayName: Men Status
version: 0.5.0
summary: "Men 状态报告：版本、更新检查、忽略版本、Agent 名单与配置健康。"
license: MIT
```

`slug` 必须全网唯一，因此使用 `cgartlab-` 前缀。

## 2. 本地流程

```bash
npm run skillhub:check      # skillhub publish --dry-run，仅本地预检
SKILLHUB_TOKEN=*** npm run skillhub:publish
```

脚本入口：`node scripts/skillhub-publish.mjs <skill-dir>`。

常用参数：

| 参数 | 说明 |
|------|------|
| `--dry-run` | 只执行 `skillhub publish --dry-run`，不发布 |
| `--changelog <text>` | 发布说明；默认读取 CHANGELOG.md 最新正式版本 |
| `--host <url>` | API host，默认 `https://api.skillhub.cn` |
| `--token <skh_...>` | API token；默认读取 `SKILLHUB_TOKEN` 或 `SKILLHUB_API_KEY` |
| `--json` | 输出 JSON 摘要 |

## 3. GitHub Actions 自动发布

Workflow：`.github/workflows/skillhub-publish.yml`。

前置配置：

1. 在 GitHub 仓库 Secrets 中配置 `SKILLHUB_API_KEY`。
2. 在 Actions 页面手动触发 `SkillHub Publish`。
3. 默认输入 `.opencode/skills/men-status`，也可选择其他已补齐 SkillHub frontmatter 的 skill 目录。

Workflow 会执行：

1. checkout 仓库；
2. 安装 Node 20；
3. `curl -fsSL https://skillhub.cn/install/install.sh | bash -s -- --cli-only`；
4. `node scripts/skillhub-publish.mjs <skill-dir> --host https://api.skillhub.cn --changelog <changelog> --json`。

## 4. 验证

```bash
node --check scripts/skillhub-publish.mjs
node --test test/skillhub-publish.test.mjs
npm run skillhub:check
```

`npm run skillhub:check` 依赖本机已安装 `skillhub` CLI。CI workflow 会自行安装 CLI，不需要本机安装。
