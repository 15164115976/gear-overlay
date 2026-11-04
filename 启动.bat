@echo off
cd /d "%~dp0"

rem 防止从某些终端（IDE / 命令行）启动时被当成 Node 运行
set ELECTRON_RUN_AS_NODE=
set NODE_OPTIONS=

if not exist "node_modules\electron\dist\electron.exe" (
  echo [首次运行] 正在安装运行环境，请稍候...
  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  call npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo 安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

rem %~dp0 结尾是反斜杠，直接塞进引号会把引号转义掉，所以这里补一个点
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit
