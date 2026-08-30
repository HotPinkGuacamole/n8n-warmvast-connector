import type { INodeProperties } from 'n8n-workflow';

import { INVOICE_LINE_CONFIG, lineEditorFields } from './LineEditor';
import { attachmentsField, ccBccFields, recipientCollectionField } from './SendFields';
import {
	advancedOptions,
	customerLocator,
	customerTypeField,
	destructiveNotice,
	resourceLocatorField,
} from './V2Common';
import { customFieldsField, paginationFields, scopeShow, sortField } from './V2SharedFields';

const RESOURCE = 'invoice';

const scope = (...operations: string[]) => ({ resource: RESOURCE, operations });

const WRITE_OPERATIONS = ['draft', 'update', 'updateBooked'];

/**
 * `invoices.list` accepts a `term` filter, so unlike the quotation picker this
 * one really does search server-side (invoice number, purchase order number,
 * payment reference, invoicee) and needs no "recent only" caveat.
 */
const invoiceLocator = (operations: string[], description: string): INodeProperties =>
	resourceLocatorField({
		displayName: 'Invoice',
		name: 'invoiceId',
		searchListMethod: 'searchInvoices',
		scope: scope(...operations),
		description,
		placeholder: 'Select an invoice...',
	});

// --------------------------------------------------------------- customer

/**
 * The flagship flow is "deal won → draft invoice", so the deal is the default
 * source of the customer. Nothing is guessed: the deal is read at execution
 * time and, if it carries no customer, the run fails with a message naming the
 * deal rather than inventing an invoicee.
 */
const customerSourceField: INodeProperties = {
	displayName: 'Customer Source',
	name: 'customerSource',
	type: 'options',
	options: [
		{
			name: 'From Deal',
			value: 'fromDeal',
			description: "Take the customer (and department) from a deal's own data",
		},
		{
			name: 'Select Manually',
			value: 'manual',
			description: 'Choose the company or contact to invoice yourself',
		},
	],
	default: 'fromDeal',
	description: 'Where the invoicee comes from',
	displayOptions: scopeShow(scope('draft')),
};

const draftDealField: INodeProperties = {
	...resourceLocatorField({
		displayName: 'Deal',
		name: 'dealId',
		searchListMethod: 'searchDeals',
		scope: scope('draft'),
		description:
			"The deal to invoice. Its customer becomes the invoicee, and its department is used unless you set one below.",
		placeholder: 'Select a deal...',
	}),
	displayOptions: scopeShow(scope('draft'), { customerSource: ['fromDeal'] }),
};

/** Manual customer selection, shown only when the deal is not the source. */
const manualCustomerFields: INodeProperties[] = [
	{
		...customerLocator(scope('draft'), { displayName: 'Customer' }),
		description: 'The company or contact this invoice is for',
		displayOptions: scopeShow(scope('draft'), { customerSource: ['manual'] }),
	},
	{
		...customerTypeField(scope('draft'), 'customer'),
		displayOptions: {
			show: {
				resource: [RESOURCE],
				operation: ['draft'],
				customerSource: ['manual'],
				'customer.mode': ['id'],
			},
		},
	},
];

/**
 * Department scopes the template, tax-rate and product-category lists, and
 * `invoices.draft` requires one. With a deal it may be left empty and is taken
 * from the deal at execution; without a deal it must be filled in.
 */
const draftDepartmentField: INodeProperties = {
	displayName: 'Department Name or ID',
	name: 'departmentId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getDepartments' },
	default: '',
	description:
		"Company entity that issues this invoice. Leave empty with a deal to use the deal's own department. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	displayOptions: scopeShow(scope('draft')),
};

// ------------------------------------------------------- for attention of

/**
 * `invoicee.for_attention_of` is One Of `{name}` or `{contact_id}`, and it is
 * never filled in automatically: putting the deal's contact person on an
 * invoice is a decision, not a default.
 */
