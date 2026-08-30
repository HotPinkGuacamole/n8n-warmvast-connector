import type { IDataObject } from 'n8n-workflow';

import { TeamleaderExecutionContext } from '../nodes/Teamleader/helpers/context';
import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import { executeCompany } from '../nodes/Teamleader/v2/actions/company';
import { executeContact } from '../nodes/Teamleader/v2/actions/contact';
import { executeDeal } from '../nodes/Teamleader/v2/actions/deal';
import { executeInvoice } from '../nodes/Teamleader/v2/actions/invoice';
import { executeProduct } from '../nodes/Teamleader/v2/actions/product';
import { executeQuotation } from '../nodes/Teamleader/v2/actions/quotation';

jest.mock('../nodes/Teamleader/helpers/GenericFunctions', () => {
	const actual = jest.requireActual('../nodes/Teamleader/helpers/GenericFunctions');
	return { ...actual, teamleaderApiRequest: jest.fn(), teamleaderFetchList: jest.fn() };
});

const apiRequest = generic.teamleaderApiRequest as unknown as jest.Mock;
const fetchList = generic.teamleaderFetchList as unknown as jest.Mock;

/**
 * The request contract of every V2 operation, in one place.
 *
 * Individual suites cover the interesting behaviour of each resource; this one
 * guarantees that NO operation ships without its endpoint and request body
 * being pinned down, including the plain reads and deletes that are easy to
 * forget. Every case here states the exact endpoint and the exact body.
 */

function makeContext(parameters: IDataObject) {
	return {
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			parameters[name] !== undefined ? parameters[name] : fallback,
		getNode: () => ({ name: 'Teamleader' }),
		helpers: {
			httpRequest: jest.fn().mockResolvedValue(Buffer.from('file')),
			prepareBinaryData: jest.fn().mockResolvedValue({ data: 'base64' }),
		},
	} as never;
}

type Executor = (
	context: never,
	operation: string,
	itemIndex: number,
	executionContext: TeamleaderExecutionContext,
) => Promise<unknown>;

const executors: Record<string, Executor> = {
	contact: (context, operation, i) =>
		executeContact.call(context, operation, i) as Promise<unknown>,
	company: (context, operation, i) =>
		executeCompany.call(context, operation, i) as Promise<unknown>,
	deal: (context, operation, i, executionContext) =>
		executeDeal.call(context, operation, i, executionContext) as Promise<unknown>,
	product: (context, operation, i) =>
		executeProduct.call(context, operation, i) as Promise<unknown>,
	quotation: (context, operation, i, executionContext) =>
		executeQuotation.call(context, operation, i, executionContext) as Promise<unknown>,
	invoice: (context, operation, i, executionContext) =>
		executeInvoice.call(context, operation, i, executionContext) as Promise<unknown>,
};

async function run(resource: string, operation: string, parameters: IDataObject) {
	return await executors[resource](
		makeContext(parameters),
		operation,
		0,
		new TeamleaderExecutionContext(),
	);
}

const locator = (value: string) => ({ mode: 'list', value });

/** Canned reads so the deal/invoice/quotation resolvers have something to resolve. */
function mockApi() {
	apiRequest.mockImplementation(async (endpoint: string) => {
		if (endpoint === '/deals.info') {
			return {
				data: {
					id: 'deal-1',
					department: { id: 'dep-1' },
					lead: { customer: { type: 'company', id: 'company-1' } },
				},
			};
		}
		if (endpoint === '/paymentTerms.list') {
			return { data: [{ id: 'term-30', type: 'after_invoice_date', days: 30 }], meta: { default: 'term-30' } };
		}
		if (endpoint === '/invoices.download') return { data: { location: 'https://cdn.test/f' } };
		return { data: { id: 'created-1' } };
	});
	fetchList.mockResolvedValue([]);
}

beforeEach(() => {
	apiRequest.mockReset();
	fetchList.mockReset();
	mockApi();
});

