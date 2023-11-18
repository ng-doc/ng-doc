import { NgDocMemberType } from './typescript';

const EXCLUDING_RULES: RegExp[] = [/^ɵ/];

/**
 * Excludes from the passed array members that have names that are not important to the end user
 * @param members - List of members
 */
export function filterUselessMembers<T extends NgDocMemberType>(members: T[]): T[] {
	return members.filter(
		(member: T) => !EXCLUDING_RULES.every((rule: RegExp) => rule.test(member.getName())),
	);
}
