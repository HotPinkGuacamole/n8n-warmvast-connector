import type { IDataObject, INodeProperties } from 'n8n-workflow';

import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import { Teamleader } from '../nodes/Teamleader/Teamleader.node';
import {
	quotationOperations as v1QuotationOperations,
} from '../nodes/Teamleader/v1/descriptions/QuotationDescription';
import {
	buildCommercialDiscounts,
	buildQuotationCurrency,
	buildQuotationExpiry,
	executeQuotation,
} from '../nodes/Teamleader/v2/actions/quotation';
import {
	quotationFields,
	quotationOperations,
} from '../nodes/Teamleader/v2/descriptions/QuotationDescription';
import { TeamleaderExecutionContext } from '../nodes/Teamleader/helpers/context';
import { searchQuotations } from '../nodes/Teamleader/methods/listSearch';

jest.mock('../nodes/Teamleader/helpers/GenericFunctions', () => {
	const actual = jest.requireActual('../nodes/Teamleader/helpers/GenericFunctions');
	return {
		...actual,
		teamleaderApiRequest: jest.fn(),
		teamleaderFetchList: jest.fn(),
	};
});

const apiRequest = generic.teamleaderApiRequest as unknown as jest.Mock;
const fetchList = generic.teamleaderFetchList as unknown as jest.Mock;

function makeContext(parameters: IDataObject) {
	return {
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			parameters[name] !== undefined ? parameters[name] : fallback,
		getNode: () => ({ name: 'Teamleader' }),
	} as never;
}

/** Run one V2 Quotation operation with a fresh per-execution context. */
async function run(operation: string, parameters: IDataObject) {
	return await executeQuotation.call(
		makeContext(parameters),
		operation,
		0,
		new TeamleaderExecutionContext(),
	);
}

/** The request body of the nth API call. */
const bodyOf = (call = 0) => apiRequest.mock.calls[call][1] as IDataObject;
const endpointOf = (call = 0) => apiRequest.mock.calls[call][0] as string;

const forOperation = (operation: string) =>
	quotationFields.filter((field) =>
		(field.displayOptions?.show?.operation as string[] | undefined)?.includes(operation),
	);

const names = (fields: INodeProperties[]) => fields.map((field) => field.name);

/** A single simple `Lines` entry as the fixedCollection stores it. */
const simpleLines = (...lines: IDataObject[]) => ({ line: lines });

const customLine = (overrides: IDataObject = {}): IDataObject => ({
	lineType: 'custom',
	description: 'Labour',
	quantity: 2,
	unitPrice: 50,
	taxRateId: 'tax-1',
	lineOptions: {},
	...overrides,
});

const productLine = (overrides: IDataObject = {}): IDataObject => ({
	lineType: 'product',
	productId: { mode: 'list', value: 'product-1' },
	useProductDefaults: true,
	quantity: 3,
	lineOptions: {},
	...overrides,
});

const PRODUCT_RESPONSE = {
	data: {
		id: 'product-1',
		name: 'Roof insulation',
		description: 'Per m²',
		selling_price: { amount: 25, currency: 'EUR' },
		purchase_price: { amount: 10, currency: 'EUR' },
		tax_rate: { id: 'tax-product' },
		unit_of_measure: { id: 'unit-1' },
	},
};

beforeEach(() => {
	apiRequest.mockReset();
	fetchList.mockReset();
	apiRequest.mockResolvedValue({ data: { type: 'quotation', id: 'quotation-1' } });
});

// ---------------------------------------------------------------- description

describe('V2 exposes Quotation with exactly the Stage 5 operation set', () => {
	const v2 = new Teamleader().getNodeType(2);

	it('adds quotation to the V2 resource list', () => {
		const resource = v2.description.properties.find((property) => property.name === 'resource');
		expect(resource?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'company',
			'contact',
			'deal',
			'product',
			'quotation',
		]);
	});

	it('offers Get, Get Many, Create, Update, Accept and Delete', () => {
		expect(
			quotationOperations[0].options?.map((option) => (option as { value: string }).value).sort(),
		).toEqual(['accept', 'create', 'delete', 'get', 'getAll', 'update']);
	});

	it('does not expose Send yet — Stage 7 owns it, and a half-built Send is worse than none', () => {
		const values = quotationOperations[0].options?.map(
			(option) => (option as { value: string }).value,
		);
		expect(values).not.toContain('send');
		expect(names(quotationFields)).not.toContain('subject');
		expect(names(quotationFields)).not.toContain('sendOptions');
	});
});

