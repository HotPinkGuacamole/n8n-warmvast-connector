import type { INodeProperties } from 'n8n-workflow';

import {
	addressesField,
	customFieldsField,
	emailsField,
	paginationFields,
	sortField,
	tagsField,
	telephonesField,
} from './SharedFields';

const RESOURCE = 'company';

export const companyOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{ name: 'Create', value: 'create', description: 'Add a new company', action: 'Create a company' },
			{ name: 'Delete', value: 'delete', description: 'Delete a company', action: 'Delete a company' },
			{ name: 'Get', value: 'get', description: 'Get a single company', action: 'Get a company' },
			{ name: 'Get Many', value: 'getAll', description: 'List or search companies', action: 'Get many companies' },
			{ name: 'Tag', value: 'tag', description: 'Add tags to a company', action: 'Tag a company' },
			{ name: 'Untag', value: 'untag', description: 'Remove tags from a company', action: 'Untag a company' },
			{ name: 'Update', value: 'update', description: 'Update a company', action: 'Update a company' },
		],
		default: 'getAll',
	},
];

const companyLocator: INodeProperties = {
	displayName: 'Company',
	name: 'companyId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	displayOptions: {
		show: { resource: [RESOURCE], operation: ['get', 'update', 'delete', 'tag', 'untag'] },
	},
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchCompanies', searchable: true },
		},
		{ displayName: 'By ID', name: 'id', type: 'string', placeholder: 'e.g. 96a38bbf-24ed-4083-8a5c-20db92aa471e' },
	],
};

export const companyFields: INodeProperties[] = [
	companyLocator,

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
				displayName: 'Include Custom Fields',
				name: 'includeCustomFields',
				type: 'boolean',
				default: false,
				description: 'Whether to include custom field values in the response',
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
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Filters on the primary email address',
			},
			{
				displayName: 'IDs',
				name: 'ids',
				type: 'string',
				default: '',
				description: 'Comma-separated list of company IDs',
			},
			{
				displayName: 'Search Term',
				name: 'term',
				type: 'string',
				default: '',
				description: 'Filters on name, VAT number, emails and telephones',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Active', value: 'active' },
					{ name: 'Deactivated', value: 'deactivated' },
				],
				default: 'active',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				description: 'Comma-separated tag names',
			},
			{ displayName: 'Updated Since', name: 'updatedSince', type: 'dateTime', default: '' },
			{ displayName: 'VAT Number', name: 'vatNumber', type: 'string', default: '' },
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
			sortField(['name', 'added_at', 'updated_at']),
			{
				displayName: 'Include Custom Fields',
				name: 'includeCustomFields',
				type: 'boolean',
				default: false,
				description: 'Whether to include custom field values in the response',
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
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['create', 'update'] } },
		options: [
			addressesField(),
			{ displayName: 'BIC', name: 'bic', type: 'string', default: '' },
			{
				displayName: 'Business Type Country',
				name: 'businessTypeCountry',
				type: 'string',
				default: 'BE',
				description: 'Two-letter country code used to look up business types',
			},
			{
				displayName: 'Business Type Name or ID',
				name: 'business_type_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getBusinessTypes', loadOptionsDependsOn: ['businessTypeCountry'] },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			customFieldsField(),
			emailsField(['primary', 'invoicing']),
			{ displayName: 'IBAN', name: 'iban', type: 'string', default: '' },
			{
				displayName: 'Language',
				name: 'language',
				type: 'string',
				default: '',
				description: 'Language code, e.g. nl or en',
			},
			{
				displayName: 'Marketing Mails Consent',
				name: 'marketing_mails_consent',
				type: 'boolean',
				default: false,
			},
			{ displayName: 'Name', name: 'name', type: 'string', default: '', displayOptions: { show: { '/operation': ['update'] } } },
			{
				displayName: 'National Identification Number',
				name: 'national_identification_number',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Preferred Currency Name or ID',
				name: 'preferred_currency',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getCurrencies' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{ displayName: 'Remarks', name: 'remarks', type: 'string', typeOptions: { rows: 3 }, default: '', description: 'Uses Markdown formatting' },
			{
				displayName: 'Responsible User Name or ID',
				name: 'responsible_user_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getUsers' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			tagsField(),
			telephonesField(['phone', 'mobile', 'fax']),
			{ displayName: 'VAT Number', name: 'vat_number', type: 'string', default: '' },
			{ displayName: 'Website', name: 'website', type: 'string', default: '' },
		],
	},

	// ---------------- tag / untag ----------------
	{
		displayName: 'Tags',
		name: 'tags',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated list of tag names',
		displayOptions: { show: { resource: [RESOURCE], operation: ['tag', 'untag'] } },
	},
];
