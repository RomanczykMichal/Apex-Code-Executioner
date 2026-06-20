import { runSf } from './sfCli';
import { OrgOption, SfOrg } from '../types';

/**
 * Returns the connected orgs known to the Salesforce CLI, deduped by username.
 * A single org can appear in several groups of `sf org list` output (e.g. a Dev Hub
 * shows up in both "devHubs" and "nonScratchOrgs"), so dedupe by username.
 */
export async function listConnectedOrgs(): Promise<SfOrg[]> {
	const groups = await runSf<Record<string, SfOrg[]>>(['org', 'list', '--json']);
	const byUsername = new Map<string, SfOrg>();
	for (const org of Object.values(groups).flat()) {
		if (org.connectedStatus === 'Connected' && !byUsername.has(org.username)) {
			byUsername.set(org.username, org);
		}
	}
	return [...byUsername.values()];
}

export function toOrgOptions(orgs: SfOrg[]): OrgOption[] {
	return orgs.map((org) => ({
		label: org.alias ? `${org.alias} (${org.username})` : org.username,
		username: org.username
	}));
}
