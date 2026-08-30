import type { INodeProperties } from 'n8n-workflow';

import { QUOTATION_LINE_CONFIG, lineEditorFields } from './LineEditor';
import { attachmentsField, ccBccFields, recipientCollectionField } from './SendFields';
import { advancedOptions, destructiveNotice, resourceLocatorField } from './V2Common';
import { LANGUAGE_OPTIONS, paginationFields, scopeShow } from './V2SharedFields';

const RESOURCE = 'quotation';

const scope = (...operations: string[]) => ({ resource: RESOURCE, operations });

/**
 * `quotations.list` offers no term filter, so the picker can only match inside
 * the page it already loaded. The hint says so rather than pretending the
 * search covers the whole history — By ID stays the way to reach an old one.
 */
const quotationLocator = (operations: string[], description: string): INodeProperties =>
	resourceLocatorField({
		displayName: 'Quotation',
		name: 'quotationId',
		searchListMethod: 'searchQuotations',
		scope: scope(...operations),
		description,
		placeholder: 'Select a quotation...',
		listHint: 'Recent quotations; use By ID for older ones',
	});

/**
 * Document Template is scoped through `getQuotationTemplatesScoped`, which
 * derives the department from the selected Deal (Create) or from the Advanced
 * `Lookup Department Override` — see `helpers/lookupContext.ts`. With neither,
 * every active department's templates are listed with the department in the
 * label instead of the dropdown going empty.
 *
 * The descriptions below are plain string literals on purpose:
 * `eslint-plugin-n8n-nodes-base` only recognises the dynamic-options wording
 * when it sits directly on the field object.
 */
const createDocumentTemplateField: INodeProperties = {
	displayName: 'Document Template Name or ID',
	name: 'documentTemplateId',
	type: 'options',
	typeOptions: {
		loadOptionsMethod: 'getQuotationTemplatesScoped',
		loadOptionsDependsOn: ['dealId.value', 'advancedOptions.lookupDepartmentId'],
	},
	default: '',
	description:
		"Layout Teamleader uses for this quotation. Filtered to the deal's department when it can be read. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
	displayOptions: scopeShow(scope('create')),
};

const updateDocumentTemplateField: INodeProperties = {
	displayName: 'Document Template Name or ID',
	name: 'documentTemplateId',
	type: 'options',
	typeOptions: {
		loadOptionsMethod: 'getQuotationTemplatesScoped',
		loadOptionsDependsOn: ['advancedOptions.lookupDepartmentId'],
	},
	default: '',
	description:
		'Leave empty to keep the current template. Every department is listed unless you set Lookup Department Override. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	displayOptions: scopeShow(scope('update')),
};

const introductionTextField = (operations: string[], description: string): INodeProperties => ({
	displayName: 'Introduction Text',
	name: 'text',
	type: 'string',
	typeOptions: { rows: 5 },
	default: '',
	description,
	displayOptions: scopeShow(scope(...operations)),
});

const expiresAfterField = (operations: string[]): INodeProperties => ({
	displayName: 'Expires After',
	name: 'expiresAfter',
	type: 'dateTime',
	default: '',
	description:
		'Date the quotation stops being valid. Only available when quotation expiry is enabled in your Teamleader plan.',
	displayOptions: scopeShow(scope(...operations)),
});

/**
 * Only meaningful together with a date, and Teamleader is only told about it
 * then: hiding the field while Expires After is empty keeps its default from
 * ever becoming an unintended mutation.
 */
const actionAfterExpiryField = (operations: string[]): INodeProperties => ({
	displayName: 'Action After Expiry',
	name: 'actionAfterExpiry',
	type: 'options',
	options: [
		{ name: 'None', value: 'none' },
		{ name: 'Lock', value: 'lock' },
	],
	default: 'none',
	description: 'What Teamleader does with the quotation once it has expired',
	displayOptions: {
		show: { resource: [RESOURCE], operation: operations },
		hide: { expiresAfter: [''] },
	},
});

