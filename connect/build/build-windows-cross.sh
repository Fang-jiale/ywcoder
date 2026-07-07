#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

export GOOS=windows
export GOARCH=amd64
export CGO_ENABLED=0

mkdir -p dist

VERSION="${VERSION:-1.0.0}"

go build -ldflags "-H=windowsgui -s -w -X main.version=${VERSION}" -o dist/YwCoderConnect.exe ./cmd/ywcoder-connect

echo "Built dist/YwCoderConnect.exe"
