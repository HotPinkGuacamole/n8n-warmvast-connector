import type { INodeProperties } from 'n8n-workflow';

import { advancedOptions, destructiveNotice, resourceLocatorField, tagFields } from './V2Common';
import {
	COMPANY_PHONE_TYPES,
	COUNTRY_OPTIONS,
	additionalAddressesField,
	additionalEmailsField,
	additionalPhonesField,
	customFieldsField,
	includeCustomFieldsField,
	invoicingAddressField,
	languageField,
	paginationFields,
	phoneFields,
	primaryEmailField,
	scopeShow,
	sortField,
	statusFilterField,
	tagFilterField,
} from './V2SharedFields';

const RESOURCE = 'company';

const scope = (...operations: string[]) => ({ resource: RESOURCE, operations });

const companyLocator = (operations: string[], description: string): INodeProperties =>
	resourceLocatorField({
		displayName: 'Company',
		name: 'companyId',
		searchListMethod: 'searchCompanies',
		scope: scope(...operations),
		description,
		placeholder: 'Select a company...',
	});

export const companyOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a company',
				action: 'Create a company',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Permanently delete a company',
				action: 'Delete a company',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a single company',
				action: 'Get a company',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many companies',
				action: 'Get many companies',
			},
			{
				name: 'Tag',
				value: 'tag',
				description: 'Add tags to a company',
				action: 'Tag a company',
			},
			{
				name: 'Untag',
				value: 'untag',
				description: 'Remove tags from a company',
				action: 'Untag a company',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a company',
				action: 'Update a company',
			},
		],
		default: 'create',
	},
];

const writeAdvanced: INodeProperties[] = [
	additionalAddressesField(),
	additionalEmailsField(),
	additionalPhonesField(COMPANY_PHONE_TYPES),
	customFieldsField('getCompanyCustomFieldDefinitions'),
	languageField(),
	{
		displayName: 'Website',
		name: 'website',
		type: 'string',
		default: '',
		placeholder: 'https://example.com',
	},
	{
		displayName: 'IBAN',
		name: 'iban',
		type: 'string',
		default: '',
	},
	{
		displayName: 'BIC',
		name: 'bic',
		type: 'string',
		default: '',
	},
	{
		displayName: 'National Identification Number',
		name: 'nationalIdentificationNumber',
		type: 'string',
		default: '',
	},
	{
		displayName: 'Preferred Currency Name or ID',
		name: 'preferredCurrency',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getCurrencies' },
		default: 'EUR',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
	{
		displayName: 'Remarks',
		name: 'remarks',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description: 'Free notes on this company. Supports Markdown.',
	},
	{
		displayName: 'Marketing Mails Consent',
		name: 'marketingMailsConsent',
		type: 'boolean',
		default: false,
		description: 'Whether this company agreed to receive marketing e-mails',
	},
];

/**
 * Business type depends on the country. Both fields sit at the top level of the
 * form rather than inside a collection: dynamic option loading has to read the
 * country from the current node parameters, and that lookup is only dependable
 * at this nesting level in the installed n8n version.
 */
const businessTypeFields = (operations: string[]): INodeProperties[] => [
	{
		displayName: 'Business Type Country',
		name: 'businessTypeCountry',
		type: 'options',
		options: COUNTRY_OPTIONS,
		default: 'BE',
		description:
			'Only used to look up the legal structures available in that country. This country itself is not sent to Teamleader.',
		displayOptions: scopeShow(scope(...operations)),
	},
	{
		displayName: 'Business Type Name or ID',
		name: 'businessTypeId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getBusinessTypes',
			loadOptionsDependsOn: ['businessTypeCountry'],
		},
		default: '',
		description:
			'Legal structure of the company, e.g. BV or VZW. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: scopeShow(scope(...operations)),
	},
];

