import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	extractId,
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../../helpers/GenericFunctions';
import type { ITeamleaderGroupedLineItem, ITeamleaderLineItem } from '../../helpers/interfaces';
import {
	buildCustomFields,
	buildCustomer,
	buildMoney,
	buildSort,
	cleanObject,
	extractCollection,
	toApiDate,
	toStringArray,
} from '../../helpers/utils';
import { buildCommercialDiscounts } from './quotation';

/** Build a single invoice line item from its fixedCollection entry. */
export function buildInvoiceLineItem(entry: IDataObject): ITeamleaderLineItem {
	const quantity = Number(entry.quantity);
	const amount = Number(entry.unitPrice);

	const item: ITeamleaderLineItem = {
		quantity: Number.isNaN(quantity) ? 0 : quantity,
		description: (entry.description as string) ?? '',
		unit_price: { amount: Number.isNaN(amount) ? 0 : amount, tax: 'excluding' },
		tax_rate_id: extractId(entry.taxRateId),
	};

	const productId = extractId(entry.productId);
	if (productId) item.product_id = productId;

	const unitOfMeasureId = extractId(entry.unitOfMeasureId);
	if (unitOfMeasureId) item.unit_of_measure_id = unitOfMeasureId;

	const productCategoryId = extractId(entry.productCategoryId);
	if (productCategoryId) item.product_category_id = productCategoryId;

	const withholdingTaxRateId = extractId(entry.withholdingTaxRateId);
	if (withholdingTaxRateId) item.withholding_tax_rate_id = withholdingTaxRateId;

	if (entry.extendedDescription) {
		item.extended_description = entry.extendedDescription as string;
	}

	if (entry.discount !== undefined && entry.discount !== '' && entry.discount !== null) {
		const value = Number(entry.discount);
		if (!Number.isNaN(value) && value !== 0) item.discount = { value, type: 'percentage' };
	}

	return item;
}

/** Convert the grouped-lines fixedCollection into the API `grouped_lines` array. */
export function buildInvoiceGroupedLines(value: unknown): ITeamleaderGroupedLineItem[] | undefined {
	const groups = extractCollection(value, 'group');

	const result = groups
		.map((group) => {
			const lineItems = extractCollection(group.lineItems, 'item')
				.filter((entry) => entry.description !== undefined && entry.description !== '')
				.map(buildInvoiceLineItem);

			const grouped: ITeamleaderGroupedLineItem = { line_items: lineItems };
			if (group.title) grouped.section = { title: group.title as string };
			return grouped;
		})
		.filter((group) => group.line_items.length > 0);

	return result.length > 0 ? result : undefined;
}

/** Build the inline `payment_term` object ({ type, days }). */
export function buildPaymentTerm(fields: IDataObject): IDataObject | undefined {
	const type = fields.paymentTermType as string | undefined;
	if (!type) return undefined;

	const term: IDataObject = { type };
	if (type !== 'cash' && fields.paymentTermDays !== undefined && fields.paymentTermDays !== '') {
		const days = Number(fields.paymentTermDays);
		if (!Number.isNaN(days)) term.days = days;
	}
	return term;
}

/** Build the optional `expected_payment_method` object. */
export function buildExpectedPaymentMethod(fields: IDataObject): IDataObject | undefined {
	const method = fields.expectedPaymentMethod as string | undefined;
	if (!method) return undefined;

	const withReference = ['sepa_direct_debit', 'direct_debit', 'credit_card'];
	const payload: IDataObject = { method };
	if (withReference.includes(method) && fields.expectedPaymentReference) {
		payload.reference = fields.expectedPaymentReference;
	}
	return payload;
}

/** Build the `invoicee` object (customer + optional for_attention_of). */
export function buildInvoicee(
	customerType: unknown,
	customerId: unknown,
	fields: IDataObject = {},
): IDataObject | undefined {
	const customer = buildCustomer(customerType, extractId(customerId));
	if (!customer) return undefined;

	const invoicee: IDataObject = { customer };

	const attentionContactId = extractId(fields.forAttentionOfContactId);
	if (attentionContactId) {
		invoicee.for_attention_of = { contact_id: attentionContactId };
	} else if (fields.forAttentionOfName) {
		invoicee.for_attention_of = { name: fields.forAttentionOfName };
	}

	return invoicee;
}

