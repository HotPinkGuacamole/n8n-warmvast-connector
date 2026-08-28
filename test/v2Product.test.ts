import type { IDataObject } from 'n8n-workflow';

import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import {
	buildProductBody,
	buildProductFilter,
	executeProduct,
} from '../nodes/Teamleader/v2/actions/product';
import { productFields } from '../nodes/Teamleader/v2/descriptions/ProductDescription';

jest.mock('../nodes/Teamleader/helpers/GenericFunctions', () => {
	const actual = jest.requireActual('../nodes/Teamleader/helpers/GenericFunctions');
	return {
		...actual,
		teamleaderApiRequest: jest.fn(),
		teamleaderFetchList: jest.fn(),
	};
});

const apiRequest = generic.teamleaderApiRequest as unknown as jest.Mock;

function makeContext(parameters: IDataObject) {
	return {
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			parameters[name] !== undefined ? parameters[name] : fallback,
		getNode: () => ({ name: 'Teamleader' }),
	} as never;
}

beforeEach(() => {
	apiRequest.mockReset();
});

describe('Product Create field order', () => {
	it('places Department before Tax Rate and Product Category', () => {
		const createFields = productFields.filter((field) =>
			(field.displayOptions?.show?.operation as string[] | undefined)?.includes('create'),
		);
		const names = createFields.map((field) => field.name);
		const departmentIndex = names.indexOf('departmentId');
		const taxRateIndex = names.indexOf('taxRateId');
		const categoryIndex = names.indexOf('productCategoryId');

		expect(departmentIndex).toBeGreaterThan(-1);
		expect(departmentIndex).toBeLessThan(taxRateIndex);
		expect(departmentIndex).toBeLessThan(categoryIndex);
	});

	it('follows the approved order: Name, Article Code, Selling Price, Purchase Price, Department, Tax Rate, Product Category, Unit of Measure, Description', () => {
		const createFields = productFields.filter((field) =>
			(field.displayOptions?.show?.operation as string[] | undefined)?.includes('create'),
		);
		const names = createFields.map((field) => field.name);
		expect(names).toEqual([
			'name',
			'code',
			'sellingPrice',
			'purchasePrice',
			'departmentId',
			'taxRateId',
			'productCategoryId',
			'unitOfMeasureId',
			'description',
			'advancedOptions',
		]);
	});
});

describe('Product V2 has a single shared currency', () => {
	it('exposes no separate selling/purchase price currency parameters', () => {
		const names = productFields.map((field) => field.name);
		expect(names).not.toContain('sellingPriceCurrency');
		expect(names).not.toContain('purchasePriceCurrency');
	});
});

describe('buildProductBody money wrapping', () => {
	it('wraps a non-zero selling price as Money', () => {
		const body = buildProductBody({
			sellingPriceAmount: 100,
			sellingPriceForced: false,
			purchasePriceForced: false,
			advanced: { currency: 'USD' },
		});
		expect(body.selling_price).toEqual({ amount: 100, currency: 'USD' });
	});

	it('wraps a non-zero purchase price as Money', () => {
		const body = buildProductBody({
			purchasePriceAmount: 40,
			sellingPriceForced: false,
			purchasePriceForced: false,
			advanced: { currency: 'USD' },
		});
		expect(body.purchase_price).toEqual({ amount: 40, currency: 'USD' });
	});

	it('applies one shared currency to both prices', () => {
		const body = buildProductBody({
			sellingPriceAmount: 100,
			purchasePriceAmount: 40,
			sellingPriceForced: false,
			purchasePriceForced: false,
			advanced: { currency: 'GBP' },
		});
		expect(body.selling_price).toEqual({ amount: 100, currency: 'GBP' });
		expect(body.purchase_price).toEqual({ amount: 40, currency: 'GBP' });
	});

	it('omits prices left at the untouched default of 0', () => {
		const body = buildProductBody({
			sellingPriceAmount: 0,
			purchasePriceAmount: 0,
			sellingPriceForced: false,
			purchasePriceForced: false,
		});
		expect(body.selling_price).toBeUndefined();
		expect(body.purchase_price).toBeUndefined();
	});

	it('the forced variant keeps an explicit 0.00, unlike the normal one', () => {
		const body = buildProductBody({
			sellingPriceAmount: 0,
			sellingPriceForced: true,
			purchasePriceForced: false,
			advanced: { currency: 'EUR' },
		});
		expect(body.selling_price).toEqual({ amount: 0, currency: 'EUR' });
	});
});