describe('Quotation locator', () => {
	const locators = quotationFields.filter((field) => field.name === 'quotationId');

	it('exists for Get, Update, Accept and Delete', () => {
		const operations = locators.flatMap(
			(field) => field.displayOptions?.show?.operation as string[],
		);
		expect(operations.sort()).toEqual(['accept', 'delete', 'get', 'update']);
	});

	it('always offers From List plus By ID for expressions', () => {
		for (const locator of locators) {
			expect(locator.modes?.map((mode) => mode.name)).toEqual(['list', 'id']);
			expect(locator.required).toBe(true);
		}
	});

	it('is honest that the list only covers recent quotations', () => {
		const listMode = locators[0].modes?.find((mode) => mode.name === 'list');
		expect(listMode?.hint).toBe('Recent quotations; use By ID for older ones');
	});
});

describe('Quotation Create layout', () => {
	const fields = forOperation('create');

	it('puts the everyday fields on the form in business order', () => {
		expect(names(fields)).toEqual([
			'dealId',
			'documentTemplateId',
			'sectionTitle',
			'lines',
			'groupedLines',
			'useSections',
			'text',
			'expiresAfter',
			// Conditional: only rendered once Expires After holds a date.
			'actionAfterExpiry',
			'advancedOptions',
		]);
	});

	it('requires only the Deal', () => {
		expect(fields.find((field) => field.name === 'dealId')?.required).toBe(true);
		for (const field of fields.filter((entry) => entry.name !== 'dealId')) {
			expect(field.required).toBeFalsy();
		}
	});

	it('never asks for the customer — Teamleader takes it from the deal', () => {
		expect(names(fields)).not.toContain('customer');
		expect(names(fields)).not.toContain('customerId');
		expect(fields.find((field) => field.name === 'dealId')?.description).toContain(
			'takes the customer from the deal',
		);
	});

	it('keeps Section Title optional and secondary to Lines', () => {
		const sectionTitle = fields.find((field) => field.name === 'sectionTitle');
		expect(sectionTitle?.required).toBeFalsy();
		expect(sectionTitle?.default).toBe('');
		expect(sectionTitle?.displayOptions?.show?.useSections).toEqual([false]);
	});

	it('keeps Use Multiple Sections off by default', () => {
		expect(fields.find((field) => field.name === 'useSections')?.default).toBe(false);
	});

	it('hides Action After Expiry until an expiry date is set', () => {
		const action = quotationFields.find(
			(field) =>
				field.name === 'actionAfterExpiry' &&
				(field.displayOptions?.show?.operation as string[]).includes('create'),
		);
		expect(action?.displayOptions?.hide?.expiresAfter).toEqual(['']);
		expect(action?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'none',
			'lock',
		]);
	});
});

describe('Quotation Create reuses the shared line editor', () => {
	const lines = forOperation('create').find((field) => field.name === 'lines');
	const lineValues = (lines?.options?.[0] as { values: INodeProperties[] }).values;
	const lineOptions = lineValues.find((field) => field.name === 'lineOptions');
	const lineOptionNames = ((lineOptions?.options ?? []) as INodeProperties[]).map(
		(option) => option.name,
	);

	it('keeps the minimal product-line UX from Stage 4', () => {
		const visibleInProductMode = lineValues
			.filter((field) => {
				const lineType = field.displayOptions?.show?.lineType as string[] | undefined;
				return !lineType || lineType.includes('product');
			})
			.map((field) => field.name);

		expect(visibleInProductMode).toEqual([
			'lineType',
			'productId',
			'useProductDefaults',
			'quantity',
			'lineOptions',
		]);
	});

	it('uses the quotation member set: Purchase Price yes, invoice-only members no', () => {
		expect(lineOptionNames).toContain('purchasePrice');
		expect(lineOptionNames).not.toContain('productCategoryId');
		expect(lineOptionNames).not.toContain('withholdingTaxRateId');
	});

	it('scopes the line tax rate list through the document lookup context', () => {
		const taxRate = lineValues.find((field) => field.name === 'taxRateId');
		expect(taxRate?.typeOptions?.loadOptionsMethod).toBe('getDocumentLineTaxRates');
	});
});

