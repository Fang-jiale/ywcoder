#!/usr/bin/env node
/**
 * Simple launcher for YwCoder Web Server.
 *
 * - Starts the bundled Node.js 22 server as a hidden background process
 * - Opens the browser once the server is ready
 * - Prints a message and exits; the server keeps running
 * - Default port 8001
 */

const { spawn, exec } = require('child_process');
const { join } = require('path');
const { existsSync, readFileSync, writeFileSync, unlinkSync, openSync } = require('fs');

const appDir = __dirname;
const CONFIG_FILE = join(appDir, 'config.json');
const PID_FILE = join(appDir, 'server.pid');
const SERVER_LOG = join(appDir, 'server.log');
const NODE_EXE = join(appDir, 'node-runtime', 'node.exe');
const SERVER_MAIN = join(appDir, 'out', 'server-main.js');

const DEFAULT_CONFIG = {
	port: 8001,
	host: '127.0.0.1',
	locale: 'zh-cn'
};

function log(message) {
	const time = new Date().toLocaleTimeString();
	console.log(`[${time}] ${message}`);
}

function generateToken() {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function loadConfig() {
	try {
		const saved = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
		return {
			port: saved.port || DEFAULT_CONFIG.port,
			host: saved.host || DEFAULT_CONFIG.host,
			token: saved.token || generateToken(),
			open: saved.open !== false,
			locale: saved.locale || DEFAULT_CONFIG.locale
		};
	} catch {
		return {
			...DEFAULT_CONFIG,
			token: generateToken(),
			open: true
		};
	}
}

function saveConfig(config) {
	try {
		writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
	} catch { /* ignore */ }
}

function openBrowser(url) {
	log(`Opening browser: ${url}`);
	if (process.platform === 'win32') {
		exec(`start "" "${url}"`, { windowsHide: true }, () => { });
	} else if (process.platform === 'darwin') {
		exec(`open "${url}"`, { windowsHide: true }, () => { });
	} else {
		exec(`xdg-open "${url}"`, { windowsHide: true }, () => { });
	}
}

function waitForReady(timeout = 60000) {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const check = () => {
			try {
				const text = readFileSync(SERVER_LOG, 'utf8');
				const match = text.match(/Web UI available at (.*)/);
				if (match) {
					resolve(match[1].trim());
					return;
				}
			} catch { /* ignore */ }
			if (Date.now() - start > timeout) {
				reject(new Error('Server did not become ready in time. Check server.log for details.'));
				return;
			}
			setTimeout(check, 300);
		};
		check();
	});
}

async function main() {
	log('YwCoder Web Launcher');
	log(`App directory: ${appDir}`);

	if (!existsSync(NODE_EXE)) {
		console.error(`Error: bundled Node.js not found at ${NODE_EXE}`);
		process.exit(1);
	}

	const config = loadConfig();
	log(`Port: ${config.port}`);
	log(`Host: ${config.host}`);

	// Clear old server log so we can detect the new ready message
	try { writeFileSync(SERVER_LOG, '', 'utf8'); } catch { /* ignore */ }

	const env = {
		...process.env,
		NODE_ENV: 'production',
		VSCODE_NLS_CONFIG: JSON.stringify({ locale: config.locale, availableLanguages: { '*': config.locale } })
	};

	const args = [
		SERVER_MAIN,
		'--port', String(config.port),
		'--host', config.host,
		'--connection-token', config.token,
		'--builtin-extensions-dir', 'extensions',
		'--accept-server-license-terms'
	];

	log('Starting YwCoder Web Server in the background...');
	const outFd = openSync(SERVER_LOG, 'a');
	const errFd = openSync(SERVER_LOG, 'a');
	const proc = spawn(NODE_EXE, args, {
		cwd: appDir,
		env,
		detached: true,
		windowsHide: true,
		stdio: ['ignore', outFd, errFd]
	});

	try { writeFileSync(PID_FILE, String(proc.pid), 'utf8'); } catch { /* ignore */ }
	proc.unref();

	try {
		const url = await waitForReady();
		if (config.open) {
			openBrowser(url);
		}
		saveConfig(config);
		log('Server is running in the background.');
		log('You can close this window.');
		// Give the user a moment to read the message before the terminal closes
		setTimeout(() => process.exit(0), 2000);
	} catch (err) {
		console.error(err.message);
		process.exit(1);
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
