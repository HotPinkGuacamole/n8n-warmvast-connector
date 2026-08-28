import type { IDataObject } from 'n8n-workflow';

import {
	buildPriceListPrices,
	buildProductConfiguration,
	buildProductFilter,
	buildProductPayload,
	executeProduct,
} from '../nodes/Teamleader/v1/actions/product';
import { getPriceLists, getProducts } from '../nodes/Teamleader/methods/loadOptions';

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

describe('buildProductPayload', () => {
	it('maps all supported write fields', () => {
		expect(
			buildProductPayload({
				code: 'COOK-42',
				description: 'dark chocolate',
				unitOfMeasureId: 'unit-1',
				departmentId: 'dept-1',
				productCategoryId: 'cat-1',
				taxRateId: 'tax-1',
				sellingPrice: 12.5,
				sellingPriceCurrency: 'EUR',
				purchasePrice: 7,
				purchasePriceCurrency: 'EUR',
				stockAmount: 123,
				stockThresholdMinimum: 4,
				priceListPrices: {
					price: [{ priceListId: 'pl-1', amount: 10, currency: 'USD' }],
				},
				customFields: { field: [{ id: 'cf-1', value: 'v' }] },
			}),
		).toEqual({
			code: 'COOK-42',
			description: 'dark chocolate',
			unit_of_measure_id: 'unit-1',
			department_id: 'dept-1',
			product_category_id: 'cat-1',
			tax_rate_id: 'tax-1',
			selling_price: { amount: 12.5, currency: 'EUR' },
			purchase_price: { amount: 7, currency: 'EUR' },
			stock: { amount: 123 },
			configuration: { stock_threshold: { minimum: 4, action: 'notify' } },
			price_list_prices: [{ price_list_id: 'pl-1', price: { amount: 10, currency: 'USD' } }],
			custom_fields: [{ id: 'cf-1', value: 'v' }],
		});
	});

	it('omits empty optional fields', () => {
		expect(
			buildProductPayload({
				code: '',
				description: '',
				unitOfMeasureId: '',
				departmentId: '',
				productCategoryId: '',
				taxRateId: '',
				sellingPrice: '',
				purchasePrice: '',
				stockAmount: '',
				stockThresholdMinimum: '',
				priceListPrices: {},
				customFields: {},
			}),
		).toEqual({});
	});

	it('returns an empty payload when nothing is provided', () => {
		expect(buildProductPayload({})).toEqual({});
	});
});

describe('buildPriceListPrices', () => {
	it('skips entries without a price list or amount and defaults the currency', () => {
		expect(
			buildPriceListPrices({
				price: [
					{ priceListId: 'pl-1', amount: 10 },
					{ priceListId: '', amount: 20, currency: 'EUR' },
					{ priceListId: 'pl-2', amount: '' },
				],
			}),
		).toEqual([{ price_list_id: 'pl-1', price: { amount: 10, currency: 'EUR' } }]);
	});

	it('returns undefined when empty', () => {
		expect(buildPriceListPrices({})).toBeUndefined();
	});
});

describe('buildProductConfiguration', () => {
	it('builds a stock threshold with the notify action', () => {
		expect(buildProductConfiguration({ stockThresholdMinimum: 4 })).toEqual({
			stock_threshold: { minimum: 4, action: 'notify' },
		});
	});

	it('ignores missing or negative thresholds', () => {
		expect(buildProductConfiguration({})).toBeUndefined();
		expect(buildProductConfiguration({ stockThresholdMinimum: -1 })).toBeUndefined();
	});
});

describe('buildProductFilter', () => {
	it('maps term, ids and updated since', () => {
		expect(
			buildProductFilter({
				term: 'cookies',
				ids: 'a, b',
				updatedSince: '2026-02-05T16:44:33+00:00',
			}),
		).toEqual({
			term: 'cookies',
			ids: ['a', 'b'],
			updated_since: '2026-02-05T16:44:33+00:00',
		});
	});

	it('omits empty filters', () => {
		expect(buildProductFilter({ term: '', ids: '', updatedSince: '' })).toEqual({});
	});
});

