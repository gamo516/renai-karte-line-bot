@echo off
cd /d "%~dp0"
if not exist logs mkdir logs
"C:\Program Files\nodejs\node.exe" scripts\research.js >> logs\research-stdout.log 2>&1
