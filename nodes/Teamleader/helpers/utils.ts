import type { IDataObject } from 'n8n-workflow';

import type {
	ITeamleaderCustomFieldValue,
	ITeamleaderEmail,
	ITeamleaderError,
	ITeamleaderMoney,
	ITeamleaderPage,
	ITeamleaderReference,
	ITeamleaderSort,
	ITeamleaderTelephone,
	ITeamleaderTypedAddress,
} from './interfaces';

/** Default and maximum page size accepted by the Teamleader API. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Build a valid Teamleader `page` object, clamping to the supported range. */
export function buildPage(size?: number, pageNumber = 1): ITeamleaderPage {
	const rawSize = typeof size === 'number' && !Number.isNaN(size) ? size : DEFAULT_PAGE_SIZE;
	return {
		size: Math.min(Math.max(Math.trunc(rawSize), 1), MAX_PAGE_SIZE),
		number: Math.max(Math.trunc(pageNumber) || 1, 1),
	};
}

/**
 * Normalise a `sort` UI value (fixedCollection) into the array the API expects.
 * Returns undefined when nothing usable was provided, so the key can be omitted.
 */
export function buildSort(value: unknown): ITeamleaderSort[] | undefined {
	const entries = Array.isArray(value) ? value : value ? [value] : [];

	const sort = entries
		.map((entry) => entry as IDataObject)
		.filter((entry) => typeof entry?.field === 'string' && (entry.field as string).length > 0)
		.map((entry) => {
			const item: ITeamleaderSort = { field: entry.field as string };
			if (entry.order === 'asc' || entry.order === 'desc') {
				item.order = entry.order;
			}
			return item;
		});

	return sort.length > 0 ? sort : undefined;
}

/** Split a comma/newline separated string (or pass an array through) into a trimmed string array. */
export function toStringArray(value: unknown): string[] {
	if (value === undefined || value === null || value === '') return [];
	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
	}
	return String(value)
		.split(/[\n,]/)
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

/** Remove undefined, null and empty-string values (recursively for plain objects). */
export function cleanObject<T extends IDataObject>(input: T): IDataObject {
	const output: IDataObject = {};

	for (const [key, value] of Object.entries(input)) {
		if (value === undefined || value === null || value === '') continue;

		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			output[key] = value;
			continue;
		}

		if (typeof value === 'object') {
			const nested = cleanObject(value as IDataObject);
			if (Object.keys(nested).length === 0) continue;
			output[key] = nested;
			continue;
		}

		output[key] = value;
	}

	return output;
}

/** Convert an emails fixedCollection value into the API shape. */
export function buildEmails(value: unknown): ITeamleaderEmail[] | undefined {
	const raw = extractCollection(value, 'email');
	const emails = raw
		.filter((item) => typeof item.email === 'string' && (item.email as string).length > 0)
		.map((item) => ({
			type: (item.type as string) || 'primary',
			email: item.email as string,
		}));
	return emails.length > 0 ? emails : undefined;
}

/** Convert a telephones fixedCollection value into the API shape. */
export function buildTelephones(value: unknown): ITeamleaderTelephone[] | undefined {
	const raw = extractCollection(value, 'telephone');
	const telephones = raw
		.filter((item) => typeof item.number === 'string' && (item.number as string).length > 0)
		.map((item) => ({
			type: (item.type as string) || 'phone',
			number: item.number as string,
		}));
	return telephones.length > 0 ? telephones : undefined;
}

/** Convert an addresses fixedCollection value into the API shape. */
export function buildAddresses(value: unknown): ITeamleaderTypedAddress[] | undefined {
	const raw = extractCollection(value, 'address');

	const addresses = raw
		.map((item) => {
			const address = cleanObject({
				line_1: item.line_1,
				postal_code: item.postal_code,
				city: item.city,
				country: item.country,
				area_level_two_id: item.area_level_two_id,
				addressee: item.addressee,
			} as IDataObject);

			return {
				type: (item.type as string) || 'primary',
				address,
			} as ITeamleaderTypedAddress;
		})
		.filter((item) => Object.keys(item.address).length > 0);

	return addresses.length > 0 ? addresses : undefined;
}

