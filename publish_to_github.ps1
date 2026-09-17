# publish_to_github.ps1 —— 一键把本仓库推送到 GitHub 的辅助脚本
#
# 用法（在你本机的 PowerShell 里跑）：
#     cd "d:\lqq\新建文件夹\大学\课件&作业\大二下\管理信息系统\waimai-delivery-system"
#     .\publish_to_github.ps1
#
# 脚本会：
#   1) 打开 GitHub Desktop（如果已安装）
#   2) 在 GitHub Desktop 里执行 File -> Add local repository 把当前目录加进去
#
# 注意：本脚本不会替你完成 Push / Publish，那一步在 GitHub Desktop 里点 "Publish repository" 按钮完成。
#       首次使用需要先在 GitHub Desktop 里登录你的 GitHub 账号。

$projectDir = $PSScriptRoot
$ghDesktop = Join-Path $env:LOCALAPPDATA 'GitHubDesktop\app-3.6.5\GitHubDesktop.exe'
$ghUpdater = Join-Path $env:LOCALAPPDATA 'GitHubDesktop\Update.exe'

Write-Host "项目目录: $projectDir" -ForegroundColor Cyan
Write-Host ""

# 1) 直接调 GitHub Desktop 启动命令
if (Test-Path $ghUpdater) {
    Write-Host "正在启动 GitHub Desktop ..." -ForegroundColor Green
    Start-Process -FilePath $ghUpdater -WorkingDirectory $projectDir | Out-Null
} elseif (Test-Path $ghDesktop) {
    Write-Host "正在启动 GitHub Desktop ..." -ForegroundColor Green
    Start-Process -FilePath $ghDesktop -WorkingDirectory $projectDir | Out-Null
} else {
    Write-Host "[ERROR] 没找到 GitHub Desktop 安装目录，请先安装。" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "===== 请在 GitHub Desktop 里完成以下操作 =====" -ForegroundColor Yellow
Write-Host "1. 登录你的 GitHub 账号（File → Options → Accounts）"
Write-Host "2. File → Add local repository → 选择当前项目目录"
Write-Host "   路径: $projectDir"
Write-Host "3. 在仓库视窗里点 'Commit to main'（用你 GitHub 账号身份提交）"
Write-Host "4. 点右上角 'Publish repository'，填好仓库名和可见性，即可推送"
Write-Host ""
Write-Host "完成后你的 GitHub 上就会出现这个仓库。" -ForegroundColor Cyan