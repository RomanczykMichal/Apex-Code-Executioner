(function () {
	const vscode = acquireVsCodeApi();
	const subtitle = document.getElementById('subtitle');
	const message = document.getElementById('message');
	const table = document.getElementById('table');
	const tbody = document.getElementById('tbody');
	const userSelect = document.getElementById('user');
	const debugLevelSelect = document.getElementById('debugLevel');
	const durationSelect = document.getElementById('duration');
	const setButton = document.getElementById('setTraceFlag');
	const actionStatus = document.getElementById('actionStatus');

	function formatDate(iso) {
		if (!iso) {
			return '';
		}
		const date = new Date(iso);
		return isNaN(date.getTime()) ? iso : date.toLocaleString();
	}

	function timeLeft(iso) {
		const ms = new Date(iso).getTime() - Date.now();
		if (isNaN(ms) || ms <= 0) {
			return 'expired';
		}
		const minutes = Math.round(ms / 60000);
		if (minutes < 60) {
			return minutes + 'm';
		}
		const hours = Math.floor(minutes / 60);
		return hours + 'h ' + (minutes % 60) + 'm';
	}

	function showMessage(text) {
		message.textContent = text;
		message.classList.remove('hidden');
		table.classList.add('hidden');
	}

	function isExpired(iso) {
		const ms = new Date(iso).getTime();
		return isNaN(ms) || ms <= Date.now();
	}

	function renderRows(rows) {
		tbody.innerHTML = '';
		for (const row of rows) {
			const tr = document.createElement('tr');
			if (isExpired(row.expirationDate)) {
				tr.classList.add('expired');
			}
			const cells = [
				row.userName,
				row.username,
				row.logType,
				row.debugLevel,
				formatDate(row.startDate),
				formatDate(row.expirationDate),
				timeLeft(row.expirationDate)
			];
			for (const cell of cells) {
				const td = document.createElement('td');
				td.textContent = cell == null ? '' : String(cell);
				tr.appendChild(td);
			}

			const actionTd = document.createElement('td');
			const actions = document.createElement('div');
			actions.className = 'row-actions';

			const extendButton = document.createElement('button');
			extendButton.className = 'action extend';
			extendButton.type = 'button';
			extendButton.textContent = 'Extend';
			extendButton.addEventListener('click', () => {
				extendButton.disabled = true;
				actionStatus.textContent = 'Extending trace flag...';
				vscode.postMessage({ command: 'extend', id: row.id, minutes: Number(durationSelect.value) });
			});

			const removeButton = document.createElement('button');
			removeButton.className = 'action remove';
			removeButton.type = 'button';
			removeButton.textContent = 'Remove';
			removeButton.addEventListener('click', () => {
				removeButton.disabled = true;
				vscode.postMessage({ command: 'delete', id: row.id, label: row.userName });
			});

			actions.appendChild(extendButton);
			actions.appendChild(removeButton);
			actionTd.appendChild(actions);
			tr.appendChild(actionTd);

			tbody.appendChild(tr);
		}
		message.classList.add('hidden');
		table.classList.remove('hidden');
	}

	function populateUsers(users, error) {
		userSelect.innerHTML = '';
		if (!users || users.length === 0) {
			const option = document.createElement('option');
			option.value = '';
			option.textContent = error ? 'Failed to load users' : 'No active users found';
			userSelect.appendChild(option);
			return;
		}
		const placeholder = document.createElement('option');
		placeholder.value = '';
		placeholder.textContent = 'Select a user...';
		userSelect.appendChild(placeholder);
		for (const user of users) {
			const option = document.createElement('option');
			option.value = user.id;
			option.textContent = user.label;
			userSelect.appendChild(option);
		}
	}

	function populateDebugLevels(levels, error) {
		debugLevelSelect.innerHTML = '';
		if (!levels || levels.length === 0) {
			const option = document.createElement('option');
			option.value = '';
			option.textContent = error ? 'Failed to load debug levels' : 'ApexExecutioner (auto-create)';
			debugLevelSelect.appendChild(option);
			return;
		}
		let defaultId = levels[0].id;
		for (const level of levels) {
			const option = document.createElement('option');
			option.value = level.id;
			option.textContent = level.label;
			debugLevelSelect.appendChild(option);
			if (level.isDefault) {
				defaultId = level.id;
			}
		}
		debugLevelSelect.value = defaultId;
	}

	document.getElementById('refresh').addEventListener('click', () => {
		showMessage('Refreshing...');
		vscode.postMessage({ command: 'refresh' });
	});

	setButton.addEventListener('click', () => {
		const userId = userSelect.value;
		if (!userId) {
			actionStatus.textContent = 'Select a user first.';
			return;
		}
		actionStatus.textContent = 'Setting trace flag...';
		vscode.postMessage({
			command: 'setTraceFlag',
			userId: userId,
			minutes: Number(durationSelect.value),
			debugLevelId: debugLevelSelect.value
		});
	});

	window.addEventListener('message', (event) => {
		const msg = event.data;
		if (!msg) {
			return;
		}
		if (msg.command === 'loading') {
			showMessage('Loading...');
		} else if (msg.command === 'users') {
			populateUsers(msg.users, msg.error);
		} else if (msg.command === 'debugLevels') {
			populateDebugLevels(msg.levels, msg.error);
		} else if (msg.command === 'actionResult') {
			actionStatus.textContent = msg.message || '';
		} else if (msg.command === 'data') {
			const count = msg.rows.length;
			const activeCount = msg.rows.filter((row) => !isExpired(row.expirationDate)).length;
			subtitle.textContent = msg.org + ' · ' + count + ' trace flag' + (count === 1 ? '' : 's')
				+ ' (' + activeCount + ' active) · as of ' + new Date().toLocaleString();
			if (count === 0) {
				showMessage('No trace flags found for any user.');
			} else {
				renderRows(msg.rows);
			}
		} else if (msg.command === 'error') {
			showMessage('Failed to load trace flags: ' + msg.message);
		}
	});

	vscode.postMessage({ command: 'ready' });
}());