/** Convert a custom fields fixedCollection value into the API shape. */
export function buildCustomFields(value: unknown): ITeamleaderCustomFieldValue[] | undefined {
	const raw = extractCollection(value, 'field');
	const fields = raw
		.filter((item) => typeof item.id === 'string' && (item.id as string).length > 0)
		.map((item) => ({ id: item.id as string, value: item.value ?? null }));
	return fields.length > 0 ? fields : undefined;
}

/**
 * fixedCollection values arrive as `{ <innerName>: [ ... ] }` (multipleValues)
 * or as a bare array/object. This normalises all shapes to an array of objects.
 */
export function extractCollection(value: unknown, innerName: string): IDataObject[] {
	if (!value) return [];
	if (Array.isArray(value)) return value as IDataObject[];

	const asObject = value as IDataObject;
	const inner = asObject[innerName];

	if (Array.isArray(inner)) return inner as IDataObject[];
	if (inner && typeof inner === 'object') return [inner as IDataObject];

	return Object.keys(asObject).length > 0 ? [asObject] : [];
}

/** Build a Money object; returns undefined when no usable amount was given. */
export function buildMoney(amount: unknown, currency?: string): ITeamleaderMoney | undefined {
	if (amount === undefined || amount === null || amount === '') return undefined;
	const parsed = typeof amount === 'number' ? amount : Number(amount);
	if (Number.isNaN(parsed)) return undefined;
	return { amount: parsed, currency: currency && currency !== '' ? currency : 'EUR' };
}

/** Build a customer reference `{ type, id }` as used by the deal `lead` object. */
export function buildCustomer(type: unknown, id: unknown): ITeamleaderReference | undefined {
	const customerId = typeof id === 'string' ? id.trim() : '';
	if (!customerId) return undefined;
	return { type: type === 'contact' ? 'contact' : 'company', id: customerId };
}

/** Format a date(-time) value as the `YYYY-MM-DD` string the API expects. */
export function toApiDate(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const asString = String(value);
	const match = asString.match(/^\d{4}-\d{2}-\d{2}/);
	if (match) return match[0];
	const parsed = new Date(asString);
	if (Number.isNaN(parsed.getTime())) return undefined;
	return parsed.toISOString().slice(0, 10);
}

/** Turn the Teamleader `errors` array into a single readable message. */
export function formatTeamleaderErrors(errors: ITeamleaderError[] | undefined): string | undefined {
	if (!Array.isArray(errors) || errors.length === 0) return undefined;

	return errors
		.map((error) => {
			const parts = [error.title, error.detail].filter(
				(part): part is string => typeof part === 'string' && part.length > 0,
			);
			const pointer =
				error.source && typeof error.source.pointer === 'string' ? ` (${error.source.pointer})` : '';
			return `${parts.join(': ') || error.code || 'Unknown error'}${pointer}`;
		})
		.join('; ');
}

/** Extract a readable message from any error thrown by the request helper. */
export function describeApiError(error: unknown): string {
	const err = error as IDataObject & { message?: string };
	const body = ((err?.response as IDataObject)?.body ?? err?.error ?? err?.body) as
		| IDataObject
		| undefined;

	const fromErrors = formatTeamleaderErrors(body?.errors as ITeamleaderError[] | undefined);
	if (fromErrors) return fromErrors;

	if (typeof body?.message === 'string') return body.message;
	if (typeof err?.message === 'string') return err.message;
	return 'Unknown Teamleader API error';
}

/** True when a failed request may be retried (rate limiting or transient server error). */
export function isRetryableStatus(statusCode: number | undefined): boolean {
	if (statusCode === undefined) return false;
	return statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504;
}
