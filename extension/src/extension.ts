/**
 * VSCode Extension Entry Point
 */

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { InstantiationServiceBuilder } from './di/instantiationServiceBuilder';
import { registerServices, ILogService, IAIAgentService, IWebViewService } from './services/serviceRegistry';
import { VSCodeTransport } from './services/ai-engine/transport/VSCodeTransport';

function ensureConfigDir(): string {
	const configDir = process.env.YWCODER_CONFIG_DIR || path.join(os.homedir(), '.ywcoder');
	if (!fs.existsSync(configDir)) {
		fs.mkdirSync(configDir, { recursive: true });
	}
	return configDir;
}

// 在模块加载最早期就强制统一配置目录，确保 SDK 初始化前 CLAUDE_CONFIG_DIR/YWCODER_CONFIG_DIR 已指向 ~/.ywcoder
const configDir = ensureConfigDir();
process.env.YWCODER_CONFIG_DIR = configDir;
process.env.CLAUDE_CONFIG_DIR = configDir;

/**
 * Extension Activation
 */
export function activate(context: vscode.ExtensionContext) {
	// 0. Force default appearance config for existing users
	const APPEARANCE_CONFIG_KEY = 'ywcoder.appearanceConfigForcedV3';
	if (!context.globalState.get<boolean>(APPEARANCE_CONFIG_KEY)) {
		const config = vscode.workspace.getConfiguration();
		config.update('workbench.colorTheme', 'Light 2026', true);
		config.update('workbench.activityBar.location', 'top', true);
		config.update('window.menuBarVisibility', 'compact', true);
		context.globalState.update(APPEARANCE_CONFIG_KEY, true);
	}

	// 1. Create service builder
	const builder = new InstantiationServiceBuilder();

	// 2. Register all services
	registerServices(builder, context);

	// 3. Seal the builder and create DI container
	const instantiationService = builder.seal();

	// 4. Log activation
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		logService.info('[YwCoder] Extension activated');
	});

	// 5. Connect services
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		const webViewService = accessor.get(IWebViewService);
		const aiAgentService = accessor.get(IAIAgentService);

		// 注入 ExtensionContext，供 globalState 等 VS Code API 使用
		aiAgentService.setExtensionContext(context);

		// Register WebView View Provider
		const webviewProvider = vscode.window.registerWebviewViewProvider(
			'ywcoder.chatView',
			webViewService,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		);

		// Connect WebView messages to AI Agent Service
		webViewService.setMessageHandler((message) => {
			aiAgentService.fromClient(message);
		});

		// Create VSCode Transport
		const transport = instantiationService.createInstance(VSCodeTransport);

		// Set transport on AI Agent Service
		aiAgentService.setTransport(transport);

		// Start message loop
		aiAgentService.start();

		// Register disposables
		context.subscriptions.push(webviewProvider);
		context.subscriptions.push(
			vscode.commands.registerCommand('ywcoder.openSettings', async () => {
				instantiationService.invokeFunction(accessorInner => {
					const webViewServiceInner = accessorInner.get(IWebViewService);
					const logServiceInner = accessorInner.get(ILogService);
					try {
						// Settings 页为单实例，不传 instanceId，使用 page 作为 key
						webViewServiceInner.openEditorPage('settings', 'YW Coder Settings');
					} catch (error) {
						logServiceInner.error('[Command] 打开 Settings 页面失败', error);
					}
				});
			})
		);

		logService.info('[YwCoder] Services connected');
	});

	// 6. Register commands
	const showChatCommand = vscode.commands.registerCommand('ywcoder.showChat', () => {
		vscode.commands.executeCommand('ywcoder.chatView.focus');
	});

	const newChatCommand = vscode.commands.registerCommand('ywcoder.newChat', () => {
		instantiationService.invokeFunction(accessor => {
			const webViewService = accessor.get(IWebViewService);
			webViewService.postMessage({
				type: 'request',
				requestId: `ext-newchat-${Date.now()}`,
				request: { type: 'external_action', action: 'new_chat' }
			});
		});
	});

	const stopGenerationCommand = vscode.commands.registerCommand('ywcoder.stopGeneration', () => {
		instantiationService.invokeFunction(accessor => {
			const webViewService = accessor.get(IWebViewService);
			webViewService.postMessage({
				type: 'request',
				requestId: `ext-stop-${Date.now()}`,
				request: { type: 'external_action', action: 'stop_generation' }
			});
		});
	});

	const askSelectionCommand = vscode.commands.registerCommand('ywcoder.askSelection', () => {
		const editor = vscode.window.activeTextEditor;
		const selection = editor?.selection;
		const text = selection && !selection.isEmpty
			? editor.document.getText(selection)
			: '';

		instantiationService.invokeFunction(accessor => {
			const webViewService = accessor.get(IWebViewService);
			webViewService.postMessage({
				type: 'request',
				requestId: `ext-ask-${Date.now()}`,
				request: { type: 'external_action', action: 'insert_text', payload: text }
			});
			// 聚焦到 YwCoder 视图
			vscode.commands.executeCommand('ywcoder.chatView.focus');
		});
	});

	const sendFileToChatCommand = vscode.commands.registerCommand('ywcoder.sendFileToChat', (uri: vscode.Uri) => {
		const filePath = uri?.fsPath || '';
		if (!filePath) return;

		instantiationService.invokeFunction(accessor => {
			const webViewService = accessor.get(IWebViewService);
			webViewService.postMessage({
				type: 'request',
				requestId: `ext-file-${Date.now()}`,
				request: { type: 'external_action', action: 'insert_text', payload: `@${filePath} ` }
			});
			vscode.commands.executeCommand('ywcoder.chatView.focus');
		});
	});

	context.subscriptions.push(showChatCommand, newChatCommand, stopGenerationCommand, askSelectionCommand, sendFileToChatCommand);

	// 7. Log completion
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		logService.info('[YwCoder] View registered');
	});

	// 8. Focus YwCoder view on startup (open secondary sidebar and switch to chat view)
	setTimeout(() => {
		vscode.commands.executeCommand('ywcoder.chatView.focus');
	}, 2000);

	// Return extension API (if needed to expose to other extensions)
	return {
		getInstantiationService: () => instantiationService
	};
}

/**
 * Extension Deactivation
 */
export function deactivate() {
	// Clean up resources
}
