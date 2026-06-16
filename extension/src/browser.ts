import * as vscode from 'vscode';

/**
 * YwCoder Browser Extension Entry Point
 * Web-compatible implementation using only VS Code APIs (no Node.js fs/child_process)
 */

export function activate(context: vscode.ExtensionContext) {
	console.log('[YwCoder] Browser extension activated');

	// Shared WebView provider
	const provider: vscode.WebviewViewProvider = {
		resolveWebviewView(webviewView) {
			const webview = webviewView.webview;

			// Configure WebView options
			webview.options = {
				enableScripts: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'dist'),
					vscode.Uri.joinPath(context.extensionUri, 'resources')
				]
			};

			// Generate and set HTML
			webview.html = getWebviewContent(webview, context.extensionUri);

			// Ensure the view is visible once resolved
			webviewView.show();

			// Handle messages from webview
			webview.onDidReceiveMessage(
				message => handleMessage(message, webview),
				undefined,
				context.subscriptions
			);
		}
	};

	// Register WebView View Provider for secondarySidebar
	const webviewProvider = vscode.window.registerWebviewViewProvider(
		'ywcoder.chatView',
		provider,
		{
			webviewOptions: {
				retainContextWhenHidden: true
			}
		}
	);

	// Register commands
	const showChatCommand = vscode.commands.registerCommand('ywcoder.showChat', () => {
		vscode.commands.executeCommand('ywcoder.chatView.focus');
	});

	const newChatCommand = vscode.commands.registerCommand('ywcoder.newChat', () => {
		vscode.window.showInformationMessage('[YwCoder] 新建对话');
	});

	const stopGenerationCommand = vscode.commands.registerCommand('ywcoder.stopGeneration', () => {
		vscode.window.showInformationMessage('[YwCoder] 停止生成');
	});

	const askSelectionCommand = vscode.commands.registerCommand('ywcoder.askSelection', () => {
		const editor = vscode.window.activeTextEditor;
		const selection = editor?.selection;
		const text = selection && !selection.isEmpty
			? editor.document.getText(selection)
			: '';
		vscode.window.showInformationMessage('[YwCoder] 选中内容: ' + text.slice(0, 50));
	});

	const sendFileToChatCommand = vscode.commands.registerCommand('ywcoder.sendFileToChat', (uri: vscode.Uri) => {
		const filePath = uri?.path || '';
		vscode.window.showInformationMessage('[YwCoder] 文件路径: ' + filePath);
	});

	const openSettingsCommand = vscode.commands.registerCommand('ywcoder.openSettings', () => {
		vscode.window.showInformationMessage('[YwCoder] 设置功能在浏览器环境中部分可用');
	});

	context.subscriptions.push(
		webviewProvider,
		showChatCommand,
		newChatCommand,
		stopGenerationCommand,
		askSelectionCommand,
		sendFileToChatCommand,
		openSettingsCommand
	);

	// Focus YwCoder view on startup
	setTimeout(() => {
		vscode.commands.executeCommand('ywcoder.chatView.focus');
	}, 2000);

	console.log('[YwCoder] Browser extension view registered');
}

export function deactivate() {
	console.log('[YwCoder] Browser extension deactivated');
}

/**
 * Generate WebView HTML loading the real YwCoder UI bundle
 */
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const nonce = getNonce();
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'media', 'main.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'media', 'style.css'));

	const csp = [
		`default-src 'none';`,
		`img-src ${webview.cspSource} https: data: http:;`,
		`style-src ${webview.cspSource} 'unsafe-inline' https://*.vscode-cdn.net;`,
		`font-src ${webview.cspSource} data:;`,
		`script-src ${webview.cspSource} 'nonce-${nonce}';`,
		`connect-src ${webview.cspSource} https: http:;`,
		`worker-src ${webview.cspSource} blob:;`,
	].join(' ');

	const bootstrapScript = `
    <script nonce="${nonce}">
      window.YWCODE_BOOTSTRAP = {"host":"sidebar","page":"chat"};
    </script>`;

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>YwCoder Chat</title>
    <link href="${styleUri}" rel="stylesheet" />
    ${bootstrapScript}
</head>
<body>
    <div id="app"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * Handle messages from the WebView
 */
async function handleMessage(message: any, webview: vscode.Webview) {
	if (message.type === 'request' && message.request) {
		const req = message.request;
		const requestId = message.requestId;

		try {
			const response = await handleRequest(req);
			webview.postMessage({
				type: 'from-extension',
				message: {
					type: 'response',
					requestId: requestId,
					response: response
				}
			});
		} catch (error) {
			webview.postMessage({
				type: 'from-extension',
				message: {
					type: 'response',
					requestId: requestId,
					response: { type: 'error', error: String(error) }
				}
			});
		}
		return;
	}

	if (message.type === 'launch_ywcoder') {
		// AI engine not available in browser - notify user
		webview.postMessage({
			type: 'from-extension',
			message: {
				type: 'sdk_error',
				channelId: message.channelId,
				error: 'AI 引擎在浏览器环境中不可用。请使用桌面版 YwCoder 以获得完整功能。',
				statusCode: '501',
				errorType: 'not_implemented_in_browser'
			}
		});
		return;
	}

	if (message.type === 'interrupt_ywcoder') {
		// No-op in browser
		return;
	}

	console.log('[YwCoder] Received message from webview:', message.type);
}

/**
 * Handle specific request types from WebView
 */
