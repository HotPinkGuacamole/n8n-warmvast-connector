import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	resolveDeal,
	type IResolvedDeal,
	type TeamleaderExecutionContext,
} from '../../helpers/context';
import { toApiTemporal } from '../../helpers/dates';
import {
	extractId,
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../../helpers/GenericFunctions';
import type { ITeamleaderGroupedLineItem, ITeamleaderReference } from '../../helpers/interfaces';
import { buildSort, extractCollection, toStringArray } from '../../helpers/utils';
import { INVOICE_LINE_CONFIG } from '../descriptions/LineEditor';
import { resolveCustomerReference } from '../helpers/customer';
import { attachWarnings, hydrateAndValidateLines } from '../helpers/hydration';
import { assembleLineGroups, countLines, type INormalizedGroup } from '../helpers/lines';
import { buildCustomFieldValues } from '../helpers/payload';
import {
	readPaymentTermInput,
	resolvePaymentTerm,
	type ITeamleaderPaymentTerm,
} from '../helpers/paymentTerms';

/**
 * V2 Invoice.
 *
 * The flagship flow is "deal won → draft invoice": the customer and the
 * department come from the deal, read once per execution through the shared
 * `fromDeal` resolver. Every derivation is explicit in the UI and every failure
 * names the record and the field to fill in — nothing is guessed, because an
 * invoice addressed to the wrong customer or dated by the wrong term is a
 * financial error, not a cosmetic one.
 *
 * Endpoint field sets differ and are honoured exactly:
 *   invoices.draft        — full set, `department_id`/`payment_term`/`grouped_lines` required
 *   invoices.update       — same minus `department_id`, everything optional
 *   invoices.updateBooked — ONLY invoicee, payment_term, project_id, grouped_lines,
 *                           invoice_date, note, custom_fields
 */

type InvoiceWriteOperation = 'draft' | 'update' | 'updateBooked';

/** `expected_payment_method` variants that also carry a reference. */
const PAYMENT_METHODS_WITH_REFERENCE = ['sepa_direct_debit', 'direct_debit', 'credit_card'];

/** Build the optional `expected_payment_method` object. */
export function buildExpectedPaymentMethod(advanced: IDataObject): IDataObject | undefined {
	const method = advanced.expectedPaymentMethod;
	if (typeof method !== 'string' || method === '') return undefined;

	const payload: IDataObject = { method };
	const reference = advanced.expectedPaymentReference;
	if (
		PAYMENT_METHODS_WITH_REFERENCE.includes(method) &&
		typeof reference === 'string' &&
		reference.trim() !== ''
	) {
		payload.reference = reference.trim();
	}
	return payload;
}

/** Invoice-level commercial discounts. Teamleader takes plain 0-100 percentages. */
export function buildInvoiceDiscounts(value: unknown): IDataObject[] | undefined {
	const discounts = extractCollection(value, 'discount')
		.filter((entry) => entry.value !== undefined && entry.value !== null && entry.value !== '')
		.map((entry) => {
			const discount: IDataObject = { type: 'percentage', value: Number(entry.value) };
			if (entry.description) discount.description = entry.description;
			return discount;
		})
		.filter((entry) => !Number.isNaN(entry.value as number));

	return discounts.length > 0 ? discounts : undefined;
}

/** The `currency` object; the exchange rate only travels inside it. */
export function buildInvoiceCurrency(advanced: IDataObject): IDataObject | undefined {
	const code = typeof advanced.currency === 'string' ? advanced.currency.trim() : '';
	if (!code) return undefined;

	const currency: IDataObject = { code };
	if (advanced.exchangeRate !== undefined && advanced.exchangeRate !== '') {
		const rate = Number(advanced.exchangeRate);
		if (!Number.isNaN(rate)) currency.exchange_rate = rate;
	}
	return currency;
}

/** Map the V2 filter collection onto the `invoices.list` filter object. */
export function buildInvoiceFilter(filters: IDataObject): IDataObject {
	const filter: IDataObject = {};

	if (filters.term) filter.term = filters.term;
	if (filters.invoiceNumber) filter.invoice_number = filters.invoiceNumber;
	if (filters.purchaseOrderNumber) filter.purchase_order_number = filters.purchaseOrderNumber;
	if (filters.paymentReference) filter.payment_reference = filters.paymentReference;

	const departmentId = extractId(filters.departmentId);
	if (departmentId) filter.department_id = departmentId;

	const dealId = extractId(filters.dealId);
	if (dealId) filter.deal_id = dealId;

	const projectId = extractId(filters.projectId);
	if (projectId) filter.project_id = projectId;

	const subscriptionId = extractId(filters.subscriptionId);
	if (subscriptionId) filter.subscription_id = subscriptionId;

	const ids = toStringArray(filters.ids);
	if (ids.length > 0) filter.ids = ids;

	const status = toStringArray(filters.status);
	if (status.length > 0) filter.status = status;

	const updatedSince = toApiTemporal('updated_since', filters.updatedSince);
	if (updatedSince) filter.updated_since = updatedSince;

	const after = toApiTemporal('invoice_date', filters.invoiceDateAfter);
	if (after) filter.invoice_date_after = after;

	const before = toApiTemporal('invoice_date', filters.invoiceDateBefore);
	if (before) filter.invoice_date_before = before;

	const customer = resolveCustomerReference(filters.customerId, filters.customerType ?? 'company');
	if (customer) filter.customer = customer;

	return filter;
}

/**
 * `invoicee.for_attention_of` is One Of `{name}` / `{contact_id}` and is only
 * built when the user explicitly chose a source. The deal's contact person is
 * never used unless it was asked for by name.
 */
function buildForAttentionOf(
	context: IExecuteFunctions,
	itemIndex: number,
	deal: IResolvedDeal | undefined,
): IDataObject | undefined {
	const source = context.getNodeParameter('forAttentionOfSource', itemIndex, 'none') as string;
	const node = context.getNode();

	if (source === 'contact') {
		const contactId = extractId(context.getNodeParameter('forAttentionOfContactId', itemIndex, ''));
		if (!contactId) {
			throw new NodeOperationError(node, 'Select the contact the invoice is addressed to', {
				itemIndex,
				description: 'Fill in "Attention Contact", or set For Attention Of to Not Set.',
			});
		}
		return { contact_id: contactId };
	}

	if (source === 'name') {
		const name = context.getNodeParameter('forAttentionOfName', itemIndex, '') as string;
		if (!name.trim()) {
			throw new NodeOperationError(node, 'Fill in the attention name', {
				itemIndex,
				description: 'Fill in "Attention Name", or set For Attention Of to Not Set.',
			});
		}
		return { name: name.trim() };
	}

	if (source === 'dealContactPerson') {
		const contactPersonId = deal?.contactPerson?.id;
		if (!contactPersonId) {
			throw new NodeOperationError(
				node,
				`Deal ${deal?.id ?? ''} has no contact person, so the invoice cannot be addressed to one`.trim(),
				{
					itemIndex,
					description:
						'Set a contact person on the deal, or choose another For Attention Of source.',
				},
			);
		}
		return { contact_id: contactPersonId };
	}

	return undefined;
}

/** Read whichever line-editor path the user configured into normalized groups. */
function readLineGroups(context: IExecuteFunctions, itemIndex: number): INormalizedGroup[] {
	return assembleLineGroups({
		useSections: context.getNodeParameter('useSections', itemIndex, false) as boolean,
		sectionTitle: context.getNodeParameter('sectionTitle', itemIndex, ''),
		lines: context.getNodeParameter('lines', itemIndex, {}),
		groupedLines: context.getNodeParameter('groupedLines', itemIndex, {}),
	});
}

/**
 * Resolve the invoicee for Create Draft: either from the deal (one cached
 * `deals.info` read) or from the manual three-mode locator. Also yields the
 * resolved deal so the department and contact person can reuse it.
 */
async function resolveDraftInvoicee(
	context: IExecuteFunctions,
	executionContext: TeamleaderExecutionContext,
	itemIndex: number,
): Promise<{ customer: ITeamleaderReference; deal?: IResolvedDeal }> {
	const node = context.getNode();
	const source = context.getNodeParameter('customerSource', itemIndex, 'fromDeal') as string;

	if (source === 'manual') {
		const customer = resolveCustomerReference(
			context.getNodeParameter('customer', itemIndex),
			context.getNodeParameter('customerType', itemIndex, 'company'),
		);
		if (!customer) {
			throw new NodeOperationError(node, 'Choose the company or contact to invoice', {
				itemIndex,
				description: 'Set "Customer Type" when supplying a raw customer ID or expression.',
			});
		}
		return { customer };
	}

	const dealId = getRequiredId(context, 'dealId', itemIndex);
	const deal = await executionContext.resolve('fromDeal', dealId, (id) =>
		resolveDeal(context, id),
	);

	if (!deal.customer) {
		throw new NodeOperationError(
			node,
			`Could not read a customer from deal ${dealId}, so the invoice has nobody to bill`,
			{
				itemIndex,
				description: 'Set Customer Source to "Select Manually" and choose the customer yourself.',
			},
		);
	}

	return { customer: { type: deal.customer.type, id: deal.customer.id }, deal };
}

/** Department for Create Draft: the explicit field, else the deal's own. */
function resolveDraftDepartment(
	context: IExecuteFunctions,
	itemIndex: number,
	deal: IResolvedDeal | undefined,
): string {
	const explicit = extractId(context.getNodeParameter('departmentId', itemIndex, ''));
	if (explicit) return explicit;

	const fromDeal = deal?.departmentId;
	if (fromDeal) return fromDeal;

	throw new NodeOperationError(context.getNode(), 'Select the department that issues this invoice', {
		itemIndex,
		description: deal
			? `Deal ${deal.id} has no department, so it cannot supply one. Fill in "Department".`
			: 'Teamleader requires a department on every invoice. Fill in "Department".',
	});
}

/** Fields common to draft/update/updateBooked, each limited to what its endpoint accepts. */
interface IInvoiceWriteParts {
	operation: InvoiceWriteOperation;
	advanced: IDataObject;
	paymentTerm?: ITeamleaderPaymentTerm;
	invoicee?: IDataObject;
	groupedLines?: ITeamleaderGroupedLineItem[];
}

function buildInvoiceWriteBody(
	context: IExecuteFunctions,
	itemIndex: number,
	parts: IInvoiceWriteParts,
): IDataObject {
	const { operation, advanced } = parts;
	const booked = operation === 'updateBooked';
	const body: IDataObject = {};

	if (parts.invoicee) body.invoicee = parts.invoicee;
	if (parts.paymentTerm) body.payment_term = parts.paymentTerm;
	if (parts.groupedLines) body.grouped_lines = parts.groupedLines;

	const invoiceDate = toApiTemporal(
		'invoice_date',
		context.getNodeParameter('invoiceDate', itemIndex, ''),
	);
	if (invoiceDate) body.invoice_date = invoiceDate;

	const note = context.getNodeParameter('note', itemIndex, '') as string;
	if (note) body.note = note;

	const projectId = extractId(advanced.projectId);
	if (projectId) body.project_id = projectId;

	const customFields = buildCustomFieldValues(advanced.customFields);
	if (customFields) body.custom_fields = customFields;

	// Everything below is rejected by invoices.updateBooked, so it is never sent
	// there — and V2 does not offer those fields on that operation at all.
	if (booked) return body;

	const purchaseOrderNumber = advanced.purchaseOrderNumber;
	if (typeof purchaseOrderNumber === 'string' && purchaseOrderNumber !== '') {
		body.purchase_order_number = purchaseOrderNumber;
	}

	const currency = buildInvoiceCurrency(advanced);
	if (currency) body.currency = currency;

	const discounts = buildInvoiceDiscounts(advanced.discounts);
	if (discounts) body.discounts = discounts;

	const expectedPaymentMethod = buildExpectedPaymentMethod(advanced);
	if (expectedPaymentMethod) body.expected_payment_method = expectedPaymentMethod;

	const documentTemplateId = extractId(
		context.getNodeParameter('documentTemplateId', itemIndex, ''),
	);
	if (documentTemplateId) body.document_template_id = documentTemplateId;

	return body;
}

/** Default file extension and MIME type per supported download format. */
const DOWNLOAD_FORMATS: Record<string, { extension: string; mimeType: string }> = {
	pdf: { extension: 'pdf', mimeType: 'application/pdf' },
	'ubl/e-fff': { extension: 'xml', mimeType: 'application/xml' },
	'ubl/peppol_bis_3': { extension: 'xml', mimeType: 'application/xml' },
};

export async function executeInvoice(
	this: IExecuteFunctions,
	operation: string,
	i: number,
	executionContext: TeamleaderExecutionContext,
): Promise<IDataObject[] | INodeExecutionData[]> {
	if (operation === 'get') {
		const id = getRequiredId(this, 'invoiceId', i);
		const options = this.getNodeParameter('options', i, {}) as IDataObject;

		const body: IDataObject = { id };
		if (options.includeLateFees) body.includes = 'late_fees';

		const response = await teamleaderApiRequest.call(this, '/invoices.info', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'getAll') {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const options = this.getNodeParameter('options', i, {}) as IDataObject;

		const body: IDataObject = {};
		const filter = buildInvoiceFilter(filters);
		if (Object.keys(filter).length > 0) body.filter = filter;

		const sort = buildSort(extractCollection(options.sort, 'rule'));
		if (sort) body.sort = sort;
		if (options.includeLateFees) body.includes = 'late_fees';

		return await teamleaderFetchList.call(this, '/invoices.list', i, body);
	}

	if (operation === 'draft') {
		const advanced = this.getNodeParameter('advancedOptions', i, {}) as IDataObject;

		const { customer, deal } = await resolveDraftInvoicee(this, executionContext, i);
		const departmentId = resolveDraftDepartment(this, i, deal);

		const invoicee: IDataObject = { customer };
		const forAttentionOf = buildForAttentionOf(this, i, deal);
		if (forAttentionOf) invoicee.for_attention_of = forAttentionOf;

		const paymentTerm = await resolvePaymentTerm(
			this,
			executionContext,
			readPaymentTermInput(this, i),
			i,
		);

		const groups = readLineGroups(this, i);
		if (countLines(groups) === 0) {
			throw new NodeOperationError(this.getNode(), 'Add at least one invoice line.', {
				itemIndex: i,
				description: 'Teamleader requires every invoice to have line items.',
			});
		}

		const hydrated = await hydrateAndValidateLines(
			this,
			executionContext,
			groups,
			INVOICE_LINE_CONFIG,
			typeof advanced.currency === 'string' ? advanced.currency : undefined,
		);

		const body: IDataObject = {
			invoicee,
			department_id: departmentId,
			...buildInvoiceWriteBody(this, i, {
				operation: 'draft',
				advanced,
				paymentTerm,
				groupedLines: hydrated.groupedLines,
			}),
		};

		const response = await teamleaderApiRequest.call(this, '/invoices.draft', body);
		return [attachWarnings((response.data ?? {}) as IDataObject, hydrated.warnings)];
	}

	if (operation === 'update' || operation === 'updateBooked') {
		const id = getRequiredId(this, 'invoiceId', i);
		const advanced = this.getNodeParameter('advancedOptions', i, {}) as IDataObject;
		const replaceLines = this.getNodeParameter('replaceLines', i, false) as boolean;
		const changeInvoicee = this.getNodeParameter('changeInvoicee', i, false) as boolean;

		let invoicee: IDataObject | undefined;
		if (changeInvoicee) {
			const customer = resolveCustomerReference(
				this.getNodeParameter('customer', i),
				this.getNodeParameter('customerType', i, 'company'),
			);
			if (!customer) {
				throw new NodeOperationError(this.getNode(), 'Choose the company or contact to invoice', {
					itemIndex: i,
					description: 'Set "Customer Type" when supplying a raw customer ID or expression.',
				});
			}
			invoicee = { customer };
			const forAttentionOf = buildForAttentionOf(this, i, undefined);
			if (forAttentionOf) invoicee.for_attention_of = forAttentionOf;
		}

		const paymentTermInput = readPaymentTermInput(this, i);
		const paymentTerm =
			paymentTermInput.source === 'keep'
				? undefined
				: await resolvePaymentTerm(this, executionContext, paymentTermInput, i);

		let groupedLines: ITeamleaderGroupedLineItem[] | undefined;
		let warnings: string[] = [];

		// With Replace Lines off nothing about the lines is read, no product is
		// fetched, and no `grouped_lines` key exists — so Teamleader keeps them.
		if (replaceLines) {
			const groups = readLineGroups(this, i);
			if (countLines(groups) === 0) {
				throw new NodeOperationError(
					this.getNode(),
					'Replace Lines is on but no lines were provided. This would empty the invoice.',
					{
						itemIndex: i,
						description:
							'Add the complete replacement line set, or turn Replace Lines off to keep the current lines.',
					},
				);
			}

			const hydrated = await hydrateAndValidateLines(
				this,
				executionContext,
				groups,
				INVOICE_LINE_CONFIG,
				typeof advanced.currency === 'string' ? advanced.currency : undefined,
			);
			groupedLines = hydrated.groupedLines;
			warnings = hydrated.warnings;
		}

		const body: IDataObject = {
			id,
			...buildInvoiceWriteBody(this, i, {
				operation: operation as InvoiceWriteOperation,
				advanced,
				paymentTerm,
				invoicee,
				groupedLines,
			}),
		};

		if (Object.keys(body).length <= 1) {
			throw new NodeOperationError(this.getNode(), 'Fill in at least one field to update', {
				itemIndex: i,
			});
		}

		const endpoint = operation === 'update' ? '/invoices.update' : '/invoices.updateBooked';
		await teamleaderApiRequest.call(this, endpoint, body);
		return [attachWarnings({ success: true, id }, warnings)];
	}

	if (operation === 'book') {
		const id = getRequiredId(this, 'invoiceId', i);
		const on = toApiTemporal('on', this.getNodeParameter('bookDate', i, ''));

		if (!on) {
			throw new NodeOperationError(this.getNode(), 'Fill in the date to book this invoice on', {
				itemIndex: i,
				description: 'Teamleader requires a book date; it is never defaulted for you.',
			});
		}

		await teamleaderApiRequest.call(this, '/invoices.book', { id, on });
		return [{ success: true, id, booked_on: on }];
	}

	if (operation === 'download') {
		const id = getRequiredId(this, 'invoiceId', i);
		const format = this.getNodeParameter('format', i, 'pdf') as string;
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;

		const response = await teamleaderApiRequest.call(this, '/invoices.download', { id, format });
		const data = (response.data ?? {}) as IDataObject;
		const location = data.location as string | undefined;

		if (!location) {
			throw new NodeOperationError(this.getNode(), 'Teamleader did not return a download link', {
				itemIndex: i,
				description: 'The invoice may not be renderable in this format yet.',
			});
		}

		// The endpoint hands back a temporary CDN URL rather than the bytes, so
		// the file itself is fetched separately and returned as binary data.
		const file = await this.helpers.httpRequest({
			method: 'GET',
			url: location,
			encoding: 'arraybuffer',
			json: false,
		});

		const { extension, mimeType } = DOWNLOAD_FORMATS[format] ?? DOWNLOAD_FORMATS.pdf;
		const fileName = `invoice-${id}.${extension}`;

		const binary = await this.helpers.prepareBinaryData(
			Buffer.from(file as Buffer),
			fileName,
			mimeType,
		);

		return [
			{
				json: { id, format, expires: data.expires ?? null, fileName },
				binary: { [binaryPropertyName]: binary },
			},
		];
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for resource "invoice"`,
		{ itemIndex: i },
	);
}
