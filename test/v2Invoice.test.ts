import type { IDataObject, INodeProperties } from 'n8n-workflow';

import { TeamleaderExecutionContext } from '../nodes/Teamleader/helpers/context';
import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import { Teamleader } from '../nodes/Teamleader/Teamleader.node';
import {
	buildExpectedPaymentMethod,
	buildInvoiceCurrency,
	buildInvoiceFilter,
	executeInvoice,
} from '../nodes/Teamleader/v2/actions/invoice';
import {
	invoiceFields,
	invoiceOperations,
} from '../nodes/Teamleader/v2/descriptions/InvoiceDescription';
import { buildPaymentTermObject } from '../nodes/Teamleader/v2/helpers/paymentTerms';

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

const httpRequest = jest.fn();
const prepareBinaryData = jest.fn();

function makeContext(parameters: IDataObject) {
	return {
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			parameters[name] !== undefined ? parameters[name] : fallback,
		getNode: () => ({ name: 'Teamleader' }),
		helpers: { httpRequest, prepareBinaryData },
	} as never;
}

async function run(operation: string, parameters: IDataObject) {
	return await executeInvoice.call(
		makeContext(parameters),
		operation,
		0,
		new TeamleaderExecutionContext(),
	);
}

const callsTo = (endpoint: string) =>
	apiRequest.mock.calls.filter((call) => call[0] === endpoint);
const bodyTo = (endpoint: string) => callsTo(endpoint)[0]?.[1] as IDataObject;

const forOperation = (operation: string) =>
	invoiceFields.filter((field) =>
		(field.displayOptions?.show?.operation as string[] | undefined)?.includes(operation),
	);
const names = (fields: INodeProperties[]) => fields.map((field) => field.name);

const simpleLines = (...lines: IDataObject[]) => ({ line: lines });

const customLine = (overrides: IDataObject = {}): IDataObject => ({
	lineType: 'custom',
	description: 'Insulation work',
	quantity: 1,
	unitPrice: 100,
	taxRateId: 'tax-1',
	lineOptions: {},
	...overrides,
});

const DEAL_RESPONSE = {
	data: {
		id: 'deal-1',
		title: 'Roof job',
		department: { type: 'department', id: 'dep-deal' },
		lead: {
			customer: { type: 'company', id: 'company-1' },
			contact_person: { type: 'contact', id: 'contact-9' },
		},
	},
};

const PAYMENT_TERMS_RESPONSE = {
	data: [
		{ id: 'term-cash', type: 'cash' },
		{ id: 'term-30', type: 'after_invoice_date', days: 30 },
		{ id: 'term-eom', type: 'end_of_month', days: 15 },
	],
	meta: { default: 'term-30' },
};

/** Route each endpoint to a canned response; anything else returns a created id. */
function mockApi(overrides: Record<string, unknown> = {}) {
	apiRequest.mockImplementation(async (endpoint: string) => {
		if (endpoint in overrides) {
			const value = overrides[endpoint];
			if (value instanceof Error) throw value;
			return value;
		}
		if (endpoint === '/deals.info') return DEAL_RESPONSE;
		if (endpoint === '/paymentTerms.list') return PAYMENT_TERMS_RESPONSE;
		return { data: { type: 'invoice', id: 'invoice-1' } };
	});
}

/** The everyday "deal won → draft invoice" parameter set. */
const draftFromDeal = (overrides: IDataObject = {}): IDataObject => ({
	customerSource: 'fromDeal',
	dealId: { mode: 'list', value: 'deal-1' },
	paymentTermSource: 'default',
	lines: simpleLines(customLine()),
	...overrides,
});

beforeEach(() => {
	apiRequest.mockReset();
	fetchList.mockReset();
	httpRequest.mockReset();
	prepareBinaryData.mockReset();
	mockApi();
});

// ---------------------------------------------------------------- description

