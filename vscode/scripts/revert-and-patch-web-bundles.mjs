#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const targetFiles = [
	'out-vscode-web/vs/code/browser/workbench/workbench.js',
	'out-vscode-web/vs/workbench/workbench.web.main.internal.js',
	'dist/ywcoder-web-win32-x64/out-vscode-web/vs/code/browser/workbench/workbench.js',
	'dist/ywcoder-web-win32-x64/out-vscode-web/vs/workbench/workbench.web.main.internal.js',
	'dist/ywcoder-web-linux-x64/out-vscode-web/vs/code/browser/workbench/workbench.js',
	'dist/ywcoder-web-linux-x64/out-vscode-web/vs/workbench/workbench.web.main.internal.js',
	'dist/ywcoder-web-linux-arm64/out-vscode-web/vs/code/browser/workbench/workbench.js',
	'dist/ywcoder-web-linux-arm64/out-vscode-web/vs/workbench/workbench.web.main.internal.js',
];

const overlayLayoutStartMarker = '// src/vs/base/browser/overlayLayoutElement.ts';
const overlayLayoutEndMarker = '// src/vs/platform/layout/browser/zIndexRegistry.ts';

const originalOverlayLayoutElement = `// src/vs/base/browser/overlayLayoutElement.ts
function getOrCreateAnchorName(element) {
  const existing = element.style.getPropertyValue("anchor-name");
  if (existing) {
    return existing;
  }
  const name = \`--overlay-anchor-\${generateUuid()}\`;
  element.style.setProperty("anchor-name", name);
  return name;
}
var OverlayLayoutElement = class {
  constructor() {
    this.content = document.createElement("div");
    this.content.style.position = "absolute";
    this.content.style.overflow = "hidden";
    this._root = document.createElement("div");
    this._root.appendChild(this.content);
    this.reapplyLayoutStyles();
  }
  reapplyLayoutStyles() {
    this.content.style.position = "fixed";
    this.content.style.top = "anchor(top)";
    this.content.style.left = "anchor(left)";
    this.content.style.width = "anchor-size(width)";
    this.content.style.height = "anchor-size(height)";
    this.content.style.pointerEvents = "auto";
    this._root.style.position = "absolute";
    this._root.style.pointerEvents = "none";
  }
  dispose() {
    this.root.remove();
  }
  get root() {
    return this._root;
  }
  setAnchorElement(anchorElement, options3) {
    if (this._currentAnchor?.element !== anchorElement) {
      const name = getOrCreateAnchorName(anchorElement);
      this.content.style.setProperty("position-anchor", name);
      setParentFlowTo(this.content, anchorElement);
      this._currentAnchor = { element: anchorElement, name };
    }
    this._updateClipping(options3?.clippingContainer);
  }
  _updateClipping(clippingContainer) {
    if (this._clippingAnchor?.element === clippingContainer) {
      return;
    }
    this._root.style.removeProperty("position-anchor");
    const ws = this._root.style;
    if (clippingContainer) {
      const name = getOrCreateAnchorName(clippingContainer);
      ws.clipPath = "content-box";
      ws.setProperty("position-anchor", name);
      ws.setProperty("top", "anchor(top)");
      ws.setProperty("left", "anchor(left)");
      ws.setProperty("width", "anchor-size(width)");
      ws.setProperty("height", "anchor-size(height)");
      this._clippingAnchor = { element: clippingContainer, name };
    } else {
      ws.clipPath = "";
      ws.setProperty("top", "0");
      ws.setProperty("left", "0");
      ws.setProperty("right", "0");
      ws.setProperty("bottom", "0");
      this._clippingAnchor = void 0;
    }
  }
};

// src/vs/platform/layout/browser/zIndexRegistry.ts`;

const supportsAnchorPositioningConst = `const supportsAnchorPositioning = (() => {
  try {
    return typeof CSS !== "undefined" && CSS.supports("position-anchor", "auto");
  } catch {
    return false;
  }
})();

`;

function patchOverlayLayoutElement(content) {
	const start = content.indexOf(overlayLayoutStartMarker);
	if (start === -1) {
		return { content, changed: false, reason: 'start marker not found' };
	}
	const end = content.indexOf(overlayLayoutEndMarker, start);
	if (end === -1) {
		return { content, changed: false, reason: 'end marker not found' };
	}
	const block = content.slice(start, end);
	if (!block.includes('supportsAnchorPositioning')) {
		return { content, changed: false, reason: 'already original' };
	}
	const newContent = content.slice(0, start) + originalOverlayLayoutElement + content.slice(end);
	return { content: newContent, changed: true, reason: 'reverted fallback' };
}

