#!/usr/bin/env bash
# install.sh — men（门）Agent 团队 Linux/macOS 一键安装引导
#
# 职责：检测依赖 → 拉取仓库（clone/下载）→ 调用共享核心 node scripts/install.mjs
# 逻辑集中在 install.mjs，本脚本只做平台引导，避免双份安装逻辑。
#
# 用法:
#   bash <(curl -fsSL https://raw.githubusercontent.com/cgartlab/men/main/install.sh) [选项]      # 管道一键安装
#   ./install.sh [选项]                          # 仓库内就地安装（记得 chmod +x install.sh）
#
# 选项:
#   --dir <path>      安装目标目录（不存在时自动 git clone）
#   --skip-deps       跳过 .opencode/ 依赖安装
#   --skip-verify     跳过端到端验证
#   --json            输出 JSON 摘要
#   --help            显示帮助
#
# URL 已硬编码为 cgartlab/men 真实地址（发布时无需再替换占位）:
#   INSTALL_URL — install.sh 的原始 URL（用于管道安装，与 README 一键命令一致）
#   REPO_URL    — 仓库 git clone 地址（用于拉取完整仓库）
set -euo pipefail

INSTALL_URL="https://raw.githubusercontent.com/cgartlab/men/main/install.sh"
REPO_URL="https://github.com/cgartlab/men.git"
DEFAULT_DIR="men"

usage() {
  cat <<'EOF'
men（门）Agent 团队 — 一键安装器（Linux/macOS）

用法:
  bash <(curl -fsSL https://raw.githubusercontent.com/cgartlab/men/main/install.sh) [选项]
  ./install.sh [选项]

选项:
  --dir <path>      安装目标目录（不存在时自动 git clone）
  --skip-deps       跳过 .opencode/ 依赖安装
  --skip-verify     跳过端到端验证
  --json            输出 JSON 摘要
  --help            显示本帮助
EOF
}

# ─── 参数解析 ───
DIR=""
SKIP_DEPS=""
SKIP_VERIFY=""
JSON=""
HELP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      if [ -z "${2:-}" ]; then
        echo "错误: --dir 需要指定目录路径" >&2; usage; exit 2
      fi
      DIR="$2"; shift 2 ;;
    --skip-deps) SKIP_DEPS="--skip-deps"; shift ;;
    --skip-verify) SKIP_VERIFY="--skip-verify"; shift ;;
    --json) JSON="--json"; shift ;;
    --help|-h) HELP=1; shift ;;
    *) echo "未知参数: $1" >&2; usage; exit 2 ;;
  esac
done

[[ -n "$HELP" ]] && { usage; exit 0; }

# ─── 依赖检测 ───
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "错误: 缺少 $1，请先安装（Node >= 18 与 git）" >&2
    exit 1
  fi
}
need node
need npm
need git

# ─── 目标目录 ───
if [[ -n "$DIR" ]]; then
  TARGET="$DIR"
elif [[ -f ./scripts/install.mjs ]]; then
  TARGET="$(pwd)"              # 已在仓库内 → 就地安装
else
  TARGET="./$DEFAULT_DIR"      # 管道安装 → clone 到子目录
fi

if [[ ! -d "$TARGET" ]]; then
  echo ">> 拉取仓库到 $TARGET ..."
  if ! git clone "$REPO_URL" "$TARGET"; then
    echo "错误: git clone 失败：请检查网络或代理后重试（$REPO_URL）" >&2
    exit 1
  fi
elif [[ ! -f "$TARGET/scripts/install.mjs" ]]; then
  echo "错误: 目标目录已存在但不是 men 仓库: $TARGET" >&2
  echo "提示: 若想在当前目录安装，请进入目标目录后直接运行: bash <(curl -fsSL $INSTALL_URL) --dir ." >&2
  exit 1
fi

cd "$TARGET"

# ─── 调用共享核心安装器（透传参数）───
PASSTHROUGH=""
[[ -n "$SKIP_DEPS" ]] && PASSTHROUGH="$PASSTHROUGH $SKIP_DEPS"
[[ -n "$SKIP_VERIFY" ]] && PASSTHROUGH="$PASSTHROUGH $SKIP_VERIFY"
[[ -n "$JSON" ]] && PASSTHROUGH="$PASSTHROUGH $JSON"

exec node scripts/install.mjs $PASSTHROUGH
