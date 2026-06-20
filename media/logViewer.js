(function () {
	const vscode = acquireVsCodeApi();
	const subtitle = document.getElementById('subtitle');
	const message = document.getElementById('message');
	const content = document.getElementById('content');
	const searchBar = document.getElementById('searchBar');
	const searchInput = document.getElementById('search');
	const searchCount = document.getElementById('searchCount');
	const prevButton = document.getElementById('prevMatch');
	const nextButton = document.getElementById('nextMatch');
	const caseSensitive = document.getElementById('caseSensitive');
	const onlyMatching = document.getElementById('onlyMatching');
	const systemDebugOnly = document.getElementById('systemDebugOnly');

	const SYSTEM_DEBUG_MARKER = '|USER_DEBUG|';

	let rawLog = '';
	let matches = [];
	let currentMatch = -1;

	function escapeHtml(text) {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function showMessage(text) {
		message.textContent = text;
		message.classList.remove('hidden');
		content.classList.add('hidden');
		searchBar.classList.add('hidden');
	}

	function highlightLine(line, query, matchCase) {
		const haystack = matchCase ? line : line.toLowerCase();
		const needle = matchCase ? query : query.toLowerCase();
		let html = '';
		let from = 0;
		let idx = haystack.indexOf(needle, from);
		while (idx !== -1) {
			html += escapeHtml(line.slice(from, idx));
			html += '<span class="match">' + escapeHtml(line.slice(idx, idx + needle.length)) + '</span>';
			from = idx + needle.length;
			idx = haystack.indexOf(needle, from);
		}
		html += escapeHtml(line.slice(from));
		return html;
	}

	function renderLog() {
		const query = searchInput.value;
		const matchCase = caseSensitive.checked;
		const filterLines = onlyMatching.checked;
		const debugOnly = systemDebugOnly.checked;
		const lines = rawLog.split('\n');
		const out = [];

		for (const line of lines) {
			if (debugOnly && line.indexOf(SYSTEM_DEBUG_MARKER) === -1) {
				continue;
			}
			const lineHasMatch = !!query && (matchCase ? line.indexOf(query) !== -1 : line.toLowerCase().indexOf(query.toLowerCase()) !== -1);
			if (filterLines && query && !lineHasMatch) {
				continue;
			}
			out.push(query ? highlightLine(line, query, matchCase) : escapeHtml(line));
		}

		if (out.length === 0 && debugOnly) {
			out.push(escapeHtml('(no System.debug output)'));
		}

		content.innerHTML = out.join('\n');
		matches = Array.prototype.slice.call(content.querySelectorAll('.match'));
		currentMatch = matches.length ? 0 : -1;
		applyActive(true);
		updateCount();
	}

	function applyActive(scroll) {
		for (let i = 0; i < matches.length; i++) {
			matches[i].classList.toggle('active', i === currentMatch);
		}
		if (scroll && currentMatch >= 0) {
			matches[currentMatch].scrollIntoView({ block: 'center' });
		}
	}

	function updateCount() {
		if (!searchInput.value) {
			searchCount.textContent = '';
		} else if (matches.length === 0) {
			searchCount.textContent = 'No matches';
		} else {
			searchCount.textContent = (currentMatch + 1) + ' / ' + matches.length;
		}
	}

	function goTo(delta) {
		if (matches.length === 0) {
			return;
		}
		currentMatch = (currentMatch + delta + matches.length) % matches.length;
		applyActive(true);
		updateCount();
	}

	let debounce;
	searchInput.addEventListener('input', () => {
		clearTimeout(debounce);
		debounce = setTimeout(renderLog, 150);
	});
	searchInput.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			goTo(event.shiftKey ? -1 : 1);
		} else if (event.key === 'Escape') {
			searchInput.value = '';
			renderLog();
		}
	});
	prevButton.addEventListener('click', () => goTo(-1));
	nextButton.addEventListener('click', () => goTo(1));
	caseSensitive.addEventListener('change', renderLog);
	onlyMatching.addEventListener('change', renderLog);
	systemDebugOnly.addEventListener('change', renderLog);

	window.addEventListener('message', (event) => {
		const msg = event.data;
		if (!msg) {
			return;
		}
		if (msg.command === 'loading') {
			subtitle.textContent = msg.label || '';
			showMessage('Loading log...');
		} else if (msg.command === 'log') {
			subtitle.textContent = msg.label || '';
			rawLog = msg.content || '';
			if (!rawLog) {
				showMessage('This log is empty.');
				return;
			}
			message.classList.add('hidden');
			content.classList.remove('hidden');
			searchBar.classList.remove('hidden');
			renderLog();
			searchInput.focus();
		} else if (msg.command === 'error') {
			showMessage('Failed to load log: ' + msg.message);
		}
	});

	vscode.postMessage({ command: 'ready' });
}());
