import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import {
	getBusinessTypes,
	getCompanyCustomFieldDefinitions,
	getContactCustomFieldDefinitions,
	getTags,
} from '../nodes/Teamleader/methods/loadOptions';

jest.mock('../nodes/Teamleader/helpers/GenericFunctions', () => {
	const actual = jest.requireActual('../nodes/Teamleader/helpers/GenericFunctions');
	return { ...actual, teamleaderApiRequestAllItems: jest.fn() };
});

const requestAll = generic.teamleaderApiRequestAllItems as unknown as jest.Mock;

function makeContext(currentParameters: Record<string, unknown> = {}) {
	return {
		getCurrentNodeParameter: (name: string) => currentParameters[name],
	} as never;
}

beforeEach(() => {
	requestAll.mockReset();
	requestAll.mockResolvedValue([]);
});

describe('custom field definition loaders', () => {
	it('asks Teamleader for contact definitions only', async () => {
		requestAll.mockResolvedValueOnce([
			{ id: 'cf-1', label: 'Roof type', context: 'contact' },
		]);

		const options = await getContactCustomFieldDefinitions.call(makeContext());

		expect(requestAll.mock.calls[0][0]).toBe('/customFieldDefinitions.list');
		expect(requestAll.mock.calls[0][1]).toEqual({ filter: { context: 'contact' } });
		// No "[context]" suffix is needed when everything belongs to one context.
		expect(options).toEqual([{ name: 'Roof type', value: 'cf-1' }]);
	});

	it('asks Teamleader for company definitions only', async () => {
		await getCompanyCustomFieldDefinitions.call(makeContext());
		expect(requestAll.mock.calls[0][1]).toEqual({ filter: { context: 'company' } });
	});
});

describe('getBusinessTypes', () => {
	it('scopes the lookup to the selected country', async () => {
		await getBusinessTypes.call(makeContext({ businessTypeCountry: 'NL' }));
		expect(requestAll.mock.calls[0][1]).toEqual({ country: 'NL' });
	});

	it('changes with the country', async () => {
		await getBusinessTypes.call(makeContext({ businessTypeCountry: 'BE' }));
		await getBusinessTypes.call(makeContext({ businessTypeCountry: 'FR' }));
		expect(requestAll.mock.calls[0][1]).toEqual({ country: 'BE' });
		expect(requestAll.mock.calls[1][1]).toEqual({ country: 'FR' });
	});

	it('still reads the V1 nested parameter path', async () => {
		await getBusinessTypes.call(makeContext({ 'additionalFields.businessTypeCountry': 'DE' }));
		expect(requestAll.mock.calls[0][1]).toEqual({ country: 'DE' });
	});

	it('falls back to BE for an unusable value such as an unresolved expression', async () => {
		await getBusinessTypes.call(makeContext({ businessTypeCountry: '={{ $json.country }}' }));
		expect(requestAll.mock.calls[0][1]).toEqual({ country: 'BE' });
	});
});

describe('getTags', () => {
	it('returns tag names as both label and value', async () => {
		requestAll.mockResolvedValueOnce([{ name: 'prospect' }, { name: 'expo' }]);
		const options = await getTags.call(makeContext());
		expect(options).toEqual([
			{ name: 'expo', value: 'expo' },
			{ name: 'prospect', value: 'prospect' },
		]);
	});
});
