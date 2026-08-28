import type { INodeProperties } from 'n8n-workflow';

import {
	advancedOptions,
	customerLocator,
	moneyField,
	resourceLocatorField,
} from './V2Common';
import { customFieldsField, includeCustomFieldsField, paginationFields, scopeShow, sortField } from './V2SharedFields';

const RESOURCE = 'deal';

const scope = (...operations: string[]) => ({ resource: RESOURCE, operations });

const dealLocator = (operations: string[], description: string): INodeProperties =>
	resourceLocatorField({
		displayName: 'Deal',
		name: 'dealId',
		searchListMethod: 'searchDeals',
		scope: scope(...operations),
		description,
		placeholder: 'Select a deal...',
	});

/**
 * The Pipeline field never goes to Teamleader on its own — it only narrows the
 * Phase dropdown below it. `deals.create`/`deals.update`/`deals.move` accept no
 * `pipeline_id`, so sending one would be inventing API surface.
 *
 * Note for maintainers: the description below is a plain string literal on
 * purpose, not built from a shared constant or template literal — the
 * `eslint-plugin-n8n-nodes-base` dynamic-options rules only recognise a literal
 * `description` directly on the field object.
 */
const pipelineField = (operations: string[], overrides: Partial<INodeProperties> = {}): INodeProperties => ({
	displayName: 'Pipeline Name or ID',
	name: 'pipelineId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getDealPipelines' },
	default: '',
	description:
		'Only used to filter the phase list below — not sent to Teamleader. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	displayOptions: scopeShow(scope(...operations)),
	...overrides,
});

const contactPersonField = (operations: string[], description: string): INodeProperties =>
	resourceLocatorField({
		displayName: 'Contact Person',
		name: 'contactPersonId',
		searchListMethod: 'searchContacts',
		scope: scope(...operations),
		description,
		placeholder: 'Select a contact...',
		required: false,
	});

const currencyField = (operations: string[], extraShow: Record<string, unknown>): INodeProperties => ({
	displayName: 'Currency Name or ID',
	name: 'currency',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getCurrencies' },
	default: 'EUR',
	description:
		'Applies to Estimated Value. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	displayOptions: scopeShow(scope(...operations), extraShow),
});

const responsibleUserField = (operations: string[]): INodeProperties => ({
	displayName: 'Responsible User Name or ID',
	name: 'responsibleUserId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getUsers' },
	default: '',
	description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	displayOptions: scopeShow(scope(...operations)),
});

const estimatedClosingDateField = (operations: string[]): INodeProperties => ({
	displayName: 'Estimated Closing Date',
	name: 'estimatedClosingDate',
	type: 'dateTime',
	default: '',
	displayOptions: scopeShow(scope(...operations)),
});

/**
 * Advanced fields shared by Create and Update. Living inside the Advanced
 * Options collection means an untouched field is genuinely absent from the
 * parameter object, not present-with-a-default — the same mechanism Contact
 * and Company already rely on to tell "not set" apart from "set to a falsy
 * value" (see `assignIfPresent`). This is what keeps Probability (%) safe
 * without needing its own Change-toggle.
 *
 * Exchange Rate is deliberately not offered here: `deals.create`/`deals.update`
 * has no such field (V1 never sent one either), and CLAUDE.md rules out adding
 * UI for API behaviour that isn't real.
 */
const dealAdvancedFields: INodeProperties[] = [
	customFieldsField('getDealCustomFieldDefinitions'),
	{
		displayName: 'Department Name or ID',
		name: 'departmentId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDepartments' },
		default: '',
		description:
			'Only needed if this deal belongs to a non-default department. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Probability (%)',
		name: 'probabilityPercent',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 100, numberPrecision: 0 },
		default: 50,
		description: 'How likely this deal is to close, from 0 to 100',
	},
	{
		displayName: 'Source Name or ID',
		name: 'sourceId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDealSources' },
		default: '',
		description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
	{
		displayName: 'Summary',
		name: 'summary',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
	},
];

export const dealOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [RESOURCE] } },
		options: [
			{ name: 'Change Phase', value: 'move', description: 'Move a deal to another phase', action: 'Change the phase of a deal' },
			{ name: 'Create', value: 'create', description: 'Create a deal', action: 'Create a deal' },
			{ name: 'Get', value: 'get', description: 'Get a single deal', action: 'Get a deal' },
			{ name: 'Get Many', value: 'getAll', description: 'Get many deals', action: 'Get many deals' },
			{ name: 'Mark as Lost', value: 'lose', description: 'Mark a deal as lost', action: 'Mark a deal as lost' },
			{ name: 'Mark as Won', value: 'win', description: 'Mark a deal as won', action: 'Mark a deal as won' },
			{ name: 'Update', value: 'update', description: 'Update a deal', action: 'Update a deal' },
		],
		default: 'create',
	},
];