describe('V2 exposes Invoice with the Stage 6 operation set', () => {
	it('adds invoice to the V2 resource list', () => {
		const v2 = new Teamleader().getNodeType(2);
		const resource = v2.description.properties.find((property) => property.name === 'resource');
		expect(resource?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'company',
			'contact',
			'deal',
			'invoice',
			'product',
			'quotation',
		]);
	});

	it('offers exactly Get, Get Many, Create Draft, Update Draft, Update Booked, Book and Download', () => {
		expect(
			invoiceOperations[0].options?.map((option) => (option as { value: string }).value).sort(),
		).toEqual(['book', 'download', 'draft', 'get', 'getAll', 'update', 'updateBooked']);
	});

	it('does not expose Send or the financial operations yet', () => {
		const values = invoiceOperations[0].options?.map((option) => (option as { value: string }).value);
		for (const later of ['send', 'registerPayment', 'removePayments', 'credit', 'creditPartially']) {
			expect(values).not.toContain(later);
		}
	});
});

describe('Create Draft layout', () => {
	const fields = forOperation('draft');

	it('leads with the customer decision and keeps scope fields above what they scope', () => {
		expect(names(fields)).toEqual([
			'customerSource',
			'dealId',
			'customer',
			'customerType',
			'departmentId',
			// One For Attention Of per customer source; only one is ever visible.
			'forAttentionOfSource',
			'forAttentionOfSource',
			'forAttentionOfContactId',
			'forAttentionOfName',
			'paymentTermSource',
			'paymentTermId',
			'paymentTermType',
			'paymentTermDays',
			'documentTemplateId',
			'sectionTitle',
			'lines',
			'groupedLines',
			'useSections',
			'invoiceDate',
			'note',
			'advancedOptions',
		]);
	});

	it('defaults to taking the customer from a deal', () => {
		expect(fields.find((field) => field.name === 'customerSource')?.default).toBe('fromDeal');
	});

	it('shows the deal only for From Deal and the customer only for Select Manually', () => {
		expect(fields.find((field) => field.name === 'dealId')?.displayOptions?.show?.customerSource).toEqual(
			['fromDeal'],
		);
		expect(fields.find((field) => field.name === 'customer')?.displayOptions?.show?.customerSource).toEqual(
			['manual'],
		);
	});

	it('offers Deal Contact Person only when the customer comes from a deal', () => {
		const sources = fields.filter((field) => field.name === 'forAttentionOfSource');
		const withDeal = sources.find(
			(field) => (field.displayOptions?.show?.customerSource as string[])?.[0] === 'fromDeal',
		);
		const manual = sources.find(
			(field) => (field.displayOptions?.show?.customerSource as string[])?.[0] === 'manual',
		);

		expect(withDeal?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'none',
			'dealContactPerson',
			'contact',
			'name',
		]);
		expect(manual?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'none',
			'contact',
			'name',
		]);
		// Never automatic: the invoice is only addressed to someone on request.
		expect(withDeal?.default).toBe('none');
	});

	it('offers the three approved payment-term sources, defaulting to the Teamleader default', () => {
		const source = fields.find((field) => field.name === 'paymentTermSource');
		expect(source?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'default',
			'select',
			'custom',
		]);
		expect(source?.default).toBe('default');
	});

	it('hides the days field for a cash term', () => {
		const days = fields.find((field) => field.name === 'paymentTermDays');
		expect(days?.displayOptions?.show?.paymentTermType).toEqual([
			'after_invoice_date',
			'end_of_month',
		]);
	});

	it('uses the invoice line member set, never the quotation-only one', () => {
		const lines = fields.find((field) => field.name === 'lines');
		const lineValues = (lines?.options?.[0] as { values: INodeProperties[] }).values;
		const lineOptions = lineValues.find((field) => field.name === 'lineOptions');
		const optionNames = ((lineOptions?.options ?? []) as INodeProperties[]).map((o) => o.name);

		expect(optionNames).toContain('productCategoryId');
		expect(optionNames).toContain('withholdingTaxRateId');
		expect(optionNames).not.toContain('purchasePrice');
	});
});

