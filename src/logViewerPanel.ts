import * as vscode from 'vscode';
import { getApexLog } from './sf/debugLogsService';
import { renderLogViewerHtml } from './webview';

const VIEW_TYPE = 'salesforceDeveloperToolbox.logViewer';

let currentPanel: vscode.WebviewPanel | undefined;
let currentOrg = '';
let currentLogId = '';
let currentLabel = '';

/**
 * Opens (or reveals) a single editor panel showing the body of a debug log. Clicking a
 * different log reuses the same panel and loads the new content.
 */
export function showLogPanel(extensionUri: vscode.Uri, org: string, logId: string, label: string): void {
	currentOrg = org;
	currentLogId = logId;
	currentLabel = label;

	if (currentPanel) {
		currentPanel.title = panelTitle(label);
		currentPanel.reveal(vscode.ViewColumn.Active);
		void sendLog(currentPanel, currentOrg, currentLogId, currentLabel);
		return;
	}

	const panel = vscode.window.createWebviewPanel(
		VIEW_TYPE,
		panelTitle(label),
		vscode.ViewColumn.Active,
		{
			enableScripts: true,
			enableFindWidget: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
		}
	);
	currentPanel = panel;
	panel.onDidDispose(() => {
		if (currentPanel === panel) {
			currentPanel = undefined;
		}
	});
	panel.webview.html = renderLogViewerHtml(panel.webview, extensionUri);
	panel.webview.onDidReceiveMessage((message) => {
		if (message && message.command === 'ready') {
			void sendLog(panel, currentOrg, currentLogId, currentLabel);
		}
	});
}

async function sendLog(panel: vscode.WebviewPanel, org: string, logId: string, label: string): Promise<void> {
	panel.webview.postMessage({ command: 'loading', label });
	try {
		const content = await getApexLog(org, logId);
		panel.webview.postMessage({ command: 'log', content, label });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		panel.webview.postMessage({ command: 'error', message });
	}
}

function panelTitle(label: string): string {
	return label ? `Debug Log — ${label}` : 'Debug Log';
}
