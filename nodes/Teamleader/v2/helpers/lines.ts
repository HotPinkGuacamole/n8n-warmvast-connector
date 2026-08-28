import type { IDataObject } from 'n8n-workflow';

import { extractId } from '../../helpers/GenericFunctions';
import { extractCollection } from '../../helpers/utils';

/**
 * One normalized line, regardless of whether it came from the simple `Lines`
 * editor or the power-path `Grouped Lines` structure — both read through
 * `lineValueFields()` in `descriptions/LineEditor.ts`, so their raw shape is
 * identical; this just gives it a typed, doc-agnostic name.
 */
export interface INormalizedLine {
	lineType: 'product' | 'custom';
	productId?: string;
	useProductDefaults: boolean;
	quantity: number;
	/** Custom Line only — Teamleader Product hides this field entirely. */
	description?: string;
	/** Custom Line only, always literal (never a hydration candidate). */
	unitPrice?: number;
	/** Custom Line only. */
	taxRateId?: string;
	/** Raw `Line Options` collection value; absent keys mean "not set". */
	lineOptions: IDataObject;
}

export interface INormalizedGroup {
	title?: string;
	lines: INormalizedLine[];
}

function normalizeLineEntry(entry: IDataObject): INormalizedLine {
	const quantity = Number(entry.quantity);

	return {
		lineType: entry.lineType === 'product' ? 'product' : 'custom',
		productId: extractId(entry.productId) || undefined,
		// Declared UI default is `true`; only an explicit `false` turns hydration off.
		useProductDefaults: entry.useProductDefaults !== false,
		quantity: Number.isNaN(quantity) ? 1 : quantity,
		description: typeof entry.description === 'string' && entry.description !== '' ? entry.description : undefined,
		unitPrice: entry.unitPrice === undefined || entry.unitPrice === '' ? undefined : Number(entry.unitPrice),
		taxRateId: extractId(entry.taxRateId) || undefined,
		lineOptions: (entry.lineOptions ?? {}) as IDataObject,
	};
}

/** Read the simple `Lines` fixedCollection value into normalized lines. */
export function normalizeSimpleLines(value: unknown): INormalizedLine[] {
	return extractCollection(value, 'line').map(normalizeLineEntry);
}

/** Read the power-path `Grouped Lines` fixedCollection value into normalized groups. */
export function normalizeGroupedLines(value: unknown): INormalizedGroup[] {
	return extractCollection(value, 'group').map((group) => ({
		title: typeof group.title === 'string' && group.title !== '' ? group.title : undefined,
		lines: extractCollection(group.lineItems, 'item').map(normalizeLineEntry),
	}));
}

/**
 * Single entry point for both editor paths (§E.4 of the spec): power path
 * uses `Grouped Lines` as-is; normal path wraps `Lines` + `Section Title`
 * into the same one-group shape. Line/group order is preserved exactly as
 * entered — nothing here sorts or reorders.
 */
export function assembleLineGroups(params: {
	useSections: boolean;
	sectionTitle?: unknown;
	lines?: unknown;
	groupedLines?: unknown;
}): INormalizedGroup[] {
	if (params.useSections) {
		return normalizeGroupedLines(params.groupedLines);
	}

	const title =
		typeof params.sectionTitle === 'string' && params.sectionTitle !== '' ? params.sectionTitle : undefined;
	return [{ title, lines: normalizeSimpleLines(params.lines) }];
}
