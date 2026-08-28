import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import type { IDisplayScope } from './V2Common';

/**
 * Field building blocks shared by the V2 Contact and Company forms.
 * Everything here speaks employee language: no snake_case labels, no raw UUID
 * inputs where a picker exists, and no field hidden behind a nested collection
 * when it is part of the everyday task.
 */

export function scopeShow(scope: IDisplayScope, extra: Record<string, unknown> = {}) {
	return {
		show: {
			resource: [scope.resource],
			operation: scope.operations,
			...extra,
		},
	};
}

/** Languages Teamleader accepts, labelled for humans. */
export const LANGUAGE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Dutch', value: 'nl' },
	{ name: 'English', value: 'en' },
	{ name: 'French', value: 'fr' },
	{ name: 'German', value: 'de' },
	{ name: 'Spanish', value: 'es' },
	{ name: 'Italian', value: 'it' },
	{ name: 'Portuguese', value: 'pt' },
	{ name: 'Polish', value: 'pl' },
	{ name: 'Danish', value: 'da' },
	{ name: 'Swedish', value: 'sv' },
	{ name: 'Norwegian', value: 'no' },
	{ name: 'Finnish', value: 'fi' },
	{ name: 'Czech', value: 'cs' },
	{ name: 'Slovak', value: 'sk' },
	{ name: 'Hungarian', value: 'hu' },
	{ name: 'Romanian', value: 'ro' },
	{ name: 'Bulgarian', value: 'bg' },
	{ name: 'Greek', value: 'gr' },
	{ name: 'Turkish', value: 'tr' },
	{ name: 'Russian', value: 'ru' },
	{ name: 'Ukrainian', value: 'uk' },
	{ name: 'Arabic', value: 'ar' },
	{ name: 'Catalan', value: 'ca' },
	{ name: 'Korean', value: 'ko' },
	{ name: 'Japanese', value: 'jp' },
	{ name: 'Chinese', value: 'ch' },
];

/** Every language value the API documents, used to validate expression input. */
export const SUPPORTED_LANGUAGE_CODES = [
	'en', 'nl', 'fr', 'ch', 'jp', 'de', 'es', 'pt', 'it', 'gr', 'tr', 'cs', 'so', 'sk', 'ru', 'ko',
	'ir', 'iq', 'hu', 'gh', 'bg', 'bs', 'br', 'ar', 'ag', 'al', 'af', 'ro', 'pl', 'ca', 'da', 'uk',
	'no', 'fi', 'sv',
];

export function languageField(): INodeProperties {
	return {
		displayName: 'Language',
		name: 'language',
		type: 'options',
		options: LANGUAGE_OPTIONS,
		default: 'nl',
		description: 'Language Teamleader uses when communicating with this record',
	};
}

/**
 * Countries offered by the ISO country selector. Kept to the set a Warmvast
 * employee realistically works with, plus every EU country, so nobody has to
 * know a country code. Expressions can still supply any ISO 3166-1 alpha-2 code.
 */
export const COUNTRY_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Belgium', value: 'BE' },
	{ name: 'Netherlands', value: 'NL' },
	{ name: 'Luxembourg', value: 'LU' },
	{ name: 'France', value: 'FR' },
	{ name: 'Germany', value: 'DE' },
	{ name: 'Austria', value: 'AT' },
	{ name: 'Bulgaria', value: 'BG' },
	{ name: 'Croatia', value: 'HR' },
	{ name: 'Cyprus', value: 'CY' },
	{ name: 'Czechia', value: 'CZ' },
	{ name: 'Denmark', value: 'DK' },
	{ name: 'Estonia', value: 'EE' },
	{ name: 'Finland', value: 'FI' },
	{ name: 'Greece', value: 'GR' },
	{ name: 'Hungary', value: 'HU' },
	{ name: 'Ireland', value: 'IE' },
	{ name: 'Italy', value: 'IT' },
	{ name: 'Latvia', value: 'LV' },
	{ name: 'Lithuania', value: 'LT' },
	{ name: 'Malta', value: 'MT' },
	{ name: 'Poland', value: 'PL' },
	{ name: 'Portugal', value: 'PT' },
	{ name: 'Romania', value: 'RO' },
	{ name: 'Slovakia', value: 'SK' },
	{ name: 'Slovenia', value: 'SI' },
	{ name: 'Spain', value: 'ES' },
	{ name: 'Sweden', value: 'SE' },
	{ name: 'Switzerland', value: 'CH' },
	{ name: 'United Kingdom', value: 'GB' },
	{ name: 'United States', value: 'US' },
];

