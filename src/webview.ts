import * as crypto from 'crypto';
import * as fs from 'fs';
import * as vscode from 'vscode';

const MAX_INPUT_LENGTH = 4000;

/**
 * Builds the webview HTML from the media/ assets, wiring up the CSP nonce and the
 * webview-safe URIs for the stylesheet and script.
 */
export function renderWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const mediaUri = vscode.Uri.joinPath(extensionUri, 'media');
	const htmlPath = vscode.Uri.joinPath(mediaUri, 'webview.html').fsPath;
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'webview.css'));
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'webview.js'));
	const nonce = crypto.randomBytes(16).toString('base64');

	return fs.readFileSync(htmlPath, 'utf8')
		.replace(/{{cspSource}}/g, webview.cspSource)
		.replace(/{{nonce}}/g, nonce)
		.replace(/{{styleUri}}/g, styleUri.toString())
		.replace(/{{scriptUri}}/g, scriptUri.toString())
		.replace(/{{maxInputLength}}/g, String(MAX_INPUT_LENGTH));
}