describe('Document Template lookup context', () => {
	const createTemplate = forOperation('create').find(
		(field) => field.name === 'documentTemplateId',
	);
	const updateTemplate = forOperation('update').find(
		(field) => field.name === 'documentTemplateId',
	);

	it('uses the department-scoped loader on both Create and Update', () => {
		expect(createTemplate?.typeOptions?.loadOptionsMethod).toBe('getQuotationTemplatesScoped');
		expect(updateTemplate?.typeOptions?.loadOptionsMethod).toBe('getQuotationTemplatesScoped');
	});

	it('refreshes when the deal or the override changes', () => {
		expect(createTemplate?.typeOptions?.loadOptionsDependsOn).toEqual([
			'dealId.value',
			'advancedOptions.lookupDepartmentId',
		]);
		// Update has no deal field to depend on.
		expect(updateTemplate?.typeOptions?.loadOptionsDependsOn).toEqual([
			'advancedOptions.lookupDepartmentId',
		]);
	});

	it('keeps the department out of the normal form and calls it lookup context', () => {
		expect(names(forOperation('create'))).not.toContain('departmentId');
		expect(names(forOperation('update'))).not.toContain('departmentId');

		const advanced = forOperation('create').find((field) => field.name === 'advancedOptions');
		const override = (advanced?.options as INodeProperties[]).find(
			(option) => option.name === 'lookupDepartmentId',
		);
		expect(override).toBeDefined();
		expect(override?.description).toContain('never sent to Teamleader');
	});
});

describe('Quotation Update layout', () => {
	const fields = forOperation('update');

	it('leads with the quotation and the line-replacement decision', () => {
		expect(names(fields)).toEqual([
			'quotationId',
			'replaceLines',
			'sectionTitle',
			'lines',
			'groupedLines',
			'useSections',
			'documentTemplateId',
			'text',
			'expiresAfter',
			'actionAfterExpiry',
			'advancedOptions',
		]);
	});

	it('defaults Replace Lines to off and spells out what it does', () => {
		const replaceLines = fields.find((field) => field.name === 'replaceLines');
		expect(replaceLines?.default).toBe(false);
		expect(replaceLines?.description).toContain('replace ALL lines');
		expect(replaceLines?.description).toContain('complete replacement line set');
	});

	it('shows every line-editor field only once Replace Lines is on', () => {
		for (const name of ['sectionTitle', 'lines', 'groupedLines', 'useSections']) {
			const field = fields.find((entry) => entry.name === name);
			expect(field?.displayOptions?.show?.replaceLines).toEqual([true]);
		}
	});

	it('makes every ordinary update field optional', () => {
		for (const field of fields.filter((entry) => entry.name !== 'quotationId')) {
			expect(field.required).toBeFalsy();
		}
	});
});

describe('Destructive and informative notices', () => {
	it('warns about Delete without faking a confirmation dialog', () => {
		const notice = forOperation('delete').find((field) => field.name === 'deleteNotice');
		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toBe(
			'Permanently deletes this quotation in Teamleader. This cannot be undone from n8n.',
		);
		expect(names(forOperation('delete'))).not.toContain('confirm');
	});

	it('explains what Accept does', () => {
		const notice = forOperation('accept').find((field) => field.name === 'acceptNotice');
		expect(notice?.displayName).toContain('accepted on behalf of the customer');
	});
});

describe('Get Many exposes only filters the API actually supports', () => {
	const filters = forOperation('getAll').find((field) => field.name === 'filters');

	it('keeps IDs and invents nothing else', () => {
		expect((filters?.options as INodeProperties[]).map((option) => option.name)).toEqual(['ids']);
	});

	it('offers Return All and Limit', () => {
		expect(names(forOperation('getAll'))).toEqual(['returnAll', 'limit', 'filters', 'options']);
	});
});

// ------------------------------------------------------------------- builders

