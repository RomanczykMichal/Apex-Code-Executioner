// Shared types used across the extension and the Salesforce CLI service layer.

export interface ApexRunResult {
	success: boolean;
	compiled: boolean;
	compileProblem: string;
	exceptionMessage: string;
	exceptionStackTrace: string;
	line: number;
	column: number;
	logs: string;
}

export interface SfOrg {
	username: string;
	alias?: string;
	connectedStatus: string;
}

export interface OrgOption {
	label: string;
	username: string;
}

export interface SfUser {
	Id: string;
	Name: string;
	Username: string;
}

export interface UserOption {
	id: string;
	label: string;
}

export interface SfQueryResult<T> {
	records: T[];
}

export interface SfDebugLevel {
	Id: string;
}

export interface SfTraceFlag {
	Id: string;
	ExpirationDate: string;
}

export interface SfActiveTraceFlag {
	Id: string;
	LogType: string;
	StartDate: string;
	ExpirationDate: string;
	TracedEntityId: string;
	DebugLevelId: string;
}

export interface SfDebugLevelInfo {
	Id: string;
	MasterLabel: string;
	DeveloperName: string;
}

export interface DebugLevelOption {
	id: string;
	label: string;
	isDefault: boolean;
}

export interface SfApexLog {
	Id: string;
	LogLength: number;
	Operation: string;
	Application: string;
	Status: string;
	DurationMilliseconds: number;
	StartTime: string;
	LogUser?: { Name: string };
}

/** A flattened row for the Log Entries table. */
export interface ApexLogRow {
	id: string;
	user: string;
	operation: string;
	status: string;
	logLength: number;
	startTime: string;
}

/** A flattened row for the Trace Flags table (active and expired). */
export interface TraceFlagRow {
	id: string;
	userName: string;
	username: string;
	logType: string;
	debugLevel: string;
	startDate: string;
	expirationDate: string;
}