/** Phone types differ per resource: contacts allow mobile, companies do not. */
export const CONTACT_PHONE_TYPES: INodePropertyOptions[] = [
	{ name: 'Phone', value: 'phone' },
	{ name: 'Mobile', value: 'mobile' },
	{ name: 'Fax', value: 'fax' },
];

export const COMPANY_PHONE_TYPES: INodePropertyOptions[] = [
	{ name: 'Phone', value: 'phone' },
	{ name: 'Fax', value: 'fax' },
];

/** Simple promoted e-mail input — no nested collection to open. */
export function primaryEmailField(scope: IDisplayScope, overrides: Partial<INodeProperties> = {}): INodeProperties {
	return {
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@company.com',
		default: '',
		description: 'Main e-mail address',
		displayOptions: scopeShow(scope),
		...overrides,
	};
}

/** Options field whose default is the first offered type. */
function phoneTypeOption(options: {
	name: string;
	types: INodePropertyOptions[];
	description?: string;
	displayOptions?: INodeProperties['displayOptions'];
}): INodeProperties {
	const field: INodeProperties = {
		displayName: 'Type',
		name: options.name,
		type: 'options',
		options: options.types,
		default: '',
	};
	field.default = options.types[0].value as string;
	if (options.name === 'phoneType') field.displayName = 'Phone Type';
	if (options.description) field.description = options.description;
	if (options.displayOptions) field.displayOptions = options.displayOptions;
	return field;
}

/** Simple promoted phone input plus its type, shown only once a number is entered. */
export function phoneFields(
	scope: IDisplayScope,
	types: INodePropertyOptions[],
): INodeProperties[] {
	return [
		{
			displayName: 'Phone',
			name: 'phone',
			type: 'string',
			default: '',
			placeholder: 'e.g. 09 298 06 15',
			description: 'Main phone number',
			displayOptions: scopeShow(scope),
		},
		phoneTypeOption({
			name: 'phoneType',
			types,
			description: 'What kind of number the phone number above is',
			displayOptions: scopeShow(scope, { phone: [{ _cnd: { not: '' } }] }),
		}),
	];
}

/** Extra e-mail addresses, kept out of the way but still available. */
export function additionalEmailsField(): INodeProperties {
	return {
		displayName: 'Additional Email Addresses',
		name: 'additionalEmails',
		type: 'string',
		default: '',
		placeholder: 'e.g. sales@company.com, support@company.com',
		description:
			'Comma-separated extra addresses. Sending e-mail addresses replaces the full list stored in Teamleader.',
	};
}

/** Extra phone numbers as a small typed collection. */
export function additionalPhonesField(types: INodePropertyOptions[]): INodeProperties {
	return {
		displayName: 'Additional Phone Numbers',
		name: 'additionalPhones',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Phone Number',
		default: {},
		description:
			'Extra numbers. Sending phone numbers replaces the full list stored in Teamleader.',
		options: [
			{
				displayName: 'Phone Number',
				name: 'phone',
				values: [
					{
						displayName: 'Number',
						name: 'number',
						type: 'string',
						default: '',
					},
					phoneTypeOption({ name: 'type', types }),
				],
			},
		],
	};
}

const ADDRESS_VALUE_FIELDS: INodeProperties[] = [
	{
		displayName: 'Street and Number',
		name: 'line_1',
		type: 'string',
		default: '',
		placeholder: 'e.g. Dok Noord 3A 101',
	},
	{
		displayName: 'Postal Code',
		name: 'postal_code',
		type: 'string',
		default: '',
	},
	{
		displayName: 'City',
		name: 'city',
		type: 'string',
		default: '',
	},
	{
		displayName: 'Country',
		name: 'country',
		type: 'options',
		options: COUNTRY_OPTIONS,
		default: 'BE',
		description: 'Country of this address',
	},
	{
		displayName: 'Addressee',
		name: 'addressee',
		type: 'string',
		default: '',
		description: 'Name printed above the address. Not allowed on a primary address.',
	},
];

