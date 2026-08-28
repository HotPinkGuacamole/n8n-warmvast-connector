import type { INodeProperties } from 'n8n-workflow';

import type { IDisplayScope } from './V2Common';

/**
 * One shared line-editor component, instantiated for Quotation and Invoice.
 *
 * Field NAMES here are a contract with `v2/helpers/lines.ts` (normalization)
 * and `v2/helpers/hydration.ts` (product hydration + validation) — changing a
 * name here means updating those readers too.
 *
 * Normal path (`Use Multiple Sections = false`): one flat `Lines` list plus a
 * top-level `Section Title`. Power path (`= true`): the V1-capability
 * `Grouped Lines` structure, rebuilt on V2 line members so hydration works
 * for it too. Both paths produce the same line "row" shape via
 * `lineValueFields()`, so there is exactly one place that defines what a line
 * looks like.
 */

/** Which per-document fields `Line Options` should offer. */
export interface ILineDocumentConfig {
	/** Quotation only: manual purchase-price override/hydration. */
	hasPurchasePrice: boolean;
	/** Invoice only: product category override/hydration. */
	hasProductCategory: boolean;
	/** Invoice only: withholding tax rate override. */
	hasWithholdingTax: boolean;
}

export const QUOTATION_LINE_CONFIG: ILineDocumentConfig = {
	hasPurchasePrice: true,
	hasProductCategory: false,
	hasWithholdingTax: false,
};

export const INVOICE_LINE_CONFIG: ILineDocumentConfig = {
	hasPurchasePrice: false,
	hasProductCategory: true,
	hasWithholdingTax: true,
};

function scopeShow(scope: IDisplayScope, extra: Record<string, unknown> = {}) {
	return {
		show: {
			resource: [scope.resource],
			operation: scope.operations,
			...extra,
		},
	};
}

/**
 * Per-line "Line Options" collection: shared overrides/rare fields plus the
 * document-specific members. Living inside a `collection` means an untouched
 * entry is genuinely absent from the parameter object — the mechanism that
 * makes an explicit `Discount (%) = 0` distinguishable from "not set" (§8),
 * and that lets a product-mode override coexist with hydration without a
 * separate toggle.
 */
export function lineOptionsField(config: ILineDocumentConfig): INodeProperties {
	const options: INodeProperties[] = [
		{
			displayName: 'Description',
			name: 'description',
			type: 'string',
			default: '',
			description: 'Product mode only: overrides the product name used as the line description',
		},
		{
			displayName: 'Discount (%)',
			name: 'discount',
			type: 'number',
			typeOptions: { minValue: 0, maxValue: 100 },
			default: 0,
			description: 'Leave unset for no discount. Adding this field sends it even when set to 0.',
		},
		{
			displayName: 'Extended Description',
			name: 'extendedDescription',
			type: 'string',
			typeOptions: { rows: 3 },
			default: '',
			description: 'Additional information about this line, in Markdown',
		},
		{
			displayName: 'Tax Rate Name or ID',
			name: 'taxRateId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getTaxRates' },
			default: '',
			description:
				'Product mode only: overrides the tax rate read from the product. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
		{
			displayName: 'Unit of Measure Name or ID',
			name: 'unitOfMeasureId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getUnitsOfMeasure' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		},
		{
			displayName: 'Unit Price (Excl. Tax)',
			name: 'unitPrice',
			type: 'number',
			typeOptions: { numberPrecision: 2 },
			default: 0,
			description:
				"Product mode only: overrides the product's selling price. 0 means use the product price — to charge exactly 0.00, turn off Use Product Defaults instead.",
		},
	];

	if (config.hasPurchasePrice) {
		options.push({
			displayName: 'Purchase Price',
			name: 'purchasePrice',
			type: 'number',
			typeOptions: { numberPrecision: 2 },
			default: 0,
			description: 'Must be in the account currency',
		});
	}

	if (config.hasProductCategory) {
		options.push({
			displayName: 'Product Category Name or ID',
			name: 'productCategoryId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getProductCategories' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		});
	}

	if (config.hasWithholdingTax) {
		options.push({
			displayName: 'Withholding Tax Rate Name or ID',
			name: 'withholdingTaxRateId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getWithholdingTaxRates' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		});
	}

	return {
		displayName: 'Line Options',
		name: 'lineOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		options: [...options].sort((a, b) => a.displayName.localeCompare(b.displayName)),
	};
}

/**
 * The fields of one line "row" — used both by the simple `Lines` fixedCollection
 * and, nested one level deeper, by the power-path `Grouped Lines` structure.
 * `displayOptions` here are sibling-relative to this row only (no
 * `resource`/`operation`): the row is already scoped by whichever top-level
 * field contains it.
 *
 * Product mode's ordinary visible fields are deliberately just Product,
 * Quantity, Use Product Defaults and Line Options (CLAUDE.md override to the
 * original spec, which showed every API-shaped field at line level).
 * Description/Unit Price/Tax Rate stay top-level only for Custom Line, where
 * they are the normal, required, manually-entered values.
 */
