import type { IDataObject } from 'n8n-workflow';

import {
	buildCommercialDiscounts,
	buildExpiry,
	buildGroupedLines,
	buildLineItem,
	buildQuotationPayload,
	buildRecipients,
	buildSendPayload,
	executeQuotation,
} from '../nodes/Teamleader/v1/actions/quotation';

/** Minimal IExecuteFunctions stub driven by a parameter map. */
function createContext(params: IDataObject, request = jest.fn().mockResolvedValue({ data: {} })) {
	return {
		context: {
			getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
				name in params ? params[name] : fallback,
			getNode: () => ({ name: 'Teamleader', type: 'teamleader' }),
			getCredentials: jest.fn().mockResolvedValue({}),
			helpers: { httpRequestWithAuthentication: request },
		},
		request,
	};
}

const lastCall = (request: jest.Mock) => request.mock.calls[request.mock.calls.length - 1][1];

const LINE = {
	description: 'An awesome product',
	quantity: 3,
	unitPrice: 123.3,
	taxRateId: 'tax-1',
};

describe('buildLineItem', () => {
	it('builds the minimal line shape with tax excluding', () => {
		expect(buildLineItem({ ...LINE })).toEqual({
			quantity: 3,
			description: 'An awesome product',
			unit_price: { amount: 123.3, tax: 'excluding' },
			tax_rate_id: 'tax-1',
		});
	});

	it('links a product and maps unit of measure, extended description and purchase price', () => {
		expect(
			buildLineItem(
				{
					...LINE,
					productId: 'prod-1',
					unitOfMeasureId: 'unit-1',
					extendedDescription: 'more info',
					purchasePrice: 50,
				},
				'EUR',
			),
		).toEqual({
			quantity: 3,
			description: 'An awesome product',
			unit_price: { amount: 123.3, tax: 'excluding' },
			tax_rate_id: 'tax-1',
			product_id: 'prod-1',
			unit_of_measure_id: 'unit-1',
			extended_description: 'more info',
			purchase_price: { amount: 50, currency: 'EUR' },
		});
	});

	it('maps a line discount as a percentage and omits a zero discount', () => {
		expect(buildLineItem({ ...LINE, discount: 10 }).discount).toEqual({
			value: 10,
			type: 'percentage',
		});
		expect(buildLineItem({ ...LINE, discount: 0 }).discount).toBeUndefined();
		expect(buildLineItem({ ...LINE, discount: '' }).discount).toBeUndefined();
	});

	it('omits empty optional fields', () => {
		expect(
			buildLineItem({
				...LINE,
				productId: '',
				unitOfMeasureId: '',
				extendedDescription: '',
				purchasePrice: '',
			}),
		).toEqual({
			quantity: 3,
			description: 'An awesome product',
			unit_price: { amount: 123.3, tax: 'excluding' },
			tax_rate_id: 'tax-1',
		});
	});
});

describe('buildGroupedLines', () => {
	it('transforms groups with a section title and their line items', () => {
		expect(
			buildGroupedLines({
				group: [
					{ title: 'Design', lineItems: { item: [{ ...LINE }] } },
					{ title: '', lineItems: { item: [{ ...LINE, description: 'Hosting' }] } },
				],
			}),
		).toEqual([
			{
				section: { title: 'Design' },
				line_items: [
					{
						quantity: 3,
						description: 'An awesome product',
						unit_price: { amount: 123.3, tax: 'excluding' },
						tax_rate_id: 'tax-1',
					},
				],
			},
			{
				line_items: [
					{
						quantity: 3,
						description: 'Hosting',
						unit_price: { amount: 123.3, tax: 'excluding' },
						tax_rate_id: 'tax-1',
					},
				],
			},
		]);
	});

	it('drops groups without usable line items and returns undefined when empty', () => {
		expect(
			buildGroupedLines({ group: [{ title: 'Empty', lineItems: { item: [{ description: '' }] } }] }),
		).toBeUndefined();
		expect(buildGroupedLines({})).toBeUndefined();
	});
});

describe('buildCommercialDiscounts', () => {
	it('maps quotation-level percentage discounts', () => {
		expect(
			buildCommercialDiscounts({
				discount: [
					{ value: 15.5, description: 'winter promotion' },
					{ value: 5 },
					{ value: '' },
				],
			}),
		).toEqual([
			{ type: 'percentage', value: 15.5, description: 'winter promotion' },
			{ type: 'percentage', value: 5 },
		]);
	});

	it('returns undefined when nothing is set', () => {
		expect(buildCommercialDiscounts({})).toBeUndefined();
	});
});

