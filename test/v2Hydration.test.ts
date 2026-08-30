import { TeamleaderExecutionContext } from '../nodes/Teamleader/helpers/context';
import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import { INVOICE_LINE_CONFIG, QUOTATION_LINE_CONFIG } from '../nodes/Teamleader/v2/descriptions/LineEditor';
import { attachWarnings, hydrateAndValidateLines } from '../nodes/Teamleader/v2/helpers/hydration';
import type { INormalizedLine } from '../nodes/Teamleader/v2/helpers/lines';

jest.mock('../nodes/Teamleader/helpers/GenericFunctions', () => {
	const actual = jest.requireActual('../nodes/Teamleader/helpers/GenericFunctions');
	return { ...actual, teamleaderApiRequest: jest.fn() };
});

const apiRequest = generic.teamleaderApiRequest as unknown as jest.Mock;

function makeContext() {
	return { getNode: () => ({ name: 'Teamleader' }) } as never;
}

function customLine(overrides: Partial<INormalizedLine> = {}): INormalizedLine {
	return {
		lineType: 'custom',
		useProductDefaults: false,
		quantity: 1,
		description: 'Item',
		unitPrice: 10,
		taxRateId: 'tax-1',
		lineOptions: {},
		...overrides,
	};
}

function productLine(overrides: Partial<INormalizedLine> = {}): INormalizedLine {
	return {
		lineType: 'product',
		useProductDefaults: true,
		quantity: 1,
		productId: 'product-1',
		lineOptions: {},
		...overrides,
	};
}

const PRODUCT_RESPONSE = {
	data: {
		id: 'product-1',
		name: 'Widget',
		description: 'A nice widget',
		selling_price: { amount: 50, currency: 'EUR' },
		purchase_price: { amount: 20, currency: 'EUR' },
		tax_rate: { id: 'tax-9' },
		unit_of_measure: { id: 'unit-9' },
		product_category: { id: 'cat-9' },
	},
};

beforeEach(() => {
	apiRequest.mockReset();
});

describe('Custom line assembly', () => {
	it('maps a minimal custom line correctly', async () => {
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [customLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines).toEqual([
			{
				line_items: [
					{
						quantity: 1,
						description: 'Item',
						unit_price: { amount: 10, tax: 'excluding' },
						tax_rate_id: 'tax-1',
					},
				],
			},
		]);
	});

	it('keeps an explicit custom Unit Price of 0 as a genuine 0', async () => {
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [customLine({ unitPrice: 0 })] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].unit_price.amount).toBe(0);
	});
});

describe('Product hydration precedence', () => {
	it('hydrates Description from the product name', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].description).toBe('Widget');
	});

	it('hydrates Extended Description from the product description', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].extended_description).toBe('A nice widget');
	});

	it('hydrates Unit Price from the product selling price', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].unit_price).toEqual({ amount: 50, tax: 'excluding' });
	});

	it('hydrates Tax Rate from the product', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].tax_rate_id).toBe('tax-9');
	});

	it('hydrates Unit of Measure from the product', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].unit_of_measure_id).toBe('unit-9');
	});

	it('hydrates Product Category for the invoice config', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			INVOICE_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].product_category_id).toBe('cat-9');
	});

	it('never sends Product Category for the quotation config', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].product_category_id).toBeUndefined();
	});

	it('hydrates Purchase Price for the quotation config when accessible', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].purchase_price).toEqual({ amount: 20, currency: 'EUR' });
	});

	it('an explicit override wins over hydration', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[
				{
					lines: [
						productLine({
							lineOptions: { description: 'Custom desc', unitPrice: 99, taxRateId: 'tax-override' },
						}),
					],
				},
			],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		const item = result.groupedLines[0].line_items[0];
		expect(item.description).toBe('Custom desc');
		expect(item.unit_price.amount).toBe(99);
		expect(item.tax_rate_id).toBe('tax-override');
	});

	it('quantity is always the employee value, never hydrated', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine({ quantity: 7 })] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].quantity).toBe(7);
	});

	it('the Product ID always survives onto the final line', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].product_id).toBe('product-1');
	});

	it('an override Unit Price of exactly 0 with defaults on falls back to the product price', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine({ lineOptions: { unitPrice: 0 } })] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].unit_price.amount).toBe(50);
	});

	it('a genuine zero with defaults off stays zero and never reads the product', async () => {
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[
				{
					lines: [
						productLine({
							useProductDefaults: false,
							lineOptions: { description: 'Manual', unitPrice: 0, taxRateId: 'tax-manual' },
						}),
					],
				},
			],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].unit_price.amount).toBe(0);
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('Product ID is still sent with defaults off', async () => {
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[
				{
					lines: [
						productLine({
							useProductDefaults: false,
							lineOptions: { description: 'Manual', unitPrice: 5, taxRateId: 'tax-manual' },
						}),
					],
				},
			],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].product_id).toBe('product-1');
	});
});

