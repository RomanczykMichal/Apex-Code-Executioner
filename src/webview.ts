import * as crypto from 'crypto';
import * as fs from 'fs';
import * as vscode from 'vscode';

const MAX_INPUT_LENGTH = 4000;

/**
 * Builds HTML for a webview from a `media/<name>.{html,css,js}` asset set, wiring up the
 * CSP nonce and the webview-safe URIs for the stylesheet and script. Extra `{{key}}`
 * placeholders in the HTML can be filled via `replacements`.
 */
function render(
	name: string,
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	replacements: Record<string, string> = {}
): string {
	const mediaUri = vscode.Uri.joinPath(extensionUri, 'media');
	const htmlPath = vscode.Uri.joinPath(mediaUri, `${name}.html`).fsPath;
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, `${name}.css`));
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, `${name}.js`));
	const nonce = crypto.randomBytes(16).toString('base64');

	// Use function replacers so values containing `$` sequences (e.g. `$&`, `$1`) are inserted
	// literally instead of being interpreted as replacement patterns.
	let html = fs.readFileSync(htmlPath, 'utf8')
		.replace(/{{cspSource}}/g, () => webview.cspSource)
		.replace(/{{nonce}}/g, () => nonce)
		.replace(/{{styleUri}}/g, () => styleUri.toString())
		.replace(/{{scriptUri}}/g, () => scriptUri.toString());
	for (const [key, value] of Object.entries(replacements)) {
		html = html.replace(new RegExp(`{{${key}}}`, 'g'), () => value);
	}
	return html;
}

export function renderWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	return render('webview', webview, extensionUri, { maxInputLength: String(MAX_INPUT_LENGTH) });
}

export function renderTraceFlagsHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	return render('traceFlags', webview, extensionUri);
}

export function renderLogViewerHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	return render('logViewer', webview, extensionUri);
}