describe('buildExpiry', () => {
	it('normalises the date and defaults the action', () => {
		expect(buildExpiry({ expiresAfter: '2026-04-05T00:00:00.000Z' })).toEqual({
			action_after_expiry: 'none',
			expires_after: '2026-04-05',
		});
		expect(buildExpiry({ expiresAfter: '2026-04-05', actionAfterExpiry: 'lock' })).toEqual({
			action_after_expiry: 'lock',
			expires_after: '2026-04-05',
		});
	});

	it('returns undefined when nothing is set', () => {
		expect(buildExpiry({})).toBeUndefined();
	});
});

describe('buildQuotationPayload', () => {
	it('maps currency, template, text, lines, discounts and expiry', () => {
		expect(
			buildQuotationPayload({
				currency: 'USD',
				exchangeRate: 1.1238,
				documentTemplateId: 'tpl-1',
				text: 'Quotation text',
				groupedLines: { group: [{ lineItems: { item: [{ ...LINE }] } }] },
				discounts: { discount: [{ value: 10 }] },
				expiresAfter: '2026-04-05',
				actionAfterExpiry: 'lock',
			}),
		).toEqual({
			currency: { code: 'USD', exchange_rate: 1.1238 },
			document_template_id: 'tpl-1',
			text: 'Quotation text',
			grouped_lines: [
				{
					line_items: [
						{
							quantity: 3,
							description: 'An awesome product',
							unit_price: { amount: 123.3, tax: 'excluding' },
							tax_rate_id: 'tax-1',
						},
					],
				},
			],
			discounts: [{ type: 'percentage', value: 10 }],
			expiry: { action_after_expiry: 'lock', expires_after: '2026-04-05' },
		});
	});

	it('omits every empty optional field', () => {
		expect(
			buildQuotationPayload({
				currency: '',
				exchangeRate: '',
				documentTemplateId: '',
				text: '',
				groupedLines: {},
				discounts: {},
				expiresAfter: '',
			}),
		).toEqual({});
	});
});

describe('buildRecipients / buildSendPayload', () => {
	it('builds to/cc/bcc with optional customer references', () => {
		expect(
			buildRecipients({
				to: {
					recipient: [
						{ emailAddress: 'a@b.c', customerType: 'contact', customerId: 'cust-1' },
						{ emailAddress: '' },
					],
				},
				cc: { recipient: [{ emailAddress: 'cc@b.c' }] },
			}),
		).toEqual({
			to: [{ email_address: 'a@b.c', customer: { type: 'contact', id: 'cust-1' } }],
			cc: [{ email_address: 'cc@b.c' }],
		});
	});

	it('builds the send payload with sender and attachments', () => {
		expect(
			buildSendPayload(['q-1', 'q-2'], 'Offer', 'Sign here #LINK', 'nl', {
				to: { recipient: [{ emailAddress: 'a@b.c' }] },
				senderType: 'department',
				senderId: 'dep-1',
				senderEmailAddress: 'info@teamleader.eu',
				attachments: 'file-1, file-2',
			}),
		).toEqual({
			quotations: ['q-1', 'q-2'],
			subject: 'Offer',
			content: 'Sign here #LINK',
			language: 'nl',
			recipients: { to: [{ email_address: 'a@b.c' }] },
			from: {
				sender: { type: 'department', id: 'dep-1' },
				email_address: 'info@teamleader.eu',
			},
			attachments: ['file-1', 'file-2'],
		});
	});

	it('omits sender and attachments when not provided', () => {
		const payload = buildSendPayload(['q-1'], 's', 'c', 'en', {
			to: { recipient: [{ emailAddress: 'a@b.c' }] },
		});
		expect(payload.from).toBeUndefined();
		expect(payload.attachments).toBeUndefined();
	});
});

