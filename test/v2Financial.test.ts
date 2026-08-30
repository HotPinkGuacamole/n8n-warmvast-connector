import type { IDataObject, INodeProperties } from 'n8n-workflow';

import { TeamleaderExecutionContext } from '../nodes/Teamleader/helpers/context';
import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import { executeInvoice } from '../nodes/Teamleader/v2/actions/invoice';
import {
	invoiceFields,
	invoiceOperations,
} from '../nodes/Teamleader/v2/descriptions/InvoiceDescription';

jest.mock('../nodes/Teamleader/helpers/GenericFunctions', () => {
	const actual = jest.requireActual('../nodes/Teamleader/helpers/GenericFunctions');
	return { ...actual, teamleaderApiRequest: jest.fn(), teamleaderFetchList: jest.fn() };
});

const apiRequest = generic.teamleaderApiRequest as unknown as jest.Mock;

function makeContext(parameters: IDataObject) {
	return {
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			parameters[name] !== undefined ? parameters[name] : fallback,
		getNode: () => ({ name: 'Teamleader' }),
	} as never;
}

async function run(operation: string, parameters: IDataObject, context = new TeamleaderExecutionContext()) {
	return await executeInvoice.call(makeContext(parameters), operation, 0, context);
}

const callsTo = (endpoint: string) => apiRequest.mock.calls.filter((call) => call[0] === endpoint);
const bodyTo = (endpoint: string) => callsTo(endpoint)[0]?.[1] as IDataObject;

const forOperation = (operation: string) =>
	invoiceFields.filter((field) =>
		(field.displayOptions?.show?.operation as string[] | undefined)?.includes(operation),
	);
const names = (fields: INodeProperties[]) => fields.map((field) => field.name);

const INVOICE_INFO = {
	data: {
		id: 'invoice-1',
		invoicee: { customer: { type: 'company', id: 'company-1' } },
		currency: 'EUR',
		total: { due: { amount: 121.55, currency: 'EUR' } },
	},
};

function mockApi(overrides: Record<string, unknown> = {}) {
	apiRequest.mockImplementation(async (endpoint: string) => {
		if (endpoint in overrides) {
			const value = overrides[endpoint];
			if (value instanceof Error) throw value;
			return value;
		}
		if (endpoint === '/invoices.info') return INVOICE_INFO;
		if (endpoint === '/invoices.credit' || endpoint === '/invoices.creditPartially') {
			return { data: { type: 'creditNote', id: 'credit-1' } };
		}
		return {};
	});
}

const creditLine = (overrides: IDataObject = {}): IDataObject => ({
	lineType: 'custom',
	description: 'Overcharged insulation',
	quantity: 1,
	unitPrice: 50,
	taxRateId: 'tax-1',
	lineOptions: {},
	...overrides,
});

beforeEach(() => {
	apiRequest.mockReset();
	mockApi();
});

// ------------------------------------------------------------------ the set

describe('V2 Invoice now covers the financial operations', () => {
	it('offers the complete final operation set', () => {
		expect(
			invoiceOperations[0].options?.map((option) => (option as { value: string }).value).sort(),
		).toEqual([
			'book',
			'credit',
			'creditPartially',
			'download',
			'draft',
			'get',
			'getAll',
			'registerPayment',
			'removePayments',
			'send',
			'update',
			'updateBooked',
		]);
	});
});

// ----------------------------------------------------------- register payment