describe('Product execution', () => {
	it('sends a minimal create payload', async () => {
		apiRequest.mockResolvedValueOnce({ data: { id: 'product-1' } });
		await executeProduct.call(makeContext({ name: 'Widget' }), 'create', 0);
		expect(apiRequest.mock.calls[0]).toEqual(['/products.add', { name: 'Widget' }]);
	});

	it('requires a name on create', async () => {
		await expect(executeProduct.call(makeContext({ name: '' }), 'create', 0)).rejects.toThrow(
			'Name is required',
		);
	});

	it('department scopes the Tax Rate lookup via loadOptionsDependsOn', () => {
		const taxRateField = productFields.find(
			(field) =>
				field.name === 'taxRateId' &&
				(field.displayOptions?.show?.operation as string[] | undefined)?.includes('create'),
		);
		expect(taxRateField?.typeOptions?.loadOptionsDependsOn).toEqual(['departmentId']);
	});

	it('department scopes the Product Category lookup via loadOptionsDependsOn', () => {
		const categoryField = productFields.find(
			(field) =>
				field.name === 'productCategoryId' &&
				(field.displayOptions?.show?.operation as string[] | undefined)?.includes('create'),
		);
		expect(categoryField?.typeOptions?.loadOptionsDependsOn).toEqual(['departmentId']);
	});

	it('update omits untouched numeric fields (no accidental overwrite)', async () => {
		apiRequest.mockResolvedValueOnce({});
		await executeProduct.call(makeContext({ productId: 'product-1', code: 'ABC' }), 'update', 0);
		const body = apiRequest.mock.calls[0][1] as IDataObject;
		expect(body.selling_price).toBeUndefined();
		expect(body.purchase_price).toBeUndefined();
		expect(body.code).toBe('ABC');
	});

	it('update can intentionally set the selling price to exactly 0.00 via its Change toggle', async () => {
		apiRequest.mockResolvedValueOnce({});
		await executeProduct.call(
			makeContext({
				productId: 'product-1',
				changeSellingPrice: true,
				sellingPrice: 0,
				advancedOptions: { currency: 'EUR' },
			}),
			'update',
			0,
		);
		const body = apiRequest.mock.calls[0][1] as IDataObject;
		expect(body.selling_price).toEqual({ amount: 0, currency: 'EUR' });
	});

	it('refuses an update with nothing to change', async () => {
		await expect(
			executeProduct.call(makeContext({ productId: 'product-1' }), 'update', 0),
		).rejects.toThrow('Fill in at least one field to update');
	});
});

describe('buildProductFilter', () => {
	it('uses timestamp semantics for Updated Since', () => {
		expect(buildProductFilter({ updatedSince: '2026-03-01T09:30:00.000Z' }).updated_since).toBe(
			'2026-03-01T09:30:00+00:00',
		);
	});

	it('stays useful when nothing was filled in', () => {
		expect(buildProductFilter({})).toEqual({});
	});
});

describe('Product custom-field loader scoping', () => {
	it('the Advanced Options custom fields use the product-scoped loader', () => {
		const advanced = productFields.find(
			(field) =>
				field.name === 'advancedOptions' &&
				(field.displayOptions?.show?.operation as string[] | undefined)?.includes('create'),
		);
		const customFields = advanced?.options?.find(
			(option) => (option as unknown as IDataObject).name === 'customFields',
		) as unknown as IDataObject | undefined;
		const idField = ((customFields?.options as IDataObject[] | undefined)?.[0]?.values as IDataObject[])?.find(
			(value) => value.name === 'id',
		);
		expect((idField?.typeOptions as IDataObject)?.loadOptionsMethod).toBe(
			'getProductCustomFieldDefinitions',
		);
	});
});
