import os
import zipfile

repo_root = r'D:\project\ywcoder\vscode'
zip_path = r'D:\project\ywcoder\vscode\overlay-layout-fix.zip'

platform = 'ywcoder-web-win32-x64'

files_to_zip = [
    r'out-vscode-web\vs\code\browser\workbench\workbench.js',
    r'out-vscode-web\vs\workbench\workbench.web.main.internal.js',
]

src_dir = os.path.join(repo_root, 'dist', platform)

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for rel_path in files_to_zip:
        file_path = os.path.join(src_dir, rel_path)
        if not os.path.exists(file_path):
            print(f'SKIP (not found): {rel_path}')
            continue
        zf.write(file_path, rel_path)
        print(f'Added: {rel_path}')

print(f'Created: {zip_path}')