describe('Update Booked exposes only what the endpoint accepts', () => {
	const advanced = forOperation('updateBooked').find(
		(field) => field.name === 'advancedOptions',
	);
	const advancedNames = ((advanced?.options ?? []) as INodeProperties[]).map((o) => o.name);
	const topLevel = names(forOperation('updateBooked'));

	it('offers no currency, discounts, document template, purchase order or payment method', () => {
		for (const rejected of [
			'currency',
			'exchangeRate',
			'discounts',
			'expectedPaymentMethod',
			'expectedPaymentReference',
			'purchaseOrderNumber',
		]) {
			expect(advancedNames).not.toContain(rejected);
		}
		expect(topLevel).not.toContain('documentTemplateId');
	});

	it('keeps the fields invoices.updateBooked does accept', () => {
		expect(advancedNames).toEqual(['customFields', 'projectId']);
		expect(topLevel).toEqual(
			expect.arrayContaining([
				'invoiceId',
				'replaceLines',
				'changeInvoicee',
				'paymentTermSource',
				'invoiceDate',
				'note',
			]),
		);
	});

	it('lets an update keep the current payment term', () => {
		const source = forOperation('updateBooked').find((f) => f.name === 'paymentTermSource');
		expect(source?.default).toBe('keep');
		expect(source?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'keep',
			'default',
			'select',
			'custom',
		]);
	});
});

describe('Line replacement and destructive notices', () => {
	it('defaults Replace Lines to off on both update operations', () => {
		const replaceLines = invoiceFields.find((field) => field.name === 'replaceLines');
		expect(replaceLines?.default).toBe(false);
		expect(replaceLines?.displayOptions?.show?.operation).toEqual(['update', 'updateBooked']);
	});

	it('shows the line editor only once Replace Lines is on', () => {
		for (const name of ['sectionTitle', 'lines', 'groupedLines', 'useSections']) {
			const field = forOperation('update').find((entry) => entry.name === name);
			expect(field?.displayOptions?.show?.replaceLines).toEqual([true]);
		}
	});

	it('warns plainly about booking without faking a confirmation', () => {
		const notice = forOperation('book').find((field) => field.name === 'bookNotice');
		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toContain('final number');
		expect(names(forOperation('book'))).not.toContain('confirm');
	});
});

// ------------------------------------------------------------------ builders

describe('Payment term object', () => {
	it('never sends days for a cash term', () => {
		expect(buildPaymentTermObject('cash', 30)).toEqual({ type: 'cash' });
	});

	it('keeps an explicit 0 days, which is a real end-of-month term', () => {
		expect(buildPaymentTermObject('end_of_month', 0)).toEqual({ type: 'end_of_month', days: 0 });
	});

	it('omits days that were never filled in', () => {
		expect(buildPaymentTermObject('after_invoice_date', '')).toEqual({ type: 'after_invoice_date' });
	});
});

describe('Currency, discounts and expected payment method', () => {
	it('sends a currency object only when a code was chosen', () => {
		expect(buildInvoiceCurrency({})).toBeUndefined();
		expect(buildInvoiceCurrency({ exchangeRate: 1.2 })).toBeUndefined();
		expect(buildInvoiceCurrency({ currency: 'USD', exchangeRate: 1.2 })).toEqual({
			code: 'USD',
			exchange_rate: 1.2,
		});
	});

	it('adds a reference only to the methods that take one', () => {
		expect(buildExpectedPaymentMethod({ expectedPaymentMethod: 'bank_transfer' })).toEqual({
			method: 'bank_transfer',
		});
		expect(
			buildExpectedPaymentMethod({
				expectedPaymentMethod: 'bank_transfer',
				expectedPaymentReference: 'AB1234',
			}),
		).toEqual({ method: 'bank_transfer' });
		expect(
			buildExpectedPaymentMethod({
				expectedPaymentMethod: 'sepa_direct_debit',
				expectedPaymentReference: 'AB1234',
			}),
		).toEqual({ method: 'sepa_direct_debit', reference: 'AB1234' });
	});

	it('maps every supported list filter and nothing else', () => {
		const filter = buildInvoiceFilter({
			term: 'roof',
			invoiceNumber: '2026 / 5',
			purchaseOrderNumber: 'PO-1',
			paymentReference: '+++084+++',
			departmentId: 'dep-1',
			dealId: { mode: 'list', value: 'deal-1' },
			projectId: 'project-1',
			subscriptionId: 'sub-1',
			ids: 'inv-1, inv-2',
			status: ['draft', 'outstanding'],
			updatedSince: '2026-01-01T10:00:00.000Z',
			invoiceDateAfter: '2026-01-01T00:00:00.000Z',
			invoiceDateBefore: '2026-02-01',
			customerId: { mode: 'contactList', value: 'contact-1' },
		});

		expect(filter).toEqual({
			term: 'roof',
			invoice_number: '2026 / 5',
			purchase_order_number: 'PO-1',
			payment_reference: '+++084+++',
			department_id: 'dep-1',
			deal_id: 'deal-1',
			project_id: 'project-1',
			subscription_id: 'sub-1',
			ids: ['inv-1', 'inv-2'],
			status: ['draft', 'outstanding'],
			// A timestamp filter keeps its time; the date filters are date-only.
			updated_since: '2026-01-01T10:00:00+00:00',
			invoice_date_after: '2026-01-01',
			invoice_date_before: '2026-02-01',
			customer: { type: 'contact', id: 'contact-1' },
		});
	});

	it('builds an empty filter from an untouched collection', () => {
		expect(buildInvoiceFilter({})).toEqual({});
	});
});

