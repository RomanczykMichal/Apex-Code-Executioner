import { quoteArg, runSf } from './sfCli';
import {
	ApexLogRow,
	DebugLevelOption,
	SfApexLog,
	SfActiveTraceFlag,
	SfDebugLevel,
	SfDebugLevelInfo,
	SfQueryResult,
	SfTraceFlag,
	SfUser,
	TraceFlagRow,
	UserOption
} from '../types';

// TracedEntityId prefix for User records; trace flags on other entities (classes,
// triggers) are out of scope for the "users with active trace flags" view.
const USER_ID_PREFIX = '005';

const DEBUG_LEVEL_NAME = 'ApexExecutioner';

// Salesforce rejects a trace flag whose window is 24h or more, so keep it strictly under.
const MAX_TRACE_DURATION_MS = 24 * 60 * 60 * 1000 - 60 * 1000;

/** The debug logs currently stored in the org, newest first. */
export async function listApexLogs(org: string): Promise<ApexLogRow[]> {
	const logs = await runSf<SfApexLog[]>(['apex', 'list', 'log', '--target-org', org, '--json']);
	return (logs ?? [])
		.map((log) => ({
			id: log.Id,
			user: log.LogUser?.Name ?? '',
			operation: log.Operation ?? '',
			status: log.Status ?? '',
			logLength: log.LogLength ?? 0,
			startTime: log.StartTime ?? ''
		}))
		.sort((a, b) => b.startTime.localeCompare(a.startTime));
}

/** The full text of a single debug log. */
export async function getApexLog(org: string, logId: string): Promise<string> {
	const result = await runSf<unknown>([
		'apex', 'get', 'log', '--log-id', logId, '--target-org', org, '--json'
	]);
	return extractLogText(result);
}

// `sf apex get log --json` has returned the body in a few shapes across CLI versions
// (a bare string, an array of strings, or an array/object with a `log` field), so be lenient.
function extractLogText(result: unknown): string {
	if (typeof result === 'string') {
		return result;
	}
	if (Array.isArray(result)) {
		return result.map((entry) => extractLogText(entry)).join('\n');
	}
	if (result && typeof result === 'object' && 'log' in result) {
		return String((result as { log: unknown }).log ?? '');
	}
	return '';
}

/** The org's debug levels, formatted for the debug-level picklist. */
export async function queryDebugLevels(org: string): Promise<DebugLevelOption[]> {
	const soql = 'SELECT Id, DeveloperName, MasterLabel FROM DebugLevel ORDER BY DeveloperName';
	const result = await runSf<SfQueryResult<SfDebugLevelInfo>>([
		'data', 'query', '--query', quoteArg(soql), '--use-tooling-api', '--target-org', org, '--json'
	]);
	return (result.records ?? []).map((level) => ({
		id: level.Id,
		label: level.DeveloperName,
		isDefault: level.DeveloperName === DEBUG_LEVEL_NAME
	}));
}

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

/**
 * All trace flags (active and expired) whose traced entity is a User, joined with the
 * user's name/username and the debug level label, ready to render as a table.
 */
export async function queryTraceFlagRows(org: string): Promise<TraceFlagRow[]> {
	const soql = 'SELECT Id, LogType, StartDate, ExpirationDate, TracedEntityId, DebugLevelId FROM TraceFlag ORDER BY ExpirationDate DESC';
	const result = await runSf<SfQueryResult<SfActiveTraceFlag>>([
		'data', 'query', '--query', quoteArg(soql), '--use-tooling-api', '--target-org', org, '--json'
	]);

	const flags = (result.records ?? []).filter((flag) => flag.TracedEntityId?.startsWith(USER_ID_PREFIX));
	if (flags.length === 0) {
		return [];
	}

	const userIds = [...new Set(flags.map((flag) => flag.TracedEntityId))];
	const debugLevelIds = [...new Set(flags.map((flag) => flag.DebugLevelId).filter(Boolean))];
	const [users, debugLevels] = await Promise.all([
		queryUsersByIds(org, userIds),
		queryDebugLevelsByIds(org, debugLevelIds)
	]);

	return flags.map((flag) => ({
		id: flag.Id,
		userName: users.get(flag.TracedEntityId)?.Name ?? flag.TracedEntityId,
		username: users.get(flag.TracedEntityId)?.Username ?? '',
		logType: flag.LogType,
		debugLevel: debugLevels.get(flag.DebugLevelId) ?? '',
		startDate: flag.StartDate,
		expirationDate: flag.ExpirationDate
	}));
}

async function queryUsersByIds(org: string, ids: string[]): Promise<Map<string, SfUser>> {
	if (ids.length === 0) {
		return new Map();
	}
	const inList = ids.map((id) => `'${id}'`).join(',');
	const soql = `SELECT Id, Name, Username FROM User WHERE Id IN (${inList})`;
	const result = await runSf<SfQueryResult<SfUser>>([
		'data', 'query', '--query', quoteArg(soql), '--target-org', org, '--json'
	]);
	return new Map((result.records ?? []).map((user) => [user.Id, user]));
}