describe('executeProduct', () => {
	it('sends products.add with the name plus additional fields', async () => {
		const { context, request } = createContext({
			name: 'cookies',
			additionalFields: { code: 'COOK-42', sellingPrice: 12.5 },
		});
		request.mockResolvedValue({ data: { id: 'new-id', type: 'product' } });

		const result = await executeProduct.call(context as never, 'create', 0);

		expect(request.mock.calls[0][1].url).toContain('/products.add');
		expect(lastCall(request).body).toEqual({
			name: 'cookies',
			code: 'COOK-42',
			selling_price: { amount: 12.5, currency: 'EUR' },
		});
		expect(result).toEqual([{ id: 'new-id', type: 'product' }]);
	});

	it('sends products.update with the id and only the changed fields', async () => {
		const { context, request } = createContext({
			productId: { mode: 'id', value: 'prod-1' },
			updateFields: { name: 'Hosting', description: '', taxRateId: 'tax-9' },
		});
		request.mockResolvedValue('');

		const result = await executeProduct.call(context as never, 'update', 0);

		expect(lastCall(request).body).toEqual({
			id: 'prod-1',
			name: 'Hosting',
			tax_rate_id: 'tax-9',
		});
		expect(result).toEqual([{ success: true, id: 'prod-1' }]);
	});

	it('throws when an update has no fields', async () => {
		const { context } = createContext({
			productId: { mode: 'id', value: 'prod-1' },
			updateFields: {},
		});

		await expect(executeProduct.call(context as never, 'update', 0)).rejects.toThrow(
			'Select at least one field to update',
		);
	});

	it('sends products.list with a filter and honours the limit', async () => {
		const { context, request } = createContext({
			returnAll: false,
			limit: 2,
			filters: { term: 'cookies' },
		});
		request.mockResolvedValue({ data: [{ id: 'p1' }, { id: 'p2' }] });

		const result = await executeProduct.call(context as never, 'getAll', 0);

		expect(request.mock.calls[0][1].url).toContain('/products.list');
		expect(lastCall(request).body).toEqual({
			filter: { term: 'cookies' },
			page: { size: 2, number: 1 },
		});
		expect(result).toHaveLength(2);
	});

	it('omits the filter key entirely when no filters are set', async () => {
		const { context, request } = createContext({ returnAll: false, limit: 5, filters: {} });
		request.mockResolvedValue({ data: [] });

		await executeProduct.call(context as never, 'getAll', 0);

		expect(lastCall(request).body.filter).toBeUndefined();
	});

	it('adds the suppliers include on get when requested', async () => {
		const { context, request } = createContext({
			productId: { mode: 'id', value: 'prod-1' },
			options: { includeSuppliers: true },
		});
		request.mockResolvedValue({ data: { id: 'prod-1' } });

		await executeProduct.call(context as never, 'get', 0);

		expect(lastCall(request).body).toEqual({ id: 'prod-1', includes: 'suppliers' });
	});

	it('sends products.delete', async () => {
		const { context, request } = createContext({ productId: { mode: 'id', value: 'prod-1' } });
		request.mockResolvedValue('');

		const result = await executeProduct.call(context as never, 'delete', 0);

		expect(request.mock.calls[0][1].url).toContain('/products.delete');
		expect(lastCall(request).body).toEqual({ id: 'prod-1' });
		expect(result).toEqual([{ success: true, id: 'prod-1' }]);
	});
});

describe('new lookups', () => {
	function loadOptionsContext(data: IDataObject[], currentParams: IDataObject = {}) {
		const request = jest.fn().mockResolvedValue({ data });
		return {
			context: {
				getNode: () => ({ name: 'Teamleader', type: 'teamleader' }),
				getCredentials: jest.fn().mockResolvedValue({}),
				getCurrentNodeParameter: (name: string) => currentParams[name],
				helpers: { httpRequestWithAuthentication: request },
			},
			request,
		};
	}

	it('maps priceLists.list onto name/value options', async () => {
		const { context, request } = loadOptionsContext([
			{ id: 'pl-2', name: 'Retail' },
			{ id: 'pl-1', name: 'Bulk' },
		]);

		const options = await getPriceLists.call(context as never);

		expect(request.mock.calls[0][1].url).toContain('/priceLists.list');
		expect(options).toEqual([
			{ name: 'Bulk', value: 'pl-1' },
			{ name: 'Retail', value: 'pl-2' },
		]);
	});

	it('labels products with their code when present', async () => {
		const { context } = loadOptionsContext([
			{ id: 'p-1', name: 'cookies', code: 'COOK-42' },
			{ id: 'p-2', name: 'hosting' },
		]);

		expect(await getProducts.call(context as never)).toEqual([
			{ name: 'cookies [COOK-42]', value: 'p-1' },
			{ name: 'hosting', value: 'p-2' },
		]);
	});
});