describe('Register Payment', () => {
	it('pays off exactly what Teamleader reports as due, in its own currency', async () => {
		const result = await run('registerPayment', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			amountSource: 'outstanding',
			paidAt: '2026-03-02T09:30:00.000Z',
		});

		expect(bodyTo('/invoices.registerPayment')).toEqual({
			id: 'invoice-1',
			payment: { amount: 121.55, currency: 'EUR' },
			// A true timestamp, not a truncated date.
			paid_at: '2026-03-02T09:30:00+00:00',
		});
		expect((result[0] as IDataObject).payment).toEqual({ amount: 121.55, currency: 'EUR' });
	});

	it('registers a manual partial amount', async () => {
		await run('registerPayment', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			amountSource: 'manual',
			amount: 50,
			currency: 'EUR',
			paidAt: '2026-03-02T09:30:00.000Z',
		});

		expect(bodyTo('/invoices.registerPayment').payment).toEqual({ amount: 50, currency: 'EUR' });
		// A manual amount needs no invoice read at all.
		expect(callsTo('/invoices.info')).toHaveLength(0);
	});

	it('refuses a zero manual amount rather than registering nothing', async () => {
		await expect(
			run('registerPayment', {
				invoiceId: { mode: 'list', value: 'invoice-1' },
				amountSource: 'manual',
				amount: 0,
				paidAt: '2026-03-02T09:30:00.000Z',
			}),
		).rejects.toThrow('Fill in a payment amount greater than 0');
		expect(callsTo('/invoices.registerPayment')).toHaveLength(0);
	});

	it('refuses a negative manual amount', async () => {
		await expect(
			run('registerPayment', {
				invoiceId: { mode: 'list', value: 'invoice-1' },
				amountSource: 'manual',
				amount: -10,
				paidAt: '2026-03-02T09:30:00.000Z',
			}),
		).rejects.toThrow('greater than 0');
	});

	it('refuses to register a payment on an invoice with nothing outstanding', async () => {
		mockApi({
			'/invoices.info': {
				data: { id: 'invoice-1', total: { due: { amount: 0, currency: 'EUR' } } },
			},
		});

		await expect(
			run('registerPayment', {
				invoiceId: { mode: 'list', value: 'invoice-1' },
				amountSource: 'outstanding',
				paidAt: '2026-03-02T09:30:00.000Z',
			}),
		).rejects.toThrow('has nothing outstanding');
		expect(callsTo('/invoices.registerPayment')).toHaveLength(0);
	});

	it('refuses to guess when Teamleader reports no outstanding amount', async () => {
		mockApi({ '/invoices.info': { data: { id: 'invoice-1', total: {} } } });

		await expect(
			run('registerPayment', {
				invoiceId: { mode: 'list', value: 'invoice-1' },
				amountSource: 'outstanding',
				paidAt: '2026-03-02T09:30:00.000Z',
			}),
		).rejects.toThrow('Could not read the outstanding amount');
	});

	it('never converts: a USD invoice is paid in USD', async () => {
		mockApi({
			'/invoices.info': {
				data: { id: 'invoice-1', currency: 'USD', total: { due: { amount: 100, currency: 'USD' } } },
			},
		});

		await run('registerPayment', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			amountSource: 'outstanding',
			paidAt: '2026-03-02T09:30:00.000Z',
		});

		expect(bodyTo('/invoices.registerPayment').payment).toEqual({ amount: 100, currency: 'USD' });
	});

	it('requires the payment date instead of defaulting to now', async () => {
		await expect(
			run('registerPayment', {
				invoiceId: { mode: 'list', value: 'invoice-1' },
				amountSource: 'manual',
				amount: 10,
			}),
		).rejects.toThrow('Fill in when this payment was received');
		expect(callsTo('/invoices.registerPayment')).toHaveLength(0);
	});

	it('adds the payment method only when one was chosen', async () => {
		await run('registerPayment', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			amountSource: 'manual',
			amount: 10,
			paidAt: '2026-03-02T09:30:00.000Z',
			paymentMethodId: 'method-1',
		});
		expect(bodyTo('/invoices.registerPayment').payment_method_id).toBe('method-1');

		apiRequest.mockClear();
		await run('registerPayment', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			amountSource: 'manual',
			amount: 10,
			paidAt: '2026-03-02T09:30:00.000Z',
		});
		expect(Object.keys(bodyTo('/invoices.registerPayment'))).not.toContain('payment_method_id');
	});

	it('keeps editor-only fields out of the request', async () => {
		await run('registerPayment', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			amountSource: 'outstanding',
			paidAt: '2026-03-02T09:30:00.000Z',
		});
		expect(JSON.stringify(bodyTo('/invoices.registerPayment'))).not.toContain('amountSource');
	});

	it('reads the invoice once when several items pay the same one', async () => {
		const executionContext = new TeamleaderExecutionContext();
		const parameters = {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			amountSource: 'outstanding',
			paidAt: '2026-03-02T09:30:00.000Z',
		};
		await run('registerPayment', parameters, executionContext);
		await run('registerPayment', parameters, executionContext);

		expect(callsTo('/invoices.info')).toHaveLength(1);
		expect(callsTo('/invoices.registerPayment')).toHaveLength(2);
	});
});

// ------------------------------------------------------------ remove payments

