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

const RESOURCE = 'contact';

export const contactOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{ name: 'Create', value: 'create', description: 'Add a new contact', action: 'Create a contact' },
			{ name: 'Delete', value: 'delete', description: 'Delete a contact', action: 'Delete a contact' },
			{ name: 'Get', value: 'get', description: 'Get a single contact', action: 'Get a contact' },
			{ name: 'Get Many', value: 'getAll', description: 'List or search contacts', action: 'Get many contacts' },
			{ name: 'Link to Company', value: 'linkToCompany', description: 'Link a contact to a company', action: 'Link a contact to a company' },
			{ name: 'Tag', value: 'tag', description: 'Add tags to a contact', action: 'Tag a contact' },
			{ name: 'Unlink From Company', value: 'unlinkFromCompany', description: 'Unlink a contact from a company', action: 'Unlink a contact from a company' },
			{ name: 'Untag', value: 'untag', description: 'Remove tags from a contact', action: 'Untag a contact' },
			{ name: 'Update', value: 'update', description: 'Update a contact', action: 'Update a contact' },
		],
		default: 'getAll',
	},
];

const contactLocator: INodeProperties = {
	displayName: 'Contact',
	name: 'contactId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	displayOptions: {
		show: {
			resource: [RESOURCE],
			operation: ['get', 'update', 'delete', 'tag', 'untag', 'linkToCompany', 'unlinkFromCompany'],
		},
	},
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchContacts', searchable: true },
		},
		{ displayName: 'By ID', name: 'id', type: 'string', placeholder: 'e.g. 2a39e420-3ba3-4384-8024-fa702ef99c9f' },
	],
};

export const contactFields: INodeProperties[] = [
	contactLocator,

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
				displayName: 'Company',
				name: 'companyId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				description: 'Only return contacts linked to this company',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'searchCompanies', searchable: true },
					},
					{ displayName: 'By ID', name: 'id', type: 'string' },
				],
			},
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
				description: 'Comma-separated list of contact IDs',
			},
			{
				displayName: 'Search Term',
				name: 'term',
				type: 'string',
				default: '',
				description: 'Filters on first name, last name, email and telephone',
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
				description: 'Comma-separated tags. Only contacts carrying all given tags are returned.',
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
		displayName: 'Last Name',
		name: 'lastName',
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
			{ displayName: 'Birthdate', name: 'birthdate', type: 'dateTime', default: '' },
			customFieldsField(),
			emailsField(['primary']),
			{ displayName: 'First Name', name: 'first_name', type: 'string', default: '' },
			{
				displayName: 'Gender',
				name: 'gender',
				type: 'options',
				options: [
					{ name: 'Female', value: 'female' },
					{ name: 'Male', value: 'male' },
					{ name: 'Non Binary', value: 'non_binary' },
					{ name: 'Prefers Not to Say', value: 'prefers_not_to_say' },
					{ name: 'Unknown', value: 'unknown' },
				],
				default: 'unknown',
			},
			{ displayName: 'IBAN', name: 'iban', type: 'string', default: '' },
			{
				displayName: 'Language',
				name: 'language',
				type: 'string',
				default: '',
				description: 'Language code, e.g. nl or en',
			},
			{ displayName: 'Last Name', name: 'last_name', type: 'string', default: '', displayOptions: { show: { '/operation': ['update'] } } },
			{
				displayName: 'Marketing Mails Consent',
				name: 'marketing_mails_consent',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'National Identification Number',
				name: 'national_identification_number',
				type: 'string',
				default: '',
			},
			{ displayName: 'Remarks', name: 'remarks', type: 'string', typeOptions: { rows: 3 }, default: '', description: 'Uses Markdown formatting' },
			{ displayName: 'Salutation', name: 'salutation', type: 'string', default: '' },
			tagsField(),
			telephonesField(),
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

	// ---------------- link/unlink company ----------------
	{
		displayName: 'Company',
		name: 'companyId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: {
			show: { resource: [RESOURCE], operation: ['linkToCompany', 'unlinkFromCompany'] },
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchCompanies', searchable: true },
			},
			{ displayName: 'By ID', name: 'id', type: 'string' },
		],
	},
	{
		displayName: 'Position',
		name: 'position',
		type: 'string',
		default: '',
		description: "The contact's function within the company",
		displayOptions: { show: { resource: [RESOURCE], operation: ['linkToCompany'] } },
	},
	{
		displayName: 'Decision Maker',
		name: 'decisionMaker',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: [RESOURCE], operation: ['linkToCompany'] } },
	},
];
