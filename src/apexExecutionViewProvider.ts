import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MAX_INPUT_LENGTH = 4000;

interface ApexRunResult {
	success: boolean;
	compiled: boolean;
	compileProblem: string;
	exceptionMessage: string;
	exceptionStackTrace: string;
	line: number;
	column: number;
	logs: string;
}

interface SfOrg {
	username: string;
	alias?: string;
	connectedStatus: string;
}

interface OrgOption {
	label: string;
	username: string;
}

export class ApexExecutionViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'anonymousApexExecution.apexExecutionView';

	private readonly outputChannel = vscode.window.createOutputChannel('Anonymous Apex Execution');

	dispose(): void {
		this.outputChannel.dispose();
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		webviewView.webview.options = {
			enableScripts: true
		};
		webviewView.webview.html = this.getHtml();

		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.command === 'ready') {
				await this.sendOrgs(webviewView);
			} else if (message.command === 'execute') {
				await this.runApex(message.org, message.text, webviewView);
			}
		});
	}

	private async sendOrgs(webviewView: vscode.WebviewView): Promise<void> {
		try {
			const orgs = await this.listConnectedOrgs();
			const options: OrgOption[] = orgs.map((org) => ({
				label: org.alias ? `${org.alias} (${org.username})` : org.username,
				username: org.username
			}));
			webviewView.webview.postMessage({ command: 'orgs', orgs: options });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			webviewView.webview.postMessage({ command: 'orgs', orgs: [], error: message });
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

		const tempFile = path.join(os.tmpdir(), `anonymous-apex-${crypto.randomUUID()}.apex`);
		webviewView.webview.postMessage({ command: 'status', text: `Executing against ${org}...` });

		try {
			fs.writeFileSync(tempFile, trimmed, 'utf8');
			const result = await this.execApex(org, tempFile);
			this.logResult(org, result);
			webviewView.webview.postMessage({
				command: 'status',
				text: result.success ? 'Execution succeeded.' : 'Execution failed.'
			});
			webviewView.webview.postMessage({
				command: 'result',
				success: result.success,
				summary: this.summarize(result),
				logs: result.logs ?? ''
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.outputChannel.appendLine(`Error: ${message}`);
			this.outputChannel.show(true);
			vscode.window.showErrorMessage(`Failed to execute Apex: ${message}`);
			webviewView.webview.postMessage({ command: 'status', text: 'Execution failed to start.' });
			webviewView.webview.postMessage({ command: 'result', success: false, summary: message, logs: '' });
		} finally {
			fs.rm(tempFile, { force: true }, () => undefined);
		}
	}

	private listConnectedOrgs(): Promise<SfOrg[]> {
		return new Promise((resolve, reject) => {
			childProcess.execFile(
				'sf',
				['org', 'list', '--json'],
				{ shell: true, maxBuffer: 10 * 1024 * 1024 },
				(error, stdout) => {
					if (!stdout) {
						reject(error ?? new Error('No output from Salesforce CLI.'));
						return;
					}
					try {
						const parsed = JSON.parse(stdout);
						const groups: SfOrg[][] = Object.values(parsed.result ?? {});
						resolve(groups.flat().filter((org) => org.connectedStatus === 'Connected'));
					} catch {
						reject(new Error('Could not parse "sf org list" output.'));
					}
				}
			);
		});
	}

	private execApex(targetOrg: string, file: string): Promise<ApexRunResult> {
		return new Promise((resolve, reject) => {
			childProcess.execFile(
				'sf',
				['apex', 'run', '--target-org', targetOrg, '--file', file, '--json'],
				{ shell: true, maxBuffer: 10 * 1024 * 1024 },
				(error, stdout) => {
					if (!stdout) {
						reject(error ?? new Error('No output from Salesforce CLI.'));
						return;
					}
					try {
						const parsed = JSON.parse(stdout);
						if (!parsed.result) {
							reject(new Error(parsed.message ?? 'Salesforce CLI returned an error.'));
							return;
						}
						resolve(parsed.result as ApexRunResult);
					} catch {
						reject(error ?? new Error('Could not parse "sf apex run" output.'));
					}
				}
			);
		});
	}

	private summarize(result: ApexRunResult): string {
		if (!result.compiled) {
			return `Compile error (line ${result.line}, column ${result.column}): ${result.compileProblem}`;
		}
		if (!result.success) {
			const lines = [`Exception: ${result.exceptionMessage}`];
			if (result.exceptionStackTrace) {
				lines.push(result.exceptionStackTrace);
			}
			return lines.join('\n');
		}
		return 'Execution succeeded.';
	}

	private formatResult(result: ApexRunResult): string {
		const lines = [this.summarize(result)];
		if (result.logs) {
			lines.push('', result.logs);
		}
		return lines.join('\n');
	}

	private logResult(targetOrg: string, result: ApexRunResult): void {
		this.outputChannel.appendLine('');
		this.outputChannel.appendLine(`--- Execute Anonymous Apex (${targetOrg}) — ${new Date().toLocaleString()} ---`);
		this.outputChannel.appendLine(this.formatResult(result));
		this.outputChannel.show(true);

		if (result.success) {
			vscode.window.showInformationMessage(`Apex executed successfully against ${targetOrg}.`);
		} else {
			vscode.window.showErrorMessage(`Apex execution failed against ${targetOrg}. See "Anonymous Apex Execution" output for details.`);
		}
	}

	private getHtml(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		body {
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			padding: 1rem;
		}
		select {
			width: 100%;
			box-sizing: border-box;
			background-color: var(--vscode-dropdown-background);
			color: var(--vscode-dropdown-foreground);
			border: 1px solid var(--vscode-dropdown-border, transparent);
			border-radius: 2px;
			padding: 0.3rem;
		}
		.editor-wrap {
			position: relative;
			height: 12rem;
			margin-top: 0.5rem;
		}
		.editor-wrap pre.highlight,
		.editor-wrap textarea {
			position: absolute;
			inset: 0;
			margin: 0;
			box-sizing: border-box;
			padding: 0.5rem;
			border: 1px solid var(--vscode-input-border, transparent);
			border-radius: 2px;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 0.95em;
			line-height: 1.4;
			white-space: pre-wrap;
			word-break: break-word;
			overflow: auto;
		}
		pre.highlight {
			pointer-events: none;
			color: var(--vscode-input-foreground);
			background-color: var(--vscode-input-background);
			z-index: 1;
		}
		pre.highlight code {
			font: inherit;
			white-space: inherit;
			word-break: inherit;
		}
		.editor-wrap textarea {
			width: 100%;
			height: 100%;
			resize: none;
			background-color: transparent;
			color: transparent;
			caret-color: var(--vscode-input-foreground);
			z-index: 2;
		}
		.tok-keyword {
			color: var(--vscode-charts-purple);
		}
		.tok-type {
			color: var(--vscode-charts-blue);
		}
		.tok-string {
			color: var(--vscode-charts-orange);
		}
		.tok-comment {
			color: var(--vscode-charts-green);
			font-style: italic;
		}
		.tok-number {
			color: var(--vscode-charts-yellow);
		}
		.tok-annotation {
			color: var(--vscode-charts-red);
		}
		.tok-soql {
			color: var(--vscode-charts-purple);
			font-weight: 600;
		}
		button {
			margin-top: 0.5rem;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 2px;
			padding: 0.4rem 1rem;
			cursor: pointer;
			align: flex-end;
		}
		button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		.checkbox-row {
			display: none;
			align-items: center;
			gap: 0.4rem;
			margin-top: 0.5rem;
			font-size: 0.9em;
		}
		.checkbox-row.visible {
			display: flex;
		}
		.checkbox-row input {
			margin: 0;
		}
		#status {
			margin-top: 0.5rem;
			color: var(--vscode-descriptionForeground);
			font-size: 0.9em;
		}
		#output {
			display: none;
			margin-top: 0.5rem;
			max-height: 18rem;
			overflow: auto;
			white-space: pre-wrap;
			word-break: break-word;
			background-color: var(--vscode-textCodeBlock-background);
			border: 1px solid var(--vscode-widget-border, transparent);
			border-left-width: 3px;
			border-radius: 2px;
			padding: 0.5rem;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 0.85em;
		}
		#output.success {
			border-left-color: var(--vscode-charts-green);
		}
		#output.failure {
			border-left-color: var(--vscode-charts-red);
		}
	</style>
