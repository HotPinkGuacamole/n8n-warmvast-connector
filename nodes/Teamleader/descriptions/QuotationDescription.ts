import type { INodeProperties } from 'n8n-workflow';

import { paginationFields } from './SharedFields';

const RESOURCE = 'quotation';

/** Grouped line items fixedCollection: sections, each holding its own line items. */
function groupedLinesField(): INodeProperties {
	return {
		displayName: 'Grouped Lines',
		name: 'groupedLines',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Line Group',
		default: {},
		description: 'Groups of quotation lines, each with an optional section title',
		options: [
			{
				displayName: 'Group',
				name: 'group',
				values: [
					{
						displayName: 'Section Title',
						name: 'title',
						type: 'string',
						default: '',
						description: 'Optional title shown above this group of lines',
					},
					{
						displayName: 'Line Items',
						name: 'lineItems',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						placeholder: 'Add Line Item',
						default: {},
						options: [
							{
								displayName: 'Item',
								name: 'item',
								values: [
									{
										displayName: 'Description',
										name: 'description',
										type: 'string',
										default: '',
										description: 'Description of the line, shown on the quotation',
									},
									{
										displayName: 'Discount (%)',
										name: 'discount',
										type: 'number',
										typeOptions: { minValue: 0, maxValue: 100 },
										default: 0,
										description: 'Line discount percentage, between 0 and 100',
									},
									{
										displayName: 'Extended Description',
										name: 'extendedDescription',
										type: 'string',
										typeOptions: { rows: 2 },
										default: '',
										description: 'Additional information about this line, in Markdown',
									},
									{
										displayName: 'Product Name or ID',
										name: 'productId',
										type: 'options',
										typeOptions: { loadOptionsMethod: 'getProducts' },
										default: '',
										description:
											'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
									},
									{
										displayName: 'Purchase Price',
										name: 'purchasePrice',
										type: 'number',
										default: 0,
										description: 'Purchase price of this line, in the account currency',
									},
									{
										displayName: 'Quantity',
										name: 'quantity',
										type: 'number',
										default: 1,
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
									{
										displayName: 'Unit Price (Excl. Tax)',
										name: 'unitPrice',
										type: 'number',
										default: 0,
										description: 'Unit price excluding tax',
									},
								],
							},
						],
					},
				],
			},
		],
	};
}

/** Quotation-level commercial discounts. */
function discountsField(): INodeProperties {
	return {
		displayName: 'Discounts',
		name: 'discounts',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Discount',
		default: {},
		description: 'Commercial discounts applied to the whole quotation',
		options: [
			{
				displayName: 'Discount',
				name: 'discount',
				values: [
					{
						displayName: 'Value (%)',
						name: 'value',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 100 },
						default: 0,
						description: 'Discount percentage, between 0 and 100',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'Description of the discount, e.g. winter promotion',
					},
				],
			},
		],
	};
}

/** Fields shared by create (additionalFields) and update (updateFields). */
function quotationWriteFields(): INodeProperties[] {
	return [
		{
			displayName: 'Action After Expiry',
			name: 'actionAfterExpiry',
			type: 'options',
			options: [
				{ name: 'Lock', value: 'lock' },
				{ name: 'None', value: 'none' },
			],
			default: 'none',
			description:
				'What happens when the quotation expires. Only available when the account has access to quotation expiry.',
		},
		{
			displayName: 'Currency Name or ID',
			name: 'currency',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getCurrencies' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
		discountsField(),
		{
			displayName: 'Document Template Name or ID',
			name: 'documentTemplateId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getQuotationTemplates' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
		{
			displayName: 'Exchange Rate',
			name: 'exchangeRate',
			type: 'number',
			default: 1,
			description: 'Exchange rate for the selected currency',
		},
		{
			displayName: 'Expires After',
			name: 'expiresAfter',
			type: 'dateTime',
			default: '',
			description: 'Date after which the quotation expires',
		},
		groupedLinesField(),
		{
			displayName: 'Text',
			name: 'text',
			type: 'string',
			typeOptions: { rows: 3 },
			default: '',
			description: 'Free quotation text, in Markdown. A quotation needs line items and/or text.',
		},
	];
}

/** Recipient fixedCollection used for to/cc/bcc on send. */
function recipientField(name: string, displayName: string): INodeProperties {
	return {
		displayName,
		name,
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Recipient',
		default: {},
		options: [
			{
				displayName: 'Recipient',
				name: 'recipient',
				values: [
					{
						displayName: 'Email Address',
						name: 'emailAddress',
						type: 'string',
						placeholder: 'name@email.com',
						default: '',
					},
					{
						displayName: 'Customer Type',
						name: 'customerType',
						type: 'options',
						options: [
							{ name: 'Company', value: 'company' },
							{ name: 'Contact', value: 'contact' },
						],
						default: 'contact',
						description: 'Optional Teamleader customer this email address belongs to',
					},
					{
						displayName: 'Customer ID',
						name: 'customerId',
						type: 'string',
						default: '',
						description: 'Optional ID of the linked contact or company',
					},
				],
			},
		],
	};
}

export const quotationOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{ name: 'Accept', value: 'accept', description: 'Mark a quotation as accepted', action: 'Accept a quotation' },
			{ name: 'Create', value: 'create', description: 'Create a quotation on a deal', action: 'Create a quotation' },
			{ name: 'Delete', value: 'delete', description: 'Delete a quotation', action: 'Delete a quotation' },
			{ name: 'Get', value: 'get', description: 'Get a single quotation', action: 'Get a quotation' },
			{ name: 'Get Many', value: 'getAll', description: 'List quotations', action: 'Get many quotations' },
			{ name: 'Send', value: 'send', description: 'Send a quotation by email', action: 'Send a quotation' },
			{ name: 'Update', value: 'update', description: 'Update a quotation', action: 'Update a quotation' },
		],
		default: 'getAll',
	},
];

