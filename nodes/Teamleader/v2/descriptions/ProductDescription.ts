import type { INodeProperties } from 'n8n-workflow';

import { advancedOptions, destructiveNotice, resourceLocatorField } from './V2Common';
import { customFieldsField, paginationFields, scopeShow } from './V2SharedFields';

const RESOURCE = 'product';

const scope = (...operations: string[]) => ({ resource: RESOURCE, operations });

const productLocator = (operations: string[], description: string): INodeProperties =>
	resourceLocatorField({
		displayName: 'Product',
		name: 'productId',
		searchListMethod: 'searchProducts',
		scope: scope(...operations),
		description,
		placeholder: 'Select a product...',
	});

/**
 * Department is placed above Tax Rate and Product Category because it scopes
 * both of their lookups (connector-wide dependent-dropdown rule). The
 * description below is a plain string literal on purpose — see the note on
 * `pipelineField` in DealDescription.ts for why.
 */
const departmentField = (operations: string[]): INodeProperties => ({
	displayName: 'Department Name or ID',
	name: 'departmentId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getDepartments' },
	default: '',
	description:
		'Scopes the Tax Rate and Product Category lists below. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	displayOptions: scopeShow(scope(...operations)),
});

const taxRateField = (operations: string[]): INodeProperties => ({
	displayName: 'Tax Rate Name or ID',
	name: 'taxRateId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getTaxRates', loadOptionsDependsOn: ['departmentId'] },
	default: '',
	description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	displayOptions: scopeShow(scope(...operations)),
});

const productCategoryField = (operations: string[]): INodeProperties => ({
	displayName: 'Product Category Name or ID',
	name: 'productCategoryId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getProductCategories', loadOptionsDependsOn: ['departmentId'] },
	default: '',
	description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	displayOptions: scopeShow(scope(...operations)),
});

const unitOfMeasureField = (operations: string[]): INodeProperties => ({
	displayName: 'Unit of Measure Name or ID',
	name: 'unitOfMeasureId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getUnitsOfMeasure' },
	default: '',
	description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	displayOptions: scopeShow(scope(...operations)),
});

const descriptionField = (operations: string[]): INodeProperties => ({
	displayName: 'Description',
	name: 'description',
	type: 'string',
	typeOptions: { rows: 3 },
	default: '',
	description: 'Description of the product, in Markdown',
	displayOptions: scopeShow(scope(...operations)),
});

const articleCodeField = (operations: string[]): INodeProperties => ({
	displayName: 'Article Code',
	name: 'code',
	type: 'string',
	default: '',
	description: 'Your internal article number. Shown in product pickers.',
	displayOptions: scopeShow(scope(...operations)),
});

/**
 * Advanced fields shared by Create and Update. Living inside the Advanced
 * Options collection means an untouched field is genuinely absent from the
 * parameter object rather than present-with-a-default, so Stock Amount and
 * Stock Threshold Minimum are safe from the "0 looks like untouched" problem
 * without needing their own Change-toggle — Selling/Purchase Price cannot use
 * this trick because they are promoted, top-level fields (see the Update
 * Change-toggle pair below).
 */
