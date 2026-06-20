import { quoteArg, runSf } from './sfCli';
import { SfDebugLevel, SfQueryResult, SfTraceFlag, SfUser, UserOption } from '../types';

const DEBUG_LEVEL_NAME = 'ApexExecutioner';

// Salesforce rejects a trace flag whose window is 24h or more, so keep it strictly under.
const MAX_TRACE_DURATION_MS = 24 * 60 * 60 * 1000 - 60 * 1000;

/** Active users in the org, formatted for the user picklist. */
export async function queryActiveUsers(org: string): Promise<UserOption[]> {
	const soql = 'SELECT Id, Name, Username FROM User WHERE IsActive = true ORDER BY Name LIMIT 200';
	const result = await runSf<SfQueryResult<SfUser>>([
		'data', 'query', '--query', quoteArg(soql), '--target-org', org, '--json'
	]);
	return (result.records ?? []).map((user) => ({
		id: user.Id,
		label: `${user.Name} (${user.Username})`
	}));
}

/** The most recent USER_DEBUG trace flag for a user, if any. */
export async function queryTraceFlag(org: string, userId: string): Promise<SfTraceFlag | undefined> {
	const soql = `SELECT Id, ExpirationDate FROM TraceFlag WHERE TracedEntityId='${userId}' AND LogType='USER_DEBUG' ORDER BY ExpirationDate DESC LIMIT 1`;
	const result = await runSf<SfQueryResult<SfTraceFlag>>([
		'data', 'query', '--query', quoteArg(soql), '--use-tooling-api', '--target-org', org, '--json'
	]);
	return result.records?.[0];
}

/**
 * Enables USER_DEBUG logging for a user for the given number of minutes and returns the
 * resulting expiration date.
 *
 * Salesforce won't move an existing flag's StartDate, so updating only the ExpirationDate
 * keeps failing the "< 24h from StartDate" rule when the original StartDate is old. We
 * delete every existing USER_DEBUG flag for the user and create a fresh one whose window
 * is exactly the chosen duration.
 */
export async function setTraceFlag(org: string, userId: string, minutes: number): Promise<Date> {
	const debugLevelId = await getOrCreateDebugLevelId(org);
	const startDate = new Date();
	const durationMs = Math.min(minutes * 60 * 1000, MAX_TRACE_DURATION_MS);
	const expirationDate = new Date(startDate.getTime() + durationMs);

	await deleteTraceFlags(org, userId);

	const values = [
		`TracedEntityId=${userId}`,
		`DebugLevelId=${debugLevelId}`,
		'LogType=USER_DEBUG',
		`StartDate=${startDate.toISOString()}`,
		`ExpirationDate=${expirationDate.toISOString()}`
	].join(' ');
	await runSf<{ id: string }>([
		'data', 'create', 'record', '--sobject', 'TraceFlag', '--use-tooling-api',
		'--target-org', org, '--values', quoteArg(values), '--json'
	]);

	return expirationDate;
}

async function getOrCreateDebugLevelId(org: string): Promise<string> {
	const soql = `SELECT Id FROM DebugLevel WHERE DeveloperName='${DEBUG_LEVEL_NAME}'`;
	const existing = await runSf<SfQueryResult<SfDebugLevel>>([
		'data', 'query', '--query', quoteArg(soql), '--use-tooling-api', '--target-org', org, '--json'
	]);
	if (existing.records && existing.records.length > 0) {
		return existing.records[0].Id;
	}

	const values = [
		`DeveloperName=${DEBUG_LEVEL_NAME}`,
		`MasterLabel=${DEBUG_LEVEL_NAME}`,
		'ApexCode=FINEST',
		'ApexProfiling=FINEST',
		'Callout=FINEST',
		'Database=FINEST',
		'System=FINE',
		'Validation=INFO',
		'Visualforce=FINER',
		'Workflow=FINER'
	].join(' ');
	const created = await runSf<{ id: string }>([
		'data', 'create', 'record', '--sobject', 'DebugLevel', '--use-tooling-api',
		'--target-org', org, '--values', quoteArg(values), '--json'
	]);
	return created.id;
}

async function deleteTraceFlags(org: string, userId: string): Promise<void> {
	const soql = `SELECT Id FROM TraceFlag WHERE TracedEntityId='${userId}' AND LogType='USER_DEBUG'`;
	const result = await runSf<SfQueryResult<SfTraceFlag>>([
		'data', 'query', '--query', quoteArg(soql), '--use-tooling-api', '--target-org', org, '--json'
	]);
	for (const flag of result.records ?? []) {
		await runSf([
			'data', 'delete', 'record', '--sobject', 'TraceFlag', '--use-tooling-api',
			'--target-org', org, '--record-id', flag.Id, '--json'
		]);
	}
}