export const quotationFields: INodeProperties[] = [
	{
		displayName: 'Quotation',
		name: 'quotationId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: {
			show: {
				resource: [RESOURCE],
				operation: ['get', 'update', 'delete', 'send', 'accept'],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchQuotations', searchable: false },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 5b16f6ee-e302-0079-901b-50c26c4a55b1',
			},
		],
	},

	// ---------------- get / getAll ----------------
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['get', 'getAll'] } },
		options: [
			{
				displayName: 'Include Expiry',
				name: 'includeExpiry',
				type: 'boolean',
				default: false,
				description: 'Whether to include expiry information, if the account has access to it',
			},
		],
	},
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
				description: 'Comma-separated list of quotation IDs',
			},
		],
	},

	// ---------------- create ----------------
	{
		displayName: 'Deal',
		name: 'dealId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The deal this quotation belongs to',
		displayOptions: { show: { resource: [RESOURCE], operation: ['create'] } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchDeals', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. cef01135-7e51-4f6f-a6eb-6e5e5a885ac8',
			},
		],
	},
	{
		displayName: 'Department Name or ID',
		name: 'departmentId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDepartments' },
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		hint: 'Only used to narrow the tax rate and document template dropdowns',
		displayOptions: { show: { resource: [RESOURCE], operation: ['create', 'update'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['create'] } },
		options: quotationWriteFields(),
	},

	// ---------------- update ----------------
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['update'] } },
		options: quotationWriteFields(),
	},

	// ---------------- send ----------------
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: [RESOURCE], operation: ['send'] } },
		description: 'Subject of the email',
	},
	{
		displayName: 'Content',
		name: 'content',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: { show: { resource: [RESOURCE], operation: ['send'] } },
		description: 'Body of the email. The shortcode #LINK is replaced with the Cloudsign URL.',
	},
	{
		displayName: 'Language',
		name: 'language',
		type: 'options',
		options: [
			{ name: 'Danish', value: 'da' },
			{ name: 'Dutch', value: 'nl' },
			{ name: 'English', value: 'en' },
			{ name: 'Finnish', value: 'fi' },
			{ name: 'French', value: 'fr' },
			{ name: 'German', value: 'de' },
			{ name: 'Italian', value: 'it' },
			{ name: 'Norwegian', value: 'no' },
			{ name: 'Polish', value: 'pl' },
			{ name: 'Portuguese', value: 'pt' },
			{ name: 'Spanish', value: 'es' },
			{ name: 'Swedish', value: 'sv' },
		],
		default: 'nl',
		required: true,
		displayOptions: { show: { resource: [RESOURCE], operation: ['send'] } },
		description: 'Language of the email',
	},
	{
		displayName: 'Send Options',
		name: 'sendOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['send'] } },
		options: [
			{
				displayName: 'Additional Quotation IDs',
				name: 'additionalQuotationIds',
				type: 'string',
				default: '',
				description:
					'Comma-separated list of extra quotation IDs to send along. They must belong to the same deal.',
			},
			{
				displayName: 'Attachment File IDs',
				name: 'attachments',
				type: 'string',
				default: '',
				description: 'Comma-separated list of Teamleader file IDs to attach',
			},
			recipientField('bcc', 'BCC'),
			recipientField('cc', 'CC'),
			{
				displayName: 'Sender Email Address',
				name: 'senderEmailAddress',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Email address the quotation is sent from',
			},
			{
				displayName: 'Sender ID',
				name: 'senderId',
				type: 'string',
				default: '',
				description: 'ID of the user or department sending the quotation',
			},
			{
				displayName: 'Sender Type',
				name: 'senderType',
				type: 'options',
				options: [
					{ name: 'Department', value: 'department' },
					{ name: 'User', value: 'user' },
				],
				default: 'user',
				description: 'Whether the sender is a user or a department',
			},
			recipientField('to', 'To'),
		],
	},
];
