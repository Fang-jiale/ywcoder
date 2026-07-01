#!/usr/bin/env python3
"""Apply the workspace-trust remote-extension-description fallback to all web bundles.

The same fix is applied identically to every platform; this script just replays the
replacement patterns against all dist files so the bundles stay consistent.
"""
import os
import sys

REPO_ROOT = r'D:\project\ywcoder\vscode'

TARGETS = [
    # dev / unminified build used by ./scripts/code-server
    r'out-vscode-web\vs\code\browser\workbench\workbench.js',
    r'out-vscode-web\vs\workbench\workbench.web.main.internal.js',
    # packaged platform dists
    r'dist\ywcoder-web-win32-x64\out-vscode-web\vs\code\browser\workbench\workbench.js',
    r'dist\ywcoder-web-win32-x64\out-vscode-web\vs\workbench\workbench.web.main.internal.js',
    r'dist\ywcoder-web-linux-x64\out-vscode-web\vs\code\browser\workbench\workbench.js',
    r'dist\ywcoder-web-linux-x64\out-vscode-web\vs\workbench\workbench.web.main.internal.js',
    r'dist\ywcoder-web-linux-arm64\out-vscode-web\vs\code\browser\workbench\workbench.js',
    r'dist\ywcoder-web-linux-arm64\out-vscode-web\vs\workbench\workbench.web.main.internal.js',
]

REPLACEMENTS = [
    (
        """    this._runningLocation = new ExtensionIdentifierMap();
    this._maxLocalProcessAffinity = 0;
    this._maxLocalWebWorkerAffinity = 0;
  }
  get maxLocalProcessAffinity() {""",
        """    this._runningLocation = new ExtensionIdentifierMap();
    this._maxLocalProcessAffinity = 0;
    this._maxLocalWebWorkerAffinity = 0;
    this._remoteExtensionIds = /* @__PURE__ */ new Set();
    this._remoteExtensionDescriptions = new ExtensionIdentifierMap();
  }
  get maxLocalProcessAffinity() {""",
    ),
    (
        """  get maxLocalWebWorkerAffinity() {
    return this._maxLocalWebWorkerAffinity;
  }
  set(extensionId, runningLocation) {""",
        """  get maxLocalWebWorkerAffinity() {
    return this._maxLocalWebWorkerAffinity;
  }
  getRemoteExtensionDescription(extensionId) {
    return this._remoteExtensionDescriptions.get(extensionId);
  }
  /**
   * Returns whether the extension is installed on the remote extension host.
   * This considers both the extension's own location and any previously recorded
   * remote copy discovered during initial extension scanning.
   */
  isInstalledRemotely(extension) {
    if (extension.extensionLocation.scheme === Schemas.vscodeRemote) {
      return true;
    }
    return this._remoteExtensionIds.has(ExtensionIdentifier.toKey(extension.identifier));
  }
  set(extensionId, runningLocation) {""",
    ),
    (
        """  _doComputeRunningLocation(existingRunningLocation, localExtensions, remoteExtensions, isInitialAllocation) {
    localExtensions = localExtensions.filter((extension) => !existingRunningLocation.has(extension.identifier));
    remoteExtensions = remoteExtensions.filter((extension) => !existingRunningLocation.has(extension.identifier));""",
        """  _doComputeRunningLocation(existingRunningLocation, localExtensions, remoteExtensions, isInitialAllocation) {
    for (const extension of remoteExtensions) {
      this._remoteExtensionIds.add(ExtensionIdentifier.toKey(extension.identifier));
      this._remoteExtensionDescriptions.set(extension.identifier, extension);
    }
    localExtensions = localExtensions.filter((extension) => !existingRunningLocation.has(extension.identifier));
    remoteExtensions = remoteExtensions.filter((extension) => !existingRunningLocation.has(extension.identifier));""",
    ),
    (
        """      const extensionKind = this.readExtensionKinds(extension);
      const isRemote = extension.extensionLocation.scheme === Schemas.vscodeRemote || (!!this._environmentService.remoteAuthority && extensionKind.includes('workspace'));
      const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKind, !isRemote, isRemote, 0 /* None */);""",
        """      const extensionKind = this.readExtensionKinds(extension);
      const isRemote = this.isInstalledRemotely(extension) || (!!this._environmentService.remoteAuthority && extensionKind.includes('workspace'));
      const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKind, !isRemote, isRemote, 0 /* None */);""",
    ),
    (
        """      const extensionKinds = this._runningLocations.readExtensionKinds(extensionDescription);
      const isRemote = extensionDescription.extensionLocation.scheme === Schemas.vscodeRemote || (!!this._environmentService.remoteAuthority && extensionKinds.includes("workspace"));
      const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extensionDescription.identifier, extensionKinds, !isRemote, isRemote, 0 /* None */);
      if (extensionHostKind === 3 /* Remote */) {
        let remoteDescription = removedRemoteDescriptions.get(extensionDescription.identifier);
        if (!remoteDescription) {""",
        """      const extensionKinds = this._runningLocations.readExtensionKinds(extensionDescription);
      const isRemote = this._runningLocations.isInstalledRemotely(extensionDescription) || (!!this._environmentService.remoteAuthority && extensionKinds.includes("workspace"));
      const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extensionDescription.identifier, extensionKinds, !isRemote, isRemote, 0 /* None */);
      if (extensionHostKind === 3 /* Remote */) {
        let remoteDescription = removedRemoteDescriptions.get(extensionDescription.identifier) || this._runningLocations.getRemoteExtensionDescription(extensionDescription.identifier);
        if (!remoteDescription) {""",
    ),
    (
        """    const extensionKinds = this._runningLocations.readExtensionKinds(extension);
    const isRemote = extension.extensionLocation.scheme === Schemas.vscodeRemote;
    const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKinds, !isRemote, isRemote, 0 /* None */);""",
        """    const extensionKinds = this._runningLocations.readExtensionKinds(extension);
    const isRemote = this._runningLocations.isInstalledRemotely(extension);
    const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKinds, !isRemote, isRemote, 0 /* None */);""",
    ),
]


def patch_file(path):
    if not os.path.exists(path):
        print(f'SKIP (not found): {path}')
        return False

    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    had_crlf = '\r\n' in content
    content = content.replace('\r\n', '\n')
    changed = False

    for old, new in REPLACEMENTS:
        if old in content:
            content = content.replace(old, new)
            changed = True

    if not changed:
        print(f'NOOP: {path}')
        return False

    if had_crlf:
        content = content.replace('\n', '\r\n')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f'PATCHED: {path}')
    return True


def main():
    total = 0
    for rel in TARGETS:
        if patch_file(os.path.join(REPO_ROOT, rel)):
            total += 1
    print(f'\n{total} file(s) patched.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
