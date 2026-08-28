import type { IDataObject, INodeExecutionData } from 'n8n-workflow';

import {
	buildExpectedPaymentMethod,
	buildInvoiceFilter,
	buildInvoiceGroupedLines,
	buildInvoiceLineItem,
	buildInvoicePayload,
	buildInvoiceSendPayload,
	buildInvoicee,
	buildPaymentTerm,
	executeInvoice,
} from '../nodes/Teamleader/actions/invoice';

/** Minimal IExecuteFunctions stub driven by a parameter map. */
function createContext(params: IDataObject, request = jest.fn().mockResolvedValue({ data: {} })) {
	const httpRequest = jest.fn().mockResolvedValue(Buffer.from('PDF-BYTES'));
	const prepareBinaryData = jest
		.fn()
		.mockImplementation(async (buffer: Buffer, fileName: string, mimeType: string) => ({
			data: buffer.toString('base64'),
			fileName,
			mimeType,
		}));

	return {
		context: {
			getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
				name in params ? params[name] : fallback,
			getNode: () => ({ name: 'Teamleader', type: 'teamleader' }),
			getCredentials: jest.fn().mockResolvedValue({}),
			helpers: {
				httpRequestWithAuthentication: request,
				httpRequest,
				prepareBinaryData,
			},
		},
		request,
		httpRequest,
		prepareBinaryData,
	};
}

const lastCall = (request: jest.Mock) => request.mock.calls[request.mock.calls.length - 1][1];

const LINE = {
	description: 'An awesome product',
	quantity: 3,
	unitPrice: 123.3,
	taxRateId: 'tax-1',
};

const MINIMAL_LINE = {
	quantity: 3,
	description: 'An awesome product',
	unit_price: { amount: 123.3, tax: 'excluding' },
	tax_rate_id: 'tax-1',
};

describe('buildInvoiceLineItem', () => {
	it('builds the minimal line shape', () => {
		expect(buildInvoiceLineItem({ ...LINE })).toEqual(MINIMAL_LINE);
	});

	it('maps product, category, unit, withholding tax, discount and extended description', () => {
		expect(
			buildInvoiceLineItem({
				...LINE,
				productId: 'prod-1',
				productCategoryId: 'cat-1',
				unitOfMeasureId: 'unit-1',
				withholdingTaxRateId: 'wht-1',
				discount: 10,
				extendedDescription: 'more info',
			}),
		).toEqual({
			...MINIMAL_LINE,
			product_id: 'prod-1',
			product_category_id: 'cat-1',
			unit_of_measure_id: 'unit-1',
			withholding_tax_rate_id: 'wht-1',
			discount: { value: 10, type: 'percentage' },
			extended_description: 'more info',
		});
	});

	it('omits empty optional line fields', () => {
		expect(
			buildInvoiceLineItem({
				...LINE,
				productId: '',
				productCategoryId: '',
				unitOfMeasureId: '',
				withholdingTaxRateId: '',
				discount: 0,
				extendedDescription: '',
			}),
		).toEqual(MINIMAL_LINE);
	});
});

describe('buildInvoiceGroupedLines', () => {
	it('transforms groups with section titles and drops empty groups', () => {
		expect(
			buildInvoiceGroupedLines({
				group: [
					{ title: 'Services', lineItems: { item: [{ ...LINE }] } },
					{ title: 'Empty', lineItems: { item: [{ description: '' }] } },
				],
			}),
		).toEqual([{ section: { title: 'Services' }, line_items: [MINIMAL_LINE] }]);
	});

	it('returns undefined when nothing usable is given', () => {
		expect(buildInvoiceGroupedLines({})).toBeUndefined();
	});
});

