#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

export CGO_ENABLED=0
export GOOS=linux

mkdir -p dist

VERSION="${VERSION:-1.0.0}"

# Linux x64
export GOARCH=amd64
go build -ldflags "-s -w -X main.version=${VERSION}" -o dist/ywcoder-connect-linux-amd64 ./cmd/ywcoder-connect-cli

# Linux ARM64
export GOARCH=arm64
go build -ldflags "-s -w -X main.version=${VERSION}" -o dist/ywcoder-connect-linux-arm64 ./cmd/ywcoder-connect-cli

echo "Built dist/ywcoder-connect-linux-amd64"
echo "Built dist/ywcoder-connect-linux-arm64"
