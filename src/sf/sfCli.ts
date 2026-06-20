import * as childProcess from 'child_process';

const MAX_BUFFER = 10 * 1024 * 1024;

// With shell:true, args are joined by spaces before being handed to cmd.exe, so any
// arg containing spaces (e.g. --query/--values strings) must be pre-wrapped in quotes
// by the caller. Use quoteArg() for those.
export function quoteArg(value: string): string {
	return `"${value}"`;
}

/**
 * Runs an `sf ... --json` command and returns its `result` payload.
 * Rejects with the CLI's error message when the command fails or produces no usable output.
 */
export function runSf<T>(args: string[]): Promise<T> {
	return new Promise((resolve, reject) => {
		childProcess.execFile(
			'sf',
			args,
			{ shell: true, maxBuffer: MAX_BUFFER },
			(error, stdout) => {
				// A maxBuffer overflow comes back as an error with truncated stdout, which
				// would otherwise fail JSON.parse and surface a misleading "could not parse"
				// message. Detect it and explain the real cause instead.
				const maxBufferExceeded = !!error && (
					(error as NodeJS.ErrnoException).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ||
					/maxBuffer/i.test(error.message)
				);
				if (maxBufferExceeded) {
					reject(new Error(
						'Salesforce CLI output exceeded the size limit. The log or query result is too large to display.'
					));
					return;
				}
				if (!stdout) {
					reject(error ?? new Error('No output from Salesforce CLI.'));
					return;
				}
				try {
					const parsed = JSON.parse(stdout);
					if (parsed.result === undefined) {
						reject(new Error(parsed.message ?? 'Salesforce CLI returned an error.'));
						return;
					}
					resolve(parsed.result as T);
				} catch {
					reject(error ?? new Error('Could not parse Salesforce CLI output.'));
				}
			}
		);
	});
}
