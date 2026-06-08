# Anonymous Apex Execution

Run anonymous Apex against your connected Salesforce orgs without leaving VS Code's side panel.

## Features

The extension adds an **Execute Anonymous Apex** view to the Activity Bar (rocket icon). From there you can:

- **Pick a target org** from a dropdown populated with the orgs your [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`) is currently connected to.
- **Write Apex** in a syntax-highlighted editor (keywords, types, strings, comments, numbers, annotations, and inline SOQL keywords are colored to match your VS Code theme).
- **Execute** the code with one click — it's run via `sf apex run --target-org <org>` against the selected org.
- **Review the result** inline: compile errors, exceptions and stack traces, and the full debug log are shown directly in the panel (and mirrored to the "Anonymous Apex Execution" output channel).
- **Filter to `System.debug` output only** with the "System Debug Only" checkbox, which appears once a result is available, to cut through the noise of the full execution log.

## Requirements

- [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`) must be installed and on your `PATH`.
- You must already be authenticated to at least one org via the CLI (e.g. `sf org login web`) — the org picker only lists orgs with a `Connected` status.

## Known Issues

- Syntax highlighting uses a lightweight built-in tokenizer rather than a full Apex grammar, so some edge cases (e.g. nested string escapes) may be colored slightly differently than in the main editor.

## Release Notes

### 0.0.1

Initial release: org picker, syntax-highlighted Apex editor, one-click execution, inline result/log view with debug-only filtering.
