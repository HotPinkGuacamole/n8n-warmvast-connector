import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import {
	getBusinessTypes,
	getCompanyCustomFieldDefinitions,
	getContactCustomFieldDefinitions,
	getDealPhases,
	getDealPhasesScoped,
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

describe('getDealPhasesScoped', () => {
	it('scopes to a single literal pipeline and preserves API order', async () => {
		requestAll.mockResolvedValueOnce([
			{ id: 'ph-2', name: 'Won' },
			{ id: 'ph-1', name: 'Proposal' },
		]);

		const options = await getDealPhasesScoped.call(makeContext({ pipelineId: 'pipe-1' }));

		expect(requestAll.mock.calls[0]).toEqual([
			'/dealPhases.list',
			{ filter: { deal_pipeline_id: 'pipe-1' } },
		]);
		expect(options).toEqual([
			{ name: 'Won', value: 'ph-2' },
			{ name: 'Proposal', value: 'ph-1' },
		]);
	});

	it('scopes to the single pipeline from filters.pipelineIds when exactly one is selected', async () => {
		requestAll.mockResolvedValueOnce([{ id: 'ph-1', name: 'Proposal' }]);
		await getDealPhasesScoped.call(makeContext({ 'filters.pipelineIds': ['pipe-9'] }));
		expect(requestAll.mock.calls[0][1]).toEqual({ filter: { deal_pipeline_id: 'pipe-9' } });
	});

	it('lists every phase prefixed with its pipeline name when no pipeline is selected', async () => {
		requestAll.mockImplementation(async (endpoint: string) => {
			if (endpoint === '/dealPhases.list') {
				return [
					{ id: 'ph-2', name: 'Won', deal_pipeline: { id: 'pipe-1' } },
					{ id: 'ph-1', name: 'Proposal', deal_pipeline: { id: 'pipe-1' } },
				];
			}
			return [{ id: 'pipe-1', name: 'Sales' }];
		});

		const options = await getDealPhasesScoped.call(makeContext({}));

		// Order preserved exactly as returned by the API, never alphabetised.
		expect(options).toEqual([
			{ name: 'Sales — Won', value: 'ph-2' },
			{ name: 'Sales — Proposal', value: 'ph-1' },
		]);
	});

	it('falls back to the unscoped list when multiple pipelines are selected', async () => {
		requestAll.mockImplementation(async (endpoint: string) =>
			endpoint === '/dealPhases.list' ? [{ id: 'ph-1', name: 'Proposal' }] : [],
		);
		const options = await getDealPhasesScoped.call(
			makeContext({ 'filters.pipelineIds': ['pipe-1', 'pipe-2'] }),
		);
		expect(options).toEqual([{ name: 'Proposal', value: 'ph-1' }]);
	});

	it('stays usable when the pipeline scope is an unresolved expression', async () => {
		requestAll.mockImplementation(async (endpoint: string) =>
			endpoint === '/dealPhases.list' ? [{ id: 'ph-1', name: 'Proposal' }] : [],
		);
		const options = await getDealPhasesScoped.call(
			makeContext({ pipelineId: '={{ $json.pipeline }}' }),
		);
		expect(options.length).toBeGreaterThan(0);
	});

	it('does not change the V1 getDealPhases loader, which stays unscoped-and-unprefixed with no pipeline', async () => {
		requestAll.mockResolvedValueOnce([{ id: 'ph-1', name: 'Proposal' }]);
		const options = await getDealPhases.call(makeContext({}));
		expect(options).toEqual([{ name: 'Proposal', value: 'ph-1' }]);
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