/**
 * Map the draft/update collections onto the invoices.draft / invoices.update payload.
 *
 * `booked` limits the payload to the fields invoices.updateBooked accepts.
 */
export function buildInvoicePayload(fields: IDataObject, booked = false): IDataObject {
	const payload: IDataObject = {
		project_id: extractId(fields.projectId) || undefined,
		purchase_order_number: fields.purchaseOrderNumber,
		note: fields.note,
	};

	const invoiceDate = toApiDate(fields.invoiceDate);
	if (invoiceDate) payload.invoice_date = invoiceDate;

	const paymentTerm = buildPaymentTerm(fields);
	if (paymentTerm) payload.payment_term = paymentTerm;

	const groupedLines = buildInvoiceGroupedLines(fields.groupedLines);
	if (groupedLines) payload.grouped_lines = groupedLines;

	const customFields = buildCustomFields(fields.customFields);
	if (customFields) payload.custom_fields = customFields;

	if (!booked) {
		const currency = (fields.currency as string) || '';
		if (currency) {
			const currencyObject: IDataObject = { code: currency };
			if (fields.exchangeRate !== undefined && fields.exchangeRate !== '') {
				const rate = Number(fields.exchangeRate);
				if (!Number.isNaN(rate)) currencyObject.exchange_rate = rate;
			}
			payload.currency = currencyObject;
		}

		const documentTemplateId = extractId(fields.documentTemplateId);
		if (documentTemplateId) payload.document_template_id = documentTemplateId;

		const discounts = buildCommercialDiscounts(fields.discounts);
		if (discounts) payload.discounts = discounts;

		const expectedPaymentMethod = buildExpectedPaymentMethod(fields);
		if (expectedPaymentMethod) payload.expected_payment_method = expectedPaymentMethod;
	} else {
		// invoices.updateBooked does not accept purchase_order_number.
		delete payload.purchase_order_number;
	}

	return cleanObject(payload);
}

/** Map the filters collection onto the invoices.list filter object. */
export function buildInvoiceFilter(filters: IDataObject): IDataObject {
	const filter: IDataObject = {};

	if (filters.term) filter.term = filters.term;
	if (filters.invoiceNumber) filter.invoice_number = filters.invoiceNumber;
	if (filters.purchaseOrderNumber) filter.purchase_order_number = filters.purchaseOrderNumber;
	if (filters.paymentReference) filter.payment_reference = filters.paymentReference;
	if (filters.updatedSince) filter.updated_since = filters.updatedSince;

	const departmentId = extractId(filters.departmentId);
	if (departmentId) filter.department_id = departmentId;

	const dealId = extractId(filters.dealId);
	if (dealId) filter.deal_id = dealId;

	const projectId = extractId(filters.projectId);
	if (projectId) filter.project_id = projectId;

	const customer = buildCustomer(filters.customerType, extractId(filters.customerId));
	if (customer) filter.customer = customer;

	const ids = toStringArray(filters.ids);
	if (ids.length > 0) filter.ids = ids;

	const status = toStringArray(filters.status);
	if (status.length > 0) filter.status = status;

	const after = toApiDate(filters.invoiceDateAfter);
	if (after) filter.invoice_date_after = after;

	const before = toApiDate(filters.invoiceDateBefore);
	if (before) filter.invoice_date_before = before;

	return filter;
}

/** Build one recipient entry for invoices.send ({ email, customer? }). */
function buildSendRecipient(entry: IDataObject): IDataObject | undefined {
	const email = (entry.email as string) ?? '';
	if (!email.trim()) return undefined;

	const recipient: IDataObject = { email: email.trim() };
	const customerId = extractId(entry.customerId);
	if (customerId) {
		recipient.customer = {
			type: entry.customerType === 'contact' ? 'contact' : 'company',
			id: customerId,
		};
	}
	return recipient;
}