async function queryDebugLevelsByIds(org: string, ids: string[]): Promise<Map<string, string>> {
	if (ids.length === 0) {
		return new Map();
	}
	const inList = ids.map((id) => `'${id}'`).join(',');
	const soql = `SELECT Id, MasterLabel, DeveloperName FROM DebugLevel WHERE Id IN (${inList})`;
	const result = await runSf<SfQueryResult<SfDebugLevelInfo>>([
		'data', 'query', '--query', quoteArg(soql), '--use-tooling-api', '--target-org', org, '--json'
	]);
	return new Map((result.records ?? []).map((level) => [level.Id, level.DeveloperName || level.MasterLabel]));
}

/**
 * Enables USER_DEBUG logging for a user for the given number of minutes and returns the
 * resulting expiration date. The trace flag uses the given debug level, falling back to a
 * shared auto-created "ApexExecutioner" level when none is supplied.
 *
 * Salesforce won't move an existing flag's StartDate, so updating only the ExpirationDate
 * keeps failing the "< 24h from StartDate" rule when the original StartDate is old. We
 * delete every existing USER_DEBUG flag for the user and create a fresh one whose window
 * is exactly the chosen duration.
 */
export async function setTraceFlag(org: string, userId: string, minutes: number, debugLevelId?: string): Promise<Date> {
	const levelId = debugLevelId || await getOrCreateDebugLevelId(org);
	const startDate = new Date();
	const durationMs = Math.min(minutes * 60 * 1000, MAX_TRACE_DURATION_MS);
	const expirationDate = new Date(startDate.getTime() + durationMs);

	await deleteTraceFlags(org, userId);

	const values = [
		`TracedEntityId=${userId}`,
		`DebugLevelId=${levelId}`,
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

/**
 * Extends an existing trace flag by the given number of minutes and returns the new
 * expiration date.
 *
 * Salesforce caps a flag's window at < 24h from its (immovable) StartDate, so when the
 * extension would still fit we just update ExpirationDate. When the StartDate is too old
 * for that, we renew the flag instead: delete it and recreate it with a fresh window
 * starting now (same entity, debug level, and log type).
 */
export async function extendTraceFlag(org: string, traceFlagId: string, minutes: number): Promise<Date> {
	const soql = `SELECT Id, LogType, StartDate, ExpirationDate, TracedEntityId, DebugLevelId FROM TraceFlag WHERE Id='${traceFlagId}'`;
	const result = await runSf<SfQueryResult<SfActiveTraceFlag>>([
		'data', 'query', '--query', quoteArg(soql), '--use-tooling-api', '--target-org', org, '--json'
	]);
	const flag = result.records?.[0];
	if (!flag) {
		throw new Error('Trace flag no longer exists.');
	}

	const durationMs = Math.min(minutes * 60 * 1000, MAX_TRACE_DURATION_MS);
	const now = Date.now();
	const currentExpiration = new Date(flag.ExpirationDate).getTime();
	// Extend from the current expiration if still active, otherwise from now.
	const base = currentExpiration > now ? currentExpiration : now;
	const target = new Date(base + durationMs);
	const maxExpiration = new Date(flag.StartDate).getTime() + MAX_TRACE_DURATION_MS;

	if (target.getTime() <= maxExpiration) {
		await runSf([
			'data', 'update', 'record', '--sobject', 'TraceFlag', '--use-tooling-api',
			'--target-org', org, '--record-id', flag.Id,
			'--values', quoteArg(`ExpirationDate=${target.toISOString()}`), '--json'
		]);
		return target;
	}

	await deleteTraceFlagById(org, flag.Id);
	const newExpiration = new Date(now + durationMs);
	const values = [
		`TracedEntityId=${flag.TracedEntityId}`,
		`DebugLevelId=${flag.DebugLevelId}`,
		`LogType=${flag.LogType}`,
		`StartDate=${new Date(now).toISOString()}`,
		`ExpirationDate=${newExpiration.toISOString()}`
	].join(' ');
	await runSf<{ id: string }>([
		'data', 'create', 'record', '--sobject', 'TraceFlag', '--use-tooling-api',
		'--target-org', org, '--values', quoteArg(values), '--json'
	]);
	return newExpiration;
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

/** Deletes a single trace flag by its record id. */
export async function deleteTraceFlagById(org: string, traceFlagId: string): Promise<void> {
	await runSf([
		'data', 'delete', 'record', '--sobject', 'TraceFlag', '--use-tooling-api',
		'--target-org', org, '--record-id', traceFlagId, '--json'
	]);
}

async function deleteTraceFlags(org: string, userId: string): Promise<void> {
	const soql = `SELECT Id FROM TraceFlag WHERE TracedEntityId='${userId}' AND LogType='USER_DEBUG'`;
	const result = await runSf<SfQueryResult<SfTraceFlag>>([
		'data', 'query', '--query', quoteArg(soql), '--use-tooling-api', '--target-org', org, '--json'
	]);
	for (const flag of result.records ?? []) {
		await deleteTraceFlagById(org, flag.Id);
	}
}