// ------------------------------------------------------------- create draft

describe('Create Draft request body', () => {
	it('derives customer, department and payment term for the deal-won flow', async () => {
		await run('draft', draftFromDeal());

		expect(bodyTo('/invoices.draft')).toEqual({
			invoicee: { customer: { type: 'company', id: 'company-1' } },
			department_id: 'dep-deal',
			payment_term: { type: 'after_invoice_date', days: 30 },
			grouped_lines: [
				{
					line_items: [
						{
							quantity: 1,
							description: 'Insulation work',
							unit_price: { amount: 100, tax: 'excluding' },
							tax_rate_id: 'tax-1',
						},
					],
				},
			],
		});
	});

	it('prefers an explicitly chosen department over the deal', async () => {
		await run('draft', draftFromDeal({ departmentId: 'dep-explicit' }));
		expect(bodyTo('/invoices.draft').department_id).toBe('dep-explicit');
	});

	it('accepts a manually selected customer without reading any deal', async () => {
		await run('draft', {
			customerSource: 'manual',
			customer: { mode: 'contactList', value: 'contact-5' },
			departmentId: 'dep-1',
			paymentTermSource: 'custom',
			paymentTermType: 'cash',
			lines: simpleLines(customLine()),
		});

		expect(callsTo('/deals.info')).toHaveLength(0);
		expect(bodyTo('/invoices.draft').invoicee).toEqual({
			customer: { type: 'contact', id: 'contact-5' },
		});
		expect(bodyTo('/invoices.draft').payment_term).toEqual({ type: 'cash' });
	});

	it('resolves a raw customer ID through the companion Customer Type field', async () => {
		await run('draft', {
			customerSource: 'manual',
			customer: { mode: 'id', value: 'x-1' },
			customerType: 'contact',
			departmentId: 'dep-1',
			paymentTermSource: 'default',
			lines: simpleLines(customLine()),
		});

		expect(bodyTo('/invoices.draft').invoicee).toEqual({
			customer: { type: 'contact', id: 'x-1' },
		});
	});

	it('addresses the invoice to the deal contact person only when asked', async () => {
		await run('draft', draftFromDeal({ forAttentionOfSource: 'dealContactPerson' }));
		expect(bodyTo('/invoices.draft').invoicee).toEqual({
			customer: { type: 'company', id: 'company-1' },
			for_attention_of: { contact_id: 'contact-9' },
		});
	});

	it('supports a free-text attention line', async () => {
		await run('draft', draftFromDeal({ forAttentionOfSource: 'name', forAttentionOfName: ' Finance ' }));
		expect((bodyTo('/invoices.draft').invoicee as IDataObject).for_attention_of).toEqual({
			name: 'Finance',
		});
	});

	it('sends no attention line by default', async () => {
		await run('draft', draftFromDeal());
		expect((bodyTo('/invoices.draft').invoicee as IDataObject).for_attention_of).toBeUndefined();
	});

	it('translates a selected payment term into its own type and days', async () => {
		await run('draft', draftFromDeal({ paymentTermSource: 'select', paymentTermId: 'term-eom' }));
		expect(bodyTo('/invoices.draft').payment_term).toEqual({ type: 'end_of_month', days: 15 });
	});

	it('maps every advanced field onto its API name', async () => {
		await run(
			'draft',
			draftFromDeal({
				documentTemplateId: 'template-1',
				invoiceDate: '2026-03-01T12:00:00.000Z',
				note: 'Thanks for your business',
				advancedOptions: {
					currency: 'USD',
					exchangeRate: 1.08,
					discounts: { discount: [{ value: 5, description: 'Loyalty' }] },
					expectedPaymentMethod: 'sepa_direct_debit',
					expectedPaymentReference: 'MND-1',
					projectId: 'project-1',
					purchaseOrderNumber: 'PO-9',
					customFields: { field: [{ id: 'cf-1', value: 'roof' }] },
				},
			}),
		);

		const body = bodyTo('/invoices.draft');
		expect(body).toMatchObject({
			document_template_id: 'template-1',
			// Date-only, never a truncated timestamp by accident.
			invoice_date: '2026-03-01',
			note: 'Thanks for your business',
			currency: { code: 'USD', exchange_rate: 1.08 },
			discounts: [{ type: 'percentage', value: 5, description: 'Loyalty' }],
			expected_payment_method: { method: 'sepa_direct_debit', reference: 'MND-1' },
			project_id: 'project-1',
			purchase_order_number: 'PO-9',
			custom_fields: [{ id: 'cf-1', value: 'roof' }],
		});
	});

	it('hydrates product lines through the shared helper, once per product', async () => {
		mockApi({
			'/products.info': {
				data: {
					id: 'product-1',
					name: 'Insulation panel',
					selling_price: { amount: 40, currency: 'EUR' },
					tax_rate: { id: 'tax-product' },
					product_category: { id: 'cat-1' },
				},
			},
		});

		await run(
			'draft',
			draftFromDeal({
				lines: simpleLines(
					{ lineType: 'product', productId: { mode: 'list', value: 'product-1' }, useProductDefaults: true, quantity: 2, lineOptions: {} },
					{ lineType: 'product', productId: { mode: 'list', value: 'product-1' }, useProductDefaults: true, quantity: 5, lineOptions: {} },
				),
			}),
		);

		expect(callsTo('/products.info')).toHaveLength(1);
		const items = (bodyTo('/invoices.draft').grouped_lines as IDataObject[])[0]
			.line_items as IDataObject[];
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({
			product_id: 'product-1',
			description: 'Insulation panel',
			unit_price: { amount: 40, tax: 'excluding' },
			tax_rate_id: 'tax-product',
			product_category_id: 'cat-1',
		});
		// Quotation-only member never appears on an invoice line.
		expect(items[0].purchase_price).toBeUndefined();
	});

	it('reads paymentTerms.list only once per execution', async () => {
		const executionContext = new TeamleaderExecutionContext();
		const context = makeContext(draftFromDeal());
		await executeInvoice.call(context, 'draft', 0, executionContext);
		await executeInvoice.call(context, 'draft', 1, executionContext);

		expect(callsTo('/paymentTerms.list')).toHaveLength(1);
		expect(callsTo('/deals.info')).toHaveLength(1);
	});
});

