import {
	DEFAULT_PAGE_SIZE,
	buildAddresses,
	buildCustomFields,
	buildEmails,
	buildMoney,
	buildPage,
	buildSort,
	buildTelephones,
	cleanObject,
	describeApiError,
	extractCollection,
	formatTeamleaderErrors,
	isRetryableStatus,
	toStringArray,
} from '../nodes/Teamleader/helpers/utils';

describe('buildPage', () => {
	it('uses defaults when nothing is given', () => {
		expect(buildPage()).toEqual({ size: DEFAULT_PAGE_SIZE, number: 1 });
	});

	it('clamps the page size to the API maximum', () => {
		expect(buildPage(5000, 2)).toEqual({ size: 100, number: 2 });
	});

	it('never returns a size or number below 1', () => {
		expect(buildPage(0, 0)).toEqual({ size: 1, number: 1 });
		expect(buildPage(-10, -3)).toEqual({ size: 1, number: 1 });
	});

	it('truncates fractional values', () => {
		expect(buildPage(10.7, 3.9)).toEqual({ size: 10, number: 3 });
	});
});

describe('buildSort', () => {
	it('returns undefined when there is nothing to sort on', () => {
		expect(buildSort(undefined)).toBeUndefined();
		expect(buildSort([])).toBeUndefined();
		expect(buildSort([{ order: 'asc' }])).toBeUndefined();
	});

	it('maps rules and drops invalid orders', () => {
		expect(
			buildSort([
				{ field: 'name', order: 'desc' },
				{ field: 'added_at', order: 'sideways' },
			]),
		).toEqual([{ field: 'name', order: 'desc' }, { field: 'added_at' }]);
	});

	it('accepts a single object', () => {
		expect(buildSort({ field: 'name' })).toEqual([{ field: 'name' }]);
	});
});

describe('toStringArray', () => {
	it('splits comma and newline separated strings', () => {
		expect(toStringArray('expo, prospect\nlead')).toEqual(['expo', 'prospect', 'lead']);
	});

	it('handles arrays and empties', () => {
		expect(toStringArray(['a', ' b '])).toEqual(['a', 'b']);
		expect(toStringArray('')).toEqual([]);
		expect(toStringArray(undefined)).toEqual([]);
	});
});

describe('cleanObject', () => {
	it('removes empty values recursively', () => {
		expect(
			cleanObject({
				a: 'x',
				b: '',
				c: null,
				d: undefined,
				e: { f: '', g: 'y' },
				h: {},
				i: [],
				j: [1],
				k: false,
				l: 0,
			}),
		).toEqual({ a: 'x', e: { g: 'y' }, j: [1], k: false, l: 0 });
	});
});

describe('extractCollection', () => {
	it('unwraps fixedCollection shapes', () => {
		expect(extractCollection({ email: [{ email: 'a@b.c' }] }, 'email')).toEqual([
			{ email: 'a@b.c' },
		]);
		expect(extractCollection({ email: { email: 'a@b.c' } }, 'email')).toEqual([
			{ email: 'a@b.c' },
		]);
		expect(extractCollection([{ email: 'a@b.c' }], 'email')).toEqual([{ email: 'a@b.c' }]);
		expect(extractCollection(undefined, 'email')).toEqual([]);
	});
});

describe('buildEmails / buildTelephones', () => {
	it('maps emails and defaults the type', () => {
		expect(buildEmails({ email: [{ email: 'a@b.c' }, { type: 'invoicing', email: 'i@b.c' }] })).toEqual([
			{ type: 'primary', email: 'a@b.c' },
			{ type: 'invoicing', email: 'i@b.c' },
		]);
	});

	it('drops entries without an email', () => {
		expect(buildEmails({ email: [{ type: 'primary', email: '' }] })).toBeUndefined();
	});

	it('maps telephones', () => {
		expect(buildTelephones({ telephone: [{ type: 'mobile', number: '+32470' }] })).toEqual([
			{ type: 'mobile', number: '+32470' },
		]);
		expect(buildTelephones({ telephone: [{ number: '' }] })).toBeUndefined();
	});
});

describe('buildAddresses', () => {
	it('nests address fields and drops empty ones', () => {
		expect(
			buildAddresses({
				address: [
					{ type: 'invoicing', line_1: 'Main 1', city: 'Gent', country: 'BE', postal_code: '' },
					{ type: 'primary' },
				],
			}),
		).toEqual([
			{ type: 'invoicing', address: { line_1: 'Main 1', city: 'Gent', country: 'BE' } },
		]);
	});
});

describe('buildCustomFields', () => {
	it('maps id/value pairs and keeps null values', () => {
		expect(buildCustomFields({ field: [{ id: 'uuid-1', value: 'x' }, { id: 'uuid-2' }] })).toEqual([
			{ id: 'uuid-1', value: 'x' },
			{ id: 'uuid-2', value: null },
		]);
		expect(buildCustomFields({ field: [{ value: 'x' }] })).toBeUndefined();
	});
});

describe('buildMoney', () => {
	it('builds a money object and defaults the currency', () => {
		expect(buildMoney(10.5)).toEqual({ amount: 10.5, currency: 'EUR' });
		expect(buildMoney('20', 'USD')).toEqual({ amount: 20, currency: 'USD' });
	});

	it('returns undefined for unusable input', () => {
		expect(buildMoney('')).toBeUndefined();
		expect(buildMoney(undefined)).toBeUndefined();
		expect(buildMoney('abc')).toBeUndefined();
	});
});

describe('error formatting', () => {
	it('joins Teamleader error objects into one message', () => {
		expect(
			formatTeamleaderErrors([
				{ title: 'Company name must not be empty' },
				{ title: 'Invalid', detail: 'vat_number', source: { pointer: '/vat_number' } },
			]),
		).toBe('Company name must not be empty; Invalid: vat_number (/vat_number)');
	});

	it('returns undefined when there are no errors', () => {
		expect(formatTeamleaderErrors(undefined)).toBeUndefined();
		expect(formatTeamleaderErrors([])).toBeUndefined();
	});

	it('describes errors coming from the HTTP helper', () => {
		expect(
			describeApiError({ response: { body: { errors: [{ title: 'Not found' }] } } }),
		).toBe('Not found');
		expect(describeApiError({ message: 'socket hang up' })).toBe('socket hang up');
		expect(describeApiError({})).toBe('Unknown Teamleader API error');
	});
});

describe('isRetryableStatus', () => {
	it('retries rate limits and gateway errors only', () => {
		expect(isRetryableStatus(429)).toBe(true);
		expect(isRetryableStatus(503)).toBe(true);
		expect(isRetryableStatus(400)).toBe(false);
		expect(isRetryableStatus(undefined)).toBe(false);
	});
});
