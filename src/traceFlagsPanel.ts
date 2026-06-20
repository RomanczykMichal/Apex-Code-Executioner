import * as vscode from 'vscode';
import {
	deleteTraceFlagById,
	extendTraceFlag,
	queryActiveUsers,
	queryDebugLevels,
	queryTraceFlagRows,
	setTraceFlag
} from './sf/debugLogsService';
import { renderTraceFlagsHtml } from './webview';

const VIEW_TYPE = 'salesforceDeveloperToolbox.traceFlags';

let currentPanel: vscode.WebviewPanel | undefined;
let currentOrg = '';

/**
 * Opens (or reveals) a single editor panel for managing users' trace flags (active and
 * expired): set a new flag, extend an existing one, or remove one. The panel re-queries on
 * its own messages, always using the most recently requested org.
 */
export function showTraceFlagsPanel(extensionUri: vscode.Uri, org: string): void {
	currentOrg = org;

	if (currentPanel) {
		currentPanel.title = panelTitle(org);
		currentPanel.reveal(vscode.ViewColumn.Active);
		void refreshAll(currentPanel, currentOrg);
		return;
	}

	const panel = vscode.window.createWebviewPanel(
		VIEW_TYPE,
		panelTitle(org),
		vscode.ViewColumn.Active,
		{
			enableScripts: true,
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
	panel.webview.html = renderTraceFlagsHtml(panel.webview, extensionUri);
	// Wait for the webview to signal it is ready before pushing data (avoids a race where
	// the message arrives before the listener is wired up).
	panel.webview.onDidReceiveMessage((message) => {
		if (!message) {
			return;
		}
		switch (message.command) {
			case 'ready':
				void refreshAll(panel, currentOrg);
				break;
			case 'refresh':
				void sendRows(panel, currentOrg);
				break;
			case 'setTraceFlag':
				void handleSet(panel, currentOrg, message.userId, message.minutes, message.debugLevelId);
				break;
			case 'extend':
				void handleExtend(panel, currentOrg, message.id, message.minutes);
				break;
			case 'delete':
				if (message.id) {
					void handleDelete(panel, currentOrg, message.id, message.label);
				}
				break;
		}
	});
}

async function handleSet(panel: vscode.WebviewPanel, org: string, userId: string, minutes: number, debugLevelId: string): Promise<void> {
	if (!userId) {
		panel.webview.postMessage({ command: 'actionResult', message: 'Select a user before setting a trace flag.' });
		return;
	}
	try {
		const expiration = await setTraceFlag(org, userId, minutes, debugLevelId);
		panel.webview.postMessage({ command: 'actionResult', message: `Trace flag set, active until ${expiration.toLocaleString()}.` });
	} catch (err) {
		panel.webview.postMessage({ command: 'actionResult', message: `Failed to set trace flag: ${toMessage(err)}` });
	}
	await sendRows(panel, org);
}

async function handleExtend(panel: vscode.WebviewPanel, org: string, id: string, minutes: number): Promise<void> {
	if (!id) {
		return;
	}
	try {
		const expiration = await extendTraceFlag(org, id, minutes);
		panel.webview.postMessage({ command: 'actionResult', message: `Trace flag extended, active until ${expiration.toLocaleString()}.` });
	} catch (err) {
		panel.webview.postMessage({ command: 'actionResult', message: `Failed to extend trace flag: ${toMessage(err)}` });
	}
	await sendRows(panel, org);
}

async function handleDelete(panel: vscode.WebviewPanel, org: string, id: string, label: string): Promise<void> {
	const target = label ? `the trace flag for ${label}` : 'this trace flag';
	const confirmed = await vscode.window.showWarningMessage(`Remove ${target}?`, { modal: true }, 'Remove');
	if (confirmed !== 'Remove') {
		await sendRows(panel, org);
		return;
	}
	try {
		await deleteTraceFlagById(org, id);
		panel.webview.postMessage({ command: 'actionResult', message: 'Trace flag removed.' });
	} catch (err) {
		panel.webview.postMessage({ command: 'actionResult', message: `Failed to remove trace flag: ${toMessage(err)}` });
	}
	await sendRows(panel, org);
}

async function refreshAll(panel: vscode.WebviewPanel, org: string): Promise<void> {
	await Promise.all([sendUsers(panel, org), sendDebugLevels(panel, org), sendRows(panel, org)]);
}

async function sendUsers(panel: vscode.WebviewPanel, org: string): Promise<void> {
	try {
		const users = await queryActiveUsers(org);
		panel.webview.postMessage({ command: 'users', users });
	} catch (err) {
		panel.webview.postMessage({ command: 'users', users: [], error: toMessage(err) });
	}
}

async function sendDebugLevels(panel: vscode.WebviewPanel, org: string): Promise<void> {
	try {
		const levels = await queryDebugLevels(org);
		panel.webview.postMessage({ command: 'debugLevels', levels });
	} catch (err) {
		panel.webview.postMessage({ command: 'debugLevels', levels: [], error: toMessage(err) });
	}
}

async function sendRows(panel: vscode.WebviewPanel, org: string): Promise<void> {
	panel.webview.postMessage({ command: 'loading' });
	try {
		const rows = await queryTraceFlagRows(org);
		panel.webview.postMessage({ command: 'data', org, rows });
	} catch (err) {
		panel.webview.postMessage({ command: 'error', message: toMessage(err) });
	}
}

function toMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function panelTitle(org: string): string {
	return `Trace Flags — ${org}`;
}
