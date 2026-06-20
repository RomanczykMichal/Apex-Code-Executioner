import * as os from 'os';
import * as vscode from 'vscode';
import { getApexLog } from './sf/debugLogsService';
import { renderLogViewerHtml } from './webview';

const VIEW_TYPE = 'salesforceDeveloperToolbox.logViewer';

// The debug log page can show either a stored ApexLog (fetched by id) or content that was
// produced in-session (e.g. an Anonymous Apex execution result).
type LogSource =
	| { kind: 'log'; org: string; logId: string; label: string }
	| { kind: 'content'; content: string; label: string };

let currentPanel: vscode.WebviewPanel | undefined;
let currentSource: LogSource | undefined;

/** Opens (or reveals) the debug log page for a stored ApexLog, fetched by id. */
export function showLogPanel(extensionUri: vscode.Uri, org: string, logId: string, label: string): void {
	show(extensionUri, { kind: 'log', org, logId, label });
}

/** Opens (or reveals) the debug log page for content produced in-session. */
export function showLogContent(extensionUri: vscode.Uri, content: string, label: string): void {
	show(extensionUri, { kind: 'content', content, label });
}

function show(extensionUri: vscode.Uri, source: LogSource): void {
	currentSource = source;
	const existed = !!currentPanel;
	const panel = ensurePanel(extensionUri);
	panel.title = panelTitle(source.label);
	panel.reveal(vscode.ViewColumn.Active);
	// A freshly created panel delivers once its webview posts "ready"; an existing one is
	// already listening, so push the new content now.
	if (existed) {
		void deliver(panel);
	}
}

function ensurePanel(extensionUri: vscode.Uri): vscode.WebviewPanel {
	if (currentPanel) {
		return currentPanel;
	}
	const panel = vscode.window.createWebviewPanel(
		VIEW_TYPE,
		panelTitle(currentSource?.label ?? ''),
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
		if (!message) {
			return;
		}
		if (message.command === 'ready') {
			void deliver(panel);
		} else if (message.command === 'download') {
			void downloadLog(message.content);
		}
	});
	return panel;
}

async function deliver(panel: vscode.WebviewPanel): Promise<void> {
	const source = currentSource;
	if (!source) {
		return;
	}
	if (source.kind === 'content') {
		panel.webview.postMessage({ command: 'log', content: source.content, label: source.label });
		return;
	}
	panel.webview.postMessage({ command: 'loading', label: source.label });
	try {
		const content = await getApexLog(source.org, source.logId);
		panel.webview.postMessage({ command: 'log', content, label: source.label });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		panel.webview.postMessage({ command: 'error', message });
	}
}

async function downloadLog(content: string): Promise<void> {
	if (!content) {
		vscode.window.showWarningMessage('There is no log to download.');
		return;
	}

	const suffix = currentSource && currentSource.kind === 'log' ? currentSource.logId : new Date().toISOString().replace(/[:.]/g, '-');
	const fileName = `apex-log-${suffix || 'debug'}.log`;
	const folders = vscode.workspace.workspaceFolders;
	const baseUri = folders && folders.length > 0 ? folders[0].uri : vscode.Uri.file(os.homedir());
	const uri = await vscode.window.showSaveDialog({
		saveLabel: 'Download Log',
		defaultUri: vscode.Uri.joinPath(baseUri, fileName),
		filters: { 'Log files': ['log'], 'Text files': ['txt'], 'All files': ['*'] }
	});
	if (!uri) {
		return;
	}

	try {
		await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
		vscode.window.showInformationMessage(`Log saved to ${uri.fsPath}.`);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage(`Failed to download log: ${message}`);
	}
}

function panelTitle(label: string): string {
	return label ? `Debug Log — ${label}` : 'Debug Log';
}
