(function () {
	const vscode = acquireVsCodeApi();
	const orgSelect = document.getElementById('org');
	const input = document.getElementById('input');
	const status = document.getElementById('status');
	const output = document.getElementById('output');
	const debugOnly = document.getElementById('debugOnly');
	const debugOnlyRow = document.getElementById('debugOnlyRow');
	const highlightCode = document.getElementById('highlightCode');
	const highlightPre = document.querySelector('.highlight');
	const tabButtons = document.querySelectorAll('.tab-button');
	const tabContents = document.querySelectorAll('.tab-content');
	const traceStatus = document.getElementById('traceStatus');
	const saveLogButton = document.getElementById('saveLog');
	const refreshLogsButton = document.getElementById('refreshLogs');
	const logsTable = document.getElementById('logsTable');
	const logsBody = document.getElementById('logsBody');
	const logsStatus = document.getElementById('logsStatus');

	const APEX_KEYWORDS = new Set(['public', 'private', 'protected', 'global', 'class', 'interface', 'enum', 'extends', 'implements', 'static', 'final', 'abstract', 'virtual', 'override', 'void', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'on', 'case', 'default', 'break', 'continue', 'new', 'this', 'super', 'try', 'catch', 'finally', 'throw', 'trigger', 'before', 'after', 'insert', 'update', 'delete', 'undelete', 'upsert', 'merge', 'instanceof', 'null', 'true', 'false', 'transient', 'testmethod', 'with', 'without', 'sharing', 'get', 'set', 'when']);
	const APEX_TYPES = new Set(['integer', 'string', 'boolean', 'object', 'list', 'set', 'map', 'decimal', 'double', 'long', 'date', 'datetime', 'time', 'id', 'blob', 'sobject']);
	const SOQL_KEYWORDS = new Set(['select', 'from', 'where', 'order', 'by', 'group', 'having', 'limit', 'offset', 'and', 'or', 'not', 'in', 'like', 'asc', 'desc', 'count']);

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
				let j = code.indexOf('\n', i);
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
					if (code[j] === '\\') { j++; }
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
			saveLogButton.classList.add('hidden');
			return;
		}
		let logs = lastResult.logs || '';
		if (debugOnly.checked && logs) {
			logs = logs.split('\n').filter((line) => line.includes('|USER_DEBUG|')).join('\n');
			if (!logs) {
				logs = '(no System.debug output)';
			}
		}
		const text = logs ? lastResult.summary + '\n\n' + logs : lastResult.summary;
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
		saveLogButton.classList.toggle('hidden', !(visible && !!lastResult.logs));
	}

	document.getElementById('execute').addEventListener('click', () => {
		vscode.postMessage({ command: 'execute', org: orgSelect.value, text: input.value });
	});

	debugOnly.addEventListener('change', renderOutput);

	saveLogButton.addEventListener('click', () => {
		if (!lastResult || !lastResult.logs) {
			return;
		}
		vscode.postMessage({ command: 'saveLog', logs: lastResult.logs });
	});

	function isDebugTabActive() {
		const activeTab = document.querySelector('.tab-content.active');
		return !!activeTab && activeTab.id === 'tab-debug';
	}

	function loadLogs() {
		const org = orgSelect.value;
		if (!org) {
			logsStatus.textContent = 'Select an org to see log entries.';
			logsTable.classList.add('hidden');
			return;
		}
		logsStatus.textContent = 'Loading log entries...';
		vscode.postMessage({ command: 'loadLogs', org });
	}

	function formatLogTime(iso) {
		if (!iso) {
			return '';
		}
		const date = new Date(iso);
		return isNaN(date.getTime()) ? iso : date.toLocaleString();
	}

	function formatSize(bytes) {
		if (typeof bytes !== 'number' || isNaN(bytes)) {
			return '';
		}
		if (bytes < 1024) {
			return bytes + ' B';
		}
		const kb = bytes / 1024;
		if (kb < 1024) {
			return kb.toFixed(1) + ' KB';
		}
		return (kb / 1024).toFixed(1) + ' MB';
	}

	function renderLogs(logs, error) {
		logsBody.innerHTML = '';
		if (error) {
			logsStatus.textContent = 'Failed to load log entries: ' + error;
			logsTable.classList.add('hidden');
			return;
		}
		if (!logs || logs.length === 0) {
			logsStatus.textContent = 'No log entries found.';
			logsTable.classList.add('hidden');
			return;
		}
		for (const log of logs) {
			const tr = document.createElement('tr');
			const cells = [log.user, log.operation, log.status, formatSize(log.logLength), formatLogTime(log.startTime)];
			for (const cell of cells) {
				const td = document.createElement('td');
				td.textContent = cell == null ? '' : String(cell);
				td.title = td.textContent;
				tr.appendChild(td);
			}
			tr.addEventListener('click', () => {
				const label = (log.user || 'Log') + ' · ' + formatLogTime(log.startTime);
				vscode.postMessage({ command: 'openLog', org: orgSelect.value, id: log.id, label: label });
			});
			logsBody.appendChild(tr);
		}
		logsStatus.textContent = logs.length + ' log entr' + (logs.length === 1 ? 'y' : 'ies') + '.';
		logsTable.classList.remove('hidden');
	}

	function activateTab(tab) {
		tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
		tabContents.forEach((content) => content.classList.toggle('active', content.id === 'tab-' + tab));
		if (tab === 'debug') {
			loadLogs();
		}
	}

	tabButtons.forEach((btn) => {
		btn.addEventListener('click', () => activateTab(btn.dataset.tab));
	});

	orgSelect.addEventListener('change', () => {
		traceStatus.textContent = '';
		if (isDebugTabActive()) {
			loadLogs();
		}
	});

	refreshLogsButton.addEventListener('click', loadLogs);

	document.getElementById('manageTraceFlags').addEventListener('click', () => {
		const org = orgSelect.value;
		if (!org) {
			traceStatus.textContent = 'Select an org first.';
			return;
		}
		vscode.postMessage({ command: 'manageTraceFlags', org });
	});

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
		} else if (message.command === 'logs') {
			renderLogs(message.logs, message.error);
		}
	});

	vscode.postMessage({ command: 'ready' });
}());