const productAdvancedFields: INodeProperties[] = [
	{
		displayName: 'Currency Name or ID',
		name: 'currency',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getCurrencies' },
		default: 'EUR',
		description:
			'Applies to both Selling Price and Purchase Price. Warmvast invoices in EUR; change this only for foreign-currency articles. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	customFieldsField('getProductCustomFieldDefinitions'),
	{
		displayName: 'Price List Prices',
		name: 'priceListPrices',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Price List Price',
		default: {},
		options: [
			{
				displayName: 'Price',
				name: 'price',
				values: [
					{
						displayName: 'Price List Name or ID',
						name: 'priceListId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getPriceLists' },
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
					{ displayName: 'Amount', name: 'amount', type: 'number', typeOptions: { numberPrecision: 2 }, default: 0 },
					{
						displayName: 'Currency Name or ID',
						name: 'currency',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getCurrencies' },
						default: 'EUR',
						description:
							'Defaults to EUR; set it if this price list uses another currency. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
		],
	},
	{
		displayName: 'Stock Amount',
		name: 'stockAmount',
		type: 'number',
		default: 0,
		description: 'Only available when the stock management feature is enabled',
	},
	{
		displayName: 'Stock Threshold Minimum',
		name: 'stockThresholdMinimum',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 0,
		description:
			'Notify when the stock drops below this amount. Only available when the stock management feature is enabled.',
	},
];

export const productOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{ name: 'Create', value: 'create', description: 'Create a new product', action: 'Create a product' },
			{ name: 'Delete', value: 'delete', description: 'Delete a product', action: 'Delete a product' },
			{ name: 'Get', value: 'get', description: 'Get a single product', action: 'Get a product' },
			{ name: 'Get Many', value: 'getAll', description: 'Get many products', action: 'Get many products' },
			{ name: 'Update', value: 'update', description: 'Update a product', action: 'Update a product' },
		],
		default: 'create',
	},
];

export const productFields: INodeProperties[] = [
	// ------------------------------------------------------------------- Get
	productLocator(['get'], 'The product to retrieve'),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: scopeShow(scope('get')),
		options: [
			{
				displayName: 'Include Suppliers',
				name: 'includeSuppliers',
				type: 'boolean',
				default: false,
				description: 'Whether to include supplier information in the response',
			},
		],
	},

	// -------------------------------------------------------------- Get Many
	...paginationFields(scope('getAll')),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: scopeShow(scope('getAll')),
		options: [
			{
				displayName: 'IDs',
				name: 'ids',
				type: 'string',
				default: '',
				description: 'Comma-separated list of product IDs',
			},
			{
				displayName: 'Search Term',
				name: 'term',
				type: 'string',
				default: '',
				description: 'Filters on the name or the code of the product',
			},
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description: 'Only return products updated after this moment',
			},
		],
	},

	// ---------------------------------------------------------------- Create
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'Name of the product. Teamleader requires this.',
		displayOptions: scopeShow(scope('create')),
	},
	articleCodeField(['create']),
	{
		displayName: 'Selling Price',
		name: 'sellingPrice',
		type: 'number',
		typeOptions: { numberPrecision: 2 },
		default: 0,
		description: 'Selling price, excluding tax. Leave at 0 to create the product without one.',
		displayOptions: scopeShow(scope('create')),
	},
	{
		displayName: 'Purchase Price',
		name: 'purchasePrice',
		type: 'number',
		typeOptions: { numberPrecision: 2 },
		default: 0,
		description: 'Purchase price, excluding tax. Leave at 0 to create the product without one.',
		displayOptions: scopeShow(scope('create')),
	},
	departmentField(['create']),
	taxRateField(['create']),
	productCategoryField(['create']),
	unitOfMeasureField(['create']),
	descriptionField(['create']),
	advancedOptions(scope('create'), productAdvancedFields),

	// ---------------------------------------------------------------- Update
	productLocator(['update'], 'The product to update'),
	{
		displayName: 'Leave a field empty to keep its current value in Teamleader',
		name: 'updateNotice',
		type: 'notice',
		default: '',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		description: 'Name of the product',
		displayOptions: scopeShow(scope('update')),
	},
	articleCodeField(['update']),
	{
		displayName: 'Change Selling Price',
		name: 'changeSellingPrice',
		type: 'boolean',
		default: false,
		description:
			'Whether to update the selling price. Leave off to keep the current price untouched — turning this on is also how you set it to exactly 0.00.',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Selling Price',
		name: 'sellingPrice',
		type: 'number',
		typeOptions: { numberPrecision: 2 },
		default: 0,
		description: 'Selling price, excluding tax',
		displayOptions: scopeShow(scope('update'), { changeSellingPrice: [true] }),
	},
	{
		displayName: 'Change Purchase Price',
		name: 'changePurchasePrice',
		type: 'boolean',
		default: false,
		description:
			'Whether to update the purchase price. Leave off to keep the current price untouched — turning this on is also how you set it to exactly 0.00.',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Purchase Price',
		name: 'purchasePrice',
		type: 'number',
		typeOptions: { numberPrecision: 2 },
		default: 0,
		description: 'Purchase price, excluding tax',
		displayOptions: scopeShow(scope('update'), { changePurchasePrice: [true] }),
	},
	departmentField(['update']),
	taxRateField(['update']),
	productCategoryField(['update']),
	unitOfMeasureField(['update']),
	descriptionField(['update']),
	advancedOptions(scope('update'), productAdvancedFields),

	// ---------------------------------------------------------------- Delete
	productLocator(['delete'], 'The product to delete'),
	destructiveNotice(scope('delete'), {
		name: 'deleteNotice',
		text: 'Permanently deletes this product in Teamleader. This cannot be undone from n8n.',
	}),
];