/** Build the full invoices.send payload. */
export function buildInvoiceSendPayload(
	id: string,
	subject: string,
	bodyText: string,
	options: IDataObject,
): IDataObject {
	const content: IDataObject = { subject, body: bodyText };
	const mailTemplateId = extractId(options.mailTemplateId);
	if (mailTemplateId) content.mail_template_id = mailTemplateId;

	const body: IDataObject = { id, content };

	const recipients: IDataObject = {};
	for (const key of ['to', 'cc', 'bcc'] as const) {
		const entries = extractCollection(options[key], 'recipient')
			.map(buildSendRecipient)
			.filter((entry): entry is IDataObject => entry !== undefined);
		if (entries.length > 0) recipients[key] = entries;
	}
	if (Object.keys(recipients).length > 0) body.recipients = recipients;

	const attachments = toStringArray(options.attachments);
	if (attachments.length > 0) body.attachments = attachments;

	return body;
}

/** Default file extension per supported download format. */
const DOWNLOAD_EXTENSIONS: Record<string, { extension: string; mimeType: string }> = {
	pdf: { extension: 'pdf', mimeType: 'application/pdf' },
	'ubl/e-fff': { extension: 'xml', mimeType: 'application/xml' },
	'ubl/peppol_bis_3': { extension: 'xml', mimeType: 'application/xml' },
};

