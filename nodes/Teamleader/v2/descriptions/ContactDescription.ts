import type { INodeProperties } from 'n8n-workflow';

import {
	advancedOptions,
	destructiveNotice,
	resourceLocatorField,
	tagFields,
} from './V2Common';
import {
	CONTACT_PHONE_TYPES,
	additionalAddressesField,
	additionalEmailsField,
	additionalPhonesField,
	customFieldsField,
	includeCustomFieldsField,
	languageField,
	paginationFields,
	phoneFields,
	primaryEmailField,
	scopeShow,
	sortField,
	statusFilterField,
	tagFilterField,
} from './V2SharedFields';

const RESOURCE = 'contact';

const scope = (...operations: string[]) => ({ resource: RESOURCE, operations });

const contactLocator = (operations: string[], description: string): INodeProperties =>
	resourceLocatorField({
		displayName: 'Contact',
		name: 'contactId',
		searchListMethod: 'searchContacts',
		scope: scope(...operations),
		description,
		placeholder: 'Select a contact...',
	});

const companyLocator = (
	operations: string[],
	options: { required: boolean; description: string },
): INodeProperties =>
	resourceLocatorField({
		displayName: 'Company',
		name: 'companyId',
		searchListMethod: 'searchCompanies',
		scope: scope(...operations),
		description: options.description,
		placeholder: 'Select a company...',
		required: options.required,
	});

export const contactOperations: INodeProperties[] = [
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
				description: 'Create a contact',
				action: 'Create a contact',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Permanently delete a contact',
				action: 'Delete a contact',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a single contact',
				action: 'Get a contact',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many contacts',
				action: 'Get many contacts',
			},
			{
				name: 'Link to Company',
				value: 'linkToCompany',
				description: 'Link a contact to a company',
				action: 'Link a contact to a company',
			},
			{
				name: 'Tag',
				value: 'tag',
				description: 'Add tags to a contact',
				action: 'Tag a contact',
			},
			{
				name: 'Unlink From Company',
				value: 'unlinkFromCompany',
				description: 'Remove the link between a contact and a company',
				action: 'Unlink a contact from a company',
			},
			{
				name: 'Untag',
				value: 'untag',
				description: 'Remove tags from a contact',
				action: 'Untag a contact',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a contact',
				action: 'Update a contact',
			},
		],
		default: 'create',
	},
];

const createAdvanced: INodeProperties[] = [
	additionalEmailsField(),
	additionalPhonesField(CONTACT_PHONE_TYPES),
	additionalAddressesField(),
	customFieldsField('getContactCustomFieldDefinitions'),
	languageField(),
	{
		displayName: 'Salutation',
		name: 'salutation',
		type: 'string',
		default: '',
		placeholder: 'e.g. Mr',
	},
	{
		displayName: 'Gender',
		name: 'gender',
		type: 'options',
		options: [
			{ name: 'Female', value: 'female' },
			{ name: 'Male', value: 'male' },
			{ name: 'Non-Binary', value: 'non_binary' },
			{ name: 'Prefers Not to Say', value: 'prefers_not_to_say' },
			{ name: 'Unknown', value: 'unknown' },
		],
		default: 'unknown',
	},
	{
		displayName: 'Birthdate',
		name: 'birthdate',
		type: 'dateTime',
		default: '',
		description: 'Only the date part is sent to Teamleader',
	},
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
		displayName: 'Remarks',
		name: 'remarks',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description: 'Free notes on this contact. Supports Markdown.',
	},
	{
		displayName: 'Marketing Mails Consent',
		name: 'marketingMailsConsent',
		type: 'boolean',
		default: false,
		description: 'Whether this contact agreed to receive marketing e-mails',
	},
];