</head>
<body>
	<select id="org">
		<option value="">Loading orgs...</option>
	</select>
	<div class="editor-wrap">
		<pre class="highlight" aria-hidden="true"><code id="highlightCode"></code></pre>
		<textarea id="input" maxlength="${MAX_INPUT_LENGTH}" placeholder="Enter Apex code..." spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
	</div>
	<div>
		<button id="execute">Execute</button>
	</div>
	<p id="status"></p>
	<label class="checkbox-row" id="debugOnlyRow">
		<input type="checkbox" id="debugOnly">
		System Debug Only
	</label>
	<pre id="output"></pre>
	<script>
		const vscode = acquireVsCodeApi();
		const orgSelect = document.getElementById('org');
		const input = document.getElementById('input');
		const status = document.getElementById('status');
		const output = document.getElementById('output');
		const debugOnly = document.getElementById('debugOnly');
		const debugOnlyRow = document.getElementById('debugOnlyRow');
		const highlightCode = document.getElementById('highlightCode');
		const highlightPre = document.querySelector('.highlight');

		const APEX_KEYWORDS = new Set(['public','private','protected','global','class','interface','enum','extends','implements','static','final','abstract','virtual','override','void','return','if','else','for','while','do','switch','on','case','default','break','continue','new','this','super','try','catch','finally','throw','trigger','before','after','insert','update','delete','undelete','upsert','merge','instanceof','null','true','false','transient','testmethod','with','without','sharing','get','set','when']);
		const APEX_TYPES = new Set(['integer','string','boolean','object','list','set','map','decimal','double','long','date','datetime','time','id','blob','sobject']);
		const SOQL_KEYWORDS = new Set(['select','from','where','order','by','group','having','limit','offset','and','or','not','in','like','asc','desc','count']);

		function isWordStart(ch) {
			return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
		}
		function isWordChar(ch) {
			return isWordStart(ch) || (ch >= '0' && ch <= '9');
		}
		function isDigit(ch) {
			return ch >= '0' && ch <= '9';
		}

		function tokenizeApex(code) {
			const tokens = [];
			const n = code.length;
			let i = 0;
			while (i < n) {
				const ch = code[i];

				if (ch === '/' && code[i + 1] === '/') {
					let j = code.indexOf('\\n', i);
					if (j === -1) { j = n; }
					tokens.push(['comment', code.slice(i, j)]);
					i = j;
					continue;
				}

				if (ch === '/' && code[i + 1] === '*') {
					let j = code.indexOf('*/', i + 2);
					j = j === -1 ? n : j + 2;
					tokens.push(['comment', code.slice(i, j)]);
					i = j;
					continue;
				}

				if (ch === "'") {
					let j = i + 1;
					while (j < n && code[j] !== "'") {
						if (code[j] === '\\\\') { j++; }
						j++;
					}
					j = Math.min(j + 1, n);
					tokens.push(['string', code.slice(i, j)]);
					i = j;
					continue;
				}

				if (ch === '@') {
					let j = i + 1;
					while (j < n && isWordChar(code[j])) { j++; }
					tokens.push(['annotation', code.slice(i, j)]);
					i = j;
					continue;
				}

				if (isDigit(ch)) {
					let j = i;
					while (j < n && (isDigit(code[j]) || code[j] === '.')) { j++; }
					tokens.push(['number', code.slice(i, j)]);
					i = j;
					continue;
				}

				if (isWordStart(ch)) {
					let j = i;
					while (j < n && isWordChar(code[j])) { j++; }
					const word = code.slice(i, j);
					const lower = word.toLowerCase();
					let cls = null;
					if (APEX_KEYWORDS.has(lower)) { cls = 'keyword'; }
					else if (APEX_TYPES.has(lower)) { cls = 'type'; }
					else if (SOQL_KEYWORDS.has(lower)) { cls = 'soql'; }
					tokens.push([cls, word]);
					i = j;
					continue;
				}

				tokens.push([null, ch]);
				i++;
			}
			return tokens;
		}

		function escapeHtml(text) {
			return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}

		function highlightApex(code) {
			let html = '';
			for (const [cls, text] of tokenizeApex(code)) {
				const escaped = escapeHtml(text);
				html += cls ? '<span class="tok-' + cls + '">' + escaped + '</span>' : escaped;
			}
			return html;
		}

		function refreshHighlight() {
			highlightCode.innerHTML = highlightApex(input.value);
		}

		function syncHighlightScroll() {
			highlightPre.scrollTop = input.scrollTop;
			highlightPre.scrollLeft = input.scrollLeft;
		}

		input.addEventListener('input', refreshHighlight);
		input.addEventListener('scroll', syncHighlightScroll);
		refreshHighlight();

		let lastResult = null;

		function renderOutput() {
			if (!lastResult) {
				output.style.display = 'none';
				debugOnlyRow.classList.remove('visible');
				return;
			}
			let logs = lastResult.logs || '';
			if (debugOnly.checked && logs) {
				logs = logs.split('\\n').filter((line) => line.includes('|USER_DEBUG|')).join('\\n');
				if (!logs) {
					logs = '(no System.debug output)';
				}
			}
			const text = logs ? lastResult.summary + '\\n\\n' + logs : lastResult.summary;
			output.textContent = text;
			output.classList.remove('success', 'failure');
			if (lastResult.success === true) {
				output.classList.add('success');
			} else if (lastResult.success === false) {
				output.classList.add('failure');
			}
			const visible = !!text;
			output.style.display = visible ? 'block' : 'none';
			debugOnlyRow.classList.toggle('visible', visible);
		}

		document.getElementById('execute').addEventListener('click', () => {
			vscode.postMessage({ command: 'execute', org: orgSelect.value, text: input.value });
		});

		debugOnly.addEventListener('change', renderOutput);

		window.addEventListener('message', (event) => {
			const message = event.data;
			if (!message) {
				return;
			}
			if (message.command === 'orgs') {
				orgSelect.innerHTML = '';
				if (!message.orgs || message.orgs.length === 0) {
					const option = document.createElement('option');
					option.value = '';
					option.textContent = message.error ? 'Failed to load orgs' : 'No connected orgs found';
					orgSelect.appendChild(option);
					return;
				}
				for (const org of message.orgs) {
					const option = document.createElement('option');
					option.value = org.username;
					option.textContent = org.label;
					orgSelect.appendChild(option);
				}
			} else if (message.command === 'status') {
				status.textContent = message.text;
			} else if (message.command === 'result') {
				lastResult = { success: message.success, summary: message.summary || '', logs: message.logs || '' };
				renderOutput();
			}
		});

		vscode.postMessage({ command: 'ready' });
	</script>
</body>
</html>`;
	}
}
