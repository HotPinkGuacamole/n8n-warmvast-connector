/**
 * Teamleader date semantics.
 *
 * The API mixes two distinct kinds of temporal fields and they must never be
 * converted with the same function:
 *
 *   - DATE fields  -> `YYYY-MM-DD`            (e.g. `invoice_date`, `due_on`)
 *   - TIMESTAMP    -> ISO 8601 with offset    (e.g. `paid_at`, `updated_since`)
 *
 * V1 collapsed everything to `YYYY-MM-DD` through `toApiDate()`, which silently
 * truncated timestamp filters. V2 uses the declared table below instead of
 * guessing from a field name at call time — every field a V2 operation sends is
 * looked up here, and an unknown field is a build-time omission, not a fallback.
 *
 * `toApiDate()` in helpers/utils.ts stays untouched so V1 behaviour is preserved.
 */

export type TeamleaderDateKind = 'date' | 'timestamp';

/**
 * Declared kind per Teamleader API field name, sourced from the official API
 * blueprint. Keys are the API field names (snake_case) as sent in request bodies.
 */
export const TEAMLEADER_DATE_FIELDS: Readonly<Record<string, TeamleaderDateKind>> = {
	// --- Date-only fields (YYYY-MM-DD) ---
	invoice_date: 'date',
	due_on: 'date',
	credit_note_date: 'date',
	estimated_closing_date: 'date',
	expires_after: 'date',
	purchase_date: 'date',
	// `invoices.book` takes the book date as `on`
	on: 'date',

	// --- True timestamps (ISO 8601 with offset) ---
	paid_at: 'timestamp',
	updated_since: 'timestamp',
	created_before: 'timestamp',
	created_after: 'timestamp',
	started_at: 'timestamp',
	ended_at: 'timestamp',
};

/** Look up the declared kind of an API field, or undefined when not declared. */
export function dateKindOf(apiField: string): TeamleaderDateKind | undefined {
	return TEAMLEADER_DATE_FIELDS[apiField];
}

function parse(value: unknown): Date | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;

	const asString = String(value).trim();
	if (asString === '') return undefined;

	const parsed = new Date(asString);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Format a value as a date-only `YYYY-MM-DD` string.
 * A value that already starts with a date is taken verbatim, so a user-entered
 * `2026-03-01` never shifts a day because of timezone conversion.
 */
export function toApiDateOnly(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;

	if (!(value instanceof Date)) {
		const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
		if (match) return match[1];
	}

	const parsed = parse(value);
	if (!parsed) return undefined;
	return parsed.toISOString().slice(0, 10);
}

/**
 * Format a value as a full ISO 8601 timestamp with an explicit UTC offset,
 * e.g. `2026-03-01T09:30:00+00:00`, which is what the API documents.
 * A date-only input is treated as midnight UTC on that day.
 */
export function toApiTimestamp(value: unknown): string | undefined {
	const parsed = parse(value);
	if (!parsed) return undefined;
	return `${parsed.toISOString().slice(0, 19)}+00:00`;
}

/**
 * Convert `value` according to the declared kind of `apiField`.
 * Throws for an undeclared field so a missing table entry surfaces during
 * development instead of silently truncating a timestamp.
 */
export function toApiTemporal(apiField: string, value: unknown): string | undefined {
	const kind = dateKindOf(apiField);
	if (kind === undefined) {
		throw new Error(
			`No date semantics declared for Teamleader field "${apiField}". Add it to TEAMLEADER_DATE_FIELDS.`,
		);
	}
	return kind === 'date' ? toApiDateOnly(value) : toApiTimestamp(value);
}