async function handleRequest(req: any): Promise<any> {
	switch (req.type) {
		case 'init': {
			const folder = vscode.workspace.workspaceFolders?.[0];
			return {
				type: 'init_response',
				state: {
					defaultCwd: folder?.uri?.path || '/',
					openNewInTab: false,
					modelSetting: 'default',
					platform: 'web',
					thinkingLevel: 'off'
				}
			};
		}

		case 'get_current_selection': {
			const editor = vscode.window.activeTextEditor;
			const selection = editor?.selection;
			if (selection && !selection.isEmpty) {
				return {
					type: 'get_current_selection_response',
					selection: {
						filePath: editor.document.uri.path,
						startLine: selection.start.line,
						endLine: selection.end.line,
						startColumn: selection.start.character,
						endColumn: selection.end.character,
						selectedText: editor.document.getText(selection)
					}
				};
			}
			return {
				type: 'get_current_selection_response',
				selection: null
			};
		}

		case 'open_file': {
			const uri = vscode.Uri.parse('file://' + req.filePath);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, {
				selection: req.location
					? new vscode.Range(
						req.location.startLine || 0,
						req.location.startColumn || 0,
						req.location.endLine || 0,
						req.location.endColumn || 0
					)
					: undefined
			});
			return { type: 'open_file_response' };
		}

		case 'open_url': {
			await vscode.env.openExternal(vscode.Uri.parse(req.url));
			return { type: 'open_url_response' };
		}

		case 'list_files_request': {
			const pattern = req.pattern || '**/*';
			const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 200);
			return {
				type: 'list_files_response',
				files: files.map(uri => ({
					path: uri.path,
					name: uri.path.split('/').pop() || '',
					type: 'file'
				}))
			};
		}

		case 'stat_path_request': {
			const entries = await Promise.all(
				req.paths.map(async (p: string) => {
					try {
						const uri = vscode.Uri.parse('file://' + p);
						const stat = await vscode.workspace.fs.stat(uri);
						const type = stat.type === vscode.FileType.Directory
							? 'directory'
							: stat.type === vscode.FileType.File
								? 'file'
								: 'other';
						return { path: p, type };
					} catch {
						return { path: p, type: 'not_found' };
					}
				})
			);
			return { type: 'stat_path_response', entries };
		}

		case 'show_notification': {
			let fn: (message: string, ...items: string[]) => Thenable<string | undefined>;
			switch (req.severity) {
				case 'error': fn = vscode.window.showErrorMessage; break;
				case 'warning': fn = vscode.window.showWarningMessage; break;
				default: fn = vscode.window.showInformationMessage; break;
			}
			const buttons = req.buttons || [];
			const result = await fn(req.message, ...buttons);
			return {
				type: 'show_notification_response',
				buttonValue: result
			};
		}

		case 'new_conversation_tab': {
			return { type: 'new_conversation_tab_response' };
		}

		case 'rename_tab': {
			return { type: 'rename_tab_response' };
		}

		case 'set_permission_mode': {
			return { type: 'set_permission_mode_response', success: true };
		}

		case 'set_model': {
			return { type: 'set_model_response', success: true };
		}

		case 'set_thinking_level': {
			return { type: 'set_thinking_level_response' };
		}

		case 'get_ywcoder_state': {
			return {
				type: 'get_ywcoder_state_response',
				config: {}
			};
		}

		case 'sdk_probe': {
			return {
				type: 'sdk_probe_response',
				data: {},
				errors: { general: 'SDK 在浏览器环境中不可用' }
			};
		}

		case 'get_mcp_servers': {
			return { type: 'get_mcp_servers_response', mcpServers: [] };
		}

		case 'get_asset_uris': {
			return { type: 'asset_uris_response', assetUris: {} };
		}

		case 'list_sessions_request': {
			return { type: 'list_sessions_response', sessions: [] };
		}

		case 'get_session_request': {
			return { type: 'get_session_response', messages: [] };
		}

		case 'exec': {
			return {
				type: 'exec_response',
				stdout: '',
				stderr: '命令执行在浏览器环境中不可用',
				exitCode: 1
			};
		}

		case 'open_content': {
			const doc = await vscode.workspace.openTextDocument({
				content: req.content,
				language: req.fileName.split('.').pop()
			});
			await vscode.window.showTextDocument(doc);
			return { type: 'open_content_response' };
		}

		case 'open_diff': {
			// Diff not fully supported in browser stub
			return { type: 'open_diff_response', newEdits: req.edits || [] };
		}

		case 'get_settings': {
			return {
				type: 'get_settings_response',
				settings: {},
				activeProfile: null,
				profiles: [],
				hasWorkspace: !!vscode.workspace.workspaceFolders
			};
		}

		case 'update_setting': {
			return { type: 'update_setting_response', success: true };
		}

		case 'reset_setting': {
			return { type: 'reset_setting_response', success: true };
		}

		case 'switch_profile': {
			return { type: 'switch_profile_response', success: true };
		}

		case 'create_profile': {
			return { type: 'create_profile_response', success: true };
		}

		case 'delete_profile': {
			return { type: 'delete_profile_response', success: true };
		}

		case 'get_extension_config': {
			return {
				type: 'get_extension_config_response',
				config: {
					defaultPermissionMode: 'prompt',
					defaultModel: 'default',
					defaultThinkingLevel: 'off',
					systemNotifications: false,
					completionSound: false,
					customModels: [],
					disabledModels: []
				}
			};
		}

		case 'update_extension_config': {
			return { type: 'update_extension_config_response', success: true };
		}

		case 'open_config_file': {
			return { type: 'open_config_file_response' };
		}

		case 'open_ywcoder_in_terminal': {
			return { type: 'open_ywcoder_in_terminal_response' };
		}

		case 'reload_webview': {
			return { type: 'reload_webview_response' };
		}

		default:
			console.log('[YwCoder] Unhandled request type:', req.type);
			return { type: req.type + '_response', success: true };
	}
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