const forAttentionOfSourceField = (operations: string[], withDeal: boolean): INodeProperties => {
	const options = [
		{ name: 'Not Set', value: 'none', description: 'No attention line on the invoice' },
		{ name: 'Contact', value: 'contact', description: 'Address it to a specific Teamleader contact' },
		{ name: 'Name', value: 'name', description: 'Address it to a free-text name, e.g. a department' },
	];
	if (withDeal) {
		options.splice(1, 0, {
			name: 'Deal Contact Person',
			value: 'dealContactPerson',
			description: "Use the contact person set on the deal (only with Customer Source = From Deal)",
		});
	}

	return {
		displayName: 'For Attention Of',
		name: 'forAttentionOfSource',
		type: 'options',
		options,
		default: 'none',
		description: 'Who the invoice is addressed to inside the customer organisation',
		displayOptions: scopeShow(scope(...operations), withDeal ? { customerSource: ['fromDeal'] } : {}),
	};
};

const forAttentionOfContactField = (operations: string[]): INodeProperties => ({
	...resourceLocatorField({
		displayName: 'Attention Contact',
		name: 'forAttentionOfContactId',
		searchListMethod: 'searchContacts',
		scope: scope(...operations),
		description: 'Contact the invoice is addressed to',
		placeholder: 'Select a contact...',
		required: false,
	}),
	displayOptions: scopeShow(scope(...operations), { forAttentionOfSource: ['contact'] }),
});

const forAttentionOfNameField = (operations: string[]): INodeProperties => ({
	displayName: 'Attention Name',
	name: 'forAttentionOfName',
	type: 'string',
	default: '',
	placeholder: 'e.g. Finance Department',
	description: 'Free-text attention line printed on the invoice',
	displayOptions: scopeShow(scope(...operations), { forAttentionOfSource: ['name'] }),
});

// ------------------------------------------------------------ payment term

/**
 * Teamleader takes the payment term inline as `{type, days}`, never as an ID.
 * "Teamleader Default" uses the term the API itself reports as the account
 * default (`paymentTerms.list` → `meta.default`); when Teamleader reports none,
 * execution fails rather than picking one.
 */
const paymentTermSourceField = (operations: string[], allowKeep: boolean): INodeProperties => {
	const options = [
		{
			name: 'Teamleader Default',
			value: 'default',
			description: "Use the payment term Teamleader marks as this account's default",
		},
		{
			name: 'Select Payment Term',
			value: 'select',
			description: "Pick one of the account's configured payment terms",
		},
		{
			name: 'Custom Payment Term',
			value: 'custom',
			description: 'Type the term yourself, e.g. 45 days after the invoice date',
		},
	];
	if (allowKeep) {
		options.unshift({
			name: 'Keep Current',
			value: 'keep',
			description: 'Do not change the payment term of this invoice',
		});
	}

	const field: INodeProperties = {
		displayName: 'Payment Term',
		name: 'paymentTermSource',
		type: 'options',
		options,
		default: 'default',
		description: 'When this invoice has to be paid',
		displayOptions: scopeShow(scope(...operations)),
	};
	// An update must not change the term unless asked to, so its default is "keep".
	if (allowKeep) field.default = 'keep';
	return field;
};

const paymentTermSelectField = (operations: string[]): INodeProperties => ({
	displayName: 'Payment Term Name or ID',
	name: 'paymentTermId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getPaymentTerms' },
	default: '',
	description:
		'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	displayOptions: scopeShow(scope(...operations), { paymentTermSource: ['select'] }),
});

const paymentTermTypeField = (operations: string[]): INodeProperties => ({
	displayName: 'Payment Term Type',
	name: 'paymentTermType',
	type: 'options',
	options: [
		{ name: 'After Invoice Date', value: 'after_invoice_date' },
		{ name: 'Cash', value: 'cash' },
		{ name: 'End of Month', value: 'end_of_month' },
	],
	default: 'after_invoice_date',
	description: 'How the due date is calculated',
	displayOptions: scopeShow(scope(...operations), { paymentTermSource: ['custom'] }),
});

const paymentTermDaysField = (operations: string[]): INodeProperties => ({
	displayName: 'Payment Term Days',
	name: 'paymentTermDays',
	type: 'number',
	typeOptions: { minValue: 0 },
	default: 30,
	description: 'Number of days added to the term. Not used for a cash term.',
	displayOptions: {
		show: {
			resource: [RESOURCE],
			operation: operations,
			paymentTermSource: ['custom'],
			paymentTermType: ['after_invoice_date', 'end_of_month'],
		},
	},
});

