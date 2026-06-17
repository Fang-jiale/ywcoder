#!/usr/bin/env bash
set -e

DIST_DIR="$1"
if [ -z "$DIST_DIR" ]; then
	echo "Usage: $0 <dist-dir>"
	exit 1
fi

NODE_BIN="$DIST_DIR/node-runtime/bin/node"

require_max() {
	local actual="$1"
	local expected="$2"
	local label="$3"
	if [ -n "$actual" ] && [ "$(printf '%s\n' "$expected" "$actual" | sort -V | tail -1)" != "$expected" ]; then
		echo "ERROR: $label requires GLIBC_$actual, expected <= GLIBC_$expected"
		exit 1
	fi
}

echo "Container glibc:"
ldd --version | head -1
echo ""

echo "Bundled Node version:"
"$NODE_BIN" --version

NODE_MAX=$(objdump -T "$NODE_BIN" | grep -oE 'GLIBC_[0-9.]+' | sort -V | tail -1)
NODE_MAX="${NODE_MAX#GLIBC_}"
echo "Bundled Node max glibc requirement: ${NODE_MAX:-none}"
require_max "$NODE_MAX" "2.17" "Bundled Node"

echo ""
echo "Checking all native modules (.node) in dist..."
NATIVE_MAX=$(find "$DIST_DIR" -name '*.node' -print0 | \
	xargs -0 -r objdump -T 2>/dev/null | \
	grep -oE 'GLIBC_[0-9.]+' | sort -V | tail -1 || true)
NATIVE_MAX="${NATIVE_MAX#GLIBC_}"
echo "Highest GLIBC required by any .node file: ${NATIVE_MAX:-none}"
require_max "$NATIVE_MAX" "2.28" "Native modules"

echo ""
echo "Checking all ELF executables in dist..."
EXEC_MAX=$(find "$DIST_DIR" -type f -print0 | while IFS= read -r -d '' f; do
	if file "$f" | grep -q 'ELF.*executable'; then
		objdump -T "$f" 2>/dev/null | grep -oE 'GLIBC_[0-9.]+' | sort -V | tail -1
	fi
done | sort -V | tail -1 || true)
EXEC_MAX="${EXEC_MAX#GLIBC_}"
echo "Highest GLIBC required by any ELF executable: ${EXEC_MAX:-none}"
require_max "$EXEC_MAX" "2.28" "ELF executables"

echo ""
echo "All glibc requirements OK."