describe('buildPaymentTerm / buildExpectedPaymentMethod / buildInvoicee', () => {
	it('builds a payment term with and without days', () => {
		expect(buildPaymentTerm({ paymentTermType: 'after_invoice_date', paymentTermDays: 30 })).toEqual(
			{ type: 'after_invoice_date', days: 30 },
		);
		expect(buildPaymentTerm({ paymentTermType: 'cash', paymentTermDays: 30 })).toEqual({
			type: 'cash',
		});
		expect(buildPaymentTerm({})).toBeUndefined();
	});

	it('adds a reference only for mandate-based payment methods', () => {
		expect(
			buildExpectedPaymentMethod({
				expectedPaymentMethod: 'sepa_direct_debit',
				expectedPaymentReference: 'AB1234',
			}),
		).toEqual({ method: 'sepa_direct_debit', reference: 'AB1234' });
		expect(
			buildExpectedPaymentMethod({
				expectedPaymentMethod: 'cash',
				expectedPaymentReference: 'AB1234',
			}),
		).toEqual({ method: 'cash' });
		expect(buildExpectedPaymentMethod({})).toBeUndefined();
	});

	it('builds an invoicee with an optional for_attention_of', () => {
		expect(buildInvoicee('company', 'cust-1')).toEqual({
			customer: { type: 'company', id: 'cust-1' },
		});
		expect(buildInvoicee('contact', 'cust-1', { forAttentionOfName: 'Finance Dept.' })).toEqual({
			customer: { type: 'contact', id: 'cust-1' },
			for_attention_of: { name: 'Finance Dept.' },
		});
		expect(buildInvoicee('contact', 'cust-1', { forAttentionOfContactId: 'c-9' })).toEqual({
			customer: { type: 'contact', id: 'cust-1' },
			for_attention_of: { contact_id: 'c-9' },
		});
		expect(buildInvoicee('company', '')).toBeUndefined();
	});
});

describe('buildInvoicePayload', () => {
	it('maps every supported draft field', () => {
		expect(
			buildInvoicePayload({
				invoiceDate: '2026-02-04T00:00:00.000Z',
				paymentTermType: 'after_invoice_date',
				paymentTermDays: 30,
				currency: 'USD',
				exchangeRate: 1.1238,
				projectId: 'proj-1',
				purchaseOrderNumber: '000023',
				note: 'Invoice comments',
				documentTemplateId: 'tpl-1',
				expectedPaymentMethod: 'bank_transfer',
				groupedLines: { group: [{ lineItems: { item: [{ ...LINE }] } }] },
				discounts: { discount: [{ value: 10 }] },
				customFields: { field: [{ id: 'cf-1', value: 'v' }] },
			}),
		).toEqual({
			invoice_date: '2026-02-04',
			payment_term: { type: 'after_invoice_date', days: 30 },
			currency: { code: 'USD', exchange_rate: 1.1238 },
			project_id: 'proj-1',
			purchase_order_number: '000023',
			note: 'Invoice comments',
			document_template_id: 'tpl-1',
			expected_payment_method: { method: 'bank_transfer' },
			grouped_lines: [{ line_items: [MINIMAL_LINE] }],
			discounts: [{ type: 'percentage', value: 10 }],
			custom_fields: [{ id: 'cf-1', value: 'v' }],
		});
	});

	it('drops fields unsupported by updateBooked', () => {
		const payload = buildInvoicePayload(
			{
				purchaseOrderNumber: '000023',
				currency: 'EUR',
				documentTemplateId: 'tpl-1',
				discounts: { discount: [{ value: 10 }] },
				expectedPaymentMethod: 'cash',
				note: 'kept',
			},
			true,
		);

		expect(payload).toEqual({ note: 'kept' });
	});

	it('omits every empty optional field', () => {
		expect(
			buildInvoicePayload({
				invoiceDate: '',
				currency: '',
				exchangeRate: '',
				projectId: '',
				purchaseOrderNumber: '',
				note: '',
				documentTemplateId: '',
				groupedLines: {},
				discounts: {},
				customFields: {},
			}),
		).toEqual({});
	});
});

