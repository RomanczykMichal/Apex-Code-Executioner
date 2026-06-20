# Salesforce Developer Toolbox

A set of everyday Salesforce developer tools in VS Code's side panel, driven by the [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`). A target-org picker sits at the top of the panel at all times; the tabs below switch between tools.

## Features

The extension adds a **Salesforce Developer Toolbox** view to the Activity Bar. A shared org picker at the top lists every org your `sf` CLI is connected to and is used by every tool. Your selection (and already-fetched data) is kept when you switch to another Activity Bar item and back.

### Anonymous Apex

- **Write Apex** in a syntax-highlighted editor (keywords, types, strings, comments, numbers, annotations, and inline SOQL keywords are colored to match your VS Code theme).
- **Execute** the code with one click — it's run via `sf apex run --target-org <org>` against the selected org.
- **Review the result** inline: compile errors, exceptions and stack traces, and the full debug log are shown directly in the panel (and mirrored to the "Salesforce Developer Toolbox" output channel).
- **Filter to `System.debug` output only** with the "System Debug Only" checkbox, which appears once a result is available, to cut through the noise of the full execution log.
- **Save the debug log** to a file with the "Save Log" button.

### Debug Logs Manager

The Debug Logs Manager tab has a **Manage Trace Flags** button and a **Log Entries** table.

**Manage Trace Flags** opens a dedicated editor page where you can:

- **Set a trace flag** for a user by choosing the user, a debug level (from the org's existing debug levels, defaulting to an auto-created `ApexExecutioner` level), and a duration.
- **Review every trace flag** (active and expired) for users in the org in a table showing the user, log type, debug level, start/expiry, and time left. Expired flags are dimmed.
- **Extend** an existing flag by the selected duration, or **Remove** it, right from its row. Use **Refresh** to re-query.

**Log Entries** lists the debug logs stored in the org (user, operation, status, size, time), with its own **Refresh** button:

- **Click a log** to open its full body on an editor page.
- **Search the log** with a built-in search bar: highlight all matches with a match counter, jump between them (▲/▼ or Enter / Shift+Enter), toggle case sensitivity, collapse to only matching lines, or filter to **System Debug Only** (`System.debug` output). VS Code's native find (`Ctrl+F`) also works in the log view.

## Requirements

- [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`) must be installed and on your `PATH`.
- You must already be authenticated to at least one org via the CLI (e.g. `sf org login web`) — the org picker only lists orgs with a `Connected` status.

## Known Issues/Future improvements

- Syntax highlighting uses a lightweight built-in tokenizer rather than a full Apex grammar, so some edge cases (e.g. nested string escapes) may be colored slightly differently than in the main editor.
- Trace flag management targets users only; trace flags on Apex classes or triggers are not shown or editable.