export function lineValueFields(config: ILineDocumentConfig): INodeProperties[] {
	return [
		{
			displayName: 'Line Type',
			name: 'lineType',
			type: 'options',
			options: [
				{ name: 'Teamleader Product', value: 'product' },
				{ name: 'Custom Line', value: 'custom' },
			],
			default: 'custom',
		},
		{
			displayName: 'Product',
			name: 'productId',
			type: 'resourceLocator',
			default: { mode: 'list', value: '' },
			description: 'The Teamleader product this line represents',
			displayOptions: { show: { lineType: ['product'] } },
			modes: [
				{
					displayName: 'From List',
					name: 'list',
					type: 'list',
					placeholder: 'Select a product...',
					typeOptions: { searchListMethod: 'searchProducts', searchable: true },
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
			displayName: 'Use Product Defaults',
			name: 'useProductDefaults',
			type: 'boolean',
			default: true,
			description:
				'Whether to read description, price, tax rate and unit from the product when the workflow runs. Fill in a Line Options field below to override just that value; turn this off to enter every value manually instead.',
			displayOptions: { show: { lineType: ['product'] } },
		},
		{
			displayName: 'Description',
			name: 'description',
			type: 'string',
			default: '',
			description: 'Shown on the document. Required for a custom line.',
			displayOptions: { show: { lineType: ['custom'] } },
		},
		{
			displayName: 'Quantity',
			name: 'quantity',
			type: 'number',
			default: 1,
		},
		{
			displayName: 'Unit Price (Excl. Tax)',
			name: 'unitPrice',
			type: 'number',
			typeOptions: { numberPrecision: 2 },
			default: 0,
			displayOptions: { show: { lineType: ['custom'] } },
		},
		{
			displayName: 'Tax Rate Name or ID',
			name: 'taxRateId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getTaxRates' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			displayOptions: { show: { lineType: ['custom'] } },
		},
		lineOptionsField(config),
	];
}

/** `Section Title` — top-level, next to `Lines`, hidden once multi-section mode is on. */
export function sectionTitleField(scope: IDisplayScope): INodeProperties {
	return {
		displayName: 'Section Title',
		name: 'sectionTitle',
		type: 'string',
		default: '',
		description: 'Optional heading shown above these lines on the document',
		displayOptions: scopeShow(scope, { useSections: [false] }),
	};
}

/** The normal, one-level `Lines` editor. Hidden once multi-section mode is on. */
export function simpleLinesField(scope: IDisplayScope, config: ILineDocumentConfig): INodeProperties {
	return {
		displayName: 'Lines',
		name: 'lines',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Line',
		default: {},
		displayOptions: scopeShow(scope, { useSections: [false] }),
		options: [
			{
				displayName: 'Line',
				name: 'line',
				values: lineValueFields(config),
			},
		],
	};
}

/**
 * The power-path `Grouped Lines` editor: V1's grouping capability rebuilt on
 * V2 line members (Line Type / Use Product Defaults / Line Options), so a
 * multi-section document still hydrates products the same way a simple one
 * does. Shown only once `Use Multiple Sections` is explicitly turned on.
 */
export function groupedLinesField(scope: IDisplayScope, config: ILineDocumentConfig): INodeProperties {
	return {
		displayName: 'Grouped Lines',
		name: 'groupedLines',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Line Group',
		default: {},
		description: 'Groups of lines, each with its own optional section title',
		displayOptions: scopeShow(scope, { useSections: [true] }),
		options: [
			{
				displayName: 'Group',
				name: 'group',
				values: [
					{
						displayName: 'Section Title',
						name: 'title',
						type: 'string',
						default: '',
						description: 'Optional title shown above this group of lines',
					},
					{
						displayName: 'Line Items',
						name: 'lineItems',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						placeholder: 'Add Line Item',
						default: {},
						options: [
							{
								displayName: 'Item',
								name: 'item',
								values: lineValueFields(config),
							},
						],
					},
				],
			},
		],
	};
}

/** `Use Multiple Sections` — common/secondary; the escape hatch, not the normal workflow. */
export function useSectionsField(scope: IDisplayScope): INodeProperties {
	return {
		displayName: 'Use Multiple Sections',
		name: 'useSections',
		type: 'boolean',
		default: false,
		description:
			'Whether to split the lines into several named sections. Most documents need only one — leave this off and use Section Title above instead.',
		displayOptions: scopeShow(scope),
	};
}

/**
 * The complete line-editor field set for one operation. Stage 5 (Quotation)
 * and Stage 6 (Invoice) consume this instead of declaring their own lines UI.
 */
export function lineEditorFields(scope: IDisplayScope, config: ILineDocumentConfig): INodeProperties[] {
	return [
		sectionTitleField(scope),
		simpleLinesField(scope, config),
		groupedLinesField(scope, config),
		useSectionsField(scope),
	];
}