/** Quotation-level commercial discounts, as percentages of the whole document. */
const discountsField: INodeProperties = {
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
					description: 'Shown on the quotation, e.g. winter promotion',
				},
			],
		},
	],
};

/**
 * Rare/API-shaped quotation fields. Living inside the Advanced Options
 * collection is what makes "untouched" distinguishable from "set to a
 * default": nothing here is sent unless the user added the field.
 *
 * `Lookup Department Override` is editor context only. It never reaches
 * Teamleader — `quotations.create` and `quotations.update` have no department
 * field, and the real department comes from the deal.
 */
const quotationAdvancedFields: INodeProperties[] = [
	{
		displayName: 'Currency Name or ID',
		name: 'currency',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getCurrencies' },
		default: 'EUR',
		description:
			'Leave this out to keep the Teamleader default. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	discountsField,
	{
		displayName: 'Exchange Rate',
		name: 'exchangeRate',
		type: 'number',
		default: 1,
		description: 'Rate for the currency above. Only sent when Currency is set as well.',
	},
	{
		displayName: 'Lookup Department Override Name or ID',
		name: 'lookupDepartmentId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDepartments' },
		default: '',
		description:
			'Editor context only — never sent to Teamleader, which takes the real department from the deal. Use it to filter the template, tax rate and product category lists when the deal is an expression. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
];

export const quotationOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{
				name: 'Accept',
				value: 'accept',
				description: 'Mark a quotation as accepted',
				action: 'Accept a quotation',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Create a quotation on a deal',
				action: 'Create a quotation',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a quotation',
				action: 'Delete a quotation',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a single quotation',
				action: 'Get a quotation',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many quotations',
				action: 'Get many quotations',
			},
			{
				name: 'Send',
				value: 'send',
				description: 'Send a quotation by e-mail',
				action: 'Send a quotation',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a quotation',
				action: 'Update a quotation',
			},
		],
		default: 'create',
	},
];