describe('Remove Payments', () => {
	it('sends only the invoice ID', async () => {
		const result = await run('removePayments', { invoiceId: { mode: 'list', value: 'invoice-1' } });

		expect(callsTo('/invoices.removePayments')[0][1]).toEqual({ id: 'invoice-1' });
		expect(result).toEqual([{ success: true, id: 'invoice-1', paid: false }]);
	});

	it('warns plainly without a fake confirmation checkbox', () => {
		const fields = forOperation('removePayments');
		const notice = fields.find((field) => field.name === 'removePaymentsNotice');
		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toContain('cannot be undone');
		expect(names(fields)).not.toContain('confirm');
	});
});

// --------------------------------------------------------------- credit fully

describe('Credit Fully', () => {
	it('credits with just the ID by default', async () => {
		const result = await run('credit', { invoiceId: { mode: 'list', value: 'invoice-1' } });

		expect(bodyTo('/invoices.credit')).toEqual({ id: 'invoice-1' });
		expect(result).toEqual([{ type: 'creditNote', id: 'credit-1' }]);
	});

	it('sends a date-only credit note date when given', async () => {
		await run('credit', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			creditNoteDate: '2026-03-05T12:00:00.000Z',
		});
		expect(bodyTo('/invoices.credit')).toEqual({ id: 'invoice-1', credit_note_date: '2026-03-05' });
	});

	it('carries a financial notice', () => {
		const notice = forOperation('credit').find((field) => field.name === 'creditNotice');
		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toContain('credit note');
	});
});

// ----------------------------------------------------------- credit partially

describe('Credit Partially', () => {
	it('sends the explicit credit lines', async () => {
		await run('creditPartially', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			lines: { line: [creditLine()] },
		});

		expect(bodyTo('/invoices.creditPartially')).toEqual({
			id: 'invoice-1',
			grouped_lines: [
				{
					line_items: [
						{
							quantity: 1,
							description: 'Overcharged insulation',
							unit_price: { amount: 50, tax: 'excluding' },
							tax_rate_id: 'tax-1',
						},
					],
				},
			],
		});
	});

	it('supports sections, a credit note date and discounts', async () => {
		await run('creditPartially', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			sectionTitle: 'Corrections',
			lines: { line: [creditLine()] },
			creditNoteDate: '2026-03-05',
			advancedOptions: { discounts: { discount: [{ value: 10, description: 'Goodwill' }] } },
		});

		const body = bodyTo('/invoices.creditPartially');
		expect((body.grouped_lines as IDataObject[])[0].section).toEqual({ title: 'Corrections' });
		expect(body.credit_note_date).toBe('2026-03-05');
		expect(body.discounts).toEqual([{ type: 'percentage', value: 10, description: 'Goodwill' }]);
	});

	it('refuses an empty credit note rather than crediting nothing', async () => {
		await expect(
			run('creditPartially', { invoiceId: { mode: 'list', value: 'invoice-1' } }),
		).rejects.toThrow('Add at least one line to credit.');
		expect(callsTo('/invoices.creditPartially')).toHaveLength(0);
	});

	it('hydrates a product credit line through the shared helper', async () => {
		mockApi({
			'/products.info': {
				data: {
					id: 'product-1',
					name: 'Panel',
					selling_price: { amount: 40, currency: 'EUR' },
					tax_rate: { id: 'tax-product' },
				},
			},
		});

		await run('creditPartially', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			lines: {
				line: [
					{
						lineType: 'product',
						productId: { mode: 'list', value: 'product-1' },
						useProductDefaults: true,
						quantity: 1,
						lineOptions: {},
					},
				],
			},
		});

		const items = (bodyTo('/invoices.creditPartially').grouped_lines as IDataObject[])[0]
			.line_items as IDataObject[];
		expect(items[0]).toMatchObject({ product_id: 'product-1', description: 'Panel' });
	});

	it('explains why lines cannot be picked from the invoice', () => {
		const notice = forOperation('creditPartially').find(
			(field) => field.name === 'creditPartiallyNotice',
		);
		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toContain('stable line ID');
	});

	it('never reads the invoice to guess what to credit', async () => {
		await run('creditPartially', {
			invoiceId: { mode: 'list', value: 'invoice-1' },
			lines: { line: [creditLine()] },
		});
		expect(callsTo('/invoices.info')).toHaveLength(0);
	});
});