describe('Currency, discounts and expiry mapping', () => {
	it('sends the currency object only when a code was chosen', () => {
		expect(buildQuotationCurrency({})).toBeUndefined();
		expect(buildQuotationCurrency({ exchangeRate: 1.2 })).toBeUndefined();
		expect(buildQuotationCurrency({ currency: 'USD' })).toEqual({ code: 'USD' });
		expect(buildQuotationCurrency({ currency: 'USD', exchangeRate: 1.2 })).toEqual({
			code: 'USD',
			exchange_rate: 1.2,
		});
	});

	it('keeps quotation discounts on the 0-100 scale the API uses', () => {
		expect(
			buildCommercialDiscounts({ discount: [{ value: 10, description: 'Winter promo' }] }),
		).toEqual([{ type: 'percentage', value: 10, description: 'Winter promo' }]);
		expect(buildCommercialDiscounts({ discount: [{ value: 0 }] })).toEqual([
			{ type: 'percentage', value: 0 },
		]);
		expect(buildCommercialDiscounts({})).toBeUndefined();
	});

	it('builds expiry only from a real date, and as a date-only value', () => {
		expect(buildQuotationExpiry('', 'lock')).toBeUndefined();
		expect(buildQuotationExpiry('2026-09-30T14:22:00.000Z', 'none')).toEqual({
			expires_after: '2026-09-30',
			action_after_expiry: 'none',
		});
		expect(buildQuotationExpiry('2026-09-30', 'lock')).toEqual({
			expires_after: '2026-09-30',
			action_after_expiry: 'lock',
		});
	});
});

// --------------------------------------------------------------------- create

