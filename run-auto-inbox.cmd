@echo off
cd /d "%~dp0"
if not exist logs mkdir logs
"C:\Program Files\nodejs\node.exe" scripts\auto-inbox.js >> logs\auto-inbox-stdout.log 2>&1