describe('buildInvoiceFilter', () => {
	it('maps all exposed official filters', () => {
		expect(
			buildInvoiceFilter({
				term: 'Interesting',
				ids: 'a, b',
				invoiceNumber: '2017 / 5',
				departmentId: 'dept-1',
				dealId: 'deal-1',
				projectId: 'proj-1',
				purchaseOrderNumber: '000023',
				paymentReference: '+++084+++',
				status: ['draft', 'outstanding'],
				customerType: 'contact',
				customerId: 'cust-1',
				invoiceDateAfter: '2026-01-01T00:00:00.000Z',
				invoiceDateBefore: '2026-06-01',
				updatedSince: '2026-02-04T16:44:33+00:00',
			}),
		).toEqual({
			term: 'Interesting',
			ids: ['a', 'b'],
			invoice_number: '2017 / 5',
			department_id: 'dept-1',
			deal_id: 'deal-1',
			project_id: 'proj-1',
			purchase_order_number: '000023',
			payment_reference: '+++084+++',
			status: ['draft', 'outstanding'],
			customer: { type: 'contact', id: 'cust-1' },
			invoice_date_after: '2026-01-01',
			invoice_date_before: '2026-06-01',
			updated_since: '2026-02-04T16:44:33+00:00',
		});
	});

	it('omits empty filters', () => {
		expect(buildInvoiceFilter({ term: '', ids: '', status: [], customerId: '' })).toEqual({});
	});
});

describe('buildInvoiceSendPayload', () => {
	it('follows the official schema with content, recipients and attachments', () => {
		expect(
			buildInvoiceSendPayload('inv-1', 'Invoice', 'Please find attached', {
				mailTemplateId: 'mt-1',
				to: {
					recipient: [
						{ email: 'a@b.c', customerType: 'company', customerId: 'cust-1' },
						{ email: '' },
					],
				},
				cc: { recipient: [{ email: 'cc@b.c' }] },
				attachments: 'file-1',
			}),
		).toEqual({
			id: 'inv-1',
			content: {
				subject: 'Invoice',
				body: 'Please find attached',
				mail_template_id: 'mt-1',
			},
			recipients: {
				to: [{ email: 'a@b.c', customer: { type: 'company', id: 'cust-1' } }],
				cc: [{ email: 'cc@b.c' }],
			},
			attachments: ['file-1'],
		});
	});

	it('omits recipients, template and attachments when empty', () => {
		expect(buildInvoiceSendPayload('inv-1', 's', 'b', {})).toEqual({
			id: 'inv-1',
			content: { subject: 's', body: 'b' },
		});
	});
});

