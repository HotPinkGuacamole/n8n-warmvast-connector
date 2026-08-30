import type { IDataObject } from 'n8n-workflow';

import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import { resolveLookupDepartmentId } from '../nodes/Teamleader/helpers/lookupContext';
import {
	getDocumentLineProductCategories,
	getDocumentLineTaxRates,
	getQuotationTemplatesScoped,
	getTaxRates,
} from '../nodes/Teamleader/methods/loadOptions';

jest.mock('../nodes/Teamleader/helpers/GenericFunctions', () => {
	const actual = jest.requireActual('../nodes/Teamleader/helpers/GenericFunctions');
	return {
		...actual,
		teamleaderApiRequestAllItems: jest.fn(),
		teamleaderApiRequest: jest.fn(),
	};
});

const requestAll = generic.teamleaderApiRequestAllItems as unknown as jest.Mock;
const apiRequest = generic.teamleaderApiRequest as unknown as jest.Mock;

function makeContext(currentParameters: Record<string, unknown> = {}) {
	return {
		getCurrentNodeParameter: (name: string) => currentParameters[name],
	} as never;
}

const DEPARTMENTS = [
	{ id: 'dep-1', name: 'Insulation' },
	{ id: 'dep-2', name: 'Solar' },
];

/** `documentTemplates.list` answers per department; `departments.list` the roster. */
function mockTemplatesPerDepartment(perDepartment: Record<string, IDataObject[]>) {
	requestAll.mockImplementation(async (endpoint: string, body: IDataObject) => {
		if (endpoint === '/departments.list') return DEPARTMENTS;
		if (endpoint === '/documentTemplates.list') {
			const filter = body.filter as IDataObject;
			return perDepartment[filter.department_id as string] ?? [];
		}
		return [];
	});
}

beforeEach(() => {
	requestAll.mockReset();
	requestAll.mockResolvedValue([]);
	apiRequest.mockReset();
	apiRequest.mockResolvedValue({ data: {} });
});

/**
 * V2 Quotation has no Department field: the department is editor lookup context
 * only, derived from the deal or from the explicit Advanced override, and never
 * sent to Teamleader. These cover the three paths the UX promises — derived,
 * overridden, and none at all.
 */