const line = {
	lineType: 'custom',
	description: 'Work',
	quantity: 1,
	unitPrice: 10,
	taxRateId: 'tax-1',
	lineOptions: {},
};

/**
 * Every operation, its minimal valid input, and the exact request it makes.
 * `body: null` means the operation goes through the paging helper instead.
 */
const MATRIX: Array<{
	resource: string;
	operation: string;
	parameters: IDataObject;
	endpoint: string;
	body?: IDataObject;
	listBody?: IDataObject;
}> = [
	// ------------------------------------------------------------- contact
	{
		resource: 'contact',
		operation: 'get',
		parameters: { contactId: locator('contact-1') },
		endpoint: '/contacts.info',
		body: { id: 'contact-1' },
	},
	{
		resource: 'contact',
		operation: 'getAll',
		parameters: {},
		endpoint: '/contacts.list',
		listBody: {},
	},
	{
		resource: 'contact',
		operation: 'create',
		parameters: { lastName: 'Peeters' },
		endpoint: '/contacts.add',
		body: { last_name: 'Peeters' },
	},
	{
		resource: 'contact',
		operation: 'update',
		parameters: { contactId: locator('contact-1'), firstName: 'Jan' },
		endpoint: '/contacts.update',
		body: { id: 'contact-1', first_name: 'Jan' },
	},
	{
		resource: 'contact',
		operation: 'delete',
		parameters: { contactId: locator('contact-1') },
		endpoint: '/contacts.delete',
		body: { id: 'contact-1' },
	},
	{
		resource: 'contact',
		operation: 'tag',
		parameters: { contactId: locator('contact-1'), tags: ['prospect'] },
		endpoint: '/contacts.tag',
		body: { id: 'contact-1', tags: ['prospect'] },
	},
	{
		resource: 'contact',
		operation: 'untag',
		parameters: { contactId: locator('contact-1'), tags: ['prospect'] },
		endpoint: '/contacts.untag',
		body: { id: 'contact-1', tags: ['prospect'] },
	},
	{
		resource: 'contact',
		operation: 'linkToCompany',
		parameters: { contactId: locator('contact-1'), companyId: locator('company-1') },
		endpoint: '/contacts.linkToCompany',
		body: { id: 'contact-1', company_id: 'company-1' },
	},
	{
		resource: 'contact',
		operation: 'unlinkFromCompany',
		parameters: { contactId: locator('contact-1'), companyId: locator('company-1') },
		endpoint: '/contacts.unlinkFromCompany',
		body: { id: 'contact-1', company_id: 'company-1' },
	},

	// ------------------------------------------------------------- company
	{
		resource: 'company',
		operation: 'get',
		parameters: { companyId: locator('company-1') },
		endpoint: '/companies.info',
		body: { id: 'company-1' },
	},
	{
		resource: 'company',
		operation: 'getAll',
		parameters: {},
		endpoint: '/companies.list',
		listBody: {},
	},
	{
		resource: 'company',
		operation: 'create',
		parameters: { name: 'Acme BV' },
		endpoint: '/companies.add',
		body: { name: 'Acme BV' },
	},
	{
		resource: 'company',
		operation: 'update',
		parameters: { companyId: locator('company-1'), name: 'Acme NV' },
		endpoint: '/companies.update',
		body: { id: 'company-1', name: 'Acme NV' },
	},
	{
		resource: 'company',
		operation: 'delete',
		parameters: { companyId: locator('company-1') },
		endpoint: '/companies.delete',
		body: { id: 'company-1' },
	},
	{
		resource: 'company',
		operation: 'tag',
		parameters: { companyId: locator('company-1'), tags: ['expo'] },
		endpoint: '/companies.tag',
		body: { id: 'company-1', tags: ['expo'] },
	},
	{
		resource: 'company',
		operation: 'untag',
		parameters: { companyId: locator('company-1'), tags: ['expo'] },
		endpoint: '/companies.untag',
		body: { id: 'company-1', tags: ['expo'] },
	},

	// ---------------------------------------------------------------- deal
	{
		resource: 'deal',
		operation: 'get',
		parameters: { dealId: locator('deal-1') },
		endpoint: '/deals.info',
		body: { id: 'deal-1' },
	},
	{
		resource: 'deal',
		operation: 'getAll',
		parameters: {},
		endpoint: '/deals.list',
		listBody: {},
	},
	{
		resource: 'deal',
		operation: 'create',
		parameters: {
			title: 'Roof job',
			customerId: { mode: 'companyList', value: 'company-1' },
			phaseId: 'phase-1',
		},
		endpoint: '/deals.create',
		body: {
			title: 'Roof job',
			lead: { customer: { type: 'company', id: 'company-1' } },
			phase_id: 'phase-1',
		},
	},
	{
		resource: 'deal',
		operation: 'update',
		parameters: { dealId: locator('deal-1'), title: 'Roof job v2' },
		endpoint: '/deals.update',
		body: { id: 'deal-1', title: 'Roof job v2' },
	},
	{
		resource: 'deal',
		operation: 'move',
		parameters: { dealId: locator('deal-1'), phaseId: 'phase-2' },
		endpoint: '/deals.move',
		body: { id: 'deal-1', phase_id: 'phase-2' },
	},
	{
		resource: 'deal',
		operation: 'win',
		parameters: { dealId: locator('deal-1') },
		endpoint: '/deals.win',
		body: { id: 'deal-1' },
	},
	{
		resource: 'deal',
		operation: 'lose',
		parameters: { dealId: locator('deal-1') },
		endpoint: '/deals.lose',
		body: { id: 'deal-1' },
	},

	// ------------------------------------------------------------- product
	{
		resource: 'product',
		operation: 'get',
		parameters: { productId: locator('product-1') },
		endpoint: '/products.info',
		body: { id: 'product-1' },
	},
	{
		resource: 'product',
		operation: 'getAll',
		parameters: {},
		endpoint: '/products.list',
		listBody: {},
	},
	{
		resource: 'product',
		operation: 'create',
		parameters: { name: 'Panel' },
		endpoint: '/products.add',
		body: { name: 'Panel' },
	},
	{
		resource: 'product',
		operation: 'update',
		parameters: { productId: locator('product-1'), name: 'Panel XL' },
		endpoint: '/products.update',
		body: { id: 'product-1', name: 'Panel XL' },
	},
	{
		resource: 'product',
		operation: 'delete',
		parameters: { productId: locator('product-1') },
		endpoint: '/products.delete',
		body: { id: 'product-1' },
	},

	// ----------------------------------------------------------- quotation
	{
		resource: 'quotation',
		operation: 'get',
		parameters: { quotationId: locator('quotation-1') },
		endpoint: '/quotations.info',
		body: { id: 'quotation-1' },
	},
	{
		resource: 'quotation',
		operation: 'getAll',
		parameters: {},
		endpoint: '/quotations.list',
		listBody: {},
	},
	{
		resource: 'quotation',
		operation: 'create',
		parameters: { dealId: locator('deal-1'), text: 'Offer' },
		endpoint: '/quotations.create',
		body: { deal_id: 'deal-1', text: 'Offer' },
	},
	{
		resource: 'quotation',
		operation: 'update',
		parameters: { quotationId: locator('quotation-1'), text: 'Offer v2' },
		endpoint: '/quotations.update',
		body: { id: 'quotation-1', text: 'Offer v2' },
	},
	{
		resource: 'quotation',
		operation: 'accept',
		parameters: { quotationId: locator('quotation-1') },
		endpoint: '/quotations.accept',
		body: { id: 'quotation-1' },
	},
	{
		resource: 'quotation',
		operation: 'delete',
		parameters: { quotationId: locator('quotation-1') },
		endpoint: '/quotations.delete',
		body: { id: 'quotation-1' },
	},
	{
		resource: 'quotation',
		operation: 'send',
		parameters: {
			quotationId: locator('quotation-1'),
			recipientSource: 'custom',
			to: { recipient: [{ email: 'a@b.test' }] },
			messageSource: 'manual',
			subject: 'Offer',
			content: 'Sign at #LINK',
		},
		endpoint: '/quotations.send',
		body: {
			quotations: ['quotation-1'],
			recipients: { to: [{ email_address: 'a@b.test' }] },
			subject: 'Offer',
			content: 'Sign at #LINK',
			language: 'nl',
		},
	},

	// ------------------------------------------------------------- invoice
	{
		resource: 'invoice',
		operation: 'get',
		parameters: { invoiceId: locator('invoice-1') },
		endpoint: '/invoices.info',
		body: { id: 'invoice-1' },
	},
	{
		resource: 'invoice',
		operation: 'getAll',
		parameters: {},
		endpoint: '/invoices.list',
		listBody: {},
	},
	{
		resource: 'invoice',
		operation: 'draft',
		parameters: {
			customerSource: 'fromDeal',
			dealId: locator('deal-1'),
			paymentTermSource: 'default',
			lines: { line: [line] },
		},
		endpoint: '/invoices.draft',
		body: {
			invoicee: { customer: { type: 'company', id: 'company-1' } },
			department_id: 'dep-1',
			payment_term: { type: 'after_invoice_date', days: 30 },
			grouped_lines: [
				{
					line_items: [
						{
							quantity: 1,
							description: 'Work',
							unit_price: { amount: 10, tax: 'excluding' },
							tax_rate_id: 'tax-1',
						},
					],
				},
			],
		},
	},
	{
		resource: 'invoice',
		operation: 'update',
		parameters: { invoiceId: locator('invoice-1'), paymentTermSource: 'keep', note: 'Note' },
		endpoint: '/invoices.update',
		body: { id: 'invoice-1', note: 'Note' },
	},
	{
		resource: 'invoice',
		operation: 'updateBooked',
		parameters: { invoiceId: locator('invoice-1'), paymentTermSource: 'keep', note: 'Note' },
		endpoint: '/invoices.updateBooked',
		body: { id: 'invoice-1', note: 'Note' },
	},
	{
		resource: 'invoice',
		operation: 'book',
		parameters: { invoiceId: locator('invoice-1'), bookDate: '2026-03-01' },
		endpoint: '/invoices.book',
		body: { id: 'invoice-1', on: '2026-03-01' },
	},
	{
		resource: 'invoice',
		operation: 'download',
		parameters: { invoiceId: locator('invoice-1'), format: 'pdf' },
		endpoint: '/invoices.download',
		body: { id: 'invoice-1', format: 'pdf' },
	},
	{
		resource: 'invoice',
		operation: 'send',
		parameters: {
			invoiceId: locator('invoice-1'),
			recipientSource: 'default',
			messageSource: 'manual',
			subject: 'Invoice',
			body: 'Attached',
		},
		endpoint: '/invoices.send',
		body: { id: 'invoice-1', content: { subject: 'Invoice', body: 'Attached' } },
	},
	{
		resource: 'invoice',
		operation: 'registerPayment',
		parameters: {
			invoiceId: locator('invoice-1'),
			amountSource: 'manual',
			amount: 100,
			currency: 'EUR',
			paidAt: '2026-03-02T09:30:00.000Z',
		},
		endpoint: '/invoices.registerPayment',
		body: {
			id: 'invoice-1',
			payment: { amount: 100, currency: 'EUR' },
			paid_at: '2026-03-02T09:30:00+00:00',
		},
	},
	{
		resource: 'invoice',
		operation: 'removePayments',
		parameters: { invoiceId: locator('invoice-1') },
		endpoint: '/invoices.removePayments',
		body: { id: 'invoice-1' },
	},
	{
		resource: 'invoice',
		operation: 'credit',
		parameters: { invoiceId: locator('invoice-1') },
		endpoint: '/invoices.credit',
		body: { id: 'invoice-1' },
	},
	{
		resource: 'invoice',
		operation: 'creditPartially',
		parameters: { invoiceId: locator('invoice-1'), lines: { line: [line] } },
		endpoint: '/invoices.creditPartially',
		body: {
			id: 'invoice-1',
			grouped_lines: [
				{
					line_items: [
						{
							quantity: 1,
							description: 'Work',
							unit_price: { amount: 10, tax: 'excluding' },
							tax_rate_id: 'tax-1',
						},
					],
				},
			],
		},
	},
];

