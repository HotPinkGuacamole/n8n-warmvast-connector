import type { IDataObject } from 'n8n-workflow';

import type {
	ITeamleaderCustomFieldValue,
	ITeamleaderEmail,
	ITeamleaderTelephone,
	ITeamleaderTypedAddress,
} from '../../helpers/interfaces';
import { cleanObject, extractCollection, toStringArray } from '../../helpers/utils';

/**
 * V2 payload builders.
 *
 * These read V2 parameter names only. V1 parameter paths are irrelevant here —
 * node versioning protects existing workflows, so the V2 UI is free to be shaped
 * around the business task instead of around the API body.
 */

/**
 * Merge a promoted primary e-mail with any extra addresses into the single
 * `emails` array the API accepts.
 *
 * Rules:
 *  - the promoted address always comes first and always carries type `primary`;
 *  - extra addresses are appended in order;
 *  - comparison is case-insensitive, so the same address never appears twice;
 *  - when nothing usable is given, `undefined` is returned so the key is omitted
 *    and Teamleader leaves the stored list alone.
 */
export function mergeEmails(options: {
	primary?: unknown;
	invoicing?: unknown;
	additional?: unknown;
	/** `invoicing` is only valid for companies. */
	allowInvoicing?: boolean;
}): ITeamleaderEmail[] | undefined {
	const emails: ITeamleaderEmail[] = [];
	const seen = new Set<string>();

	const push = (value: unknown, type: 'primary' | 'invoicing') => {
		const email = typeof value === 'string' ? value.trim() : '';
		if (!email) return;
		const key = email.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		emails.push({ type, email });
	};

	push(options.primary, 'primary');
	if (options.allowInvoicing) push(options.invoicing, 'invoicing');

	for (const extra of toStringArray(options.additional)) {
		push(extra, 'primary');
	}

	return emails.length > 0 ? emails : undefined;
}

/**
 * Merge a promoted phone number with any extra numbers.
 * Duplicate numbers (ignoring spaces and punctuation) are dropped.
 */
export function mergeTelephones(options: {
	primary?: unknown;
	primaryType?: unknown;
	additional?: unknown;
	fallbackType?: string;
}): ITeamleaderTelephone[] | undefined {
	const telephones: ITeamleaderTelephone[] = [];
	const seen = new Set<string>();
	const fallback = options.fallbackType ?? 'phone';

	const push = (rawNumber: unknown, rawType: unknown) => {
		const number = typeof rawNumber === 'string' ? rawNumber.trim() : '';
		if (!number) return;
		const key = number.replace(/[^0-9+]/g, '');
		if (key !== '' && seen.has(key)) return;
		if (key !== '') seen.add(key);
		const type = typeof rawType === 'string' && rawType !== '' ? rawType : fallback;
		telephones.push({ type, number });
	};

	push(options.primary, options.primaryType);

	for (const entry of extractCollection(options.additional, 'phone')) {
		push(entry.number, entry.type);
	}

	return telephones.length > 0 ? telephones : undefined;
}

function buildAddressBody(entry: IDataObject): IDataObject {
	return cleanObject({
		line_1: entry.line_1,
		postal_code: entry.postal_code,
		city: entry.city,
		country: entry.country,
		addressee: entry.addressee,
	});
}

/**
 * Merge the promoted invoicing address with any additional addresses.
 * The invoicing address is emitted first; a second `invoicing` entry coming from
 * the additional list is dropped so the same type is never sent twice.
 */
export function mergeAddresses(options: {
	invoicing?: unknown;
	additional?: unknown;
}): ITeamleaderTypedAddress[] | undefined {
	const addresses: ITeamleaderTypedAddress[] = [];
	let hasInvoicing = false;

	const invoicingEntries = extractCollection(options.invoicing, 'address');
	for (const entry of invoicingEntries) {
		const address = buildAddressBody(entry);
		if (Object.keys(address).length === 0) continue;
		addresses.push({ type: 'invoicing', address });
		hasInvoicing = true;
	}

	for (const entry of extractCollection(options.additional, 'address')) {
		const type = (entry.type as string) || 'primary';
		if (type === 'invoicing' && hasInvoicing) continue;
		const address = buildAddressBody(entry);
		if (Object.keys(address).length === 0) continue;
		// Teamleader rejects an addressee on a primary address.
		if (type === 'primary') delete address.addressee;
		addresses.push({ type, address });
	}

	return addresses.length > 0 ? addresses : undefined;
}

/**
 * Merge the existing-tag selector with the free-text New Tags input.
 * Values are trimmed, empties dropped and duplicates removed case-insensitively
 * while keeping the first spelling the user chose.
 */
export function mergeTags(existing: unknown, created?: unknown): string[] {
	const merged: string[] = [];
	const seen = new Set<string>();

	for (const tag of [...toStringArray(existing), ...toStringArray(created)]) {
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(tag);
	}

	return merged;
}

/** Build the `custom_fields` array from the V2 fixedCollection. */
export function buildCustomFieldValues(
	value: unknown,
): ITeamleaderCustomFieldValue[] | undefined {
	const entries = extractCollection(value, 'field')
		.filter((entry) => typeof entry.id === 'string' && (entry.id as string).trim().length > 0)
		.map((entry) => ({ id: (entry.id as string).trim(), value: entry.value ?? null }));

	return entries.length > 0 ? entries : undefined;
}

/**
 * Assign only the keys whose value is actually present.
 * Booleans and the number 0 are kept: an explicit `false` is a real value,
 * while an untouched string field means "do not change".
 */
export function assignIfPresent(
	target: IDataObject,
	source: Record<string, unknown>,
): IDataObject {
	for (const [key, value] of Object.entries(source)) {
		if (value === undefined || value === null || value === '') continue;
		target[key] = value as IDataObject[string];
	}
	return target;
}