const paymentTermFields = (operations: string[], allowKeep: boolean): INodeProperties[] => [
	paymentTermSourceField(operations, allowKeep),
	paymentTermSelectField(operations),
	paymentTermTypeField(operations),
	paymentTermDaysField(operations),
];

// -------------------------------------------------------- document template

/**
 * Scoped through the shared lookup context: the explicit Department above, or
 * the selected Deal's department, or — with neither — every department's
 * templates, labelled by department rather than an empty dropdown.
 */
const draftDocumentTemplateField: INodeProperties = {
	displayName: 'Document Template Name or ID',
	name: 'documentTemplateId',
	type: 'options',
	typeOptions: {
		loadOptionsMethod: 'getInvoiceTemplatesScoped',
		loadOptionsDependsOn: ['departmentId', 'dealId.value'],
	},
	default: '',
	description:
		"Layout Teamleader uses for this invoice. Filtered to the department above, or the deal's department. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	displayOptions: scopeShow(scope('draft')),
};

const updateDocumentTemplateField: INodeProperties = {
	displayName: 'Document Template Name or ID',
	name: 'documentTemplateId',
	type: 'options',
	typeOptions: {
		loadOptionsMethod: 'getInvoiceTemplatesScoped',
		loadOptionsDependsOn: ['advancedOptions.lookupDepartmentId'],
	},
	default: '',
	description:
		'Leave empty to keep the current template. Every department is listed unless you set Lookup Department Override. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	displayOptions: scopeShow(scope('update')),
};

// ------------------------------------------------------------------ shared

const invoiceDateField = (operations: string[], description: string): INodeProperties => ({
	displayName: 'Invoice Date',
	name: 'invoiceDate',
	type: 'dateTime',
	default: '',
	description,
	displayOptions: scopeShow(scope(...operations)),
});

const noteField = (operations: string[]): INodeProperties => ({
	displayName: 'Note',
	name: 'note',
	type: 'string',
	typeOptions: { rows: 3 },
	default: '',
	description:
		"Remarks printed on the invoice. Plain text — Teamleader's saved document text templates are not available through its API.",
	displayOptions: scopeShow(scope(...operations)),
});

/** Quotation-level discounts, reused verbatim for invoices. */
const discountsField: INodeProperties = {
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
					description: 'Shown on the invoice, e.g. winter promotion',
				},
			],
		},
	],
};

const currencyAdvancedFields: INodeProperties[] = [
	{
		displayName: 'Currency Name or ID',
		name: 'currency',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getCurrencies' },
		default: 'EUR',
		description:
			'Leave this out to keep the Teamleader default. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Exchange Rate',
		name: 'exchangeRate',
		type: 'number',
		default: 1,
		description: 'Rate for the currency above. Only sent when Currency is set as well.',
	},
];

const expectedPaymentMethodFields: INodeProperties[] = [
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
		description: 'How you expect this invoice to be paid',
	},
	{
		displayName: 'Expected Payment Reference',
		name: 'expectedPaymentReference',
		type: 'string',
		default: '',
		description:
			'Mandate or card reference. Only used for SEPA Direct Debit, Direct Debit and Credit Card.',
	},
];

const projectIdField: INodeProperties = {
	displayName: 'Project ID',
	name: 'projectId',
	type: 'string',
	default: '',
	description:
		'Teamleader project this invoice belongs to. This connector has no project picker, so paste the ID or use an expression.',
};

const purchaseOrderNumberField: INodeProperties = {
	displayName: 'Purchase Order Number',
	name: 'purchaseOrderNumber',
	type: 'string',
	default: '',
	description: "The customer's own order number, printed on the invoice",
};

/** Advanced set for Create Draft / Update Draft — everything those endpoints accept. */
const draftAdvancedFields: INodeProperties[] = [
	...currencyAdvancedFields,
	customFieldsField('getInvoiceCustomFieldDefinitions'),
	discountsField,
	...expectedPaymentMethodFields,
	projectIdField,
	purchaseOrderNumberField,
];

/**
 * `invoices.updateBooked` accepts a much smaller field set: id, invoicee,
 * payment_term, project_id, grouped_lines, invoice_date, note and
 * custom_fields. Currency, discounts, document template, purchase order number
 * and expected payment method are NOT accepted, so V2 does not offer them here
 * — V1 exposed some of them and silently dropped them.
 */