describe('resolveLookupDepartmentId', () => {
	it('reads the explicit override first', async () => {
		const id = await resolveLookupDepartmentId(
			makeContext({
				'advancedOptions.lookupDepartmentId': 'dep-1',
				dealId: { mode: 'list', value: 'deal-1' },
			}),
		);

		expect(id).toBe('dep-1');
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('accepts a resource that owns a real Department field, such as Product', async () => {
		expect(await resolveLookupDepartmentId(makeContext({ departmentId: 'dep-7' }))).toBe('dep-7');
	});

	it('derives the department from a literal Deal with one deals.info read', async () => {
		apiRequest.mockResolvedValue({ data: { id: 'deal-1', department: { id: 'dep-2' } } });

		const id = await resolveLookupDepartmentId(
			makeContext({ dealId: { mode: 'list', value: 'deal-1' } }),
		);

		expect(id).toBe('dep-2');
		expect(apiRequest.mock.calls[0]).toEqual(['/deals.info', { id: 'deal-1' }]);
	});

	it('never sends an unresolved expression to the API as a literal ID', async () => {
		const id = await resolveLookupDepartmentId(
			makeContext({ dealId: { mode: 'id', value: '={{ $json.dealId }}' } }),
		);

		expect(id).toBeUndefined();
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('returns no context rather than breaking the dropdown when the deal cannot be read', async () => {
		apiRequest.mockRejectedValue(new Error('403 forbidden'));

		expect(
			await resolveLookupDepartmentId(makeContext({ dealId: { mode: 'list', value: 'deal-1' } })),
		).toBeUndefined();
	});

	it('returns no context when the deal carries no department', async () => {
		apiRequest.mockResolvedValue({ data: { id: 'deal-1' } });

		expect(
			await resolveLookupDepartmentId(makeContext({ dealId: { mode: 'list', value: 'deal-1' } })),
		).toBeUndefined();
	});
});

describe('getQuotationTemplatesScoped', () => {
	it('scopes the templates to the department of a literal Deal', async () => {
		apiRequest.mockResolvedValue({ data: { department: { id: 'dep-2' } } });
		mockTemplatesPerDepartment({ 'dep-2': [{ id: 'tpl-2', name: 'Solar offer' }] });

		const options = await getQuotationTemplatesScoped.call(
			makeContext({ dealId: { mode: 'list', value: 'deal-1' } }),
		);

		expect(requestAll.mock.calls[0]).toEqual([
			'/documentTemplates.list',
			{ filter: { department_id: 'dep-2', document_type: 'quotation', status: ['active'] } },
		]);
		// One department in scope, so no disambiguating prefix is needed.
		expect(options).toEqual([{ name: 'Solar offer', value: 'tpl-2' }]);
	});

	it('uses the explicit override in preference to the deal', async () => {
		mockTemplatesPerDepartment({ 'dep-1': [{ id: 'tpl-1', name: 'Insulation offer' }] });

		const options = await getQuotationTemplatesScoped.call(
			makeContext({
				dealId: { mode: 'list', value: 'deal-1' },
				'advancedOptions.lookupDepartmentId': 'dep-1',
			}),
		);

		expect(apiRequest).not.toHaveBeenCalled();
		expect(options).toEqual([{ name: 'Insulation offer', value: 'tpl-1' }]);
	});

	it('lists every department when there is no context, labelled so nothing is ambiguous', async () => {
		mockTemplatesPerDepartment({
			'dep-1': [{ id: 'tpl-1', name: 'Standard' }],
			'dep-2': [{ id: 'tpl-2', name: 'Standard' }],
		});

		const options = await getQuotationTemplatesScoped.call(makeContext({}));

		expect(options).toEqual([
			{ name: 'Insulation — Standard', value: 'tpl-1' },
			{ name: 'Solar — Standard', value: 'tpl-2' },
		]);
	});

	it('stays usable — never empty — when the Deal is an expression', async () => {
		mockTemplatesPerDepartment({ 'dep-1': [{ id: 'tpl-1', name: 'Standard' }] });

		const options = await getQuotationTemplatesScoped.call(
			makeContext({ dealId: { mode: 'id', value: '={{ $json.dealId }}' } }),
		);

		expect(options).toEqual([{ name: 'Insulation — Standard', value: 'tpl-1' }]);
	});

	it('falls back to the full list when the deal read fails', async () => {
		apiRequest.mockRejectedValue(new Error('403 forbidden'));
		mockTemplatesPerDepartment({ 'dep-1': [{ id: 'tpl-1', name: 'Standard' }] });

		const options = await getQuotationTemplatesScoped.call(
			makeContext({ dealId: { mode: 'list', value: 'deal-1' } }),
		);

		expect(options).toEqual([{ name: 'Insulation — Standard', value: 'tpl-1' }]);
	});
});

describe('document line tax rates and product categories', () => {
	it('scopes tax rates to the department derived from the Deal', async () => {
		apiRequest.mockResolvedValue({ data: { department: { id: 'dep-2' } } });
		requestAll.mockResolvedValue([{ id: 'tax-1', description: 'BTW', rate: 0.21 }]);

		const options = await getDocumentLineTaxRates.call(
			makeContext({ dealId: { mode: 'list', value: 'deal-1' } }),
		);

		expect(requestAll.mock.calls[0]).toEqual([
			'/taxRates.list',
			{ filter: { department_id: 'dep-2' } },
		]);
		expect(options).toEqual([{ name: 'BTW (21%)', value: 'tax-1' }]);
	});

	it('offers every tax rate, labelled by department, when nothing scopes it', async () => {
		requestAll.mockImplementation(async (endpoint: string) =>
			endpoint === '/departments.list'
				? [{ id: 'dep-1', name: 'Insulation' }]
				: [{ id: 'tax-1', description: 'BTW', rate: 0.21, department: { id: 'dep-1' } }],
		);

		const options = await getDocumentLineTaxRates.call(makeContext({}));

		expect(requestAll.mock.calls[0][1]).toEqual({});
		expect(options).toEqual([{ name: 'Insulation — BTW (21%)', value: 'tax-1' }]);
	});

	it('keeps plain labels when the entries expose no department', async () => {
		requestAll.mockResolvedValue([{ id: 'tax-1', description: 'BTW', rate: 0.21 }]);
		expect(await getDocumentLineTaxRates.call(makeContext({}))).toEqual([
			{ name: 'BTW (21%)', value: 'tax-1' },
		]);
	});

	it('scopes product categories the same way and stays usable unscoped', async () => {
		requestAll.mockResolvedValue([{ id: 'cat-1', name: 'Materials' }]);

		await getDocumentLineProductCategories.call(
			makeContext({ 'advancedOptions.lookupDepartmentId': 'dep-1' }),
		);
		expect(requestAll.mock.calls[0]).toEqual([
			'/productCategories.list',
			{ filter: { department_id: 'dep-1' } },
		]);

		requestAll.mockClear();
		expect(await getDocumentLineProductCategories.call(makeContext({}))).toEqual([
			{ name: 'Materials', value: 'cat-1' },
		]);
		expect(requestAll.mock.calls[0][1]).toEqual({});
	});

	it('leaves the plain getTaxRates loader (V1 and V2 Product) unchanged', async () => {
		requestAll.mockResolvedValue([{ id: 'tax-1', description: 'BTW', rate: 0.21 }]);

		const options = await getTaxRates.call(makeContext({ departmentId: 'dep-3' }));

		expect(requestAll.mock.calls[0]).toEqual([
			'/taxRates.list',
			{ filter: { department_id: 'dep-3' } },
		]);
		expect(options).toEqual([{ name: 'BTW (21%)', value: 'tax-1' }]);
		// It reads the parameter directly and never consults the deal.
		expect(apiRequest).not.toHaveBeenCalled();
	});
});