describe('Create Draft refuses to guess', () => {
	it('fails when the deal has no customer', async () => {
		mockApi({ '/deals.info': { data: { id: 'deal-1', lead: {} } } });

		await expect(run('draft', draftFromDeal())).rejects.toThrow(
			'Could not read a customer from deal deal-1',
		);
		expect(callsTo('/invoices.draft')).toHaveLength(0);
	});

	it('fails when neither the field nor the deal supplies a department', async () => {
		mockApi({
			'/deals.info': { data: { id: 'deal-1', lead: { customer: { type: 'company', id: 'c-1' } } } },
		});

		await expect(run('draft', draftFromDeal())).rejects.toThrow(
			'Select the department that issues this invoice',
		);
		expect(callsTo('/invoices.draft')).toHaveLength(0);
	});

	it('fails when Teamleader reports no default payment term', async () => {
		mockApi({ '/paymentTerms.list': { data: PAYMENT_TERMS_RESPONSE.data, meta: {} } });

		await expect(run('draft', draftFromDeal())).rejects.toThrow(
			'Teamleader did not report a default payment term',
		);
		expect(callsTo('/invoices.draft')).toHaveLength(0);
	});

	it('never falls back to the first term in the list', async () => {
		mockApi({ '/paymentTerms.list': { data: PAYMENT_TERMS_RESPONSE.data, meta: {} } });
		await expect(run('draft', draftFromDeal())).rejects.toThrow();
		expect(callsTo('/invoices.draft')).toHaveLength(0);
	});

	it('fails on a stale selected payment term instead of substituting one', async () => {
		await expect(
			run('draft', draftFromDeal({ paymentTermSource: 'select', paymentTermId: 'term-gone' })),
		).rejects.toThrow('Payment term term-gone no longer exists');
	});

	it('fails when no line was entered', async () => {
		await expect(run('draft', draftFromDeal({ lines: {} }))).rejects.toThrow(
			'Add at least one invoice line.',
		);
		expect(callsTo('/invoices.draft')).toHaveLength(0);
	});

	it('fails when Deal Contact Person is chosen but the deal has none', async () => {
		mockApi({
			'/deals.info': {
				data: {
					id: 'deal-1',
					department: { id: 'dep-deal' },
					lead: { customer: { type: 'company', id: 'company-1' } },
				},
			},
		});

		await expect(
			run('draft', draftFromDeal({ forAttentionOfSource: 'dealContactPerson' })),
		).rejects.toThrow('has no contact person');
	});

	it('fails when the attention contact was left empty', async () => {
		await expect(
			run('draft', draftFromDeal({ forAttentionOfSource: 'contact' })),
		).rejects.toThrow('Select the contact the invoice is addressed to');
	});
});

