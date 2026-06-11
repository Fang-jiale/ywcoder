#!/usr/bin/env node
/**
 * Generate nls.messages.zh-cn.js from the official language pack.
 *
 * Reads:
 *   - out-vscode-web/nls.keys.json   (format: [[moduleId, [key1, key2]], ...])
 *   - extensions/vscode-language-pack-zh-hans/translations/main.i18n.json
 *
 * Writes:
 *   - out-vscode-web/nls.messages.zh-cn.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const keysPath = join(repoRoot, 'out-vscode-web', 'nls.keys.json');
const i18nPath = join(repoRoot, 'extensions', 'vscode-language-pack-zh-hans', 'translations', 'main.i18n.json');
const outPath = join(repoRoot, 'out-vscode-web', 'nls.messages.zh-cn.js');

const keys = JSON.parse(readFileSync(keysPath, 'utf8'));
const i18n = JSON.parse(readFileSync(i18nPath, 'utf8'));
const contents = i18n.contents || {};

const messages = [];
let translatedCount = 0;
let missingCount = 0;

for (const [moduleId, moduleKeys] of keys) {
	const moduleTranslations = contents[moduleId];
	for (const key of moduleKeys) {
		const translation = moduleTranslations?.[key];
		if (typeof translation === 'string') {
			messages.push(translation);
			translatedCount++;
		} else {
			messages.push(undefined);
			missingCount++;
		}
	}
}

const js = `/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
globalThis._VSCODE_NLS_MESSAGES=${JSON.stringify(messages)};
globalThis._VSCODE_NLS_LANGUAGE=${JSON.stringify('zh-cn')};`;

writeFileSync(outPath, js, 'utf8');

console.log(`[generate-nls-zh-cn] Wrote ${messages.length} messages to ${outPath}`);
console.log(`[generate-nls-zh-cn] Translated: ${translatedCount}, Missing: ${missingCount}`);
