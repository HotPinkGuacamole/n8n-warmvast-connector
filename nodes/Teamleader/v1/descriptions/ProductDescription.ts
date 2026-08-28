import type { INodeProperties } from 'n8n-workflow';

import { customFieldsField, paginationFields } from './SharedFields';

const RESOURCE = 'product';

/** Fields shared by the create (additionalFields) and update (updateFields) collections. */
function productWriteFields(): INodeProperties[] {
	return [
		{
			displayName: 'Code',
			name: 'code',
			type: 'string',
			default: '',
			description: 'Product code / identifier',
		},
		customFieldsField(),
		{
			displayName: 'Department Name or ID',
			name: 'departmentId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getDepartments' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
		{
			displayName: 'Description',
			name: 'description',
			type: 'string',
			typeOptions: { rows: 3 },
			default: '',
			description: 'Description of the product, in Markdown',
		},
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
						{ displayName: 'Amount', name: 'amount', type: 'number', default: 0 },
						{
							displayName: 'Currency Name or ID',
							name: 'currency',
							type: 'options',
							typeOptions: { loadOptionsMethod: 'getCurrencies' },
							default: 'EUR',
							description:
								'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
						},
					],
				},
			],
		},
		{
			displayName: 'Product Category Name or ID',
			name: 'productCategoryId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getProductCategories' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
		{
			displayName: 'Purchase Price',
			name: 'purchasePrice',
			type: 'number',
			default: 0,
			description: 'Purchase price, excluding tax. The currency must match the account currency.',
		},
		{
			displayName: 'Purchase Price Currency Name or ID',
			name: 'purchasePriceCurrency',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getCurrencies' },
			default: 'EUR',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
		{
			displayName: 'Selling Price',
			name: 'sellingPrice',
			type: 'number',
			default: 0,
			description: 'Selling price, excluding tax',
		},
		{
			displayName: 'Selling Price Currency Name or ID',
			name: 'sellingPriceCurrency',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getCurrencies' },
			default: 'EUR',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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
		{
			displayName: 'Tax Rate Name or ID',
			name: 'taxRateId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getTaxRates' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
		{
			displayName: 'Unit of Measure Name or ID',
			name: 'unitOfMeasureId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getUnitsOfMeasure' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
	];
}

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
			{ name: 'Get Many', value: 'getAll', description: 'List or search products', action: 'Get many products' },
			{ name: 'Update', value: 'update', description: 'Update a product', action: 'Update a product' },
		],
		default: 'getAll',
	},
];

export const productFields: INodeProperties[] = [
	{
		displayName: 'Product',
		name: 'productId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: { show: { resource: [RESOURCE], operation: ['get', 'update', 'delete'] } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchProducts', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 65a35860-dcca-4850-9fd6-47ff08469e0c',
			},
		],
	},

	// ---------------- get ----------------
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['get'] } },
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

	// ---------------- getAll ----------------
	...paginationFields(RESOURCE, ['getAll']),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['getAll'] } },
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

	// ---------------- create ----------------
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: [RESOURCE], operation: ['create'] } },
		description: 'Name of the product',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['create'] } },
		options: productWriteFields(),
	},

	// ---------------- update ----------------
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['update'] } },
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Name of the product',
			},
			...productWriteFields(),
		],
	},
];
