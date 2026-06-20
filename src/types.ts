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