export async function executeInvoice(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[] | INodeExecutionData[]> {
	if (operation === 'get') {
		const id = getRequiredId(this, 'invoiceId', i);
		const response = await teamleaderApiRequest.call(this, '/invoices.info', { id });
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
		const customerType = this.getNodeParameter('customerType', i) as string;
		const customerId = getRequiredId(this, 'customerId', i);
		const departmentId = extractId(this.getNodeParameter('departmentId', i));
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

		if (!departmentId) {
			throw new NodeOperationError(this.getNode(), 'A department is required to draft an invoice', {
				itemIndex: i,
			});
		}

		const payload = buildInvoicePayload(additionalFields);

		if (!payload.grouped_lines) {
			throw new NodeOperationError(this.getNode(), 'At least one invoice line is required', {
				itemIndex: i,
			});
		}
		if (!payload.payment_term) {
			throw new NodeOperationError(this.getNode(), 'A payment term is required', { itemIndex: i });
		}

		const body: IDataObject = {
			...payload,
			invoicee: buildInvoicee(customerType, customerId, additionalFields),
			department_id: departmentId,
		};

		const response = await teamleaderApiRequest.call(this, '/invoices.draft', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'update' || operation === 'updateBooked') {
		const id = getRequiredId(this, 'invoiceId', i);
		const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
		const updateCustomer = this.getNodeParameter('updateCustomer', i, false) as boolean;

		const body: IDataObject = {
			id,
			...buildInvoicePayload(updateFields, operation === 'updateBooked'),
		};

		if (updateCustomer) {
			const customerType = this.getNodeParameter('customerType', i) as string;
			const customerId = getRequiredId(this, 'customerId', i);
			body.invoicee = buildInvoicee(customerType, customerId, updateFields);
		}

		if (Object.keys(body).length === 1) {
			throw new NodeOperationError(this.getNode(), 'Select at least one field to update', {
				itemIndex: i,
			});
		}

		const endpoint = operation === 'update' ? '/invoices.update' : '/invoices.updateBooked';
		await teamleaderApiRequest.call(this, endpoint, body);
		return [{ success: true, id }];
	}

	if (operation === 'book') {
		const id = getRequiredId(this, 'invoiceId', i);
		const on = toApiDate(this.getNodeParameter('bookDate', i));

		if (!on) {
			throw new NodeOperationError(this.getNode(), 'A valid booking date is required', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/invoices.book', { id, on });
		return [{ success: true, id, booked_on: on }];
	}

	if (operation === 'send') {
		const id = getRequiredId(this, 'invoiceId', i);
		const subject = this.getNodeParameter('subject', i) as string;
		const bodyText = this.getNodeParameter('body', i) as string;
		const options = this.getNodeParameter('sendOptions', i, {}) as IDataObject;

		const body = buildInvoiceSendPayload(id, subject, bodyText, options);

		await teamleaderApiRequest.call(this, '/invoices.send', body);
		return [{ success: true, id }];
	}

	if (operation === 'registerPayment') {
		const id = getRequiredId(this, 'invoiceId', i);
		const amount = this.getNodeParameter('amount', i) as number;
		const currency = this.getNodeParameter('currency', i, 'EUR') as string;
		const paidAt = this.getNodeParameter('paidAt', i) as string;
		const paymentMethodId = extractId(this.getNodeParameter('paymentMethodId', i, ''));

		const payment = buildMoney(amount, currency);
		if (!payment) {
			throw new NodeOperationError(this.getNode(), 'A valid payment amount is required', {
				itemIndex: i,
			});
		}
		if (!paidAt) {
			throw new NodeOperationError(this.getNode(), 'A payment date is required', { itemIndex: i });
		}

		const body: IDataObject = { id, payment, paid_at: paidAt };
		if (paymentMethodId) body.payment_method_id = paymentMethodId;

		await teamleaderApiRequest.call(this, '/invoices.registerPayment', body);
		return [{ success: true, id, payment }];
	}

	if (operation === 'removePayments') {
		const id = getRequiredId(this, 'invoiceId', i);
		await teamleaderApiRequest.call(this, '/invoices.removePayments', { id });
		return [{ success: true, id, paid: false }];
	}

	if (operation === 'credit') {
		const id = getRequiredId(this, 'invoiceId', i);
		const options = this.getNodeParameter('options', i, {}) as IDataObject;

		const body: IDataObject = { id };
		const creditNoteDate = toApiDate(options.creditNoteDate);
		if (creditNoteDate) body.credit_note_date = creditNoteDate;

		const response = await teamleaderApiRequest.call(this, '/invoices.credit', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'creditPartially') {
		const id = getRequiredId(this, 'invoiceId', i);
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

		const groupedLines = buildInvoiceGroupedLines(additionalFields.groupedLines);
		if (!groupedLines) {
			throw new NodeOperationError(
				this.getNode(),
				'At least one line is required to partially credit an invoice',
				{ itemIndex: i },
			);
		}

		const body: IDataObject = { id, grouped_lines: groupedLines };

		const creditNoteDate = toApiDate(additionalFields.creditNoteDate);
		if (creditNoteDate) body.credit_note_date = creditNoteDate;

		const discounts = buildCommercialDiscounts(additionalFields.discounts);
		if (discounts) body.discounts = discounts;

		const response = await teamleaderApiRequest.call(this, '/invoices.creditPartially', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'download') {
		const id = getRequiredId(this, 'invoiceId', i);
		const format = this.getNodeParameter('format', i, 'pdf') as string;
		const binaryProperty = this.getNodeParameter('binaryPropertyName', i, 'data') as string;

		const response = await teamleaderApiRequest.call(this, '/invoices.download', { id, format });
		const data = (response.data ?? {}) as IDataObject;
		const location = data.location as string | undefined;

		if (!location) {
			throw new NodeOperationError(this.getNode(), 'Teamleader did not return a download link', {
				itemIndex: i,
			});
		}

		const file = await this.helpers.httpRequest({
			method: 'GET',
			url: location,
			encoding: 'arraybuffer',
			json: false,
		});

		const { extension, mimeType } = DOWNLOAD_EXTENSIONS[format] ?? DOWNLOAD_EXTENSIONS.pdf;
		const fileName = `invoice-${id}.${extension}`;

		const binary = await this.helpers.prepareBinaryData(
			Buffer.from(file as Buffer),
			fileName,
			mimeType,
		);

		return [
			{
				json: { id, format, expires: data.expires ?? null, fileName },
				binary: { [binaryProperty]: binary },
			},
		];
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for resource "invoice"`,
		{ itemIndex: i },
	);
}
