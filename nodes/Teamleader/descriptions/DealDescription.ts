import type { INodeProperties } from 'n8n-workflow';

import { customFieldsField, customerFields, paginationFields, sortField } from './SharedFields';

const RESOURCE = 'deal';

export const dealOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{ name: 'Change Phase', value: 'move', description: 'Move a deal to another phase', action: 'Change the phase of a deal' },
			{ name: 'Create', value: 'create', description: 'Create a new deal', action: 'Create a deal' },
			{ name: 'Get', value: 'get', description: 'Get a single deal', action: 'Get a deal' },
			{ name: 'Get Many', value: 'getAll', description: 'List or search deals', action: 'Get many deals' },
			{ name: 'Mark as Lost', value: 'lose', description: 'Mark a deal as lost', action: 'Mark a deal as lost' },
			{ name: 'Mark as Won', value: 'win', description: 'Mark a deal as won', action: 'Mark a deal as won' },
			{ name: 'Update', value: 'update', description: 'Update a deal', action: 'Update a deal' },
		],
		default: 'getAll',
	},
];

export const dealFields: INodeProperties[] = [
	{
		displayName: 'Deal',
		name: 'dealId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: {
			show: { resource: [RESOURCE], operation: ['get', 'update', 'move', 'win', 'lose'] },
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: 'searchDeals', searchable: true },
			},
			{ displayName: 'By ID', name: 'id', type: 'string', placeholder: 'e.g. 65a35860-dcca-4850-9fd6-47ff08469e0c' },
		],
	},

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
				displayName: 'Customer ID',
				name: 'customerId',
				type: 'string',
				default: '',
				description: 'ID of the contact or company the deals belong to',
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
			{ displayName: 'Estimated Closing Date From', name: 'estimatedClosingDateFrom', type: 'dateTime', default: '' },
			{ displayName: 'Estimated Closing Date Until', name: 'estimatedClosingDateUntil', type: 'dateTime', default: '' },
			{
				displayName: 'IDs',
				name: 'ids',
				type: 'string',
				default: '',
				description: 'Comma-separated list of deal IDs',
			},
			{
				displayName: 'Phase Name or ID',
				name: 'phaseId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDealPhases' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Pipeline Names or IDs',
				name: 'pipelineIds',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getDealPipelines' },
				default: [],
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Responsible User Name or ID',
				name: 'responsibleUserId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getUsers' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Search Term',
				name: 'term',
				type: 'string',
				default: '',
				description: "Filters on title, reference and the customer's name",
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'multiOptions',
				options: [
					{ name: 'Lost', value: 'lost' },
					{ name: 'Open', value: 'open' },
					{ name: 'Won', value: 'won' },
				],
				default: [],
			},
			{ displayName: 'Updated Since', name: 'updatedSince', type: 'dateTime', default: '' },
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
				displayName: 'Include Custom Fields',
				name: 'includeCustomFields',
				type: 'boolean',
				default: false,
				description: 'Whether to include custom field values in the response',
			},
			sortField(['created_at', 'weighted_value']),
		],
	},

	// ---------------- create ----------------
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: [RESOURCE], operation: ['create'] } },
	},
	...customerFields({ resource: [RESOURCE], operation: ['create'] }),

	// ---------------- update: optional customer change ----------------
	{
		displayName: 'Update Customer',
		name: 'updateCustomer',
		type: 'boolean',
		default: false,
		description: 'Whether to move the deal to a different contact or company',
		displayOptions: { show: { resource: [RESOURCE], operation: ['update'] } },
	},
	...customerFields({ resource: [RESOURCE], operation: ['update'] }, false).map((field) => ({
		...field,
		displayOptions: {
			show: { ...(field.displayOptions?.show ?? {}), updateCustomer: [true] },
		},
	})),

	// ---------------- create / update shared fields ----------------
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: [RESOURCE], operation: ['create', 'update'] } },
		options: [
			{
				displayName: 'Contact Person ID',
				name: 'contact_person_id',
				type: 'string',
				default: '',
				description: 'ID of the contact person at the customer company',
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
			customFieldsField(),
			{
				displayName: 'Department Name or ID',
				name: 'departmentId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDepartments' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{ displayName: 'Estimated Closing Date', name: 'estimated_closing_date', type: 'dateTime', default: '' },
			{
				displayName: 'Estimated Probability',
				name: 'estimated_probability',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 0.5,
				description: 'A number between 0 and 1 (inclusive)',
			},
			{ displayName: 'Estimated Value', name: 'estimated_value', type: 'number', default: 0 },
			{
				displayName: 'Phase Name or ID',
				name: 'phase_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDealPhases', loadOptionsDependsOn: ['pipelineId'] },
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Only supported when creating a deal; use Change Phase afterwards. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Pipeline Name or ID',
				name: 'pipelineId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDealPipelines' },
				default: '',
				description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Only used to narrow down the phase list. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Responsible User Name or ID',
				name: 'responsible_user_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getUsers' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Source Name or ID',
				name: 'source_id',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDealSources' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{ displayName: 'Summary', name: 'summary', type: 'string', typeOptions: { rows: 3 }, default: '' },
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				displayOptions: { show: { '/operation': ['update'] } },
			},
		],
	},

	// ---------------- move ----------------
	{
		displayName: 'Pipeline Name or ID',
		name: 'pipelineId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDealPipelines' },
		default: '',
		description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>. Only used to narrow down the phase list. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: { resource: [RESOURCE], operation: ['move'] } },
	},
	{
		displayName: 'Phase Name or ID',
		name: 'phaseId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDealPhases', loadOptionsDependsOn: ['pipelineId'] },
		default: '',
		required: true,
		description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: [RESOURCE], operation: ['move'] } },
	},

	// ---------------- lose ----------------
	{
		displayName: 'Lost Reason Name or ID',
		name: 'reasonId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getLostReasons' },
		default: '',
		description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: [RESOURCE], operation: ['lose'] } },
	},
	{
		displayName: 'Remark',
		name: 'extraInfo',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		description: 'Extra information about why the deal was lost',
		displayOptions: { show: { resource: [RESOURCE], operation: ['lose'] } },
	},
];