export const contactFields: INodeProperties[] = [
	// ---------------------------------------------------------------- Create
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		default: '',
		description: 'Given name of the contact',
		displayOptions: scopeShow(scope('create')),
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
		type: 'string',
		required: true,
		default: '',
		description: 'Family name. Teamleader requires this.',
		displayOptions: scopeShow(scope('create')),
	},
	primaryEmailField(scope('create')),
	...phoneFields(scope('create'), CONTACT_PHONE_TYPES),
	companyLocator(['create'], {
		required: false,
		description:
			'Optional. When set, the contact is created first and then linked to this company.',
	}),
	{
		displayName: 'Position',
		name: 'position',
		type: 'string',
		default: '',
		placeholder: 'e.g. Purchasing Manager',
		description: 'Job title this contact holds at the selected company',
		displayOptions: scopeShow(scope('create'), { 'companyId.value': [{ _cnd: { not: '' } }] }),
	},
	{
		displayName: 'Decision Maker',
		name: 'decisionMaker',
		type: 'boolean',
		default: false,
		description: 'Whether this contact decides on purchases at the selected company',
		displayOptions: scopeShow(scope('create'), { 'companyId.value': [{ _cnd: { not: '' } }] }),
	},
	...tagFields(scope('create')),
	advancedOptions(scope('create'), createAdvanced),

	// ---------------------------------------------------------------- Update
	contactLocator(['update'], 'The contact to update'),
	{
		displayName: 'Leave a field empty to keep its current value in Teamleader',
		name: 'updateNotice',
		type: 'notice',
		default: '',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		default: '',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
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
		description: 'Replaces the stored e-mail addresses of this contact',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Phone',
		name: 'phone',
		type: 'string',
		default: '',
		description: 'Replaces the stored phone numbers of this contact',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Phone Type',
		name: 'phoneType',
		type: 'options',
		options: CONTACT_PHONE_TYPES,
		default: 'phone',
		description: 'What kind of number the phone number above is',
		displayOptions: scopeShow(scope('update'), { phone: [{ _cnd: { not: '' } }] }),
	},
	{
		displayName: 'Replace Tags',
		name: 'replaceTags',
		type: 'boolean',
		default: false,
		description:
			'Whether to overwrite all tags on this contact with the tags below. Leave off and use the Tag / Untag operations to add or remove individual tags.',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Tag Names or IDs',
		name: 'tags',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getTags' },
		default: [],
		description:
			'The complete set of tags this contact should end up with. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
	advancedOptions(scope('update'), createAdvanced),

	// ------------------------------------------------------------------- Get
	contactLocator(['get'], 'The contact to retrieve'),
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
						placeholder: 'Select a company...',
						typeOptions: { searchListMethod: 'searchCompanies', searchable: true },
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
				displayName: 'Contact IDs',
				name: 'ids',
				type: 'string',
				default: '',
				placeholder: 'e.g. 4b4d2ff7-..., 8c1a09f2-...',
				description: 'Comma-separated Teamleader contact IDs',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@company.com',
				default: '',
				description: 'Only return the contact whose primary e-mail address matches exactly',
			},
			{
				displayName: 'Search Term',
				name: 'term',
				type: 'string',
				default: '',
				description: 'Matches on first name, last name, e-mail and phone number',
			},
			statusFilterField('contacts'),
			tagFilterField(),
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description: 'Only return contacts changed after this moment',
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
	contactLocator(['delete'], 'The contact to delete'),
	destructiveNotice(scope('delete'), {
		name: 'deleteNotice',
		text: 'Permanently deletes this contact in Teamleader. This cannot be undone from n8n.',
	}),

	// ----------------------------------------------------------- Tag / Untag
	contactLocator(['tag', 'untag'], 'The contact to change tags on'),
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

	// -------------------------------------------------------- Link to Company
	contactLocator(['linkToCompany'], 'The contact to link'),
	companyLocator(['linkToCompany'], {
		required: true,
		description: 'The company to link the contact to',
	}),
	{
		displayName: 'Position',
		name: 'position',
		type: 'string',
		default: '',
		placeholder: 'e.g. Purchasing Manager',
		description: 'Job title this contact holds at the company. Leave empty to send no position.',
		displayOptions: scopeShow(scope('linkToCompany')),
	},
	{
		displayName: 'Mark as Decision Maker',
		name: 'markAsDecisionMaker',
		type: 'boolean',
		default: false,
		description:
			'Whether to tell Teamleader this contact is a decision maker at the company. Leave off to send no decision-maker value at all.',
		displayOptions: scopeShow(scope('linkToCompany')),
	},
	{
		displayName: 'Decision Maker',
		name: 'decisionMaker',
		type: 'boolean',
		default: true,
		description: 'Whether this contact decides on purchases at the company',
		displayOptions: scopeShow(scope('linkToCompany'), { markAsDecisionMaker: [true] }),
	},

	// ---------------------------------------------------- Unlink From Company
	contactLocator(['unlinkFromCompany'], 'The contact to unlink'),
	companyLocator(['unlinkFromCompany'], {
		required: true,
		description: 'The company to unlink the contact from',
	}),
	destructiveNotice(scope('unlinkFromCompany'), {
		name: 'unlinkNotice',
		text: 'Removes the link between the contact and company. Neither record is deleted.',
	}),
];