export const dealFields: INodeProperties[] = [
	// ------------------------------------------------------------------- Get
	dealLocator(['get'], 'The deal to retrieve'),
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
				displayName: 'Customer',
				name: 'customerId',
				type: 'resourceLocator',
				default: { mode: 'companyList', value: '' },
				description: 'Only return deals belonging to this customer',
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
				displayName: 'Estimated Closing Date From',
				name: 'estimatedClosingDateFrom',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Estimated Closing Date Until',
				name: 'estimatedClosingDateUntil',
				type: 'dateTime',
				default: '',
			},
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
				typeOptions: {
					loadOptionsMethod: 'getDealPhasesScoped',
					loadOptionsDependsOn: ['filters.pipelineIds'],
				},
				default: '',
				description:
					'Filtered to the selected pipelines below when exactly one is chosen, otherwise every phase is listed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description: 'Only return deals changed after this moment',
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
				{ name: 'Created At', value: 'created_at' },
				{ name: 'Weighted Value', value: 'weighted_value' },
			]),
		],
	},

	// ---------------------------------------------------------------- Create
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		required: true,
		displayOptions: scopeShow(scope('create')),
	},
	customerLocator(scope('create'), { name: 'customerId' }),
	{
		displayName: 'Customer Type',
		name: 'customerType',
		type: 'options',
		options: [
			{ name: '— Select —', value: '' },
			{ name: 'Company', value: 'company' },
			{ name: 'Contact', value: 'contact' },
		],
		default: '',
		description: 'Only needed when you supply a raw ID or expression for Customer',
		displayOptions: scopeShow(scope('create'), { 'customerId.mode': ['id'] }),
	},
	contactPersonField(['create'], 'The person at the customer this deal runs through'),
	pipelineField(['create']),
	{
		displayName: 'Phase Name or ID',
		name: 'phaseId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDealPhasesScoped', loadOptionsDependsOn: ['pipelineId'] },
		default: '',
		description:
			"Leave empty to start in the pipeline's default first phase. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
		displayOptions: scopeShow(scope('create'), { pipelineId: [{ _cnd: { not: '' } }] }),
	},
	moneyField({
		displayName: 'Estimated Value',
		name: 'estimatedValue',
		scope: scope('create'),
		description: 'Leave at 0 to create the deal without an estimated value',
	}),
	currencyField(['create'], { estimatedValue: [{ _cnd: { not: 0 } }] }),
	responsibleUserField(['create']),
	estimatedClosingDateField(['create']),
	advancedOptions(scope('create'), dealAdvancedFields),

	// ---------------------------------------------------------------- Update
	dealLocator(['update'], 'The deal to update'),
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		displayOptions: scopeShow(scope('update')),
	},
	{
		displayName: 'Change Customer',
		name: 'updateCustomer',
		type: 'boolean',
		default: false,
		description:
			'Whether to move the deal to a different contact or company. Only turn this on if the deal must be moved.',
		displayOptions: scopeShow(scope('update')),
	},
	{
		...customerLocator(scope('update'), { name: 'customerId' }),
		displayOptions: scopeShow(scope('update'), { updateCustomer: [true] }),
	},
	{
		displayName: 'Customer Type',
		name: 'customerType',
		type: 'options',
		options: [
			{ name: '— Select —', value: '' },
			{ name: 'Company', value: 'company' },
			{ name: 'Contact', value: 'contact' },
		],
		default: '',
		description: 'Only needed when you supply a raw ID or expression for Customer',
		displayOptions: scopeShow(scope('update'), { updateCustomer: [true], 'customerId.mode': ['id'] }),
	},
	contactPersonField(
		['update'],
		"Reads the deal's current customer so the contact person can be updated on its own, unless Change Customer is on",
	),
	{
		displayName: 'Change Estimated Value',
		name: 'changeEstimatedValue',
		type: 'boolean',
		default: false,
		description:
			"Whether to update the estimated value. Leave off to keep the deal's current value untouched — turning this on is also how you set it to exactly 0.",
		displayOptions: scopeShow(scope('update')),
	},
	{
		...moneyField({
			displayName: 'Estimated Value',
			name: 'estimatedValue',
			scope: scope('update'),
			description: 'The new estimated value',
		}),
		displayOptions: scopeShow(scope('update'), { changeEstimatedValue: [true] }),
	},
	currencyField(['update'], { changeEstimatedValue: [true] }),
	responsibleUserField(['update']),
	estimatedClosingDateField(['update']),
	advancedOptions(scope('update'), dealAdvancedFields),

	// ---------------------------------------------------------- Change Phase
	dealLocator(['move'], 'The deal to move'),
	pipelineField(['move']),
	{
		displayName: 'Phase Name or ID',
		name: 'phaseId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDealPhasesScoped', loadOptionsDependsOn: ['pipelineId'] },
		default: '',
		required: true,
		description:
			'With no pipeline chosen, every phase is listed, prefixed with its pipeline name. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: scopeShow(scope('move')),
	},

	// -------------------------------------------------------------- Mark Won
	dealLocator(['win'], 'The deal to mark as won'),

	// ------------------------------------------------------------- Mark Lost
	dealLocator(['lose'], 'The deal to mark as lost'),
	{
		displayName: 'Closes the deal as lost. This is reversible in Teamleader but not from n8n.',
		name: 'loseNotice',
		type: 'notice',
		default: '',
		displayOptions: scopeShow(scope('lose')),
	},
	{
		displayName: 'Lost Reason Name or ID',
		name: 'reasonId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getLostReasons' },
		default: '',
		description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: scopeShow(scope('lose')),
	},
	{
		displayName: 'Remark',
		name: 'extraInfo',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description: 'Extra information about why the deal was lost',
		displayOptions: scopeShow(scope('lose')),
	},
];