export const companyFields: INodeProperties[] = [
	// ---------------------------------------------------------------- Create
	{
		displayName: 'Company Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		description: 'Registered name of the company. Teamleader requires this.',
		displayOptions: scopeShow(scope('create')),
	},
	{
		displayName: 'VAT Number',
		name: 'vatNumber',
		type: 'string',
		default: '',
		placeholder: 'e.g. BE0899623035',
		displayOptions: scopeShow(scope('create')),
	},
	primaryEmailField(scope('create')),
	{
		displayName: 'Invoicing Email',
		name: 'invoicingEmail',
		type: 'string',
		placeholder: 'invoices@company.com',
		default: '',
		description:
			'Address Teamleader sends invoices to. Leave empty when invoices go to the main address.',
		displayOptions: scopeShow(scope('create')),
	},
	...phoneFields(scope('create'), COMPANY_PHONE_TYPES),
	{
		displayName: 'Responsible User Name or ID',
		name: 'responsibleUserId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getUsers' },
		default: '',
		description:
			'Colleague who owns this customer. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: scopeShow(scope('create')),
	},
	invoicingAddressField(scope('create')),
	...businessTypeFields(['create']),
	...tagFields(scope('create')),
	advancedOptions(scope('create'), writeAdvanced),

	// ---------------------------------------------------------------- Update
	companyLocator(['update'], 'The company to update'),
	{
		displayName: 'Leave a field empty to keep its current value in Teamleader',
		name: 'updateNotice',
		type: 'notice',
		default: '',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Company Name',
		name: 'name',
		type: 'string',
		default: '',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'VAT Number',
		name: 'vatNumber',
		type: 'string',
		default: '',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@company.com',
		default: '',
		description:
			'Replaces the stored e-mail addresses. Fill in Invoicing Email as well if the company has one, otherwise it is removed.',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Invoicing Email',
		name: 'invoicingEmail',
		type: 'string',
		placeholder: 'invoices@company.com',
		default: '',
		description: 'Replaces the stored e-mail addresses together with Email',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Phone',
		name: 'phone',
		type: 'string',
		default: '',
		description: 'Replaces the stored phone numbers of this company',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Phone Type',
		name: 'phoneType',
		type: 'options',
		options: COMPANY_PHONE_TYPES,
		default: 'phone',
		description: 'What kind of number the phone number above is',
		displayOptions: scopeShow(scope('update'), { phone: [{ _cnd: { not: '' } }] }),
	},
	{
		displayName: 'Responsible User Name or ID',
		name: 'responsibleUserId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getUsers' },
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: scopeShow(scope('update')),
	},
	invoicingAddressField(scope('update')),
	...businessTypeFields(['update']),
	{
		displayName: 'Replace Tags',
		name: 'replaceTags',
		type: 'boolean',
		default: false,
		description:
			'Whether to overwrite all tags on this company with the tags below. Leave off and use the Tag / Untag operations to add or remove individual tags.',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Tag Names or IDs',
		name: 'tags',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getTags' },
		default: [],
		description:
			'The complete set of tags this company should end up with. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: scopeShow(scope('update'), { replaceTags: [true] }),
	},
	{
		displayName: 'New Tags',
		name: 'newTags',
		type: 'string',
		default: '',
		placeholder: 'e.g. isolation, 2026-campaign',
		description: 'Comma-separated tags to create and include in the replacement set',
		displayOptions: scopeShow(scope('update'), { replaceTags: [true] }),
	},
	advancedOptions(scope('update'), writeAdvanced),

	// ------------------------------------------------------------------- Get
	companyLocator(['get'], 'The company to retrieve'),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: scopeShow(scope('get')),
		options: [includeCustomFieldsField()],
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
				displayName: 'Company IDs',
				name: 'ids',
				type: 'string',
				default: '',
				placeholder: 'e.g. 4b4d2ff7-..., 8c1a09f2-...',
				description: 'Comma-separated Teamleader company IDs',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@company.com',
				default: '',
				description: 'Only return the company whose primary e-mail address matches exactly',
			},
			{
				displayName: 'Search Term',
				name: 'term',
				type: 'string',
				default: '',
				description: 'Matches on name, VAT number, e-mail addresses and phone numbers',
			},
			statusFilterField('companies'),
			tagFilterField(),
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description: 'Only return companies changed after this moment',
			},
			{
				displayName: 'VAT Number',
				name: 'vatNumber',
				type: 'string',
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
		displayOptions: scopeShow(scope('getAll')),
		options: [
			includeCustomFieldsField(),
			sortField([
				{ name: 'Name', value: 'name' },
				{ name: 'Added At', value: 'added_at' },
				{ name: 'Updated At', value: 'updated_at' },
			]),
		],
	},

	// ---------------------------------------------------------------- Delete
	companyLocator(['delete'], 'The company to delete'),
	destructiveNotice(scope('delete'), {
		name: 'deleteNotice',
		text: 'Permanently deletes this company in Teamleader. This cannot be undone from n8n.',
	}),

	// ----------------------------------------------------------- Tag / Untag
	companyLocator(['tag', 'untag'], 'The company to change tags on'),
	{
		displayName: 'Tag Names or IDs',
		name: 'tags',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getTags' },
		default: [],
		description:
			'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: scopeShow(scope('tag', 'untag')),
	},
	{
		displayName: 'New Tags',
		name: 'newTags',
		type: 'string',
		default: '',
		placeholder: 'e.g. isolation, 2026-campaign',
		description: 'Comma-separated tags to create and apply if they do not exist yet',
		displayOptions: scopeShow(scope('tag')),
	},
];
