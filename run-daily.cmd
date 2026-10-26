@echo off
rem 毎日1回：実績の取得（＋月曜は週次レポート）→ 競合リサーチ（リプ候補のLINE通知）
cd /d "%~dp0"
if not exist logs mkdir logs
"C:\Program Files\nodejs\node.exe" scripts\metrics.js >> logs\daily-stdout.log 2>&1
"C:\Program Files\nodejs\node.exe" scripts\research.js >> logs\daily-stdout.log 2>&1
