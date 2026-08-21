# sync-to-opencode.ps1
# 将 men 团队的 agent、skills、commands 同步到 OpenCode 全局配置

$ErrorActionPreference = "Stop"

# 源路径（men 仓库）
$MEN_ROOT = "D:\github-repos\men"
$SOURCE_AGENTS = "$MEN_ROOT\.opencode\agent"
$SOURCE_SKILLS = "$MEN_ROOT\.opencode\skills"
$SOURCE_COMMANDS = "$MEN_ROOT\.opencode\command"

# 目标路径（OpenCode 全局配置）
$OPENCODE_CONFIG = "$env:USERPROFILE\.config\opencode"
$TARGET_AGENTS = "$OPENCODE_CONFIG\agent"
$TARGET_SKILLS = "$OPENCODE_CONFIG\skills"
$TARGET_COMMANDS = "$OPENCODE_CONFIG\command"

Write-Host "🚀 同步 Men 团队到 OpenCode 全局配置..." -ForegroundColor Cyan

# 1. 同步 Agent 定义
Write-Host "`n📁 同步 Agent 定义..." -ForegroundColor Yellow
if (!(Test-Path $TARGET_AGENTS)) {
    New-Item -ItemType Directory -Path $TARGET_AGENTS -Force | Out-Null
}
Copy-Item -Path "$SOURCE_AGENTS\*.md" -Destination $TARGET_AGENTS -Force
Write-Host "   ✅ 已同步 $(Get-ChildItem $TARGET_AGENTS\*.md | Measure-Object | Select-Object -ExpandProperty Count) 个 agent" -ForegroundColor Green

# 2. 同步 Skills
Write-Host "`n🔧 同步 Skills..." -ForegroundColor Yellow
if (!(Test-Path $TARGET_SKILLS)) {
    New-Item -ItemType Directory -Path $TARGET_SKILLS -Force | Out-Null
}
Copy-Item -Path "$SOURCE_SKILLS\*" -Destination $TARGET_SKILLS -Recurse -Force
Write-Host "   ✅ 已同步 $(Get-ChildItem $TARGET_SKILLS -Directory | Measure-Object | Select-Object -ExpandProperty Count) 个 skills" -ForegroundColor Green

# 3. 同步 Commands
Write-Host "`n⚡ 同步 Commands..." -ForegroundColor Yellow
if (!(Test-Path $TARGET_COMMANDS)) {
    New-Item -ItemType Directory -Path $TARGET_COMMANDS -Force | Out-Null
}
Copy-Item -Path "$SOURCE_COMMANDS\*.md" -Destination $TARGET_COMMANDS -Force
Write-Host "   ✅ 已同步 $(Get-ChildItem $TARGET_COMMANDS\*.md | Measure-Object | Select-Object -ExpandProperty Count) 个 commands" -ForegroundColor Green

# 4. 验证配置
Write-Host "`n🔍 验证配置..." -ForegroundColor Yellow
Write-Host "   Agent 定义:" -ForegroundColor Gray
Get-ChildItem $TARGET_AGENTS -Filter *.md | ForEach-Object { Write-Host "      - $($_.Name)" -ForegroundColor Gray }

Write-Host "`n   Skills:" -ForegroundColor Gray
Get-ChildItem $TARGET_SKILLS -Directory | ForEach-Object { Write-Host "      - $($_.Name)" -ForegroundColor Gray }

Write-Host "`n   Commands:" -ForegroundColor Gray
Get-ChildItem $TARGET_COMMANDS -Filter *.md | ForEach-Object { Write-Host "      - $($_.Name)" -ForegroundColor Gray }

Write-Host "`n✅ 同步完成！" -ForegroundColor Green
Write-Host "`n📝 下一步：" -ForegroundColor Cyan
Write-Host "   1. 重启 OpenCode 使配置生效" -ForegroundColor Gray
Write-Host "   2. 运行 'opencode agent list' 验证 agent 是否可用" -ForegroundColor Gray
Write-Host "   3. 运行 'opencode debug skill' 验证 skills 是否被识别" -ForegroundColor Gray
