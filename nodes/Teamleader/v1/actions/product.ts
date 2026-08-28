import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../../helpers/GenericFunctions';
import {
	buildCustomFields,
	buildMoney,
	cleanObject,
	extractCollection,
	toStringArray,
} from '../../helpers/utils';

/** Build the `price_list_prices` array from its fixedCollection value. */
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

/** Build the `configuration` object (stock threshold) for products.add/update. */
export function buildProductConfiguration(fields: IDataObject): IDataObject | undefined {
	const minimum = fields.stockThresholdMinimum;
	if (minimum === undefined || minimum === null || minimum === '') return undefined;

	const parsed = Number(minimum);
	if (Number.isNaN(parsed) || parsed < 0) return undefined;

	return { stock_threshold: { minimum: parsed, action: 'notify' } };
}

/** Map the additionalFields collection onto the products.add/update payload. */
export function buildProductPayload(fields: IDataObject): IDataObject {
	const payload: IDataObject = {
		code: fields.code,
		description: fields.description,
		unit_of_measure_id: fields.unitOfMeasureId,
		department_id: fields.departmentId,
		product_category_id: fields.productCategoryId,
		tax_rate_id: fields.taxRateId,
	};

	const sellingPrice = buildMoney(fields.sellingPrice, fields.sellingPriceCurrency as string);
	if (sellingPrice) payload.selling_price = sellingPrice;

	const purchasePrice = buildMoney(fields.purchasePrice, fields.purchasePriceCurrency as string);
	if (purchasePrice) payload.purchase_price = purchasePrice;

	if (fields.stockAmount !== undefined && fields.stockAmount !== '') {
		const amount = Number(fields.stockAmount);
		if (!Number.isNaN(amount)) payload.stock = { amount };
	}

	const configuration = buildProductConfiguration(fields);
	if (configuration) payload.configuration = configuration;

	const priceListPrices = buildPriceListPrices(fields.priceListPrices);
	if (priceListPrices) payload.price_list_prices = priceListPrices;

	const customFields = buildCustomFields(fields.customFields);
	if (customFields) payload.custom_fields = customFields;

	return cleanObject(payload);
}

/** Map the filters collection onto the products.list filter object. */
export function buildProductFilter(filters: IDataObject): IDataObject {
	const filter: IDataObject = {};

	if (filters.term) filter.term = filters.term;
	if (filters.updatedSince) filter.updated_since = filters.updatedSince;

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
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

		const body: IDataObject = { ...buildProductPayload(additionalFields), name };

		const response = await teamleaderApiRequest.call(this, '/products.add', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'update') {
		const id = getRequiredId(this, 'productId', i);
		const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;

		const body: IDataObject = { id, ...buildProductPayload(updateFields) };
		if (updateFields.name) body.name = updateFields.name;

		if (Object.keys(body).length === 1) {
			throw new NodeOperationError(this.getNode(), 'Select at least one field to update', {
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