describe('every V2 operation has a pinned request contract', () => {
	it.each(MATRIX.map((entry) => [`${entry.resource}.${entry.operation}`, entry] as const))(
		'%s',
		async (_name, entry) => {
			await run(entry.resource, entry.operation, entry.parameters);

			if (entry.listBody !== undefined) {
				expect(fetchList.mock.calls[0][0]).toBe(entry.endpoint);
				expect(fetchList.mock.calls[0][2]).toEqual(entry.listBody);
				return;
			}

			const call = apiRequest.mock.calls.find((entryCall) => entryCall[0] === entry.endpoint);
			expect(call).toBeDefined();
			expect(call?.[1]).toEqual(entry.body);
		},
	);

	it('covers every operation the node offers', () => {
		// Guards against an operation being added without a contract case here.
		const covered = new Set(MATRIX.map((entry) => `${entry.resource}.${entry.operation}`));
		const expected = [
			'contact.get', 'contact.getAll', 'contact.create', 'contact.update', 'contact.delete',
			'contact.tag', 'contact.untag', 'contact.linkToCompany', 'contact.unlinkFromCompany',
			'company.get', 'company.getAll', 'company.create', 'company.update', 'company.delete',
			'company.tag', 'company.untag',
			'deal.get', 'deal.getAll', 'deal.create', 'deal.update', 'deal.move', 'deal.win', 'deal.lose',
			'product.get', 'product.getAll', 'product.create', 'product.update', 'product.delete',
			'quotation.get', 'quotation.getAll', 'quotation.create', 'quotation.update',
			'quotation.accept', 'quotation.delete', 'quotation.send',
			'invoice.get', 'invoice.getAll', 'invoice.draft', 'invoice.update', 'invoice.updateBooked',
			'invoice.book', 'invoice.download', 'invoice.send', 'invoice.registerPayment',
			'invoice.removePayments', 'invoice.credit', 'invoice.creditPartially',
		];
		for (const operation of expected) expect(covered.has(operation)).toBe(true);
		expect(covered.size).toBe(expected.length);
	});
});

describe('minimal input never sends a field the user did not fill in', () => {
	it.each(
		MATRIX.filter((entry) => entry.listBody === undefined).map(
			(entry) => [`${entry.resource}.${entry.operation}`, entry] as const,
		),
	)('%s sends no editor-only metadata', async (_name, entry) => {
		await run(entry.resource, entry.operation, entry.parameters);

		const call = apiRequest.mock.calls.find((entryCall) => entryCall[0] === entry.endpoint);
		const serialised = JSON.stringify(call?.[1]);

		for (const key of [
			'lineType',
			'useProductDefaults',
			'lineOptions',
			'useSections',
			'sectionTitle',
			'replaceLines',
			'lookupDepartmentId',
			'recipientSource',
			'customerSource',
			'paymentTermSource',
			'amountSource',
			'messageSource',
			'advancedOptions',
			'changeInvoicee',
			'_warnings',
		]) {
			expect(serialised).not.toContain(key);
		}
	});
});
