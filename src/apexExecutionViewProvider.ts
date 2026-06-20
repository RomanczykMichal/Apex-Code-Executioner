import * as vscode from 'vscode';
import { listConnectedOrgs, toOrgOptions } from './sf/orgService';
import { formatResult, runAnonymousApex, summarize } from './sf/apexService';
import { listApexLogs } from './sf/debugLogsService';
import { renderWebviewHtml } from './webview';
import { showTraceFlagsPanel, updateTraceFlagsOrg } from './traceFlagsPanel';
import { showLogContent, showLogPanel } from './logViewerPanel';
import { ApexRunResult } from './types';

export class ApexExecutionViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'salesforceDeveloperToolbox.mainView';

	private readonly outputChannel = vscode.window.createOutputChannel('Salesforce Developer Toolbox');

	private lastApexResult?: { content: string; label: string };

	constructor(private readonly extensionUri: vscode.Uri) {}

	dispose(): void {
		this.outputChannel.dispose();
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
		};
		webviewView.webview.html = renderWebviewHtml(webviewView.webview, this.extensionUri);

		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.command === 'ready') {
				await this.sendOrgs(webviewView);
			} else if (message.command === 'execute') {
				await this.runApex(message.org, message.text, webviewView);
			} else if (message.command === 'manageTraceFlags') {
				showTraceFlagsPanel(this.extensionUri, message.org);
			} else if (message.command === 'orgChanged') {
				updateTraceFlagsOrg(message.org);
			} else if (message.command === 'loadLogs') {
				await this.sendLogs(message.org, webviewView);
			} else if (message.command === 'openLog') {
				showLogPanel(this.extensionUri, message.org, message.id, message.label);
			} else if (message.command === 'showLastResult') {
				this.openLastResult();
			}
		});
	}

	private async sendOrgs(webviewView: vscode.WebviewView): Promise<void> {
		try {
			const orgs = toOrgOptions(await listConnectedOrgs());
			webviewView.webview.postMessage({ command: 'orgs', orgs });
		} catch (err) {
			webviewView.webview.postMessage({ command: 'orgs', orgs: [], error: errorMessage(err) });
		}
	}

	private async runApex(org: string, code: string, webviewView: vscode.WebviewView): Promise<void> {
		const trimmed = (code ?? '').trim();
		if (!org) {
			vscode.window.showWarningMessage('Select a Salesforce org before executing.');
			return;
		}
		if (!trimmed) {
			vscode.window.showWarningMessage('Enter some Apex code before executing.');
			return;
		}

		webviewView.webview.postMessage({ command: 'status', text: `Executing against ${org}...` });

		try {
			const result = await runAnonymousApex(org, trimmed);
			this.logResult(org, result);
			webviewView.webview.postMessage({
				command: 'status',
				text: result.success ? 'Execution succeeded.' : 'Execution failed.'
			});
			const summary = summarize(result);
			const content = result.logs ? `${summary}\n\n${result.logs}` : summary;
			this.lastApexResult = { content, label: `Anonymous Apex (${org})` };
			showLogContent(this.extensionUri, content, this.lastApexResult.label);
		} catch (err) {
			const message = errorMessage(err);
			this.outputChannel.appendLine(`Error: ${message}`);
			this.outputChannel.show(true);
			vscode.window.showErrorMessage(`Failed to execute Apex: ${message}`);
			webviewView.webview.postMessage({ command: 'status', text: 'Execution failed to start.' });
		}
	}

	private openLastResult(): void {
		if (!this.lastApexResult) {
			vscode.window.showInformationMessage('Run Anonymous Apex first to see its debug log.');
			return;
		}
		showLogContent(this.extensionUri, this.lastApexResult.content, this.lastApexResult.label);
	}

	private async sendLogs(org: string, webviewView: vscode.WebviewView): Promise<void> {
		if (!org) {
			webviewView.webview.postMessage({ command: 'logs', logs: [], error: 'Select an org first.' });
			return;
		}
		try {
			const logs = await listApexLogs(org);
			webviewView.webview.postMessage({ command: 'logs', logs });
		} catch (err) {
			webviewView.webview.postMessage({ command: 'logs', logs: [], error: errorMessage(err) });
		}
	}

	private logResult(targetOrg: string, result: ApexRunResult): void {
		this.outputChannel.appendLine('');
		this.outputChannel.appendLine(`--- Execute Anonymous Apex (${targetOrg}) — ${new Date().toLocaleString()} ---`);
		this.outputChannel.appendLine(formatResult(result));
		this.outputChannel.show(true);

		if (result.success) {
			vscode.window.showInformationMessage(`Apex executed successfully against ${targetOrg}.`);
		} else {
			vscode.window.showErrorMessage(`Apex execution failed against ${targetOrg}. See "Salesforce Developer Toolbox" output for details.`);
		}
	}
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