describe('Quotation Create request body', () => {
	it('creates a minimal text-only quotation on the deal', async () => {
		await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			text: 'Thanks for your interest.',
		});

		expect(endpointOf()).toBe('/quotations.create');
		expect(bodyOf()).toEqual({ deal_id: 'deal-1', text: 'Thanks for your interest.' });
	});

	it('turns the simple Lines editor into one unnamed group', async () => {
		await run('create', {
			dealId: { mode: 'id', value: 'deal-2' },
			lines: simpleLines(customLine()),
		});

		expect(bodyOf().grouped_lines).toEqual([
			{
				line_items: [
					{
						quantity: 2,
						description: 'Labour',
						unit_price: { amount: 50, tax: 'excluding' },
						tax_rate_id: 'tax-1',
					},
				],
			},
		]);
	});

	it('names the group when a Section Title was given', async () => {
		await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			sectionTitle: 'Materials',
			lines: simpleLines(customLine()),
		});

		expect((bodyOf().grouped_lines as IDataObject[])[0].section).toEqual({ title: 'Materials' });
	});

	it('keeps multi-section order exactly as configured', async () => {
		await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			useSections: true,
			groupedLines: {
				group: [
					{ title: 'Preparation', lineItems: { item: [customLine({ description: 'Scaffolding' })] } },
					{ title: 'Insulation', lineItems: { item: [customLine({ description: 'Panels' })] } },
				],
			},
		});

		const groups = bodyOf().grouped_lines as IDataObject[];
		expect(groups.map((group) => (group.section as IDataObject).title)).toEqual([
			'Preparation',
			'Insulation',
		]);
		expect(
			groups.map((group) => (group.line_items as IDataObject[])[0].description),
		).toEqual(['Scaffolding', 'Panels']);
	});

	it('hydrates a Teamleader Product line through the shared Stage 4 helper', async () => {
		apiRequest.mockImplementation(async (endpoint: string) =>
			endpoint === '/products.info'
				? PRODUCT_RESPONSE
				: { data: { type: 'quotation', id: 'quotation-1' } },
		);

		await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			lines: simpleLines(productLine()),
		});

		expect(apiRequest.mock.calls[0][0]).toBe('/products.info');
		const line = ((bodyOf(1).grouped_lines as IDataObject[])[0].line_items as IDataObject[])[0];
		expect(line).toEqual({
			quantity: 3,
			description: 'Roof insulation',
			unit_price: { amount: 25, tax: 'excluding' },
			tax_rate_id: 'tax-product',
			product_id: 'product-1',
			unit_of_measure_id: 'unit-1',
			extended_description: 'Per m²',
			purchase_price: { amount: 10, currency: 'EUR' },
		});
	});

	it('keeps the Stage 4 override precedence for a hydrated line', async () => {
		apiRequest.mockImplementation(async (endpoint: string) =>
			endpoint === '/products.info'
				? PRODUCT_RESPONSE
				: { data: { type: 'quotation', id: 'quotation-1' } },
		);

		await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			lines: simpleLines(
				productLine({ lineOptions: { unitPrice: 19.5, description: 'Special price' } }),
			),
		});

		const line = ((bodyOf(1).grouped_lines as IDataObject[])[0].line_items as IDataObject[])[0];
		expect(line.unit_price).toEqual({ amount: 19.5, tax: 'excluding' });
		expect(line.description).toBe('Special price');
		// Everything not overridden still comes from the product.
		expect(line.tax_rate_id).toBe('tax-product');
		expect(line.product_id).toBe('product-1');
	});

	it('refuses a quotation with neither lines nor text, before calling Teamleader', async () => {
		await expect(
			run('create', { dealId: { mode: 'list', value: 'deal-1' } }),
		).rejects.toThrow('Add at least one line or some quotation text.');
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('does not count an empty section shell as a line', async () => {
		await expect(
			run('create', {
				dealId: { mode: 'list', value: 'deal-1' },
				useSections: true,
				groupedLines: { group: [{ title: 'Empty section', lineItems: {} }] },
			}),
		).rejects.toThrow('Add at least one line or some quotation text.');
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('maps the document template, expiry and expiry action', async () => {
		await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			documentTemplateId: 'template-1',
			text: 'Offer',
			expiresAfter: '2026-10-15T00:00:00.000Z',
			actionAfterExpiry: 'lock',
		});

		expect(bodyOf()).toEqual({
			deal_id: 'deal-1',
			text: 'Offer',
			document_template_id: 'template-1',
			expiry: { expires_after: '2026-10-15', action_after_expiry: 'lock' },
		});
	});

	it('sends no expiry action when no expiry date was set', async () => {
		await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			text: 'Offer',
			actionAfterExpiry: 'lock',
		});

		expect(bodyOf().expiry).toBeUndefined();
		expect(JSON.stringify(bodyOf())).not.toContain('action_after_expiry');
	});

	it('maps currency, exchange rate and quotation discounts from Advanced Options', async () => {
		await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			text: 'Offer',
			advancedOptions: {
				currency: 'USD',
				exchangeRate: 1.08,
				discounts: { discount: [{ value: 5, description: 'Loyalty' }] },
			},
		});

		expect(bodyOf().currency).toEqual({ code: 'USD', exchange_rate: 1.08 });
		expect(bodyOf().discounts).toEqual([
			{ type: 'percentage', value: 5, description: 'Loyalty' },
		]);
	});

	it('uses the quotation currency as the hydration currency, without converting anything', async () => {
		apiRequest.mockImplementation(async (endpoint: string) =>
			endpoint === '/products.info'
				? PRODUCT_RESPONSE
				: { data: { type: 'quotation', id: 'quotation-1' } },
		);

		const result = await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			lines: simpleLines(productLine()),
			advancedOptions: { currency: 'USD' },
		});

		const line = ((bodyOf(1).grouped_lines as IDataObject[])[0].line_items as IDataObject[])[0];
		// The EUR product amount is used as-is; the mismatch is reported, not converted.
		expect(line.unit_price).toEqual({ amount: 25, tax: 'excluding' });
		expect(result[0]._warnings).toEqual([
			expect.stringContaining('priced in EUR'),
			expect.stringContaining('purchase price is in EUR'),
		]);
	});
});