const bookedAdvancedFields: INodeProperties[] = [
	customFieldsField('getInvoiceCustomFieldDefinitions'),
	projectIdField,
];

export const invoiceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{
				name: 'Book',
				value: 'book',
				description: 'Book a draft invoice, giving it its final number',
				action: 'Book an invoice',
			},
			{
				name: 'Create Draft',
				value: 'draft',
				description: 'Draft a new invoice',
				action: 'Create a draft invoice',
			},
			{
				name: 'Credit Fully',
				value: 'credit',
				description: 'Credit an invoice completely, creating a credit note',
				action: 'Credit an invoice fully',
			},
			{
				name: 'Credit Partially',
				value: 'creditPartially',
				description: 'Credit part of an invoice, creating a credit note for the lines you supply',
				action: 'Credit an invoice partially',
			},
			{
				name: 'Download',
				value: 'download',
				description: 'Download an invoice as PDF or UBL',
				action: 'Download an invoice',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a single invoice',
				action: 'Get an invoice',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many invoices',
				action: 'Get many invoices',
			},
			{
				name: 'Register Payment',
				value: 'registerPayment',
				description: 'Register a payment against an invoice',
				action: 'Register a payment',
			},
			{
				name: 'Remove Payments',
				value: 'removePayments',
				description: 'Mark an invoice unpaid and remove every linked payment',
				action: 'Remove payments from an invoice',
			},
			{
				name: 'Send',
				value: 'send',
				description: 'Send an invoice by e-mail',
				action: 'Send an invoice',
			},
			{
				name: 'Update Booked',
				value: 'updateBooked',
				description: 'Update an already booked invoice, where your settings allow it',
				action: 'Update a booked invoice',
			},
			{
				name: 'Update Draft',
				value: 'update',
				description: 'Update a draft invoice',
				action: 'Update a draft invoice',
			},
		],
		default: 'draft',
	},
];

