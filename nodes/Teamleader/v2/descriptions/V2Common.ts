import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

/**
 * Shared V2 description primitives.
 *
 * These exist so every V2 resource presents the same vocabulary: one name for
 * advanced settings, one customer locator, one tag pair, one money/percentage
 * input and one way of warning about a destructive action. Only patterns that
 * are genuinely reused across resources live here — this is not a generic UI
 * builder.
 */

/** The single approved name for the collection holding rarely-used fields. */
export const ADVANCED_OPTIONS_DISPLAY_NAME = 'Advanced Options';
export const ADVANCED_OPTIONS_NAME = 'advancedOptions';

/** Hint appended to fields that accept an expression as well as a picked value. */
export const EXPRESSION_HINT = 'Choose from the list, or specify an ID using an expression';

export interface IDisplayScope {
	resource: string;
	operations: string[];
}

function show(scope: IDisplayScope, extra: Record<string, unknown> = {}) {
	return {
		show: {
			resource: [scope.resource],
			operation: scope.operations,
			...extra,
		},
	};
}

/** The V2 resource selector. Resources are added to the list as stages land. */
export function v2ResourceField(options: INodePropertyOptions[]): INodeProperties {
	const sorted = [...options].sort((a, b) => a.name.localeCompare(b.name));
	const field: INodeProperties = {
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: sorted,
		default: '',
	};
	if (sorted.length > 0) field.default = sorted[0].value as string;
	return field;
}

/** Advanced Options collection wrapper, so the name and placement never drift. */
export function advancedOptions(
	scope: IDisplayScope,
	options: INodeProperties[],
): INodeProperties {
	return {
		displayName: ADVANCED_OPTIONS_DISPLAY_NAME,
		name: ADVANCED_OPTIONS_NAME,
		type: 'collection',
		placeholder: 'Add Advanced Option',
		default: {},
		displayOptions: show(scope),
		options: [...options].sort((a, b) => a.displayName.localeCompare(b.displayName)),
	};
}

/**
 * Three-mode customer selector: pick a company, pick a contact, or supply a raw
 * ID/expression. The customer type is derived from the chosen mode, so the user
 * never has to declare "type" before being allowed to pick anybody.
 */
export function customerLocator(
	scope: IDisplayScope,
	overrides: { name?: string; displayName?: string; required?: boolean } = {},
): INodeProperties {
	const name = overrides.name ?? 'customer';
	return {
		displayName: overrides.displayName ?? 'Customer',
		name,
		type: 'resourceLocator',
		default: { mode: 'companyList', value: '' },
		required: overrides.required ?? true,
		description: 'The company or contact this document belongs to',
		displayOptions: show(scope),
		modes: [
			{
				displayName: 'Company',
				name: 'companyList',
				type: 'list',
				placeholder: 'Select a company...',
				typeOptions: {
					searchListMethod: 'searchCompanies',
					searchable: true,
				},
			},
			{
				displayName: 'Contact',
				name: 'contactList',
				type: 'list',
				placeholder: 'Select a contact...',
				typeOptions: {
					searchListMethod: 'searchContacts',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 4b4d2ff7-c56f-0bcf-b4c9-b9d5e6f0f9f0',
				hint: 'Use the Customer Type field to say whether this ID is a company or a contact',
			},
		],
	};
}

/**
 * Companion field for the raw-ID customer mode: only then does the connector
 * need to be told which entity the ID refers to.
 */
export function customerTypeField(
	scope: IDisplayScope,
	customerParameterName = 'customer',
): INodeProperties {
	return {
		displayName: 'Customer Type',
		name: `${customerParameterName}Type`,
		type: 'options',
		options: [
			{ name: 'Company', value: 'company' },
			{ name: 'Contact', value: 'contact' },
		],
		default: 'company',
		description: 'Whether the customer ID entered above belongs to a company or a contact',
		displayOptions: {
			show: {
				resource: [scope.resource],
				operation: scope.operations,
				[`${customerParameterName}.mode`]: ['id'],
			},
		},
	};
}

/** Standard single-entity resource locator (From List + By ID/expression). */
export function resourceLocatorField(options: {
	displayName: string;
	name: string;
	searchListMethod: string;
	scope: IDisplayScope;
	description: string;
	placeholder?: string;
	required?: boolean;
	/**
	 * Shown under the From List picker. Use it wherever the underlying endpoint
	 * has no term filter, so the list can only match what it already loaded —
	 * the user is told that instead of assuming a full server-side search.
	 */
	listHint?: string;
}): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: options.required ?? true,
		description: options.description,
		displayOptions: show(options.scope),
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: options.placeholder ?? 'Select...',
				typeOptions: {
					searchListMethod: options.searchListMethod,
					searchable: true,
				},
				...(options.listHint ? { hint: options.listHint } : {}),
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 4b4d2ff7-c56f-0bcf-b4c9-b9d5e6f0f9f0',
			},
		],
	};
}

/**
 * Tag selector plus a free-text companion for tags that do not exist yet.
 * Always used as a pair so users are never forced to type an existing tag by hand.
 */
export function tagFields(scope: IDisplayScope): INodeProperties[] {
	return [
		{
			displayName: 'Tag Names or IDs',
			name: 'tags',
			type: 'multiOptions',
			typeOptions: { loadOptionsMethod: 'getTags' },
			default: [],
			description:
				'Existing tags to apply. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			displayOptions: show(scope),
		},
		{
			displayName: 'New Tags',
			name: 'newTags',
			type: 'string',
			default: '',
			placeholder: 'e.g. isolation, 2026-campaign',
			description: 'Comma-separated tags to create and apply if they do not exist yet',
			displayOptions: show(scope),
		},
	];
}

/** Money amount input. Currency is a separate, optional field per the API shape. */
export function moneyField(options: {
	displayName: string;
	name: string;
	scope: IDisplayScope;
	description: string;
	required?: boolean;
}): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'number',
		typeOptions: { numberPrecision: 2 },
		default: 0,
		required: options.required ?? false,
		description: options.description,
		displayOptions: show(options.scope),
	};
}

/**
 * Percentage entered the way a human says it (0-100), converted to the API's
 * 0-1 fraction at execution time by `percentToFraction`.
 */
export function percentageField(options: {
	displayName: string;
	name: string;
	scope: IDisplayScope;
	description: string;
	default?: number;
}): INodeProperties {
	const field: INodeProperties = {
		displayName: options.displayName,
		name: options.name,
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 100, numberPrecision: 2 },
		default: 0,
		description: options.description,
		displayOptions: show(options.scope),
	};
	if (options.default !== undefined) field.default = options.default;
	return field;
}

/** Convert a 0-100 UI percentage into the 0-1 fraction the API expects. */
export function percentToFraction(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = typeof value === 'number' ? value : Number(value);
	if (Number.isNaN(parsed)) return undefined;
	const clamped = Math.min(Math.max(parsed, 0), 100);
	return Math.round(clamped) / 100;
}

/** Convert an API 0-1 fraction back into a 0-100 UI percentage. */
export function fractionToPercent(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = typeof value === 'number' ? value : Number(value);
	if (Number.isNaN(parsed)) return undefined;
	return Math.round(parsed * 10000) / 100;
}

/**
 * Notice explaining exactly what a destructive operation does.
 * n8n cannot show a confirmation dialog from a node, so honesty in the
 * description is the mechanism — never pretend a dialog will appear.
 */
export function destructiveNotice(
	scope: IDisplayScope,
	options: { name: string; text: string },
): INodeProperties {
	return {
		displayName: options.text,
		name: options.name,
		type: 'notice',
		default: '',
		displayOptions: show(scope),
	};
}