describe('executeInvoice', () => {
	it('sends invoices.draft with invoicee, department and payload', async () => {
		const { context, request } = createContext({
			customerType: 'company',
			customerId: { mode: 'id', value: 'cust-1' },
			departmentId: 'dept-1',
			additionalFields: {
				paymentTermType: 'cash',
				groupedLines: { group: [{ lineItems: { item: [{ ...LINE }] } }] },
			},
		});
		request.mockResolvedValue({ data: { id: 'inv-1', type: 'invoice' } });

		const result = await executeInvoice.call(context as never, 'draft', 0);

		expect(request.mock.calls[0][1].url).toContain('/invoices.draft');
		expect(lastCall(request).body).toEqual({
			invoicee: { customer: { type: 'company', id: 'cust-1' } },
			department_id: 'dept-1',
			payment_term: { type: 'cash' },
			grouped_lines: [{ line_items: [MINIMAL_LINE] }],
		});
		expect(result).toEqual([{ id: 'inv-1', type: 'invoice' }]);
	});

	it('rejects a draft without lines or payment term', async () => {
		const noLines = createContext({
			customerType: 'company',
			customerId: { mode: 'id', value: 'c' },
			departmentId: 'dept-1',
			additionalFields: { paymentTermType: 'cash' },
		});
		await expect(executeInvoice.call(noLines.context as never, 'draft', 0)).rejects.toThrow(
			'At least one invoice line is required',
		);

		const noTerm = createContext({
			customerType: 'company',
			customerId: { mode: 'id', value: 'c' },
			departmentId: 'dept-1',
			additionalFields: { groupedLines: { group: [{ lineItems: { item: [{ ...LINE }] } }] } },
		});
		await expect(executeInvoice.call(noTerm.context as never, 'draft', 0)).rejects.toThrow(
			'A payment term is required',
		);
	});

	it('sends invoices.update with only the changed fields', async () => {
		const { context, request } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			updateFields: { note: 'New note', purchaseOrderNumber: '' },
		});
		request.mockResolvedValue('');

		const result = await executeInvoice.call(context as never, 'update', 0);

		expect(request.mock.calls[0][1].url).toContain('/invoices.update');
		expect(lastCall(request).body).toEqual({ id: 'inv-1', note: 'New note' });
		expect(result).toEqual([{ success: true, id: 'inv-1' }]);
	});

	it('sends invoices.updateBooked and can replace the invoicee', async () => {
		const { context, request } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			updateCustomer: true,
			customerType: 'contact',
			customerId: { mode: 'id', value: 'cust-9' },
			updateFields: { note: 'Booked note', purchaseOrderNumber: 'ignored' },
		});
		request.mockResolvedValue('');

		await executeInvoice.call(context as never, 'updateBooked', 0);

		expect(request.mock.calls[0][1].url).toContain('/invoices.updateBooked');
		expect(lastCall(request).body).toEqual({
			id: 'inv-1',
			note: 'Booked note',
			invoicee: { customer: { type: 'contact', id: 'cust-9' } },
		});
	});

	it('throws when an update has no fields', async () => {
		const { context } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			updateFields: {},
		});

		await expect(executeInvoice.call(context as never, 'update', 0)).rejects.toThrow(
			'Select at least one field to update',
		);
	});

	it('sends invoices.book with a normalised date', async () => {
		const { context, request } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			bookDate: '2026-02-04T10:00:00.000Z',
		});
		request.mockResolvedValue('');

		const result = await executeInvoice.call(context as never, 'book', 0);

		expect(lastCall(request).body).toEqual({ id: 'inv-1', on: '2026-02-04' });
		expect(result).toEqual([{ success: true, id: 'inv-1', booked_on: '2026-02-04' }]);
	});

	it('sends invoices.send', async () => {
		const { context, request } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			subject: 'Invoice',
			body: 'Attached',
			sendOptions: { to: { recipient: [{ email: 'a@b.c' }] } },
		});
		request.mockResolvedValue('');

		await executeInvoice.call(context as never, 'send', 0);

		expect(request.mock.calls[0][1].url).toContain('/invoices.send');
		expect(lastCall(request).body).toEqual({
			id: 'inv-1',
			content: { subject: 'Invoice', body: 'Attached' },
			recipients: { to: [{ email: 'a@b.c' }] },
		});
	});

	it('sends invoices.registerPayment with money, date and method', async () => {
		const { context, request } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			amount: 123.45,
			currency: 'EUR',
			paidAt: '2026-03-03T16:44:33+00:00',
			paymentMethodId: 'pm-1',
		});
		request.mockResolvedValue('');

		const result = await executeInvoice.call(context as never, 'registerPayment', 0);

		expect(lastCall(request).body).toEqual({
			id: 'inv-1',
			payment: { amount: 123.45, currency: 'EUR' },
			paid_at: '2026-03-03T16:44:33+00:00',
			payment_method_id: 'pm-1',
		});
		expect(result).toEqual([
			{ success: true, id: 'inv-1', payment: { amount: 123.45, currency: 'EUR' } },
		]);
	});

	it('omits the payment method when not chosen', async () => {
		const { context, request } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			amount: 10,
			currency: 'EUR',
			paidAt: '2026-03-03T16:44:33+00:00',
		});
		request.mockResolvedValue('');

		await executeInvoice.call(context as never, 'registerPayment', 0);

		expect(lastCall(request).body.payment_method_id).toBeUndefined();
	});

	it('sends invoices.removePayments', async () => {
		const { context, request } = createContext({ invoiceId: { mode: 'id', value: 'inv-1' } });
		request.mockResolvedValue('');

		const result = await executeInvoice.call(context as never, 'removePayments', 0);

		expect(request.mock.calls[0][1].url).toContain('/invoices.removePayments');
		expect(lastCall(request).body).toEqual({ id: 'inv-1' });
		expect(result).toEqual([{ success: true, id: 'inv-1', paid: false }]);
	});

	it('sends invoices.credit with an optional credit note date', async () => {
		const { context, request } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			options: { creditNoteDate: '2026-02-04' },
		});
		request.mockResolvedValue({ data: { id: 'cn-1', type: 'creditNote' } });

		const result = await executeInvoice.call(context as never, 'credit', 0);

		expect(lastCall(request).body).toEqual({ id: 'inv-1', credit_note_date: '2026-02-04' });
		expect(result).toEqual([{ id: 'cn-1', type: 'creditNote' }]);
	});

	it('sends invoices.creditPartially with lines and discounts', async () => {
		const { context, request } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			additionalFields: {
				groupedLines: { group: [{ lineItems: { item: [{ ...LINE }] } }] },
				discounts: { discount: [{ value: 5 }] },
			},
		});
		request.mockResolvedValue({ data: { id: 'cn-1', type: 'creditNote' } });

		await executeInvoice.call(context as never, 'creditPartially', 0);

		expect(request.mock.calls[0][1].url).toContain('/invoices.creditPartially');
		expect(lastCall(request).body).toEqual({
			id: 'inv-1',
			grouped_lines: [{ line_items: [MINIMAL_LINE] }],
			discounts: [{ type: 'percentage', value: 5 }],
		});
	});

	it('rejects a partial credit without lines', async () => {
		const { context } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			additionalFields: {},
		});

		await expect(executeInvoice.call(context as never, 'creditPartially', 0)).rejects.toThrow(
			'At least one line is required to partially credit an invoice',
		);
	});

	it('downloads an invoice as binary data', async () => {
		const { context, request, httpRequest, prepareBinaryData } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			format: 'pdf',
			binaryPropertyName: 'file',
		});
		request.mockResolvedValue({
			data: { location: 'https://cdn.teamleader.eu/file', expires: '2026-02-05T16:44:33+00:00' },
		});

		const result = (await executeInvoice.call(
			context as never,
			'download',
			0,
		)) as INodeExecutionData[];

		expect(lastCall(request).body).toEqual({ id: 'inv-1', format: 'pdf' });
		expect(httpRequest).toHaveBeenCalledWith(
			expect.objectContaining({ url: 'https://cdn.teamleader.eu/file', encoding: 'arraybuffer' }),
		);
		expect(prepareBinaryData).toHaveBeenCalledWith(
			expect.any(Buffer),
			'invoice-inv-1.pdf',
			'application/pdf',
		);
		expect(result[0].binary?.file).toBeDefined();
		expect(result[0].json).toEqual({
			id: 'inv-1',
			format: 'pdf',
			expires: '2026-02-05T16:44:33+00:00',
			fileName: 'invoice-inv-1.pdf',
		});
	});

	it('uses an XML file name for UBL downloads', async () => {
		const { context, request, prepareBinaryData } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			format: 'ubl/peppol_bis_3',
		});
		request.mockResolvedValue({ data: { location: 'https://cdn.teamleader.eu/file' } });

		await executeInvoice.call(context as never, 'download', 0);

		expect(prepareBinaryData).toHaveBeenCalledWith(
			expect.any(Buffer),
			'invoice-inv-1.xml',
			'application/xml',
		);
	});

	it('throws when no download link is returned', async () => {
		const { context, request } = createContext({
			invoiceId: { mode: 'id', value: 'inv-1' },
			format: 'pdf',
		});
		request.mockResolvedValue({ data: {} });

		await expect(executeInvoice.call(context as never, 'download', 0)).rejects.toThrow(
			'Teamleader did not return a download link',
		);
	});

	it('sends invoices.list with filters, sort and includes', async () => {
		const { context, request } = createContext({
			returnAll: false,
			limit: 2,
			filters: { term: 'abc' },
			options: {
				includeLateFees: true,
				sort: { rule: [{ field: 'invoice_date', order: 'desc' }] },
			},
		});
		request.mockResolvedValue({ data: [{ id: 'inv-1' }, { id: 'inv-2' }] });

		const result = await executeInvoice.call(context as never, 'getAll', 0);

		expect(lastCall(request).body).toEqual({
			filter: { term: 'abc' },
			sort: [{ field: 'invoice_date', order: 'desc' }],
			includes: 'late_fees',
			page: { size: 2, number: 1 },
		});
		expect(result).toHaveLength(2);
	});

	it('omits the filter key when no filters are set', async () => {
		const { context, request } = createContext({ returnAll: false, limit: 5, filters: {} });
		request.mockResolvedValue({ data: [] });

		await executeInvoice.call(context as never, 'getAll', 0);

		expect(lastCall(request).body.filter).toBeUndefined();
	});
});