function patchOverlayWebview(content) {
	let changed = false;
	let reason = '';

	function tryReplace(oldStr, newStr, desc) {
		if (!content.includes(oldStr)) {
			return;
		}
		const next = content.replace(oldStr, newStr);
		if (next !== content) {
			content = next;
			changed = true;
			reason += desc + '; ';
		}
	}

	// 1. Add supportsAnchorPositioning const before the OverlayWebview class
	if (!content.includes('// src/vs/workbench/contrib/webview/browser/overlayWebview.ts\nconst supportsAnchorPositioning')) {
		tryReplace(
			'// src/vs/workbench/contrib/webview/browser/overlayWebview.ts\nvar OverlayWebview = class extends Disposable {',
			'// src/vs/workbench/contrib/webview/browser/overlayWebview.ts\n' + supportsAnchorPositioningConst + 'var OverlayWebview = class extends Disposable {',
			'added const'
		);
	}

	// 2. Add _inlineContainer initialization in constructor
	tryReplace(
		'    this.intrinsicContentSize = observableValue("WebviewIntrinsicContentSize", void 0);\n    this.providedViewType = initInfo.providedViewType;',
		'    this.intrinsicContentSize = observableValue("WebviewIntrinsicContentSize", void 0);\n    this._inlineContainer = void 0;\n    this.providedViewType = initInfo.providedViewType;',
		'added _inlineContainer init'
	);

	// 3. Replace dispose() method
	tryReplace(
		`  dispose() {
    this._isDisposed = true;
    this._overlayLayout?.dispose();
    this._overlayLayout = void 0;
    for (const msg of this._firstLoadPendingMessages) {`,
		`  dispose() {
    this._isDisposed = true;
    this._overlayLayout?.dispose();
    this._overlayLayout = void 0;
    this._inlineContainer?.remove();
    this._inlineContainer = void 0;
    for (const msg of this._firstLoadPendingMessages) {`,
		'patched dispose'
	);

	// 4. Replace container getter (original -> inline, with anchor position fix)
	tryReplace(
		`  get container() {
    if (this._isDisposed) {
      throw new Error(\`OverlayWebview has been disposed\`);
    }
    if (supportsAnchorPositioning) {
      return this.overlayLayout.content;
    }
    if (!this._inlineContainer) {
      this._inlineContainer = document.createElement("div");
      this._inlineContainer.style.position = "absolute";
      this._inlineContainer.style.top = "0";
      this._inlineContainer.style.left = "0";
      this._inlineContainer.style.width = "100%";
      this._inlineContainer.style.height = "100%";
      this._inlineContainer.style.overflow = "hidden";
    }
    if (this._anchorState?.anchorElement && this._inlineContainer.parentElement !== this._anchorState.anchorElement) {
      this._anchorState.anchorElement.appendChild(this._inlineContainer);
    }
    return this._inlineContainer;
  }`,
		`  get container() {
    if (this._isDisposed) {
      throw new Error(\`OverlayWebview has been disposed\`);
    }
    if (supportsAnchorPositioning) {
      return this.overlayLayout.content;
    }
    if (!this._inlineContainer) {
      this._inlineContainer = document.createElement("div");
      this._inlineContainer.style.position = "absolute";
      this._inlineContainer.style.top = "0";
      this._inlineContainer.style.left = "0";
      this._inlineContainer.style.width = "100%";
      this._inlineContainer.style.height = "100%";
      this._inlineContainer.style.overflow = "hidden";
    }
    if (this._anchorState?.anchorElement && this._inlineContainer.parentElement !== this._anchorState.anchorElement) {
      const anchor = this._anchorState.anchorElement;
      if (getComputedStyle(anchor).position === "static") {
        anchor.style.position = "relative";
      }
      anchor.appendChild(this._inlineContainer);
    }
    return this._inlineContainer;
  }`,
		'fixed container anchor position'
	);

	// 4b. Replace container getter (legacy original -> inline + anchor position fix)
	tryReplace(
		`  get container() {
    if (this._isDisposed) {
      throw new Error(\`OverlayWebview has been disposed\`);
    }
    return this.overlayLayout.content;
  }`,
		`  get container() {
    if (this._isDisposed) {
      throw new Error(\`OverlayWebview has been disposed\`);
    }
    if (supportsAnchorPositioning) {
      return this.overlayLayout.content;
    }
    if (!this._inlineContainer) {
      this._inlineContainer = document.createElement("div");
      this._inlineContainer.style.position = "absolute";
      this._inlineContainer.style.top = "0";
      this._inlineContainer.style.left = "0";
      this._inlineContainer.style.width = "100%";
      this._inlineContainer.style.height = "100%";
      this._inlineContainer.style.overflow = "hidden";
    }
    if (this._anchorState?.anchorElement && this._inlineContainer.parentElement !== this._anchorState.anchorElement) {
      const anchor = this._anchorState.anchorElement;
      if (getComputedStyle(anchor).position === "static") {
        anchor.style.position = "relative";
      }
      anchor.appendChild(this._inlineContainer);
    }
    return this._inlineContainer;
  }`,
		'patched container getter'
	);

	// 5. Replace window-moving block in claim()
	tryReplace(
		`    if (this._windowId !== targetWindow.vscodeWindowId) {
      this.release(oldOwner);
      this._webview.clear();
      this._webviewEvents.clear();
      this._overlayLayout?.dispose();
      this._overlayLayout = void 0;
    }`,
		`    if (this._windowId !== targetWindow.vscodeWindowId) {
      this.release(oldOwner);
      this._webview.clear();
      this._webviewEvents.clear();
      this._overlayLayout?.dispose();
      this._overlayLayout = void 0;
      this._inlineContainer?.remove();
      this._inlineContainer = void 0;
    }`,
		'patched claim move'
	);

	// 6. Replace anchor state block in claim()
	tryReplace(
		`    if (this._anchorState) {
      this.overlayLayout.setAnchorElement(this._anchorState.anchorElement, { clippingContainer: this._anchorState.clippingContainer });
    }`,
		`    if (this._anchorState) {
      if (supportsAnchorPositioning) {
        this.overlayLayout.setAnchorElement(this._anchorState.anchorElement, { clippingContainer: this._anchorState.clippingContainer });
      } else {
        this.container;
      }
    }`,
		'patched claim anchor'
	);

	// 7. Replace visibility handling in release()
	tryReplace(
		`    this._owner = void 0;
    if (this._overlayLayout) {
      this._overlayLayout.content.style.visibility = "hidden";
    }`,
		`    this._owner = void 0;
    if (supportsAnchorPositioning) {
      if (this._overlayLayout) {
        this._overlayLayout.content.style.visibility = "hidden";
      }
    } else if (this._inlineContainer) {
      this._inlineContainer.style.visibility = "hidden";
    }`,
		'patched release visibility'
	);

	// 8. Replace setAnchorElement()
	tryReplace(
		`  setAnchorElement(anchorElement, clippingContainer) {
    this._anchorState = { anchorElement, clippingContainer };
    this.overlayLayout.setAnchorElement(anchorElement, { clippingContainer });
  }`,
		`  setAnchorElement(anchorElement, clippingContainer) {
    this._anchorState = { anchorElement, clippingContainer };
    if (supportsAnchorPositioning) {
      this.overlayLayout.setAnchorElement(anchorElement, { clippingContainer });
    } else {
      this.container;
    }
  }`,
		'patched setAnchorElement'
	);

	// 9. Replace visibility handling at end of _show()
	tryReplace(
		`    if (this._overlayLayout) {
      this._overlayLayout.content.style.visibility = "visible";
    }
  }
  setHtml(html3) {`,
		`    if (supportsAnchorPositioning) {
      if (this._overlayLayout) {
        this._overlayLayout.content.style.visibility = "visible";
      }
    } else if (this._inlineContainer) {
      this._inlineContainer.style.visibility = "visible";
    }
  }
  setHtml(html3) {`,
		'patched _show visibility'
	);

	return { content, changed, reason: reason || 'no changes needed' };
}

let totalChanged = 0;
for (const rel of targetFiles) {
	const filePath = resolve(repoRoot, rel);
	if (!existsSync(filePath)) {
		console.log('SKIP (not found): ' + rel);
		continue;
	}

	let raw = readFileSync(filePath, 'utf8');
	const hadCRLF = raw.includes('\r\n');
	let content = raw.replace(/\r\n/g, '\n');

	const overlayResult = patchOverlayLayoutElement(content);
	if (overlayResult.changed) {
		content = overlayResult.content;
	}

	const webviewResult = patchOverlayWebview(content);
	if (webviewResult.changed) {
		content = webviewResult.content;
	}

	if (!overlayResult.changed && !webviewResult.changed) {
		console.log('SKIP (' + overlayResult.reason + ' / ' + webviewResult.reason + '): ' + rel);
		continue;
	}

	if (hadCRLF) {
		content = content.replace(/\n/g, '\r\n');
	}

	writeFileSync(filePath, content, 'utf8');
	console.log('PATCHED (' + overlayResult.reason + ' | ' + webviewResult.reason + '): ' + rel);
	totalChanged++;
}

console.log(totalChanged + ' file(s) patched.');
