import {
	TEAMLEADER_DATE_FIELDS,
	dateKindOf,
	toApiDateOnly,
	toApiTemporal,
	toApiTimestamp,
} from '../nodes/Teamleader/helpers/dates';
import { toApiDate } from '../nodes/Teamleader/helpers/utils';

describe('declared date semantics', () => {
	it('classifies known date-only fields', () => {
		for (const field of ['invoice_date', 'due_on', 'credit_note_date', 'estimated_closing_date', 'expires_after', 'on']) {
			expect(dateKindOf(field)).toBe('date');
		}
	});

	it('classifies known timestamp fields', () => {
		for (const field of ['paid_at', 'updated_since', 'created_before', 'started_at', 'ended_at']) {
			expect(dateKindOf(field)).toBe('timestamp');
		}
	});

	it('declares every field explicitly rather than guessing from the name', () => {
		expect(dateKindOf('some_unknown_date')).toBeUndefined();
		expect(() => toApiTemporal('some_unknown_date', '2026-01-01')).toThrow(
			/No date semantics declared/,
		);
		expect(Object.values(TEAMLEADER_DATE_FIELDS).every((kind) => kind === 'date' || kind === 'timestamp')).toBe(true);
	});
});

describe('toApiDateOnly', () => {
	it('takes a plain date verbatim without timezone shifting', () => {
		expect(toApiDateOnly('2026-03-01')).toBe('2026-03-01');
		expect(toApiDateOnly('2026-03-01T23:30:00+02:00')).toBe('2026-03-01');
	});

	it('converts Date objects and other parseable input', () => {
		expect(toApiDateOnly(new Date('2026-03-01T12:00:00Z'))).toBe('2026-03-01');
		expect(toApiDateOnly('March 1, 2026 12:00:00 UTC')).toBe('2026-03-01');
	});

	it('returns undefined for empty or unparseable input', () => {
		expect(toApiDateOnly('')).toBeUndefined();
		expect(toApiDateOnly(null)).toBeUndefined();
		expect(toApiDateOnly(undefined)).toBeUndefined();
		expect(toApiDateOnly('not a date')).toBeUndefined();
	});
});

describe('toApiTimestamp', () => {
	it('keeps the time of day instead of truncating it', () => {
		expect(toApiTimestamp('2026-03-01T14:45:30Z')).toBe('2026-03-01T14:45:30+00:00');
		expect(toApiTimestamp('2026-03-01T16:45:30+02:00')).toBe('2026-03-01T14:45:30+00:00');
	});

	it('treats a date-only value as midnight UTC', () => {
		expect(toApiTimestamp('2026-03-01')).toBe('2026-03-01T00:00:00+00:00');
	});

	it('returns undefined for empty or unparseable input', () => {
		expect(toApiTimestamp('')).toBeUndefined();
		expect(toApiTimestamp('nope')).toBeUndefined();
	});
});

describe('toApiTemporal dispatch', () => {
	it('uses the declared kind, not the value shape', () => {
		expect(toApiTemporal('invoice_date', '2026-03-01T14:45:30Z')).toBe('2026-03-01');
		expect(toApiTemporal('paid_at', '2026-03-01T14:45:30Z')).toBe('2026-03-01T14:45:30+00:00');
		expect(toApiTemporal('updated_since', '2026-03-01')).toBe('2026-03-01T00:00:00+00:00');
	});
});

describe('V1 date behaviour is preserved', () => {
	it('still truncates everything to a date, unchanged', () => {
		expect(toApiDate('2026-03-01T14:45:30Z')).toBe('2026-03-01');
		expect(toApiDate('2026-03-01')).toBe('2026-03-01');
		expect(toApiDate('')).toBeUndefined();
	});
});
