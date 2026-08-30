import type { INodeProperties } from 'n8n-workflow';

import {
	INVOICE_LINE_CONFIG,
	QUOTATION_LINE_CONFIG,
	lineEditorFields,
	lineValueFields,
} from '../nodes/Teamleader/v2/descriptions/LineEditor';
import { assembleLineGroups, countLines } from '../nodes/Teamleader/v2/helpers/lines';

const scope = { resource: 'quotation', operations: ['create'] };

function namesVisibleFor(fields: INodeProperties[], lineType: 'product' | 'custom'): string[] {
	return fields
		.filter((field) => {
			const show = field.displayOptions?.show as Record<string, unknown> | undefined;
			if (!show) return true;
			const lineTypeShow = show.lineType as string[] | undefined;
			return !lineTypeShow || lineTypeShow.includes(lineType);
		})
		.map((field) => field.name);
}

describe('Line row structure', () => {
	const fields = lineValueFields(QUOTATION_LINE_CONFIG);

	it('product mode shows only Product, Quantity, Use Product Defaults and Line Options', () => {
		expect(namesVisibleFor(fields, 'product')).toEqual([
			'lineType',
			'productId',
			'useProductDefaults',
			'quantity',
			'lineOptions',
		]);
	});

	it('does not promote Description/Unit Price/Tax Rate in product mode', () => {
		const visible = namesVisibleFor(fields, 'product');
		expect(visible).not.toContain('description');
		expect(visible).not.toContain('unitPrice');
		expect(visible).not.toContain('taxRateId');
	});

	it('Custom Line exposes Description, Quantity, Unit Price and Tax Rate', () => {
		expect(namesVisibleFor(fields, 'custom')).toEqual([
			'lineType',
			'description',
			'quantity',
			'unitPrice',
			'taxRateId',
			'lineOptions',
		]);
	});

	it('does not force a product onto a custom line', () => {
		const productId = fields.find((field) => field.name === 'productId');
		expect(productId?.displayOptions?.show?.lineType).toEqual(['product']);
	});
});

describe('Line Options member set differs per document', () => {
	function lineOptionNames(config: typeof QUOTATION_LINE_CONFIG): string[] {
		const fields = lineValueFields(config);
		const lineOptions = fields.find((field) => field.name === 'lineOptions');
		return ((lineOptions?.options ?? []) as INodeProperties[]).map((option) => option.name);
	}

	it('Quotation offers Purchase Price but not Product Category or Withholding Tax', () => {
		const names = lineOptionNames(QUOTATION_LINE_CONFIG);
		expect(names).toContain('purchasePrice');
		expect(names).not.toContain('productCategoryId');
		expect(names).not.toContain('withholdingTaxRateId');
	});

	it('Invoice offers Product Category and Withholding Tax but not Purchase Price', () => {
		const names = lineOptionNames(INVOICE_LINE_CONFIG);
		expect(names).toContain('productCategoryId');
		expect(names).toContain('withholdingTaxRateId');
		expect(names).not.toContain('purchasePrice');
	});
});

describe('Section Title / Use Multiple Sections', () => {
	const fields = lineEditorFields(scope, QUOTATION_LINE_CONFIG);

	it('Section Title is not required', () => {
		const sectionTitle = fields.find((field) => field.name === 'sectionTitle');
		expect(sectionTitle?.required).toBeFalsy();
	});

	it('the simple Lines editor is shown only when Use Multiple Sections is off', () => {
		const lines = fields.find((field) => field.name === 'lines');
		expect(lines?.displayOptions?.show?.useSections).toEqual([false]);
	});

	it('the Grouped Lines editor is shown only when Use Multiple Sections is on', () => {
		const groupedLines = fields.find((field) => field.name === 'groupedLines');
		expect(groupedLines?.displayOptions?.show?.useSections).toEqual([true]);
	});
});

describe('assembleLineGroups — simple path', () => {
	it('no section title produces one unnamed group', () => {
		const groups = assembleLineGroups({
			useSections: false,
			lines: { line: [{ lineType: 'custom', description: 'A' }] },
		});
		expect(groups).toHaveLength(1);
		expect(groups[0].title).toBeUndefined();
	});

	it('a section title produces one named group', () => {
		const groups = assembleLineGroups({ useSections: false, sectionTitle: 'Intro', lines: {} });
		expect(groups[0].title).toBe('Intro');
	});

	it('preserves line order exactly as configured', () => {
		const groups = assembleLineGroups({
			useSections: false,
			lines: { line: [{ description: 'First' }, { description: 'Second' }, { description: 'Third' }] },
		});
		expect(groups[0].lines.map((line) => line.description)).toEqual(['First', 'Second', 'Third']);
	});
});

describe('assembleLineGroups — multi-section path', () => {
	it('reads Grouped Lines and preserves group and line order', () => {
		const groups = assembleLineGroups({
			useSections: true,
			groupedLines: {
				group: [
					{ title: 'Group A', lineItems: { item: [{ description: '1' }, { description: '2' }] } },
					{ title: 'Group B', lineItems: { item: [{ description: '3' }] } },
				],
			},
		});
		expect(groups.map((group) => group.title)).toEqual(['Group A', 'Group B']);
		expect(groups[0].lines.map((line) => line.description)).toEqual(['1', '2']);
		expect(groups[1].lines.map((line) => line.description)).toEqual(['3']);
	});
});

describe('countLines', () => {
	it('counts the real line items across every group', () => {
		const groups = assembleLineGroups({
			useSections: true,
			groupedLines: {
				group: [
					{ title: 'A', lineItems: { item: [{ description: '1' }, { description: '2' }] } },
					{ title: 'B', lineItems: { item: [{ description: '3' }] } },
				],
			},
		});
		expect(countLines(groups)).toBe(3);
	});

	it('does not count an empty section shell as a line', () => {
		const groups = assembleLineGroups({
			useSections: true,
			groupedLines: { group: [{ title: 'Empty', lineItems: {} }] },
		});
		expect(groups).toHaveLength(1);
		expect(countLines(groups)).toBe(0);
	});

	it('counts nothing for an untouched editor', () => {
		expect(countLines(assembleLineGroups({ useSections: false, lines: {} }))).toBe(0);
	});
});

describe('Extra display conditions', () => {
	it('layer onto every editor field at once, keeping the useSections rules intact', () => {
		const fields = lineEditorFields(scope, QUOTATION_LINE_CONFIG, { replaceLines: [true] });

		for (const field of fields) {
			expect(field.displayOptions?.show?.replaceLines).toEqual([true]);
		}
		expect(fields.find((field) => field.name === 'lines')?.displayOptions?.show?.useSections).toEqual([
			false,
		]);
		expect(
			fields.find((field) => field.name === 'groupedLines')?.displayOptions?.show?.useSections,
		).toEqual([true]);
	});

	it('adds nothing when no extra condition is given', () => {
		const fields = lineEditorFields(scope, QUOTATION_LINE_CONFIG);
		for (const field of fields) {
			expect(field.displayOptions?.show?.replaceLines).toBeUndefined();
		}
	});
});
