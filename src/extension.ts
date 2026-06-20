import * as vscode from 'vscode';
import { ApexExecutionViewProvider } from './apexExecutionViewProvider';

export function activate(context: vscode.ExtensionContext) {
	const provider = new ApexExecutionViewProvider(context.extensionUri);
	context.subscriptions.push(provider);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ApexExecutionViewProvider.viewType, provider, {
			// Keep the webview alive when the user switches to another activity bar item and
			// back, so the selected org and already-fetched data are preserved instead of
			// being re-fetched every time the view becomes visible again.
			webviewOptions: { retainContextWhenHidden: true }
		})
	);
}

export function deactivate() {}