describe('Create Draft payload discipline', () => {
	it('never forwards editor-only metadata', async () => {
		await run(
			'draft',
			draftFromDeal({
				sectionTitle: 'Materials',
				documentTemplateId: 'template-1',
				forAttentionOfSource: 'name',
				forAttentionOfName: 'Finance',
				advancedOptions: { currency: 'EUR' },
			}),
		);

		const serialised = JSON.stringify(bodyTo('/invoices.draft'));
		for (const key of [
			'customerSource',
			'paymentTermSource',
			'paymentTermId',
			'forAttentionOfSource',
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
		]) {
			expect(serialised).not.toContain(key);
		}
	});

	it('sends a payment term of exactly {type, days} and nothing more', async () => {
		await run('draft', draftFromDeal({ paymentTermSource: 'select', paymentTermId: 'term-30' }));
		expect(Object.keys(bodyTo('/invoices.draft').payment_term as IDataObject).sort()).toEqual([
			'days',
			'type',
		]);
	});

	it('reports a product currency mismatch on the output only', async () => {
		mockApi({
			'/products.info': {
				data: {
					id: 'product-1',
					name: 'Panel',
					selling_price: { amount: 40, currency: 'GBP' },
					tax_rate: { id: 'tax-product' },
				},
			},
		});

		const result = await run(
			'draft',
			draftFromDeal({
				lines: simpleLines({
					lineType: 'product',
					productId: { mode: 'list', value: 'product-1' },
					useProductDefaults: true,
					quantity: 1,
					lineOptions: {},
				}),
				advancedOptions: { currency: 'EUR' },
			}),
		);

		expect(JSON.stringify(bodyTo('/invoices.draft'))).not.toContain('warning');
		expect((result[0] as IDataObject)._warnings).toEqual([expect.stringContaining('priced in GBP')]);
	});
});

// -------------------------------------------------------------- update draft

