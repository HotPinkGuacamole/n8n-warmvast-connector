import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { toApiTimestamp } from '../../helpers/dates';
import {
	extractId,
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../../helpers/GenericFunctions';
import type { ITeamleaderMoney } from '../../helpers/interfaces';
import { buildMoney, cleanObject, extractCollection, toStringArray } from '../../helpers/utils';
import { assignIfPresent, buildCustomFieldValues } from '../helpers/payload';

/**
 * V2 Product payload builders.
 *
 * Only V2 parameter names are read here — V1's own `v1/actions/product.ts`
 * is untouched.
 */

/** Selling/Purchase Price: only sent when the user actually supplied a non-zero amount. */
function buildOptionalMoney(amount: unknown, currency: unknown): ITeamleaderMoney | undefined {
	if (amount === undefined || amount === null || amount === '') return undefined;
	const parsed = typeof amount === 'number' ? amount : Number(amount);
	if (Number.isNaN(parsed) || parsed === 0) return undefined;
	return { amount: parsed, currency: (currency as string) || 'EUR' };
}

/** Selling/Purchase Price on Update once its Change-toggle is on: 0.00 is then a real value. */
function buildForcedMoney(amount: unknown, currency: unknown): ITeamleaderMoney {
	const parsed = typeof amount === 'number' ? amount : Number(amount);
	return { amount: Number.isNaN(parsed) ? 0 : parsed, currency: (currency as string) || 'EUR' };
}

/**
 * Build `price_list_prices` from the Advanced Options fixedCollection. A row's
 * mere presence is the user's explicit intent (the same reasoning that makes
 * Advanced Options safe for numeric zero elsewhere), so amounts are sent as-is,
 * including an intentional 0.
 */
export function buildPriceListPrices(value: unknown): IDataObject[] | undefined {
	const raw = extractCollection(value, 'price');

	const prices = raw
		.filter((item) => typeof item.priceListId === 'string' && (item.priceListId as string) !== '')
		.map((item) => ({
			price_list_id: item.priceListId as string,
			price: buildMoney(item.amount, item.currency as string),
		}))
		.filter((item) => item.price !== undefined);

	return prices.length > 0 ? (prices as unknown as IDataObject[]) : undefined;
}

/** Build the `configuration.stock_threshold` object from Advanced Options. */
function buildProductConfiguration(advanced: IDataObject): IDataObject | undefined {
	const minimum = advanced.stockThresholdMinimum;
	if (minimum === undefined || minimum === null || minimum === '') return undefined;

	const parsed = Number(minimum);
	if (Number.isNaN(parsed) || parsed < 0) return undefined;

	return { stock_threshold: { minimum: parsed, action: 'notify' } };
}

/**
 * Advanced Options fields (Currency, Price List Prices, Stock Amount, Stock
 * Threshold Minimum, Custom Fields). These live inside a `collection`, so an
 * untouched field is genuinely absent from the parameter object — safe from
 * the "0 looks like untouched" problem without a Change-toggle.
 */
function buildProductAdvancedFields(advanced: IDataObject): IDataObject {
	const payload: IDataObject = {};

	if (advanced.stockAmount !== undefined && advanced.stockAmount !== '') {
		const amount = Number(advanced.stockAmount);
		if (!Number.isNaN(amount)) payload.stock = { amount };
	}

	const configuration = buildProductConfiguration(advanced);
	if (configuration) payload.configuration = configuration;

	const priceListPrices = buildPriceListPrices(advanced.priceListPrices);
	if (priceListPrices) payload.price_list_prices = priceListPrices;

	const customFields = buildCustomFieldValues(advanced.customFields);
	if (customFields) payload.custom_fields = customFields;

	return payload;
}

interface IProductWriteParameters {
	code?: unknown;
	departmentId?: unknown;
	taxRateId?: unknown;
	productCategoryId?: unknown;
	unitOfMeasureId?: unknown;
	description?: unknown;
	sellingPriceAmount?: unknown;
	sellingPriceForced: boolean;
	purchasePriceAmount?: unknown;
	purchasePriceForced: boolean;
	advanced?: IDataObject;
}

/** Shared body builder for `products.add` and `products.update`. */
export function buildProductBody(parameters: IProductWriteParameters): IDataObject {
	const advanced = parameters.advanced ?? {};
	const currency = advanced.currency as string | undefined;

	const sellingPrice = parameters.sellingPriceForced
		? buildForcedMoney(parameters.sellingPriceAmount, currency)
		: buildOptionalMoney(parameters.sellingPriceAmount, currency);

	const purchasePrice = parameters.purchasePriceForced
		? buildForcedMoney(parameters.purchasePriceAmount, currency)
		: buildOptionalMoney(parameters.purchasePriceAmount, currency);

	const body: IDataObject = {};
	assignIfPresent(body, {
		code: parameters.code,
		department_id: extractId(parameters.departmentId),
		tax_rate_id: extractId(parameters.taxRateId),
		product_category_id: extractId(parameters.productCategoryId),
		unit_of_measure_id: extractId(parameters.unitOfMeasureId),
		description: parameters.description,
	});
	if (sellingPrice) body.selling_price = sellingPrice;
	if (purchasePrice) body.purchase_price = purchasePrice;

	return { ...body, ...buildProductAdvancedFields(advanced) };
}

/** Map the V2 filter collection onto the `products.list` filter object. */
export function buildProductFilter(filters: IDataObject): IDataObject {
	const filter: IDataObject = {};

	if (filters.term) filter.term = filters.term;

	const updatedSince = toApiTimestamp(filters.updatedSince);
	if (updatedSince) filter.updated_since = updatedSince;

	const ids = toStringArray(filters.ids);
	if (ids.length > 0) filter.ids = ids;

	return filter;
}

export async function executeProduct(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	if (operation === 'get') {
		const id = getRequiredId(this, 'productId', i);
		const options = this.getNodeParameter('options', i, {}) as IDataObject;

		const body: IDataObject = { id };
		if (options.includeSuppliers) body.includes = 'suppliers';

		const response = await teamleaderApiRequest.call(this, '/products.info', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'getAll') {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

		const body: IDataObject = {};
		const filter = buildProductFilter(filters);
		if (Object.keys(filter).length > 0) body.filter = filter;

		return await teamleaderFetchList.call(this, '/products.list', i, body);
	}

	if (operation === 'create') {
		const name = this.getNodeParameter('name', i) as string;

		const body: IDataObject = {
			name,
			...buildProductBody({
				code: this.getNodeParameter('code', i, ''),
				departmentId: this.getNodeParameter('departmentId', i, ''),
				taxRateId: this.getNodeParameter('taxRateId', i, ''),
				productCategoryId: this.getNodeParameter('productCategoryId', i, ''),
				unitOfMeasureId: this.getNodeParameter('unitOfMeasureId', i, ''),
				description: this.getNodeParameter('description', i, ''),
				sellingPriceAmount: this.getNodeParameter('sellingPrice', i, 0),
				sellingPriceForced: false,
				purchasePriceAmount: this.getNodeParameter('purchasePrice', i, 0),
				purchasePriceForced: false,
				advanced: this.getNodeParameter('advancedOptions', i, {}) as IDataObject,
			}),
		};

		if (!body.name) {
			throw new NodeOperationError(this.getNode(), 'Name is required', { itemIndex: i });
		}

		const response = await teamleaderApiRequest.call(this, '/products.add', cleanObject(body));
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'update') {
		const id = getRequiredId(this, 'productId', i);
		const name = this.getNodeParameter('name', i, '') as string;
		const changeSellingPrice = this.getNodeParameter('changeSellingPrice', i, false) as boolean;
		const changePurchasePrice = this.getNodeParameter('changePurchasePrice', i, false) as boolean;

		const body: IDataObject = {
			id,
			...buildProductBody({
				code: this.getNodeParameter('code', i, ''),
				departmentId: this.getNodeParameter('departmentId', i, ''),
				taxRateId: this.getNodeParameter('taxRateId', i, ''),
				productCategoryId: this.getNodeParameter('productCategoryId', i, ''),
				unitOfMeasureId: this.getNodeParameter('unitOfMeasureId', i, ''),
				description: this.getNodeParameter('description', i, ''),
				sellingPriceAmount: changeSellingPrice
					? this.getNodeParameter('sellingPrice', i, 0)
					: undefined,
				sellingPriceForced: changeSellingPrice,
				purchasePriceAmount: changePurchasePrice
					? this.getNodeParameter('purchasePrice', i, 0)
					: undefined,
				purchasePriceForced: changePurchasePrice,
				advanced: this.getNodeParameter('advancedOptions', i, {}) as IDataObject,
			}),
		};
		if (name) body.name = name;

		if (Object.keys(body).length <= 1) {
			throw new NodeOperationError(this.getNode(), 'Fill in at least one field to update', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/products.update', body);
		return [{ success: true, id }];
	}

	if (operation === 'delete') {
		const id = getRequiredId(this, 'productId', i);
		await teamleaderApiRequest.call(this, '/products.delete', { id });
		return [{ success: true, id }];
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for resource "product"`,
		{ itemIndex: i },
	);
}
