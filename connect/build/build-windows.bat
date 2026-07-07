@echo off
setlocal

set GOOS=windows
set GOARCH=amd64
set CGO_ENABLED=0

cd /d "%~dp0\.."

if not exist dist mkdir dist

set VERSION=1.0.0

go build -ldflags "-H=windowsgui -s -w -X main.version=%VERSION%" -o dist\YwCoderConnect.exe ./cmd/ywcoder-connect

if %ERRORLEVEL% neq 0 (
    echo Build failed.
    exit /b %ERRORLEVEL%
)

echo Built dist\YwCoderConnect.exe