/**
 * Invoicing address as a single flat block — an employee filling in an invoicing
 * address should not have to reason about a generic multi-address structure.
 */
export function invoicingAddressField(scope: IDisplayScope): INodeProperties {
	return {
		displayName: 'Invoicing Address',
		name: 'invoicingAddress',
		type: 'fixedCollection',
		placeholder: 'Add Invoicing Address',
		default: {},
		description:
			'Address used on invoices. Sending an address replaces the full address list stored in Teamleader unless you also fill in Additional Addresses.',
		displayOptions: scopeShow(scope),
		options: [
			{
				displayName: 'Address',
				name: 'address',
				values: ADDRESS_VALUE_FIELDS,
			},
		],
	};
}

/** Additional addresses of any type, for the uncommon cases. */
export function additionalAddressesField(): INodeProperties {
	return {
		displayName: 'Additional Addresses',
		name: 'additionalAddresses',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Address',
		default: {},
		description:
			'Extra addresses. Sending addresses replaces the full address list stored in Teamleader.',
		options: [
			{
				displayName: 'Address',
				name: 'address',
				values: [
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						options: [
							{ name: 'Primary', value: 'primary' },
							{ name: 'Invoicing', value: 'invoicing' },
							{ name: 'Delivery', value: 'delivery' },
							{ name: 'Visiting', value: 'visiting' },
						],
						default: 'primary',
					},
					...ADDRESS_VALUE_FIELDS,
				],
			},
		],
	};
}

/** Custom fields, scoped to the resource context so unrelated definitions never appear. */
export function customFieldsField(loadOptionsMethod: string): INodeProperties {
	return {
		displayName: 'Custom Fields',
		name: 'customFields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Custom Field',
		default: {},
		options: [
			{
				displayName: 'Custom Field',
				name: 'field',
				values: [
					{
						displayName: 'Field Name or ID',
						name: 'id',
						type: 'options',
						typeOptions: { loadOptionsMethod },
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Value to store. Numbers and dates are sent as text.',
					},
				],
			},
		],
	};
}

/** Return All / Limit pair, identical in behaviour to V1. */
export function paginationFields(scope: IDisplayScope): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: scopeShow(scope),
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: scopeShow(scope, { returnAll: [false] }),
		},
	];
}

/** Sort target picker whose default is the first offered field. */
function sortFieldOption(fields: INodePropertyOptions[]): INodeProperties {
	const field: INodeProperties = {
		displayName: 'Field',
		name: 'field',
		type: 'options',
		options: fields,
		default: '',
	};
	field.default = fields[0].value as string;
	return field;
}

/** Sort rules for a list operation. */
export function sortField(fields: INodePropertyOptions[]): INodeProperties {
	return {
		displayName: 'Sort',
		name: 'sort',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Sort Rule',
		default: {},
		options: [
			{
				displayName: 'Rule',
				name: 'rule',
				values: [
					sortFieldOption(fields),
					{
						displayName: 'Order',
						name: 'order',
						type: 'options',
						options: [
							{ name: 'Ascending', value: 'asc' },
							{ name: 'Descending', value: 'desc' },
						],
						default: 'asc',
					},
				],
			},
		],
	};
}

/** Status filter, worded so the default behaviour is obvious. */
export function statusFilterField(label: string): INodeProperties {
	return {
		displayName: 'Status',
		name: 'status',
		type: 'options',
		options: [
			{ name: 'Active Only', value: 'active' },
			{ name: 'Deactivated Only', value: 'deactivated' },
			{ name: 'Active and Deactivated', value: '' },
		],
		default: 'active',
		description: `Which ${label} to return. Leave on Active and Deactivated to let Teamleader return everything.`,
	};
}

/** Existing-tag selector used in filters. */
export function tagFilterField(): INodeProperties {
	return {
		displayName: 'Tag Names or IDs',
		name: 'tags',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getTags' },
		default: [],
		description:
			'Only return records carrying all of these tags. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	};
}

/** Include Custom Fields toggle used by Get and Get Many. */
export function includeCustomFieldsField(): INodeProperties {
	return {
		displayName: 'Include Custom Fields',
		name: 'includeCustomFields',
		type: 'boolean',
		default: false,
		description: 'Whether to also return the custom field values of each record',
	};
}