describe('Validation', () => {
	it('a missing custom description errors with the 1-based line number', async () => {
		await expect(
			hydrateAndValidateLines(
				makeContext(),
				new TeamleaderExecutionContext(),
				[{ lines: [customLine({ description: undefined })] }],
				QUOTATION_LINE_CONFIG,
				'EUR',
			),
		).rejects.toThrow('Line 1 has no description.');
	});

	it('a missing tax rate errors with the line number', async () => {
		await expect(
			hydrateAndValidateLines(
				makeContext(),
				new TeamleaderExecutionContext(),
				[{ lines: [customLine({ taxRateId: undefined })] }],
				QUOTATION_LINE_CONFIG,
				'EUR',
			),
		).rejects.toThrow('Line 1 has no tax rate.');
	});

	it('a product line with defaults off and no manual price errors', async () => {
		await expect(
			hydrateAndValidateLines(
				makeContext(),
				new TeamleaderExecutionContext(),
				[
					{
						lines: [
							productLine({
								useProductDefaults: false,
								lineOptions: { description: 'X', taxRateId: 'tax-1' },
							}),
						],
					},
				],
				QUOTATION_LINE_CONFIG,
				'EUR',
			),
		).rejects.toThrow('Line 1 has no unit price.');
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('names the line and product ID when products.info fails', async () => {
		apiRequest.mockRejectedValueOnce(new Error('boom'));
		await expect(
			hydrateAndValidateLines(
				makeContext(),
				new TeamleaderExecutionContext(),
				[{ lines: [productLine()] }],
				QUOTATION_LINE_CONFIG,
				'EUR',
			),
		).rejects.toThrow('Could not load Product product-1 for line 1');
	});

	it('does not label a generic failure as deleted', async () => {
		apiRequest.mockRejectedValueOnce(new Error('boom'));
		await expect(
			hydrateAndValidateLines(
				makeContext(),
				new TeamleaderExecutionContext(),
				[{ lines: [productLine()] }],
				QUOTATION_LINE_CONFIG,
				'EUR',
			),
		).rejects.not.toThrow('no longer exists');
	});
});

describe('Cache', () => {
	it('one products.info call for the same product used twice in one item', async () => {
		apiRequest.mockResolvedValue(PRODUCT_RESPONSE);
		const executionContext = new TeamleaderExecutionContext();
		await hydrateAndValidateLines(
			makeContext(),
			executionContext,
			[{ lines: [productLine(), productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(apiRequest).toHaveBeenCalledTimes(1);
	});

	it('one products.info call across multiple items sharing one execution context', async () => {
		apiRequest.mockResolvedValue(PRODUCT_RESPONSE);
		const executionContext = new TeamleaderExecutionContext();
		await hydrateAndValidateLines(
			makeContext(),
			executionContext,
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		await hydrateAndValidateLines(
			makeContext(),
			executionContext,
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(apiRequest).toHaveBeenCalledTimes(1);
	});

	it('two distinct product IDs cause two calls', async () => {
		apiRequest.mockResolvedValue(PRODUCT_RESPONSE);
		const executionContext = new TeamleaderExecutionContext();
		await hydrateAndValidateLines(
			makeContext(),
			executionContext,
			[{ lines: [productLine({ productId: 'product-1' }), productLine({ productId: 'product-2' })] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(apiRequest).toHaveBeenCalledTimes(2);
	});

	it('concurrent resolution of the same product dedupes to one underlying read', async () => {
		let resolvePending: (value: unknown) => void = () => {};
		apiRequest.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolvePending = resolve;
				}),
		);
		const executionContext = new TeamleaderExecutionContext();

		const first = hydrateAndValidateLines(
			makeContext(),
			executionContext,
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		const second = hydrateAndValidateLines(
			makeContext(),
			executionContext,
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);

		resolvePending(PRODUCT_RESPONSE);
		await Promise.all([first, second]);

		expect(apiRequest).toHaveBeenCalledTimes(1);
	});
});

describe('Currency', () => {
	it('no warning when the product currency matches the document currency', async () => {
		apiRequest.mockResolvedValueOnce(PRODUCT_RESPONSE);
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.warnings).toEqual([]);
	});

	it('a mismatched currency copies the amount unchanged and returns a warning', async () => {
		apiRequest.mockResolvedValueOnce({
			data: { ...PRODUCT_RESPONSE.data, selling_price: { amount: 50, currency: 'USD' } },
		});
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].unit_price.amount).toBe(50);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('USD');
		expect(result.warnings[0]).toContain('EUR');
	});

	it('never converts the amount', async () => {
		apiRequest.mockResolvedValueOnce({
			data: { ...PRODUCT_RESPONSE.data, selling_price: { amount: 50, currency: 'USD' } },
		});
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].unit_price.amount).toBe(50);
	});

	it('warnings never leak into the generated grouped_lines payload', async () => {
		apiRequest.mockResolvedValueOnce({
			data: { ...PRODUCT_RESPONSE.data, selling_price: { amount: 50, currency: 'USD' } },
		});
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [productLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		const serialized = JSON.stringify(result.groupedLines);
		expect(serialized).not.toContain('warning');
		expect(serialized).not.toContain('_warnings');
	});
});

describe('Discount intent', () => {
	it('an absent Discount (%) sends no discount object', async () => {
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [customLine()] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].discount).toBeUndefined();
	});

	it('an explicit 0% sends a discount object with value 0', async () => {
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [customLine({ lineOptions: { discount: 0 } })] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].discount).toEqual({ value: 0, type: 'percentage' });
	});

	it('a non-zero discount is preserved', async () => {
		const result = await hydrateAndValidateLines(
			makeContext(),
			new TeamleaderExecutionContext(),
			[{ lines: [customLine({ lineOptions: { discount: 15 } })] }],
			QUOTATION_LINE_CONFIG,
			'EUR',
		);
		expect(result.groupedLines[0].line_items[0].discount).toEqual({ value: 15, type: 'percentage' });
	});

	it('rejects an out-of-range discount percentage', async () => {
		await expect(
			hydrateAndValidateLines(
				makeContext(),
				new TeamleaderExecutionContext(),
				[{ lines: [customLine({ lineOptions: { discount: 150 } })] }],
				QUOTATION_LINE_CONFIG,
				'EUR',
			),
		).rejects.toThrow('invalid discount');
	});
});

describe('attachWarnings', () => {
	it('leaves the item untouched when there is nothing to report', () => {
		const data = { id: 'quotation-1' };
		expect(attachWarnings(data, [])).toBe(data);
		expect(Object.keys(attachWarnings(data, []))).not.toContain('_warnings');
	});

	it('adds the connector-owned _warnings field', () => {
		expect(attachWarnings({ id: 'quotation-1' }, ['currency mismatch'])).toEqual({
			id: 'quotation-1',
			_warnings: ['currency mismatch'],
		});
	});

	it('never overwrites a response property that is already called _warnings', () => {
		const result = attachWarnings({ id: 'q1', _warnings: 'from Teamleader' }, ['ours']);
		expect(result._warnings).toBe('from Teamleader');
		expect(result._connectorWarnings).toEqual(['ours']);
	});

	it('keeps looking for a free key rather than clobbering anything', () => {
		const result = attachWarnings(
			{ _warnings: 1, _connectorWarnings: 2, _connectorWarnings_2: 3 },
			['ours'],
		);
		expect(result._connectorWarnings_3).toEqual(['ours']);
		expect(result._warnings).toBe(1);
		expect(result._connectorWarnings).toBe(2);
		expect(result._connectorWarnings_2).toBe(3);
	});

	it('does not mutate the object it was given', () => {
		const data = { id: 'quotation-1' };
		attachWarnings(data, ['something']);
		expect(data).toEqual({ id: 'quotation-1' });
	});
});