describe('Quotation Create payload discipline', () => {
	const EDITOR_ONLY_KEYS = [
		'lineType',
		'useProductDefaults',
		'lineOptions',
		'useSections',
		'sectionTitle',
		'replaceLines',
		'lookupDepartmentId',
		'advancedOptions',
		'exchangeRate',
		'_warnings',
	];

	it('never forwards editor-only metadata or lookup context to Teamleader', async () => {
		apiRequest.mockImplementation(async (endpoint: string) =>
			endpoint === '/products.info'
				? PRODUCT_RESPONSE
				: { data: { type: 'quotation', id: 'quotation-1' } },
		);

		await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			sectionTitle: 'Materials',
			lines: simpleLines(productLine({ lineOptions: { discount: 10 } }), customLine()),
			advancedOptions: { currency: 'EUR', lookupDepartmentId: 'department-1' },
		});

		const serialised = JSON.stringify(bodyOf(1));
		for (const key of EDITOR_ONLY_KEYS) {
			expect(serialised).not.toContain(key);
		}
		expect(serialised).not.toContain('department');
	});

	it('keeps hydration warnings out of the request and puts them on the output', async () => {
		apiRequest.mockImplementation(async (endpoint: string) =>
			endpoint === '/products.info'
				? {
						data: {
							...PRODUCT_RESPONSE.data,
							selling_price: { amount: 25, currency: 'GBP' },
							purchase_price: { amount: 10, currency: 'GBP' },
						},
					}
				: { data: { type: 'quotation', id: 'quotation-1' } },
		);

		const result = await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			lines: simpleLines(productLine()),
			advancedOptions: { currency: 'EUR' },
		});

		expect(JSON.stringify(bodyOf(1))).not.toContain('warning');
		expect(result[0]._warnings).toHaveLength(2);
		expect(result[0]).toMatchObject({ type: 'quotation', id: 'quotation-1' });
	});

	it('adds no warnings field when there is nothing to warn about', async () => {
		const result = await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			text: 'Offer',
		});

		expect(Object.keys(result[0])).not.toContain('_warnings');
	});

	it('never overwrites a Teamleader response property called _warnings', async () => {
		apiRequest.mockImplementation(async (endpoint: string) =>
			endpoint === '/products.info'
				? {
						data: {
							...PRODUCT_RESPONSE.data,
							selling_price: { amount: 25, currency: 'GBP' },
							purchase_price: { amount: 10, currency: 'GBP' },
						},
					}
				: { data: { id: 'quotation-1', _warnings: 'from Teamleader' } },
		);

		const result = await run('create', {
			dealId: { mode: 'list', value: 'deal-1' },
			lines: simpleLines(productLine()),
			advancedOptions: { currency: 'EUR' },
		});

		expect(result[0]._warnings).toBe('from Teamleader');
		expect(result[0]._connectorWarnings).toHaveLength(2);
	});
});

// --------------------------------------------------------------------- update

