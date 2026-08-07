@echo off
cd /d "%~dp0"
echo Opening ACES LET Web at http://localhost:8080
start "" http://localhost:8080
python -m http.server 8080 --directory docs