describe('executeQuotation', () => {
	it('sends quotations.create with the deal id and payload', async () => {
		const { context, request } = createContext({
			dealId: { mode: 'id', value: 'deal-1' },
			additionalFields: {
				text: 'Quotation text',
				groupedLines: { group: [{ title: 'Design', lineItems: { item: [{ ...LINE }] } }] },
			},
		});
		request.mockResolvedValue({ data: { id: 'q-1', type: 'quotation' } });

		const result = await executeQuotation.call(context as never, 'create', 0);

		expect(request.mock.calls[0][1].url).toContain('/quotations.create');
		expect(lastCall(request).body).toEqual({
			deal_id: 'deal-1',
			text: 'Quotation text',
			grouped_lines: [
				{
					section: { title: 'Design' },
					line_items: [
						{
							quantity: 3,
							description: 'An awesome product',
							unit_price: { amount: 123.3, tax: 'excluding' },
							tax_rate_id: 'tax-1',
						},
					],
				},
			],
		});
		expect(result).toEqual([{ id: 'q-1', type: 'quotation' }]);
	});

	it('rejects a create without lines or text', async () => {
		const { context } = createContext({
			dealId: { mode: 'id', value: 'deal-1' },
			additionalFields: {},
		});

		await expect(executeQuotation.call(context as never, 'create', 0)).rejects.toThrow(
			'A quotation needs at least grouped line items or a text',
		);
	});

	it('sends quotations.update with the id and only the changed fields', async () => {
		const { context, request } = createContext({
			quotationId: { mode: 'id', value: 'q-1' },
			updateFields: { text: 'New text', documentTemplateId: '' },
		});
		request.mockResolvedValue('');

		const result = await executeQuotation.call(context as never, 'update', 0);

		expect(lastCall(request).body).toEqual({ id: 'q-1', text: 'New text' });
		expect(result).toEqual([{ success: true, id: 'q-1' }]);
	});

	it('throws when an update has no fields', async () => {
		const { context } = createContext({
			quotationId: { mode: 'id', value: 'q-1' },
			updateFields: {},
		});

		await expect(executeQuotation.call(context as never, 'update', 0)).rejects.toThrow(
			'Select at least one field to update',
		);
	});

	it('sends quotations.send including extra quotation ids', async () => {
		const { context, request } = createContext({
			quotationId: { mode: 'id', value: 'q-1' },
			subject: 'Offer',
			content: 'Sign here #LINK',
			language: 'nl',
			sendOptions: {
				additionalQuotationIds: 'q-2',
				to: { recipient: [{ emailAddress: 'a@b.c' }] },
			},
		});
		request.mockResolvedValue('');

		await executeQuotation.call(context as never, 'send', 0);

		expect(request.mock.calls[0][1].url).toContain('/quotations.send');
		expect(lastCall(request).body).toEqual({
			quotations: ['q-1', 'q-2'],
			subject: 'Offer',
			content: 'Sign here #LINK',
			language: 'nl',
			recipients: { to: [{ email_address: 'a@b.c' }] },
		});
	});

	it('rejects a send without a To recipient', async () => {
		const { context } = createContext({
			quotationId: { mode: 'id', value: 'q-1' },
			subject: 'Offer',
			content: 'c',
			language: 'nl',
			sendOptions: {},
		});

		await expect(executeQuotation.call(context as never, 'send', 0)).rejects.toThrow(
			'At least one "To" recipient is required',
		);
	});

	it('sends quotations.accept and quotations.delete', async () => {
		const accept = createContext({ quotationId: { mode: 'id', value: 'q-1' } });
		accept.request.mockResolvedValue('');
		expect(await executeQuotation.call(accept.context as never, 'accept', 0)).toEqual([
			{ success: true, id: 'q-1', status: 'accepted' },
		]);
		expect(accept.request.mock.calls[0][1].url).toContain('/quotations.accept');
		expect(lastCall(accept.request).body).toEqual({ id: 'q-1' });

		const remove = createContext({ quotationId: { mode: 'id', value: 'q-1' } });
		remove.request.mockResolvedValue('');
		expect(await executeQuotation.call(remove.context as never, 'delete', 0)).toEqual([
			{ success: true, id: 'q-1' },
		]);
		expect(remove.request.mock.calls[0][1].url).toContain('/quotations.delete');
	});

	it('sends quotations.list with an ids filter and honours the limit', async () => {
		const { context, request } = createContext({
			returnAll: false,
			limit: 2,
			filters: { ids: 'q-1, q-2' },
			options: { includeExpiry: true },
		});
		request.mockResolvedValue({ data: [{ id: 'q-1' }, { id: 'q-2' }] });

		const result = await executeQuotation.call(context as never, 'getAll', 0);

		expect(lastCall(request).body).toEqual({
			filter: { ids: ['q-1', 'q-2'] },
			includes: 'expiry',
			page: { size: 2, number: 1 },
		});
		expect(result).toHaveLength(2);
	});

	it('omits the filter key when no ids are given', async () => {
		const { context, request } = createContext({ returnAll: false, limit: 5, filters: {} });
		request.mockResolvedValue({ data: [] });

		await executeQuotation.call(context as never, 'getAll', 0);

		expect(lastCall(request).body.filter).toBeUndefined();
	});
});
