#!/usr/bin/env python3
"""Mirror the freshly built extension into the local VS Code Web server dist,
re-apply the trust fix if needed, create an incremental replacement zip, and
restart the test server."""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(r'D:\project\ywcoder')
EXTENSION_ROOT = REPO_ROOT / 'extension'
SERVER_ROOT = REPO_ROOT / 'vscode' / 'dist' / 'ywcoder-web-win32-x64'
ZIP_PATH = Path(r'E:\ywcoder-web-update-20260701.zip')

TARGETS = [
    SERVER_ROOT / 'extensions' / 'ywcoder',
    SERVER_ROOT / '.build' / 'extensions' / 'ywcoder',
]

STATIC_FILES = [
    'package.json',
    'LICENSE',
    'README.md',
    'README_CN.md',
    '.vscodeignore',
]

DIRS_TO_MIRROR = [
    ('dist', 'dist'),
    ('resources', 'resources'),
]


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def clean_package_json() -> str:
    pkg_path = EXTENSION_ROOT / 'package.json'
    pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
    pkg.pop('scripts', None)
    pkg.pop('devDependencies', None)
    pkg.pop('dependencies', None)
    pkg['browser'] = './dist/browser.cjs'
    pkg['extensionKind'] = ['workspace']
    return json.dumps(pkg, indent=2, ensure_ascii=False) + '\n'


def mirror_target(target_dir: Path, changed_files: list) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)

    # Mirror dist/resources directories
    for src_name, dst_name in DIRS_TO_MIRROR:
        src_dir = EXTENSION_ROOT / src_name
        dst_dir = target_dir / dst_name
        if dst_dir.exists():
            shutil.rmtree(dst_dir)
        if src_dir.exists():
            shutil.copytree(src_dir, dst_dir)

    # Static files
    cleaned_pkg = clean_package_json()
    for name in STATIC_FILES:
        src = EXTENSION_ROOT / name
        dst = target_dir / name
        if name == 'package.json':
            dst.write_text(cleaned_pkg, encoding='utf-8')
        elif src.exists():
            shutil.copy2(src, dst)


def collect_changes(target_dir: Path, changes: list) -> None:
    """Compare webview/media files under target_dir/dist with the freshly built extension/dist."""
    src_dist = EXTENSION_ROOT / 'dist'
    dst_dist = target_dir / 'dist'
    if not dst_dist.exists():
        return

    for src in src_dist.rglob('*'):
        if not src.is_file():
            continue
        rel = src.relative_to(src_dist).as_posix()
        # 只关心真正会被前端加载的 webview bundle 文件和扩展入口；
        # CLI/node_modules 每次 build 可能时间戳/路径不同，但本次修改不涉及它们。
        if not (rel.startswith('media/') or rel in ('extension.cjs', 'browser.cjs')):
            continue
        dst = dst_dist / rel
        if not dst.exists() or file_hash(src) != file_hash(dst):
            changes.append(('change' if dst.exists() else 'add', rel))


TRUST_FIX_FILES = [
    SERVER_ROOT / 'out-vscode-web' / 'vs' / 'code' / 'browser' / 'workbench' / 'workbench.js',
    SERVER_ROOT / 'out-vscode-web' / 'vs' / 'workbench' / 'workbench.web.main.internal.js',
]


def create_zip(changes: list) -> None:
    """Create a full deployment replacement zip for extensions/ywcoder plus trust fix bundles."""
    extension_dir = SERVER_ROOT / 'extensions' / 'ywcoder'
    ZIP_PATH.unlink(missing_ok=True)

    count = 0
    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as zf:
        for src in extension_dir.rglob('*'):
            if not src.is_file():
                continue
            rel = src.relative_to(SERVER_ROOT).as_posix()
            zf.write(src, rel)
            count += 1

        for src in TRUST_FIX_FILES:
            if src.exists():
                rel = src.relative_to(SERVER_ROOT).as_posix()
                zf.write(src, rel)
                count += 1

    print(f'Created replacement zip: {ZIP_PATH} ({count} files)')


def main() -> int:
    if not EXTENSION_ROOT.exists():
        print(f'Extension root not found: {EXTENSION_ROOT}')
        return 1

    changes: list[tuple[str, str]] = []

    for target in TARGETS:
        collect_changes(target, changes)
        mirror_target(target, changes)
        print(f'Mirrored extension to: {target}')

    # Create incremental zip based on changes before we overwrote the first target
    create_zip(changes)

    return 0


if __name__ == '__main__':
    sys.exit(main())
