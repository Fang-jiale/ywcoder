/**
 * VSCode Extension Entry Point
 */

import * as vscode from 'vscode';
import { InstantiationServiceBuilder } from './di/instantiationServiceBuilder';
import { registerServices, ILogService, IAIAgentService, IWebViewService } from './services/serviceRegistry';
import { VSCodeTransport } from './services/ai-engine/transport/VSCodeTransport';

/**
 * Extension Activation
 */
export function activate(context: vscode.ExtensionContext) {
	// 0. Force default appearance config for existing users
	const APPEARANCE_CONFIG_KEY = 'ywcoder.appearanceConfigForced';
	if (!context.globalState.get<boolean>(APPEARANCE_CONFIG_KEY)) {
		const config = vscode.workspace.getConfiguration();
		config.update('workbench.colorTheme', 'Default High Contrast Light', true);
		config.update('workbench.activityBar.location', 'top', true);
		config.update('window.menuBarVisibility', 'hidden', true);
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

	context.subscriptions.push(showChatCommand);

	// 7. Log completion
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		logService.info('[YwCoder] View registered');
	});

	// 8. Focus YwCoder view on startup (open secondary sidebar)
	setTimeout(() => {
		vscode.commands.executeCommand('workbench.action.focusAuxiliaryBar');
	}, 1000);

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
