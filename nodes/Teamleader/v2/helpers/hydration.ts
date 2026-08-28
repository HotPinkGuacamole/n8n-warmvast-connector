import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { resolveProduct, type IResolvedProduct, type TeamleaderExecutionContext } from '../../helpers/context';
import { extractId } from '../../helpers/GenericFunctions';
import type { ITeamleaderGroupedLineItem, ITeamleaderLineItem, ITeamleaderMoney } from '../../helpers/interfaces';
import { buildMoney } from '../../helpers/utils';
import type { ILineDocumentConfig } from '../descriptions/LineEditor';
import type { INormalizedGroup, INormalizedLine } from './lines';

/**
 * Execution-time assembly of `grouped_lines` from normalized line groups,
 * including Teamleader Product hydration (§3 of the global spec, CLAUDE.md
 * product-line override) and the final API-shape validation every line must
 * pass before it can be sent.
 *
 * Warnings (e.g. a currency mismatch between a product and the document) are
 * returned alongside the payload rather than folded into it — Teamleader must
 * never see connector-internal metadata in the request body.
 */
export interface IHydratedLines {
	groupedLines: ITeamleaderGroupedLineItem[];
	warnings: string[];
}

function numberOrUndefined(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Discount: absent key → no object; present (including 0) → validated and sent. */
function resolveDiscount(
	lineOptions: IDataObject,
	lineNumber: number,
	node: INode,
): { value: number; type: 'percentage' } | undefined {
	if (lineOptions.discount === undefined || lineOptions.discount === '') return undefined;

	const value = Number(lineOptions.discount);
	if (Number.isNaN(value) || value < 0 || value > 100) {
		throw new NodeOperationError(node, `Line ${lineNumber} has an invalid discount`, {
			description: 'Discount (%) must be a number between 0 and 100.',
		});
	}
	return { value, type: 'percentage' };
}

/** Assemble and validate the final Teamleader line item from its resolved parts. */
function finalizeLine(
	parts: {
		description?: string;
		unitPrice?: number;
		taxRateId?: string;
		quantity: number;
		productId?: string;
		extendedDescription?: unknown;
		unitOfMeasureId?: string;
		discount?: { value: number; type: 'percentage' };
		purchasePrice?: ITeamleaderMoney;
		productCategoryId?: string;
		withholdingTaxRateId?: string;
	},
	lineNumber: number,
	node: INode,
): ITeamleaderLineItem {
	if (!parts.description) {
		throw new NodeOperationError(node, `Line ${lineNumber} has no description.`);
	}
	if (parts.unitPrice === undefined || Number.isNaN(parts.unitPrice)) {
		throw new NodeOperationError(node, `Line ${lineNumber} has no unit price.`);
	}
	if (!parts.taxRateId) {
		throw new NodeOperationError(node, `Line ${lineNumber} has no tax rate.`);
	}

	const item: ITeamleaderLineItem = {
		quantity: parts.quantity,
		description: parts.description,
		unit_price: { amount: parts.unitPrice, tax: 'excluding' },
		tax_rate_id: parts.taxRateId,
	};

	if (parts.productId) item.product_id = parts.productId;
	if (parts.unitOfMeasureId) item.unit_of_measure_id = parts.unitOfMeasureId;
	if (nonEmptyString(parts.extendedDescription)) {
		item.extended_description = parts.extendedDescription as string;
	}
	if (parts.discount) item.discount = parts.discount;
	if (parts.purchasePrice) item.purchase_price = parts.purchasePrice;
	if (parts.productCategoryId) item.product_category_id = parts.productCategoryId;
	if (parts.withholdingTaxRateId) item.withholding_tax_rate_id = parts.withholdingTaxRateId;

	return item;
}

/** Translate a failed `products.info` read into a line-and-product-scoped message. */
function describeProductFailure(error: unknown, productId: string, lineNumber: number): string {
	const err = error as { message?: string; description?: string; httpCode?: string | number };
	const detail = err?.description || err?.message || 'Unknown error';
	const notFound = err?.httpCode === '404' || err?.httpCode === 404 || /not found/i.test(String(detail));
	const reason = notFound ? 'This product no longer exists in Teamleader.' : detail;
	return `Could not load Product ${productId} for line ${lineNumber}. ${reason}`;
}

async function hydrateLine(
	context: IExecuteFunctions,
	executionContext: TeamleaderExecutionContext,
	line: INormalizedLine,
	lineNumber: number,
	config: ILineDocumentConfig,
	documentCurrency: string | undefined,
	warnings: string[],
): Promise<ITeamleaderLineItem> {
	const node = context.getNode();
	const options = line.lineOptions;

	if (line.lineType === 'custom') {
		return finalizeLine(
			{
				description: line.description,
				unitPrice: line.unitPrice,
				taxRateId: line.taxRateId,
				quantity: line.quantity,
				extendedDescription: options.extendedDescription,
				unitOfMeasureId: extractId(options.unitOfMeasureId),
				discount: resolveDiscount(options, lineNumber, node),
				purchasePrice: config.hasPurchasePrice ? buildMoney(options.purchasePrice, documentCurrency) : undefined,
				productCategoryId: config.hasProductCategory ? extractId(options.productCategoryId) : undefined,
				withholdingTaxRateId: config.hasWithholdingTax ? extractId(options.withholdingTaxRateId) : undefined,
			},
			lineNumber,
			node,
		);
	}

	// Teamleader Product line.
	if (!line.productId) {
		throw new NodeOperationError(node, `Line ${lineNumber} has no product selected.`);
	}

	let product: IResolvedProduct | undefined;
	if (line.useProductDefaults) {
		try {
			product = await executionContext.resolve('fromProduct', line.productId, (id) =>
				resolveProduct(context, id),
			);
		} catch (error) {
			throw new NodeOperationError(node, describeProductFailure(error, line.productId, lineNumber));
		}
	}

	const overrideDescription = nonEmptyString(options.description);
	const overrideExtendedDescription = nonEmptyString(options.extendedDescription);
	const overrideUnitPrice = numberOrUndefined(options.unitPrice);
	const overrideTaxRateId = extractId(options.taxRateId) || undefined;
	const overrideUnitOfMeasureId = extractId(options.unitOfMeasureId) || undefined;
	const overrideProductCategoryId = config.hasProductCategory
		? extractId(options.productCategoryId) || undefined
		: undefined;
	const overridePurchasePrice = config.hasPurchasePrice ? numberOrUndefined(options.purchasePrice) : undefined;

	let description: string | undefined;
	let extendedDescription: string | undefined;
	let unitPrice: number | undefined;
	let taxRateId: string | undefined;
	let unitOfMeasureId: string | undefined;
	let productCategoryId: string | undefined;
	let purchasePrice: ITeamleaderMoney | undefined;

	if (line.useProductDefaults) {
		description = overrideDescription ?? product?.name;
		extendedDescription = overrideExtendedDescription ?? product?.description;

		// The zero-price rule (§12): 0 (or no override at all) means "use the
		// product's price". A genuine 0.00 requires Use Product Defaults = off.
		if (overrideUnitPrice !== undefined && overrideUnitPrice !== 0) {
			unitPrice = overrideUnitPrice;
		} else if (product?.sellingPrice !== undefined) {
			unitPrice = product.sellingPrice;
			if (
				product.sellingPriceCurrency &&
				documentCurrency &&
				product.sellingPriceCurrency !== documentCurrency
			) {
				warnings.push(
					`Product ${product.name ?? line.productId} is priced in ${product.sellingPriceCurrency}; the amount was used as-is in ${documentCurrency}.`,
				);
			}
		}

		taxRateId = overrideTaxRateId ?? product?.taxRateId;
		unitOfMeasureId = overrideUnitOfMeasureId ?? product?.unitOfMeasureId;

		if (config.hasProductCategory) {
			productCategoryId = overrideProductCategoryId ?? product?.productCategoryId;
		}

		if (config.hasPurchasePrice) {
			const amount = overridePurchasePrice ?? product?.purchasePrice;
			const currency = overridePurchasePrice !== undefined ? documentCurrency : product?.purchasePriceCurrency;
			purchasePrice = buildMoney(amount, currency ?? documentCurrency);
			if (
				overridePurchasePrice === undefined &&
				product?.purchasePriceCurrency &&
				documentCurrency &&
				product.purchasePriceCurrency !== documentCurrency
			) {
				warnings.push(
					`Product ${product.name ?? line.productId} purchase price is in ${product.purchasePriceCurrency}; the amount was used as-is in ${documentCurrency}.`,
				);
			}
		}
	} else {
		// Defaults off: only explicit overrides count, including a genuine 0.
		description = overrideDescription;
		extendedDescription = overrideExtendedDescription;
		unitPrice = overrideUnitPrice;
		taxRateId = overrideTaxRateId;
		unitOfMeasureId = overrideUnitOfMeasureId;
		productCategoryId = overrideProductCategoryId;
		if (config.hasPurchasePrice) {
			purchasePrice = buildMoney(overridePurchasePrice, documentCurrency);
		}
	}

	return finalizeLine(
		{
			description,
			unitPrice,
			taxRateId,
			quantity: line.quantity,
			productId: line.productId,
			extendedDescription,
			unitOfMeasureId,
			discount: resolveDiscount(options, lineNumber, node),
			purchasePrice,
			productCategoryId,
			withholdingTaxRateId: config.hasWithholdingTax
				? extractId(options.withholdingTaxRateId) || undefined
				: undefined,
		},
		lineNumber,
		node,
	);
}

/**
 * Hydrate and validate every line across every group, numbering lines 1-based
 * in the flattened order the employee configured them. Groups that end up
 * with no lines are dropped rather than sent as an empty section.
 */
export async function hydrateAndValidateLines(
	context: IExecuteFunctions,
	executionContext: TeamleaderExecutionContext,
	groups: INormalizedGroup[],
	config: ILineDocumentConfig,
	documentCurrency: string | undefined,
): Promise<IHydratedLines> {
	const warnings: string[] = [];
	const groupedLines: ITeamleaderGroupedLineItem[] = [];
	let lineNumber = 0;

	for (const group of groups) {
		const lineItems: ITeamleaderLineItem[] = [];
		for (const line of group.lines) {
			lineNumber += 1;
			lineItems.push(
				await hydrateLine(context, executionContext, line, lineNumber, config, documentCurrency, warnings),
			);
		}
		if (lineItems.length === 0) continue;

		const grouped: ITeamleaderGroupedLineItem = { line_items: lineItems };
		if (group.title) grouped.section = { title: group.title };
		groupedLines.push(grouped);
	}

	return { groupedLines, warnings };
}