describe('Update Draft request body', () => {
	it('sends only what was filled in', async () => {
		await run('update', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			note: 'Updated note',
			paymentTermSource: 'keep',
		});

		expect(bodyTo('/invoices.update')).toEqual({ id: 'invoice-1', note: 'Updated note' });
	});

	it('keeps the current payment term without touching paymentTerms.list', async () => {
		await run('update', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			paymentTermSource: 'keep',
			note: 'x',
		});

		expect(callsTo('/paymentTerms.list')).toHaveLength(0);
		expect(bodyTo('/invoices.update').payment_term).toBeUndefined();
	});

	it('omits grouped_lines and reads no product while Replace Lines is off', async () => {
		await run('update', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			paymentTermSource: 'keep',
			note: 'Updated',
			lines: simpleLines({
				lineType: 'product',
				productId: { mode: 'list', value: 'product-1' },
				useProductDefaults: true,
				quantity: 1,
				lineOptions: {},
			}),
		});

		expect(Object.keys(bodyTo('/invoices.update'))).not.toContain('grouped_lines');
		expect(callsTo('/products.info')).toHaveLength(0);
	});

	it('replaces the lines completely when asked', async () => {
		await run('update', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			paymentTermSource: 'keep',
			replaceLines: true,
			lines: simpleLines(customLine()),
		});

		expect(bodyTo('/invoices.update').grouped_lines).toHaveLength(1);
	});

	it('refuses to empty an invoice through an empty editor', async () => {
		await expect(
			run('update', {
				invoiceId: { mode: 'list', value: 'invoice-1' },
				paymentTermSource: 'keep',
				replaceLines: true,
			}),
		).rejects.toThrow('Replace Lines is on but no lines were provided');
		expect(callsTo('/invoices.update')).toHaveLength(0);
	});

	it('changes the invoicee only when explicitly gated', async () => {
		await run('update', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			paymentTermSource: 'keep',
			customer: { mode: 'companyList', value: 'company-9' },
			note: 'x',
		});
		expect(bodyTo('/invoices.update').invoicee).toBeUndefined();

		apiRequest.mockClear();
		await run('update', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			paymentTermSource: 'keep',
			changeInvoicee: true,
			customer: { mode: 'companyList', value: 'company-9' },
		});
		expect(bodyTo('/invoices.update').invoicee).toEqual({
			customer: { type: 'company', id: 'company-9' },
		});
	});

	it('requires at least one changed field', async () => {
		await expect(
			run('update', { invoiceId: { mode: 'list', value: 'invoice-1' }, paymentTermSource: 'keep' }),
		).rejects.toThrow('Fill in at least one field to update');
		expect(callsTo('/invoices.update')).toHaveLength(0);
	});
});

describe('Update Booked payload is restricted to the endpoint contract', () => {
	it('drops every field invoices.updateBooked does not accept', async () => {
		await run('updateBooked', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			paymentTermSource: 'select',
			paymentTermId: 'term-30',
			invoiceDate: '2026-03-01',
			note: 'Booked note',
			// Even if these somehow reach the executor, they must not be sent.
			documentTemplateId: 'template-1',
			advancedOptions: {
				projectId: 'project-1',
				customFields: { field: [{ id: 'cf-1', value: 'x' }] },
				currency: 'USD',
				exchangeRate: 1.2,
				discounts: { discount: [{ value: 5 }] },
				expectedPaymentMethod: 'cash',
				purchaseOrderNumber: 'PO-1',
			},
		});

		expect(bodyTo('/invoices.updateBooked')).toEqual({
			id: 'invoice-1',
			payment_term: { type: 'after_invoice_date', days: 30 },
			invoice_date: '2026-03-01',
			note: 'Booked note',
			project_id: 'project-1',
			custom_fields: [{ id: 'cf-1', value: 'x' }],
		});
	});

	it('uses the booked endpoint, not the draft one', async () => {
		await run('updateBooked', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			paymentTermSource: 'keep',
			note: 'x',
		});
		expect(callsTo('/invoices.update')).toHaveLength(0);
		expect(callsTo('/invoices.updateBooked')).toHaveLength(1);
	});
});

// -------------------------------------------------- get / get many / book / download

describe('Invoice Get and Get Many', () => {
	it('gets one invoice by ID', async () => {
		mockApi({ '/invoices.info': { data: { id: 'invoice-1' } } });
		const result = await run('get', { invoiceId: { mode: 'list', value: 'invoice-1' } });

		expect(bodyTo('/invoices.info')).toEqual({ id: 'invoice-1' });
		expect(result).toEqual([{ id: 'invoice-1' }]);
	});

	it('adds the late-fee include only when asked', async () => {
		mockApi({ '/invoices.info': { data: {} } });
		await run('get', {
			invoiceId: { mode: 'id', value: 'invoice-2' },
			options: { includeLateFees: true },
		});
		expect(bodyTo('/invoices.info')).toEqual({ id: 'invoice-2', includes: 'late_fees' });
	});

	it('lists without a filter by default', async () => {
		fetchList.mockResolvedValue([]);
		await run('getAll', {});
		expect(fetchList.mock.calls[0][0]).toBe('/invoices.list');
		expect(fetchList.mock.calls[0][2]).toEqual({});
	});

	it('passes filters, sort and includes through', async () => {
		fetchList.mockResolvedValue([]);
		await run('getAll', {
			filters: { status: ['outstanding'] },
			options: {
				includeLateFees: true,
				sort: { rule: [{ field: 'invoice_date', order: 'desc' }] },
			},
		});

		expect(fetchList.mock.calls[0][2]).toEqual({
			filter: { status: ['outstanding'] },
			sort: [{ field: 'invoice_date', order: 'desc' }],
			includes: 'late_fees',
		});
	});
});