export const quotationFields: INodeProperties[] = [
	// ------------------------------------------------------------------- Get
	quotationLocator(['get'], 'The quotation to retrieve'),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: scopeShow(scope('get')),
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

	// -------------------------------------------------------------- Get Many
	...paginationFields(scope('getAll')),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: scopeShow(scope('getAll')),
		// `quotations.list` documents no other filter for this connector's API
		// version — a Deal or Search Term filter would be invented, not supported.
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
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: scopeShow(scope('getAll')),
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

	// ---------------------------------------------------------------- Create
	resourceLocatorField({
		displayName: 'Deal',
		name: 'dealId',
		searchListMethod: 'searchDeals',
		scope: scope('create'),
		description:
			'The quotation is created on this deal. Teamleader takes the customer from the deal, so you never select one here.',
		placeholder: 'Select a deal...',
	}),
	createDocumentTemplateField,
	...lineEditorFields(scope('create'), QUOTATION_LINE_CONFIG),
	introductionTextField(
		['create'],
		"Free text shown on the quotation, in Markdown. A quotation needs at least one line or some text. Teamleader's saved introduction-text templates cannot be selected through its API, so paste or build the text here.",
	),
	expiresAfterField(['create']),
	actionAfterExpiryField(['create']),
	advancedOptions(scope('create'), quotationAdvancedFields),

	// ---------------------------------------------------------------- Update
	quotationLocator(['update'], 'The quotation to update'),
	{
		displayName: 'Replace Lines',
		name: 'replaceLines',
		type: 'boolean',
		default: false,
		description:
			'Whether to replace ALL lines of this quotation with the lines below. Teamleader removes every line you do not send, so turn this on only when you supply the complete replacement line set. Leave it off to change other fields and keep the current lines untouched.',
		displayOptions: scopeShow(scope('update')),
	},
	...lineEditorFields(scope('update'), QUOTATION_LINE_CONFIG, { replaceLines: [true] }),
	updateDocumentTemplateField,
	introductionTextField(['update'], 'Leave empty to keep the current text. Markdown is supported.'),
	expiresAfterField(['update']),
	actionAfterExpiryField(['update']),
	advancedOptions(scope('update'), quotationAdvancedFields),

	// ------------------------------------------------------------------ Send
	quotationLocator(['send'], 'The quotation to send'),
	{
		displayName: 'Recipient Source',
		name: 'recipientSource',
		type: 'options',
		options: [
			{
				name: 'Deal Contact Person',
				value: 'dealContactPerson',
				description: "Send to the contact person on the quotation's deal",
			},
			{
				name: 'Deal Customer',
				value: 'dealCustomer',
				description: "Send to the deal's customer company or contact",
			},
			{
				name: 'Custom Recipients',
				value: 'custom',
				description: 'Type the addresses yourself',
			},
		],
		default: 'dealContactPerson',
		description:
			'Where the "To" addresses come from. If the chosen source has no e-mail address the run fails — the connector never quietly sends to somebody else.',
		displayOptions: scopeShow(scope('send')),
	},
	recipientCollectionField({
		displayName: 'To',
		name: 'to',
		description: 'Addresses this quotation is sent to',
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
				description: "Copy the subject and body out of one of your Teamleader quotation mail templates",
			},
		],
		default: 'manual',
		description:
			'Teamleader takes no template ID on quotations.send, so a template is copied into the message at run time. Only #LINK is replaced by Teamleader; other merge fields are sent as-is.',
		displayOptions: scopeShow(scope('send')),
	},
	{
		displayName: 'Mail Template Name or ID',
		name: 'mailTemplateId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getQuotationMailTemplates' },
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
		name: 'content',
		type: 'string',
		typeOptions: { rows: 6 },
		default: '',
		required: true,
		description:
			'Body of the e-mail. Teamleader replaces #LINK with the Cloudsign signing URL; include it so the customer can sign.',
		displayOptions: scopeShow(scope('send'), { messageSource: ['manual'] }),
	},
	{
		displayName: 'Language',
		name: 'language',
		type: 'options',
		options: LANGUAGE_OPTIONS,
		default: 'nl',
		required: true,
		description: 'Language Teamleader sends this quotation in',
		displayOptions: scopeShow(scope('send')),
	},
	advancedOptions(scope('send'), [
		attachmentsField(),
		{
			displayName: 'Additional Quotation IDs',
			name: 'additionalQuotationIds',
			type: 'string',
			default: '',
			description:
				'Comma-separated IDs of further quotations to send in the same e-mail. Teamleader requires them to belong to the same deal.',
		},
		{
			displayName: 'Sender Email Address',
			name: 'senderEmailAddress',
			type: 'string',
			placeholder: 'name@email.com',
			default: '',
			description: 'Address the quotation is sent from. Only used together with Sender ID.',
		},
		{
			displayName: 'Sender ID',
			name: 'senderId',
			type: 'string',
			default: '',
			description: 'ID of the user or department sending it. Only used together with Sender Email Address.',
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
			description: 'Whether the sender ID above is a user or a department',
		},
	]),
	...ccBccFields(scope('send')).map((field) => ({
		...field,
		displayOptions: scopeShow(scope('send')),
	})),

	// ---------------------------------------------------------------- Accept
	quotationLocator(['accept'], 'The quotation to mark as accepted'),
	{
		displayName:
			'Marks the quotation as accepted on behalf of the customer. Teamleader may move the deal according to your settings.',
		name: 'acceptNotice',
		type: 'notice',
		default: '',
		displayOptions: scopeShow(scope('accept')),
	},

	// ---------------------------------------------------------------- Delete
	quotationLocator(['delete'], 'The quotation to delete'),
	destructiveNotice(scope('delete'), {
		name: 'deleteNotice',
		text: 'Permanently deletes this quotation in Teamleader. This cannot be undone from n8n.',
	}),
];
