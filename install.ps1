#Requires -Version 5.1
<#
  install.ps1 — men（门）Agent 团队 Windows 一键安装引导

  职责：检测依赖 → 拉取仓库（clone）→ 调用共享核心 node scripts/install.mjs
  逻辑集中在 install.mjs，本脚本只做平台引导，避免双份安装逻辑。

  用法:
    irm https://raw.githubusercontent.com/cgartlab/men/main/install.ps1 | iex     # 管道一键安装（PowerShell 7+）
    ./install.ps1 [-Dir <path>] [-SkipDeps] [-SkipVerify] [-Json] [-Help]

  选项:
    -Dir <path>      安装目标目录（不存在时自动 git clone）
    -SkipDeps        跳过 .opencode/ 依赖安装
    -SkipVerify      跳过端到端验证
    -Json            输出 JSON 摘要
    -Help            显示帮助

  URL 已硬编码为 cgartlab/men 真实地址（发布时无需再替换占位）:
    INSTALL_URL — install.ps1 的原始 URL（用于管道安装，与 README 一键命令一致）
    REPO_URL    — 仓库 git clone 地址（用于拉取完整仓库）
#>

param(
  [string]$Dir = "",
  [switch]$SkipDeps,
  [switch]$SkipVerify,
  [switch]$Json,
  [switch]$Help
)

$INSTALL_URL = "https://raw.githubusercontent.com/cgartlab/men/main/install.ps1"
$REPO_URL = "https://github.com/cgartlab/men.git"
$DEFAULT_DIR = "men"

function Show-Help {
  @"
men（门）Agent 团队 — 一键安装器（Windows / PowerShell）

用法:
  irm $INSTALL_URL | iex
  ./install.ps1 [选项]

选项:
  -Dir <path>      安装目标目录（不存在时自动 git clone）
  -SkipDeps        跳过 .opencode/ 依赖安装
  -SkipVerify      跳过端到端验证
  -Json            输出 JSON 摘要
  -Help            显示本帮助
"@ | Write-Host
}

if ($Help) { Show-Help; exit 0 }

# ─── 依赖检测 ───
foreach ($cmd in @('node', 'npm', 'git')) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Error "缺少 $cmd，请先安装（Node >= 18 与 git）"
    exit 1
  }
}

# ─── 目标目录 ───
$TARGET = ""
if ($Dir) {
  $TARGET = $Dir
} elseif (Test-Path -LiteralPath '.\scripts\install.mjs') {
  $TARGET = (Get-Location).Path        # 已在仓库内 → 就地安装
} else {
  $TARGET = Join-Path (Get-Location).Path $DEFAULT_DIR  # 管道安装 → clone 到子目录
}

if (-not (Test-Path -LiteralPath $TARGET -PathType Container)) {
  Write-Host ">> 拉取仓库到 $TARGET ..."
  git clone $REPO_URL $TARGET
  if ($LASTEXITCODE -ne 0) {
    Write-Error "git clone 失败（exit $LASTEXITCODE）"
    exit 1
  }
} elseif (-not (Test-Path -LiteralPath (Join-Path $TARGET 'scripts\install.mjs'))) {
  Write-Error "目标目录已存在但不是 men 仓库: $TARGET"
  exit 1
}

# ─── 调用共享核心安装器（透传参数）───
Push-Location $TARGET
try {
  $passArgs = @()
  if ($SkipDeps) { $passArgs += '--skip-deps' }
  if ($SkipVerify) { $passArgs += '--skip-verify' }
  if ($Json) { $passArgs += '--json' }
  & node scripts\install.mjs @passArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