describe('Quotation Update request body', () => {
	it('sends no grouped_lines at all while Replace Lines is off', async () => {
		await run('update', {
			quotationId: { mode: 'list', value: 'quotation-1' },
			replaceLines: false,
			text: 'Updated introduction',
			// Lines left over in the (hidden) editor must be ignored entirely.
			lines: simpleLines(customLine()),
		});

		expect(endpointOf()).toBe('/quotations.update');
		expect(bodyOf()).toEqual({ id: 'quotation-1', text: 'Updated introduction' });
		expect(Object.keys(bodyOf())).not.toContain('grouped_lines');
	});

	it('reads no products while Replace Lines is off', async () => {
		await run('update', {
			quotationId: { mode: 'list', value: 'quotation-1' },
			replaceLines: false,
			text: 'Updated introduction',
			lines: simpleLines(productLine()),
		});

		expect(apiRequest).toHaveBeenCalledTimes(1);
		expect(apiRequest.mock.calls.map((call) => call[0])).not.toContain('/products.info');
	});

	it('normalizes and hydrates the replacement lines when Replace Lines is on', async () => {
		apiRequest.mockImplementation(async (endpoint: string) =>
			endpoint === '/products.info' ? PRODUCT_RESPONSE : {},
		);

		await run('update', {
			quotationId: { mode: 'list', value: 'quotation-1' },
			replaceLines: true,
			lines: simpleLines(productLine()),
		});

		expect(apiRequest.mock.calls[0][0]).toBe('/products.info');
		const line = ((bodyOf(1).grouped_lines as IDataObject[])[0].line_items as IDataObject[])[0];
		expect(line.product_id).toBe('product-1');
		expect(line.description).toBe('Roof insulation');
	});

	it('refuses to empty a quotation through an empty editor, before calling Teamleader', async () => {
		await expect(
			run('update', {
				quotationId: { mode: 'list', value: 'quotation-1' },
				replaceLines: true,
			}),
		).rejects.toThrow(
			'Replace Lines is on but no lines were provided. This would empty the quotation.',
		);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('omits every untouched optional value', async () => {
		await run('update', {
			quotationId: { mode: 'list', value: 'quotation-1' },
			documentTemplateId: 'template-2',
			// Defaults of hidden/untouched fields must not become mutations.
			actionAfterExpiry: 'none',
			expiresAfter: '',
			text: '',
			advancedOptions: {},
		});

		expect(bodyOf()).toEqual({ id: 'quotation-1', document_template_id: 'template-2' });
	});

	it('requires at least one changed field', async () => {
		await expect(
			run('update', { quotationId: { mode: 'list', value: 'quotation-1' } }),
		).rejects.toThrow('Fill in at least one field to update');
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('keeps the lookup department out of the update payload', async () => {
		await run('update', {
			quotationId: { mode: 'list', value: 'quotation-1' },
			text: 'Updated',
			advancedOptions: { lookupDepartmentId: 'department-1' },
		});

		expect(JSON.stringify(bodyOf())).not.toContain('department');
		expect(bodyOf()).toEqual({ id: 'quotation-1', text: 'Updated' });
	});

	it('reports success and any warnings on the output item', async () => {
		apiRequest.mockImplementation(async (endpoint: string) =>
			endpoint === '/products.info'
				? {
						data: {
							...PRODUCT_RESPONSE.data,
							selling_price: { amount: 25, currency: 'GBP' },
							purchase_price: { amount: 10, currency: 'GBP' },
						},
					}
				: {},
		);

		const result = await run('update', {
			quotationId: { mode: 'list', value: 'quotation-1' },
			replaceLines: true,
			lines: simpleLines(productLine()),
			advancedOptions: { currency: 'EUR' },
		});

		expect(result[0]).toMatchObject({ success: true, id: 'quotation-1' });
		expect(result[0]._warnings).toHaveLength(2);
	});
});

// ------------------------------------------------- get / get many / accept / delete

describe('Quotation Get', () => {
	it('asks for one quotation by ID', async () => {
		apiRequest.mockResolvedValue({ data: { id: 'quotation-1' } });
		const result = await run('get', { quotationId: { mode: 'list', value: 'quotation-1' } });

		expect(endpointOf()).toBe('/quotations.info');
		expect(bodyOf()).toEqual({ id: 'quotation-1' });
		expect(result).toEqual([{ id: 'quotation-1' }]);
	});

	it('adds the expiry include only when asked', async () => {
		apiRequest.mockResolvedValue({ data: {} });
		await run('get', {
			quotationId: { mode: 'id', value: 'quotation-2' },
			options: { includeExpiry: true },
		});

		expect(bodyOf()).toEqual({ id: 'quotation-2', includes: 'expiry' });
	});
});

describe('Quotation Get Many', () => {
	it('lists without a filter by default', async () => {
		fetchList.mockResolvedValue([]);
		await run('getAll', {});

		expect(fetchList.mock.calls[0][0]).toBe('/quotations.list');
		expect(fetchList.mock.calls[0][2]).toEqual({});
	});

	it('filters on IDs and can include expiry', async () => {
		fetchList.mockResolvedValue([]);
		await run('getAll', {
			filters: { ids: 'quotation-1, quotation-2' },
			options: { includeExpiry: true },
		});

		expect(fetchList.mock.calls[0][2]).toEqual({
			filter: { ids: ['quotation-1', 'quotation-2'] },
			includes: 'expiry',
		});
	});
});

describe('Quotation Accept and Delete', () => {
	it('accepts through quotations.accept', async () => {
		apiRequest.mockResolvedValue({});
		const result = await run('accept', { quotationId: { mode: 'list', value: 'quotation-1' } });

		expect(endpointOf()).toBe('/quotations.accept');
		expect(bodyOf()).toEqual({ id: 'quotation-1' });
		expect(result).toEqual([{ success: true, id: 'quotation-1', status: 'accepted' }]);
	});

	it('deletes through quotations.delete', async () => {
		apiRequest.mockResolvedValue({});
		const result = await run('delete', { quotationId: { mode: 'id', value: 'quotation-9' } });

		expect(endpointOf()).toBe('/quotations.delete');
		expect(bodyOf()).toEqual({ id: 'quotation-9' });
		expect(result).toEqual([{ success: true, id: 'quotation-9' }]);
	});

	it('rejects an unsupported operation instead of guessing one', async () => {
		await expect(
			run('send', { quotationId: { mode: 'id', value: 'quotation-9' } }),
		).rejects.toThrow('The operation "send" is not supported for resource "quotation"');
	});
});

// ----------------------------------------------------------------- regression

describe('Stage 5 leaves the rest of the node alone', () => {
	it('does not change the V1 quotation operation set', () => {
		expect(
			v1QuotationOperations[0].options?.map((option) => (option as { value: string }).value).sort(),
		).toEqual(['accept', 'create', 'delete', 'get', 'getAll', 'send', 'update']);
	});

	it('scopes every V2 quotation field to the quotation resource', () => {
		for (const field of quotationFields) {
			expect(field.displayOptions?.show?.resource).toEqual(['quotation']);
		}
	});
});

describe('searchQuotations backs the locator honestly', () => {
	const PAGE = {
		data: [
			{ id: 'q-1', reference: '2026-0001', web_url: 'https://focus.teamleader.eu/q1' },
			{ id: 'q-2', reference: '2026-0002' },
		],
	};

	it('lists the most recent quotations when nothing is typed', async () => {
		apiRequest.mockResolvedValue(PAGE);

		const result = await searchQuotations.call(makeContext({}));

		// `quotations.list` has no term filter, so none is invented.
		expect(bodyOf().filter).toEqual({});
		expect(result.results.map((entry) => entry.name)).toEqual(['2026-0001', '2026-0002']);
	});

	it('narrows the loaded page client-side instead of sending a made-up filter', async () => {
		apiRequest.mockResolvedValue(PAGE);

		const result = await searchQuotations.call(makeContext({}), '0002');

		expect(bodyOf().filter).toEqual({});
		expect(result.results.map((entry) => entry.value)).toEqual(['q-2']);
	});

	it('also matches on the quotation ID, which is what By ID users paste', async () => {
		apiRequest.mockResolvedValue(PAGE);

		const result = await searchQuotations.call(makeContext({}), 'Q-1');

		expect(result.results.map((entry) => entry.value)).toEqual(['q-1']);
	});
});

describe('Quotation failure paths stay actionable', () => {
	it('names the product and line when a product no longer exists', async () => {
		apiRequest.mockImplementation(async (endpoint: string) => {
			if (endpoint === '/products.info') {
				const error = Object.assign(new Error('Not found'), { httpCode: '404' });
				throw error;
			}
			return { data: {} };
		});

		await expect(
			run('create', {
				dealId: { mode: 'list', value: 'deal-1' },
				lines: simpleLines(customLine(), productLine({ productId: { mode: 'id', value: 'gone-1' } })),
			}),
		).rejects.toThrow('Could not load Product gone-1 for line 2');

		// The quotation was never created.
		expect(apiRequest.mock.calls.map((call) => call[0])).not.toContain('/quotations.create');
	});

	it('surfaces a Teamleader API failure instead of hiding it behind a fallback', async () => {
		apiRequest.mockRejectedValue(new Error('Teamleader API request to "/quotations.create" failed'));

		await expect(
			run('create', { dealId: { mode: 'list', value: 'deal-1' }, text: 'Offer' }),
		).rejects.toThrow('/quotations.create');
	});

	it('requires a quotation ID rather than sending an empty one', async () => {
		await expect(run('accept', { quotationId: { mode: 'id', value: '' } })).rejects.toThrow(
			'quotationId',
		);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('rejects an out-of-range line discount before creating anything', async () => {
		await expect(
			run('create', {
				dealId: { mode: 'list', value: 'deal-1' },
				lines: simpleLines(customLine({ lineOptions: { discount: 150 } })),
			}),
		).rejects.toThrow('invalid discount');
		expect(apiRequest).not.toHaveBeenCalled();
	});
});
