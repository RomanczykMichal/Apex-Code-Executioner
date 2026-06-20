import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runSf } from './sfCli';
import { ApexRunResult } from '../types';

/**
 * Executes anonymous Apex against an org. The code is written to a temp file because
 * `sf apex run --file` is more robust than passing source on the command line.
 */
export async function runAnonymousApex(org: string, code: string): Promise<ApexRunResult> {
	const tempFile = path.join(os.tmpdir(), `anonymous-apex-${crypto.randomUUID()}.apex`);
	try {
		fs.writeFileSync(tempFile, code, 'utf8');
		return await runSf<ApexRunResult>(['apex', 'run', '--target-org', org, '--file', tempFile, '--json']);
	} finally {
		fs.rm(tempFile, { force: true }, () => undefined);
	}
}

export function summarize(result: ApexRunResult): string {
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

export function formatResult(result: ApexRunResult): string {
	const lines = [summarize(result)];
	if (result.logs) {
		lines.push('', result.logs);
	}
	return lines.join('\n');
}