export const invoiceFields: INodeProperties[] = [
	// ------------------------------------------------------------------- Get
	invoiceLocator(['get'], 'The invoice to retrieve'),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: scopeShow(scope('get')),
		options: [
			{
				displayName: 'Include Late Fees',
				name: 'includeLateFees',
				type: 'boolean',
				default: false,
				description:
					'Whether to include the late-fee totals (due incasso inclusive, fixed late fee, interest)',
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
				displayName: 'Customer',
				name: 'customerId',
				type: 'resourceLocator',
				default: { mode: 'companyList', value: '' },
				description: 'Only return invoices for this customer',
				modes: [
					{
						displayName: 'Company',
						name: 'companyList',
						type: 'list',
						placeholder: 'Select a company...',
						typeOptions: { searchListMethod: 'searchCompanies', searchable: true },
					},
					{
						displayName: 'Contact',
						name: 'contactList',
						type: 'list',
						placeholder: 'Select a contact...',
						typeOptions: { searchListMethod: 'searchContacts', searchable: true },
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						placeholder: 'e.g. 4b4d2ff7-c56f-0bcf-b4c9-b9d5e6f0f9f0',
						hint: 'Use the Customer Type field to say whether this ID is a company or a contact',
					},
				],
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
				description: 'Only used when Customer above is set to By ID',
			},
			{
				displayName: 'Deal',
				name: 'dealId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				description: 'Only return invoices created for this deal',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a deal...',
						typeOptions: { searchListMethod: 'searchDeals', searchable: true },
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						placeholder: 'e.g. 4b4d2ff7-c56f-0bcf-b4c9-b9d5e6f0f9f0',
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
			},
			{
				displayName: 'IDs',
				name: 'ids',
				type: 'string',
				default: '',
				description: 'Comma-separated list of invoice IDs',
			},
			{
				displayName: 'Invoice Date From',
				name: 'invoiceDateAfter',
				type: 'dateTime',
				default: '',
				description: 'Only return invoices dated on or after this day',
			},
			{
				displayName: 'Invoice Date Until',
				name: 'invoiceDateBefore',
				type: 'dateTime',
				default: '',
				description: 'Only return invoices dated on or before this day',
			},
			{
				displayName: 'Invoice Number',
				name: 'invoiceNumber',
				type: 'string',
				default: '',
				placeholder: 'e.g. 2026 / 5',
				description: 'Full invoice number, as fiscal year / number',
			},
			{
				displayName: 'Payment Reference',
				name: 'paymentReference',
				type: 'string',
				default: '',
				description: 'Structured payment reference printed on the invoice',
			},
			{
				displayName: 'Project ID',
				name: 'projectId',
				type: 'string',
				default: '',
				description: 'Only return invoices for this Teamleader project',
			},
			{
				displayName: 'Purchase Order Number',
				name: 'purchaseOrderNumber',
				type: 'string',
				default: '',
				description: "Only return invoices with this customer order number",
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
				description: 'Only return invoices in these states',
			},
			{
				displayName: 'Subscription ID',
				name: 'subscriptionId',
				type: 'string',
				default: '',
				description: 'Only return invoices generated by this subscription',
			},
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description: 'Only return invoices changed after this moment',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: scopeShow(scope('getAll')),
		options: [
			{
				displayName: 'Include Late Fees',
				name: 'includeLateFees',
				type: 'boolean',
				default: false,
				description: 'Whether to include the late-fee totals in every invoice',
			},
			sortField([
				{ name: 'Invoice Date', value: 'invoice_date' },
				{ name: 'Invoice Number', value: 'invoice_number' },
			]),
		],
	},

	// ---------------------------------------------------------- Create Draft
	customerSourceField,
	draftDealField,
	...manualCustomerFields,
	draftDepartmentField,
	forAttentionOfSourceField(['draft'], true),
	{
		...forAttentionOfSourceField(['draft'], false),
		displayOptions: scopeShow(scope('draft'), { customerSource: ['manual'] }),
	},
	forAttentionOfContactField(['draft']),
	forAttentionOfNameField(['draft']),
	...paymentTermFields(['draft'], false),
	draftDocumentTemplateField,
	...lineEditorFields(scope('draft'), INVOICE_LINE_CONFIG),
	invoiceDateField(['draft'], "Date printed on the invoice. Leave empty to use Teamleader's own default."),
	noteField(['draft']),
	advancedOptions(scope('draft'), draftAdvancedFields),

	// ---------------------------------------------------------- Update Draft
	invoiceLocator(['update'], 'The draft invoice to update. Booked invoices need Update Booked.'),
	{
		displayName: 'Replace Lines',
		name: 'replaceLines',
		type: 'boolean',
		default: false,
		description:
			'Whether to replace ALL lines of this invoice with the lines below. Teamleader removes every line you do not send, so turn this on only when you supply the complete replacement line set. Leave it off to change other fields and keep the current lines untouched.',
		displayOptions: scopeShow(scope('update', 'updateBooked')),
	},
	...lineEditorFields(scope('update', 'updateBooked'), INVOICE_LINE_CONFIG, {
		replaceLines: [true],
	}),
	{
		displayName: 'Change Invoicee',
		name: 'changeInvoicee',
		type: 'boolean',
		default: false,
		description:
			'Whether to change who the invoice is addressed to. Teamleader replaces the whole invoicee block, so the customer must be supplied together with any attention line.',
		displayOptions: scopeShow(scope('update', 'updateBooked')),
	},
	{
		...customerLocator(scope('update', 'updateBooked'), { displayName: 'Customer' }),
		description: 'The company or contact this invoice is for',
		displayOptions: scopeShow(scope('update', 'updateBooked'), { changeInvoicee: [true] }),
	},
	{
		...customerTypeField(scope('update', 'updateBooked'), 'customer'),
		displayOptions: {
			show: {
				resource: [RESOURCE],
				operation: ['update', 'updateBooked'],
				changeInvoicee: [true],
				'customer.mode': ['id'],
			},
		},
	},
	{
		...forAttentionOfSourceField(['update', 'updateBooked'], false),
		displayOptions: scopeShow(scope('update', 'updateBooked'), { changeInvoicee: [true] }),
	},
	{
		...forAttentionOfContactField(['update', 'updateBooked']),
		displayOptions: scopeShow(scope('update', 'updateBooked'), {
			changeInvoicee: [true],
			forAttentionOfSource: ['contact'],
		}),
	},
	{
		...forAttentionOfNameField(['update', 'updateBooked']),
		displayOptions: scopeShow(scope('update', 'updateBooked'), {
			changeInvoicee: [true],
			forAttentionOfSource: ['name'],
		}),
	},
	...paymentTermFields(['update', 'updateBooked'], true),
	updateDocumentTemplateField,
	invoiceDateField(['update', 'updateBooked'], 'Leave empty to keep the current invoice date'),
	{
		...noteField(['update', 'updateBooked']),
		description: 'Leave empty to keep the current note',
	},
	advancedOptions(scope('update'), [
		...draftAdvancedFields,
		{
			displayName: 'Lookup Department Override Name or ID',
			name: 'lookupDepartmentId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getDepartments' },
			default: '',
			description:
				'Editor context only — never sent to Teamleader. Use it to filter the template, tax rate and product category lists. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
	]),

	// --------------------------------------------------------- Update Booked
	invoiceLocator(['updateBooked'], 'The booked invoice to update'),
	{
		displayName:
			'Teamleader only accepts this when editing booked invoices is enabled in your settings. Currency, discounts, document template, purchase order number and expected payment method cannot be changed on a booked invoice.',
		name: 'updateBookedNotice',
		type: 'notice',
		default: '',
		displayOptions: scopeShow(scope('updateBooked')),
	},
	advancedOptions(scope('updateBooked'), bookedAdvancedFields),

	// ------------------------------------------------------------------ Send
	invoiceLocator(['send'], 'The invoice to send'),
	{
		displayName: 'Recipient Source',
		name: 'recipientSource',
		type: 'options',
		options: [
			{
				name: 'Teamleader Default',
				value: 'default',
				description:
					'Send no recipient list at all, so Teamleader uses the invoice its own default addresses',
			},
			{
				name: 'Invoice Customer',
				value: 'invoiceCustomer',
				description: "Send to the invoicee's own e-mail address",
			},
			{
				name: 'Custom Recipients',
				value: 'custom',
				description: 'Type the addresses yourself',
			},
		],
		default: 'default',
		description:
			'Where the "To" addresses come from. If the chosen source has no e-mail address the run fails — the connector never quietly sends to somebody else.',
		displayOptions: scopeShow(scope('send')),
	},
	recipientCollectionField({
		displayName: 'To',
		name: 'to',
		description: 'Addresses this invoice is sent to',
		scope: scope('send'),
		extraShow: { recipientSource: ['custom'] },
	}),
	{
		displayName: 'Message Source',
		name: 'messageSource',
		type: 'options',
		options: [
			{ name: 'Manual Message', value: 'manual', description: 'Write the subject and message here' },
			{
				name: 'Teamleader Mail Template',
				value: 'template',
				description:
					'Use one of your Teamleader invoice mail templates. invoices.send takes the template ID natively.',
			},
		],
		default: 'manual',
		description: 'Where the e-mail subject and body come from',
		displayOptions: scopeShow(scope('send')),
	},
	{
		displayName: 'Mail Template Name or ID',
		name: 'mailTemplateId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getInvoiceMailTemplates' },
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: scopeShow(scope('send'), { messageSource: ['template'] }),
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		required: true,
		description: 'Subject line of the e-mail',
		displayOptions: scopeShow(scope('send'), { messageSource: ['manual'] }),
	},
	{
		displayName: 'Message',
		name: 'body',
		type: 'string',
		typeOptions: { rows: 6 },
		default: '',
		required: true,
		description: 'Body of the e-mail sent with the invoice',
		displayOptions: scopeShow(scope('send'), { messageSource: ['manual'] }),
	},
	...ccBccFields(scope('send')),
	advancedOptions(scope('send'), [attachmentsField()]),

	// ------------------------------------------------------- Register Payment
	invoiceLocator(['registerPayment'], 'The invoice the payment belongs to'),
	{
		displayName: 'Amount Source',
		name: 'amountSource',
		type: 'options',
		options: [
			{
				name: 'Outstanding Amount',
				value: 'outstanding',
				description: 'Pay off exactly what Teamleader still reports as due on this invoice',
			},
			{
				name: 'Manual Amount',
				value: 'manual',
				description: 'Register a specific amount, e.g. a partial payment',
			},
		],
		default: 'outstanding',
		description: 'How much was paid',
		displayOptions: scopeShow(scope('registerPayment')),
	},
	{
		displayName: 'Amount',
		name: 'amount',
		type: 'number',
		typeOptions: { numberPrecision: 2 },
		default: 0,
		required: true,
		description: 'Amount that was paid. Must be greater than 0.',
		displayOptions: scopeShow(scope('registerPayment'), { amountSource: ['manual'] }),
	},
	{
		displayName: 'Currency Name or ID',
		name: 'currency',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getCurrencies' },
		default: 'EUR',
		description:
			'Must match the currency of the invoice — the connector never converts. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: scopeShow(scope('registerPayment'), { amountSource: ['manual'] }),
	},
	{
		displayName: 'Paid At',
		name: 'paidAt',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'Moment the payment was received. Teamleader requires this and it is never defaulted.',
		displayOptions: scopeShow(scope('registerPayment')),
	},
	{
		displayName: 'Payment Method Name or ID',
		name: 'paymentMethodId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getPaymentMethods' },
		default: '',
		description:
			'Optional. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: scopeShow(scope('registerPayment')),
	},

	// -------------------------------------------------------- Remove Payments
	invoiceLocator(['removePayments'], 'The invoice to mark as unpaid'),
	destructiveNotice(scope('removePayments'), {
		name: 'removePaymentsNotice',
		text: 'Removes every payment linked to this invoice and marks it unpaid. Teamleader re-renders the invoice PDF. This cannot be undone from n8n.',
	}),

	// ----------------------------------------------------------- Credit Fully
	invoiceLocator(['credit'], 'The invoice to credit completely'),
	{
		displayName: 'Credit Note Date',
		name: 'creditNoteDate',
		type: 'dateTime',
		default: '',
		description: "Date on the credit note. Leave empty to use Teamleader's own default.",
		displayOptions: scopeShow(scope('credit', 'creditPartially')),
	},
	destructiveNotice(scope('credit'), {
		name: 'creditNotice',
		text: 'Creates a credit note for the full amount of this invoice. Credit notes are permanent bookkeeping documents.',
	}),

	// ------------------------------------------------------- Credit Partially
	invoiceLocator(['creditPartially'], 'The invoice to credit part of'),
	{
		displayName:
			'Teamleader returns invoice lines without a stable line ID, so lines cannot be picked from the invoice safely — a reordered invoice would credit the wrong line. Enter the lines to credit below; they are sent exactly as written.',
		name: 'creditPartiallyNotice',
		type: 'notice',
		default: '',
		displayOptions: scopeShow(scope('creditPartially')),
	},
	...lineEditorFields(scope('creditPartially'), INVOICE_LINE_CONFIG),
	advancedOptions(scope('creditPartially'), [discountsField]),

	// ------------------------------------------------------------------ Book
	invoiceLocator(['book'], 'The draft invoice to book'),
	{
		displayName: 'Book Date',
		name: 'bookDate',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'Date the invoice is booked on. Teamleader requires this.',
		displayOptions: scopeShow(scope('book')),
	},
	destructiveNotice(scope('book'), {
		name: 'bookNotice',
		text: 'Booking gives the invoice its final number and locks it. Only the last booked invoice can be deleted afterwards.',
	}),

	// -------------------------------------------------------------- Download
	invoiceLocator(['download'], 'The invoice to download'),
	{
		displayName: 'Format',
		name: 'format',
		type: 'options',
		options: [
			{ name: 'PDF', value: 'pdf' },
			{ name: 'UBL (E-FFF)', value: 'ubl/e-fff' },
			{ name: 'UBL (Peppol BIS 3)', value: 'ubl/peppol_bis_3' },
		],
		default: 'pdf',
		description: 'File format Teamleader renders the invoice in',
		displayOptions: scopeShow(scope('download')),
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		hint: 'The name of the output binary field to put the file in',
		displayOptions: scopeShow(scope('download')),
	},
];

/** Operations whose payload the shared invoice write builder serves. */
export const INVOICE_WRITE_OPERATIONS = WRITE_OPERATIONS;
