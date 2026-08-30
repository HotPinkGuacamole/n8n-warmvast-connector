import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import { searchInvoices, searchQuotations } from '../nodes/Teamleader/methods/listSearch';
import { Teamleader } from '../nodes/Teamleader/Teamleader.node';
import { companyFields } from '../nodes/Teamleader/v1/descriptions/CompanyDescription';
import { contactFields } from '../nodes/Teamleader/v1/descriptions/ContactDescription';
import { dealFields } from '../nodes/Teamleader/v1/descriptions/DealDescription';
import { invoiceFields } from '../nodes/Teamleader/v1/descriptions/InvoiceDescription';
import { productFields } from '../nodes/Teamleader/v1/descriptions/ProductDescription';
import { quotationFields } from '../nodes/Teamleader/v1/descriptions/QuotationDescription';

jest.mock('../nodes/Teamleader/helpers/GenericFunctions', () => {
	const actual = jest.requireActual('../nodes/Teamleader/helpers/GenericFunctions');
	return { ...actual, teamleaderApiRequest: jest.fn() };
});

const apiRequest = generic.teamleaderApiRequest as unknown as jest.Mock;

/**
 * V1 compatibility.
 *
 * V1 is frozen: its own files are byte-identical to the v1.0.0 release apart
 * from the import depth caused by moving them into `v1/`. What this suite
 * protects is the part that cannot be proven by comparing files — the shared
 * infrastructure V1 still calls into, which V2 keeps extending.
 */

const v1 = new Teamleader().getNodeType(1);
const v1Fields: INodeProperties[] = [
	...contactFields,
	...companyFields,
	...dealFields,
	...productFields,
	...quotationFields,
	...invoiceFields,
];

describe('V1 keeps its full surface', () => {
	it('still offers every V1 resource', () => {
		const resource = v1.description.properties.find((property) => property.name === 'resource');
		expect(
			(resource?.options ?? []).map((option) => (option as INodePropertyOptions).value).sort(),
		).toEqual(['company', 'contact', 'deal', 'invoice', 'product', 'quotation']);
	});

	it('still offers Quotation Send, which V2 gained only in Stage 7', () => {
		const operations = v1.description.properties.filter(
			(property) =>
				property.name === 'operation' &&
				(property.displayOptions?.show?.resource as string[] | undefined)?.includes('quotation'),
		);
		const values = operations.flatMap((property) =>
			(property.options ?? []).map((option) => (option as INodePropertyOptions).value),
		);
		expect(values).toContain('send');
	});

	it('still offers every V1 invoice operation', () => {
		const operations = v1.description.properties.filter(
			(property) =>
				property.name === 'operation' &&
				(property.displayOptions?.show?.resource as string[] | undefined)?.includes('invoice'),
		);
		const values = operations
			.flatMap((property) =>
				(property.options ?? []).map((option) => (option as INodePropertyOptions).value as string),
			)
			.sort();

		expect(values).toEqual([
			'book',
			'credit',
			'creditPartially',
			'download',
			'draft',
			'get',
			'getAll',
			'registerPayment',
			'removePayments',
			'send',
			'update',
			'updateBooked',
		]);
	});

	it('keeps its own parameter names, untouched by the V2 renames', () => {
		const names = new Set(v1Fields.map((field) => field.name));
		// V1's collections stay `additionalFields` / `updateFields`; V2's
		// `advancedOptions` never appears here.
		expect(names.has('additionalFields')).toBe(true);
		expect(names.has('updateFields')).toBe(true);
		expect(names.has('advancedOptions')).toBe(false);
		// V2-only concepts must not have leaked into V1.
		for (const v2Only of [
			'customerSource',
			'paymentTermSource',
			'recipientSource',
			'replaceLines',
			'useSections',
			'lookupDepartmentId',
			'messageSource',
			'amountSource',
		]) {
			expect(names.has(v2Only)).toBe(false);
		}
	});
});

describe('shared list-search changes cannot reach V1', () => {
	beforeEach(() => {
		apiRequest.mockReset();
		apiRequest.mockResolvedValue({ data: [] });
	});

	const context = { getNode: () => ({ name: 'Teamleader' }) } as never;

	it('leaves V1 quotation and invoice pickers non-searchable, so no term is ever passed', () => {
		for (const [fields, method] of [
			[quotationFields, 'searchQuotations'],
			[invoiceFields, 'searchInvoices'],
		] as const) {
			const locator = fields.find((field) => field.type === 'resourceLocator');
			const listMode = (locator?.modes ?? []).find((mode) => mode.name === 'list');
			expect(listMode?.typeOptions?.searchListMethod).toBe(method);
			// n8n only sends a filter term when the mode declares itself searchable.
			expect(listMode?.typeOptions?.searchable).toBe(false);
		}
	});

	it('keeps the un-termed quotation search request identical to V1 behaviour', async () => {
		await searchQuotations.call(context);
		expect(apiRequest.mock.calls[0][1]).toMatchObject({ filter: {} });
	});

	it('keeps the un-termed invoice search request identical to V1 behaviour', async () => {
		await searchInvoices.call(context);
		expect(apiRequest.mock.calls[0][1]).toMatchObject({ filter: {} });
	});
});

describe('a fresh node is V2, an existing one stays V1', () => {
	it('defaults to version 2 while still resolving version 1', () => {
		const node = new Teamleader();
		expect(node.description.defaultVersion).toBe(2);
		expect(node.getNodeType(1).description.version).toBe(1);
		expect(node.getNodeType(2).description.version).toBe(2);
	});
});