describe('Invoice Book', () => {
	it('books on an explicit date-only value', async () => {
		mockApi({ '/invoices.book': {} });
		const result = await run('book', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			bookDate: '2026-03-01T15:00:00.000Z',
		});

		expect(bodyTo('/invoices.book')).toEqual({ id: 'invoice-1', on: '2026-03-01' });
		expect(result).toEqual([{ success: true, id: 'invoice-1', booked_on: '2026-03-01' }]);
	});

	it('never defaults the book date', async () => {
		await expect(run('book', { invoiceId: { mode: 'list', value: 'invoice-1' } })).rejects.toThrow(
			'Fill in the date to book this invoice on',
		);
		expect(callsTo('/invoices.book')).toHaveLength(0);
	});
});

describe('Invoice Download', () => {
	beforeEach(() => {
		mockApi({
			'/invoices.download': {
				data: { location: 'https://cdn.teamleader.eu/file', expires: '2026-03-01T16:00:00+00:00' },
			},
		});
		httpRequest.mockResolvedValue(Buffer.from('%PDF-1.4'));
		prepareBinaryData.mockImplementation(async (_buffer: Buffer, fileName: string, mimeType: string) => ({
			fileName,
			mimeType,
			data: 'base64',
		}));
	});

	it('asks for the requested format and returns binary data plus metadata', async () => {
		const result = await run('download', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			format: 'pdf',
			binaryPropertyName: 'data',
		});

		expect(bodyTo('/invoices.download')).toEqual({ id: 'invoice-1', format: 'pdf' });
		expect(httpRequest).toHaveBeenCalledWith({
			method: 'GET',
			url: 'https://cdn.teamleader.eu/file',
			encoding: 'arraybuffer',
			json: false,
		});
		expect(result[0]).toEqual({
			json: {
				id: 'invoice-1',
				format: 'pdf',
				expires: '2026-03-01T16:00:00+00:00',
				fileName: 'invoice-invoice-1.pdf',
			},
			binary: { data: { fileName: 'invoice-invoice-1.pdf', mimeType: 'application/pdf', data: 'base64' } },
		});
	});

	it('names UBL downloads as XML and honours the chosen binary field', async () => {
		const result = await run('download', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			format: 'ubl/e-fff',
			binaryPropertyName: 'invoice',
		});

		const item = result[0] as { binary: Record<string, { mimeType: string; fileName: string }> };
		expect(Object.keys(item.binary)).toEqual(['invoice']);
		expect(item.binary.invoice.mimeType).toBe('application/xml');
		expect(item.binary.invoice.fileName).toBe('invoice-invoice-1.xml');
	});

	it('fails clearly when Teamleader returns no download link', async () => {
		mockApi({ '/invoices.download': { data: {} } });
		await expect(
			run('download', { invoiceId: { mode: 'list', value: 'invoice-1' }, format: 'pdf' }),
		).rejects.toThrow('did not return a download link');
		expect(httpRequest).not.toHaveBeenCalled();
	});
});

describe('Unsupported invoice operations', () => {
	it('rejects an operation this stage does not implement', async () => {
		await expect(
			run('send', { invoiceId: { mode: 'list', value: 'invoice-1' } }),
		).rejects.toThrow('The operation "send" is not supported for resource "invoice"');
	});
});

describe('Stage 6 keeps its fields to itself', () => {
	it('scopes every V2 invoice field to the invoice resource', () => {
		for (const field of invoiceFields) {
			expect(field.displayOptions?.show?.resource).toEqual(['invoice']);
		}
	});
});
