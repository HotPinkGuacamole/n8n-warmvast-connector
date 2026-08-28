import type { INodeProperties } from 'n8n-workflow';

import { customFieldsField, customerFields, paginationFields, sortField } from './SharedFields';

const RESOURCE = 'invoice';

/** Grouped line items fixedCollection shared by draft/update/creditPartially. */
function invoiceGroupedLinesField(): INodeProperties {
	return {
		displayName: 'Grouped Lines',
		name: 'groupedLines',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Line Group',
		default: {},
		description: 'Groups of invoice lines, each with an optional section title',
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
										description: 'Description of the line, shown on the invoice',
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
										displayName: 'Product Category Name or ID',
										name: 'productCategoryId',
										type: 'options',
										typeOptions: { loadOptionsMethod: 'getProductCategories' },
										default: '',
										description:
											'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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
									{
										displayName: 'Withholding Tax Rate Name or ID',
										name: 'withholdingTaxRateId',
										type: 'options',
										typeOptions: { loadOptionsMethod: 'getWithholdingTaxRates' },
										default: '',
										description:
											'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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

/** Quotation-style commercial discounts, reused for invoices. */
function invoiceDiscountsField(): INodeProperties {
	return {
		displayName: 'Discounts',
		name: 'discounts',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Discount',
		default: {},
		description: 'Commercial discounts applied to the whole invoice',
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

/** Recipient fixedCollection for invoices.send (uses `email`, per the official schema). */
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
						displayName: 'Email',
						name: 'email',
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

/** Fields shared by draft (additionalFields) and update (updateFields). */
function invoiceWriteFields(): INodeProperties[] {
	return [
		{
			displayName: 'Currency Name or ID',
			name: 'currency',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getCurrencies' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
		customFieldsField(),
		invoiceDiscountsField(),
		{
			displayName: 'Document Template Name or ID',
			name: 'documentTemplateId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getInvoiceTemplates' },
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
			displayName: 'Expected Payment Method',
			name: 'expectedPaymentMethod',
			type: 'options',
			options: [
				{ name: 'Bank Transfer', value: 'bank_transfer' },
				{ name: "Banker's Draft", value: 'bankers_draft' },
				{ name: 'Cash', value: 'cash' },
				{ name: 'Cheque', value: 'cheque' },
				{ name: 'Credit Card', value: 'credit_card' },
				{ name: 'Direct Debit', value: 'direct_debit' },
				{ name: 'Payment Card', value: 'payment_card' },
				{ name: 'SEPA Direct Debit', value: 'sepa_direct_debit' },
			],
			default: 'bank_transfer',
			description: 'How the invoice is expected to be paid',
		},
		{
			displayName: 'Expected Payment Reference',
			name: 'expectedPaymentReference',
			type: 'string',
			default: '',
			description:
				'Mandate reference, only supported for SEPA direct debit, direct debit and credit card',
		},
		{
			displayName: 'For Attention of (Contact ID)',
			name: 'forAttentionOfContactId',
			type: 'string',
			default: '',
			description: 'ID of the contact the invoice is addressed to. Takes priority over the name.',
		},
		{
			displayName: 'For Attention of (Name)',
			name: 'forAttentionOfName',
			type: 'string',
			default: '',
			description: 'Name the invoice is addressed to, e.g. Finance Dept',
		},
		invoiceGroupedLinesField(),
		{
			displayName: 'Invoice Date',
			name: 'invoiceDate',
			type: 'dateTime',
			default: '',
			description: 'Date of the invoice',
		},
		{
			displayName: 'Note',
			name: 'note',
			type: 'string',
			typeOptions: { rows: 2 },
			default: '',
			description: 'Comments shown on the invoice',
		},
		{
			displayName: 'Payment Term Days',
			name: 'paymentTermDays',
			type: 'number',
			default: 30,
			description: 'Number of days for the payment term. Not used when the type is cash.',
		},
		{
			displayName: 'Payment Term Type',
			name: 'paymentTermType',
			type: 'options',
			options: [
				{ name: 'After Invoice Date', value: 'after_invoice_date' },
				{ name: 'Cash', value: 'cash' },
				{ name: 'End of Month', value: 'end_of_month' },
			],
			default: 'after_invoice_date',
			description: 'When the invoice is due. Required when drafting an invoice.',
		},
		{
			displayName: 'Project ID',
			name: 'projectId',
			type: 'string',
			default: '',
			description: 'ID of the project this invoice belongs to',
		},
		{
			displayName: 'Purchase Order Number',
			name: 'purchaseOrderNumber',
			type: 'string',
			default: '',
			description: 'Purchase order number of the customer',
		},
	];
}

export const invoiceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{ name: 'Book', value: 'book', description: 'Book a draft invoice', action: 'Book an invoice' },
			{ name: 'Create Draft', value: 'draft', description: 'Draft a new invoice', action: 'Create a draft invoice' },
			{ name: 'Credit Fully', value: 'credit', description: 'Credit an invoice completely, creating a credit note', action: 'Credit an invoice fully' },
			{ name: 'Credit Partially', value: 'creditPartially', description: 'Credit specific lines of an invoice, creating a credit note', action: 'Credit an invoice partially' },
			{ name: 'Download', value: 'download', description: 'Download an invoice as a file', action: 'Download an invoice' },
			{ name: 'Get', value: 'get', description: 'Get a single invoice', action: 'Get an invoice' },
			{ name: 'Get Many', value: 'getAll', description: 'List or search invoices', action: 'Get many invoices' },
			{ name: 'Register Payment', value: 'registerPayment', description: 'Register a payment for an invoice', action: 'Register a payment for an invoice' },
			{ name: 'Remove Payments', value: 'removePayments', description: 'Mark an invoice as unpaid and remove all linked payments', action: 'Remove payments from an invoice' },
			{ name: 'Send', value: 'send', description: 'Send an invoice by email', action: 'Send an invoice' },
			{ name: 'Update Booked', value: 'updateBooked', description: 'Update a booked invoice, if allowed by the account settings', action: 'Update a booked invoice' },
			{ name: 'Update Draft', value: 'update', description: 'Update a draft invoice', action: 'Update a draft invoice' },
		],
		default: 'getAll',
	},
];

export const invoiceFields: INodeProperties[] = [
	{
		displayName: 'Invoice',
		name: 'invoiceId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: {
			show: {
				resource: [RESOURCE],
				operation: [
					'get',
					'update',
					'updateBooked',
					'book',
					'send',
					'registerPayment',
					'removePayments',
					'download',
					'credit',
					'creditPartially',
				],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchInvoices', searchable: false },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. d885e5d5-bacb-4607-bde9-abc4a04a901b',
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
				displayName: 'Customer ID',
				name: 'customerId',
				type: 'string',
				default: '',
				description: 'ID of the contact or company the invoices belong to',
			},
			{
				displayName: 'Customer Type',
				name: 'customerType',
				type: 'options',
				options: [
					{ name: 'Company', value: 'company' },
					{ name: 'Contact', value: 'contact' },
				],
				default: 'company',
			},
			{
				displayName: 'Deal ID',
				name: 'dealId',
				type: 'string',
				default: '',
				description: 'Only return invoices linked to this deal',
			},
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
				displayName: 'IDs',
				name: 'ids',
				type: 'string',
				default: '',
				description: 'Comma-separated list of invoice IDs',
			},
			{
				displayName: 'Invoice Date After',
				name: 'invoiceDateAfter',
				type: 'dateTime',
				default: '',
				description: 'Inclusive start of the invoice date range',
			},
			{
				displayName: 'Invoice Date Before',
				name: 'invoiceDateBefore',
				type: 'dateTime',
				default: '',
				description: 'Inclusive end of the invoice date range',
			},
			{
				displayName: 'Invoice Number',
				name: 'invoiceNumber',
				type: 'string',
				default: '',
				description: 'Full invoice number, e.g. 2017 / 5',
			},
			{
				displayName: 'Payment Reference',
				name: 'paymentReference',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'string',
				default: '',
				description: 'Only return invoices linked to this project',
			},
			{
				displayName: 'Purchase Order Number',
				name: 'purchaseOrderNumber',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Search Term',
				name: 'term',
				type: 'string',
				default: '',
				description:
					'Filters on invoice number, purchase order number, payment reference and invoicee',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'multiOptions',
				options: [
					{ name: 'Draft', value: 'draft' },
					{ name: 'Matched', value: 'matched' },
					{ name: 'Outstanding', value: 'outstanding' },
				],
				default: [],
			},
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Include Late Fees',
				name: 'includeLateFees',
				type: 'boolean',
				default: false,
				description: 'Whether to include late fee and interest totals in the response',
			},
			sortField(['invoice_number', 'invoice_date']),
		],
	},

	// ---------------- draft ----------------
	...customerFields({ resource: [RESOURCE], operation: ['draft'] }),
	{
		displayName: 'Department Name or ID',
		name: 'departmentId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDepartments' },
		default: '',
		required: true,
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: [RESOURCE], operation: ['draft'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['draft'] } },
		options: invoiceWriteFields(),
	},

	// ---------------- update / updateBooked ----------------
	{
		displayName: 'Update Customer',
		name: 'updateCustomer',
		type: 'boolean',
		default: false,
		description: 'Whether to also change the invoicee of this invoice',
		displayOptions: { show: { resource: [RESOURCE], operation: ['update', 'updateBooked'] } },
	},
	...customerFields({ resource: [RESOURCE], operation: ['update', 'updateBooked'] }, false).map(
		(field) => ({
			...field,
			displayOptions: {
				show: { ...(field.displayOptions?.show ?? {}), updateCustomer: [true] },
			},
		}),
	),
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['update', 'updateBooked'] } },
		options: invoiceWriteFields(),
	},

	// ---------------- book ----------------
	{
		displayName: 'Booking Date',
		name: 'bookDate',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'Date on which the invoice is booked',
		displayOptions: { show: { resource: [RESOURCE], operation: ['book'] } },
	},

	// ---------------- send ----------------
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		required: true,
		description: 'Subject of the email',
		displayOptions: { show: { resource: [RESOURCE], operation: ['send'] } },
	},
	{
		displayName: 'Body',
		name: 'body',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		description: 'Body of the email',
		displayOptions: { show: { resource: [RESOURCE], operation: ['send'] } },
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
				displayName: 'Attachment File IDs',
				name: 'attachments',
				type: 'string',
				default: '',
				description: 'Comma-separated list of Teamleader file IDs to attach',
			},
			recipientField('bcc', 'BCC'),
			recipientField('cc', 'CC'),
			{
				displayName: 'Mail Template Name or ID',
				name: 'mailTemplateId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getMailTemplates' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			recipientField('to', 'To'),
		],
	},

	// ---------------- registerPayment ----------------
	{
		displayName: 'Amount',
		name: 'amount',
		type: 'number',
		default: 0,
		required: true,
		description: 'Amount that was paid',
		displayOptions: { show: { resource: [RESOURCE], operation: ['registerPayment'] } },
	},
	{
		displayName: 'Currency Name or ID',
		name: 'currency',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getCurrencies' },
		default: 'EUR',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: [RESOURCE], operation: ['registerPayment'] } },
	},
	{
		displayName: 'Paid At',
		name: 'paidAt',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'Moment the payment was received',
		displayOptions: { show: { resource: [RESOURCE], operation: ['registerPayment'] } },
	},
	{
		displayName: 'Payment Method Name or ID',
		name: 'paymentMethodId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getPaymentMethods' },
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: [RESOURCE], operation: ['registerPayment'] } },
	},

	// ---------------- download ----------------
	{
		displayName: 'Format',
		name: 'format',
		type: 'options',
		options: [
			{ name: 'PDF', value: 'pdf' },
			{ name: 'UBL E-FFF', value: 'ubl/e-fff' },
			{ name: 'UBL Peppol BIS 3', value: 'ubl/peppol_bis_3' },
		],
		default: 'pdf',
		description: 'File format to download',
		displayOptions: { show: { resource: [RESOURCE], operation: ['download'] } },
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		hint: 'The name of the output binary field to put the file in',
		displayOptions: { show: { resource: [RESOURCE], operation: ['download'] } },
	},

	// ---------------- credit ----------------
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['credit'] } },
		options: [
			{
				displayName: 'Credit Note Date',
				name: 'creditNoteDate',
				type: 'dateTime',
				default: '',
				description: 'Date of the resulting credit note',
			},
		],
	},

	// ---------------- creditPartially ----------------
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['creditPartially'] } },
		options: [
			{
				displayName: 'Credit Note Date',
				name: 'creditNoteDate',
				type: 'dateTime',
				default: '',
				description: 'Date of the resulting credit note',
			},
			invoiceDiscountsField(),
			invoiceGroupedLinesField(),
		],
	},
];
