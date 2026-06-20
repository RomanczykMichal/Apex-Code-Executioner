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
	const userSelect = document.getElementById('user');
	const durationSelect = document.getElementById('duration');
	const traceStatus = document.getElementById('traceStatus');
	const saveLogButton = document.getElementById('saveLog');
	let usersLoadedForOrg = null;

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

	function activateTab(tab) {
		tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
		tabContents.forEach((content) => content.classList.toggle('active', content.id === 'tab-' + tab));
		if (tab === 'debug') {
			ensureUsersLoaded();
		}
	}

	tabButtons.forEach((btn) => {
		btn.addEventListener('click', () => activateTab(btn.dataset.tab));
	});

	function ensureUsersLoaded() {
		const org = orgSelect.value;
		if (!org || usersLoadedForOrg === org) {
			return;
		}
		userSelect.innerHTML = '<option value="">Loading users...</option>';
		traceStatus.textContent = '';
		vscode.postMessage({ command: 'loadUsers', org });
	}

	orgSelect.addEventListener('change', () => {
		usersLoadedForOrg = null;
		traceStatus.textContent = '';
		const activeTab = document.querySelector('.tab-content.active');
		if (activeTab && activeTab.id === 'tab-debug') {
			ensureUsersLoaded();
		}
	});

	userSelect.addEventListener('change', () => {
		traceStatus.textContent = '';
		const org = orgSelect.value;
		const userId = userSelect.value;
		if (org && userId) {
			vscode.postMessage({ command: 'userSelected', org, userId });
		}
	});

	document.getElementById('setTraceFlag').addEventListener('click', () => {
		const org = orgSelect.value;
		const userId = userSelect.value;
		const minutes = Number(durationSelect.value);
		if (!org || !userId) {
			traceStatus.textContent = 'Select an org and a user first.';
			return;
		}
		traceStatus.textContent = 'Setting trace flag...';
		vscode.postMessage({ command: 'setTraceFlag', org, userId, minutes });
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
		} else if (message.command === 'users') {
			userSelect.innerHTML = '';
			usersLoadedForOrg = orgSelect.value;
			if (!message.users || message.users.length === 0) {
				const option = document.createElement('option');
				option.value = '';
				option.textContent = message.error ? 'Failed to load users' : 'No active users found';
				userSelect.appendChild(option);
				return;
			}
			const placeholder = document.createElement('option');
			placeholder.value = '';
			placeholder.textContent = 'Select a user...';
			userSelect.appendChild(placeholder);
			for (const user of message.users) {
				const option = document.createElement('option');
				option.value = user.id;
				option.textContent = user.label;
				userSelect.appendChild(option);
			}
		} else if (message.command === 'traceFlagStatus' || message.command === 'traceFlagResult') {
			traceStatus.textContent = message.message || '';
		}
	});

	vscode.postMessage({ command: 'ready' });
}());
