import type { INodeProperties } from 'n8n-workflow';

/** Pagination fields shared by every list/search operation. */
export function paginationFields(resource: string, operations: string[]): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show: { resource: [resource], operation: operations } },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: {
				show: { resource: [resource], operation: operations, returnAll: [false] },
			},
		},
	];
}

/** Emails fixedCollection. */
export function emailsField(types: string[] = ['primary']): INodeProperties {
	return {
		displayName: 'Emails',
		name: 'emails',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Email',
		default: {},
		options: [
			{
				displayName: 'Email',
				name: 'email',
				values: [
					// eslint-disable-next-line n8n-nodes-base/node-param-default-missing -- the default is derived from the options array above
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						options: types.map((type) => ({ name: titleCase(type), value: type })),
						default: types[0],
					},
					{
						displayName: 'Email',
						name: 'email',
						type: 'string',
						placeholder: 'name@email.com',
						default: '',
					},
				],
			},
		],
	};
}

/** Telephones fixedCollection. */
export function telephonesField(types: string[] = ['phone', 'mobile', 'fax']): INodeProperties {
	return {
		displayName: 'Telephones',
		name: 'telephones',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Telephone',
		default: {},
		options: [
			{
				displayName: 'Telephone',
				name: 'telephone',
				values: [
					// eslint-disable-next-line n8n-nodes-base/node-param-default-missing -- the default is derived from the options array above
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						options: types.map((type) => ({ name: titleCase(type), value: type })),
						default: types[0],
					},
					{
						displayName: 'Number',
						name: 'number',
						type: 'string',
						default: '',
					},
				],
			},
		],
	};
}

/** Addresses fixedCollection. */
export function addressesField(): INodeProperties {
	return {
		displayName: 'Addresses',
		name: 'addresses',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Address',
		default: {},
		options: [
			{
				displayName: 'Address',
				name: 'address',
				values: [
					// eslint-disable-next-line n8n-nodes-base/node-param-default-missing -- the default is derived from the options array above
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
					{ displayName: 'Addressee', name: 'addressee', type: 'string', default: '', description: 'Not allowed on primary addresses' },
					{ displayName: 'Line 1', name: 'line_1', type: 'string', default: '' },
					{ displayName: 'Postal Code', name: 'postal_code', type: 'string', default: '' },
					{ displayName: 'City', name: 'city', type: 'string', default: '' },
					{ displayName: 'Country', name: 'country', type: 'string', default: '', description: 'Two-letter ISO 3166-1 country code, e.g. BE' },
				],
			},
		],
	};
}

/** Custom fields fixedCollection using the dynamic custom field definitions. */
export function customFieldsField(): INodeProperties {
	return {
		displayName: 'Custom Fields',
		name: 'customFields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Custom Field',
		default: {},
		options: [
			{
				displayName: 'Field',
				name: 'field',
				values: [
					{
						displayName: 'Custom Field Name or ID',
						name: 'id',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getCustomFieldDefinitions' },
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
	};
}

/** Tags input (free text, matching Teamleader tag names). */
export function tagsField(): INodeProperties {
	return {
		displayName: 'Tags',
		name: 'tags',
		type: 'string',
		default: '',
		description: 'Comma-separated list of tag names. On update this overwrites existing tags.',
	};
}

/** Sort fixedCollection for list operations. */
export function sortField(fields: string[]): INodeProperties {
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
					// eslint-disable-next-line n8n-nodes-base/node-param-default-missing -- the default is derived from the options array above
					{
						displayName: 'Field',
						name: 'field',
						type: 'options',
						options: fields.map((field) => ({ name: titleCase(field), value: field })),
						default: fields[0],
					},
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

export function titleCase(value: string): string {
	return value
		.replace(/[_-]+/g, ' ')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Resource locator for a customer (contact or company), scoped to a resource/operation. */
export function customerFields(
	show: { resource: string[]; operation: string[] },
	required = true,
): INodeProperties[] {
	return [
		{
			displayName: 'Customer Type',
			name: 'customerType',
			type: 'options',
			options: [
				{ name: 'Contact', value: 'contact' },
				{ name: 'Company', value: 'company' },
			],
			default: 'company',
			required,
			displayOptions: { show },
		},
		{
			displayName: 'Customer',
			name: 'customerId',
			type: 'resourceLocator',
			default: { mode: 'list', value: '' },
			required,
			description: 'The contact or company this document belongs to',
			modes: [
				{
					displayName: 'From List',
					name: 'list',
					type: 'list',
					typeOptions: { searchListMethod: 'searchCompanies', searchable: true },
				},
				{ displayName: 'By ID', name: 'id', type: 'string' },
			],
			displayOptions: { show: { ...show, customerType: ['company'] } },
		},
		{
			displayName: 'Customer',
			name: 'customerId',
			type: 'resourceLocator',
			default: { mode: 'list', value: '' },
			required,
			description: 'The contact or company this document belongs to',
			modes: [
				{
					displayName: 'From List',
					name: 'list',
					type: 'list',
					typeOptions: { searchListMethod: 'searchContacts', searchable: true },
				},
				{ displayName: 'By ID', name: 'id', type: 'string' },
			],
			displayOptions: { show: { ...show, customerType: ['contact'] } },
		},
	];
}
