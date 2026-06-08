import * as vscode from 'vscode';
import { ApexExecutionViewProvider } from './apexExecutionViewProvider';

export function activate(context: vscode.ExtensionContext) {
	const provider = new ApexExecutionViewProvider();
	context.subscriptions.push(provider);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ApexExecutionViewProvider.viewType, provider)
	);
}

export function deactivate() {}
