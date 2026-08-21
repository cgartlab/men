# fix-port-4096.ps1
# 修复 OpenCode 端口 4096 被占用的问题
# 用法：右键 → 使用 PowerShell 运行

$port = 4096
Write-Host "🔍 检查端口 $port 占用情况..." -ForegroundColor Cyan

# 方法 1：查找并终止占用进程
$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($connections) {
    $pids = $connections.OwningProcess | Select-Object -Unique
    foreach ($procId in $pids) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "   找到进程: $($proc.ProcessName) (PID: $procId)" -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "   ✅ 已终止" -ForegroundColor Green
        }
    }
}

# 方法 2：重置 TCP 连接
Write-Host "`n🔄 重置 TCP 连接..." -ForegroundColor Cyan
netsh interface ipv4 reset

# 等待释放
Start-Sleep -Seconds 3

# 验证
$currentConnections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($currentConnections) {
    Write-Host "`n⚠️  端口 $port 仍被占用" -ForegroundColor Red
    Write-Host "   可能需要重启电脑才能完全释放" -ForegroundColor Gray
} else {
    Write-Host "`n✅ 端口 $port 已释放！" -ForegroundColor Green
    Write-Host "   现在可以运行 'opencode web'" -ForegroundColor Gray
}

# 显示当前状态
Write-Host "`n📊 当前端口状态:" -ForegroundColor Cyan
netstat -ano | findstr ":$port"
