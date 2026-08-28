import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	extractId,
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../helpers/GenericFunctions';
import type { ITeamleaderGroupedLineItem, ITeamleaderLineItem } from '../helpers/interfaces';
import {
	buildMoney,
	cleanObject,
	extractCollection,
	toApiDate,
	toStringArray,
} from '../helpers/utils';

/** Build a single quotation line item from its fixedCollection entry. */
export function buildLineItem(entry: IDataObject, currency?: string): ITeamleaderLineItem {
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

	if (entry.extendedDescription) {
		item.extended_description = entry.extendedDescription as string;
	}

	if (entry.discount !== undefined && entry.discount !== '' && entry.discount !== null) {
		const value = Number(entry.discount);
		if (!Number.isNaN(value) && value !== 0) item.discount = { value, type: 'percentage' };
	}

	const purchasePrice = buildMoney(entry.purchasePrice, currency);
	if (purchasePrice) item.purchase_price = purchasePrice;

	return item;
}

/**
 * Convert the grouped-lines fixedCollection into the API `grouped_lines` array.
 *
 * Each group carries an optional section title plus its own line items.
 */
export function buildGroupedLines(
	value: unknown,
	currency?: string,
): ITeamleaderGroupedLineItem[] | undefined {
	const groups = extractCollection(value, 'group');

	const result = groups
		.map((group) => {
			const lineItems = extractCollection(group.lineItems, 'item')
				.filter((entry) => entry.description !== undefined && entry.description !== '')
				.map((entry) => buildLineItem(entry, currency));

			const grouped: ITeamleaderGroupedLineItem = { line_items: lineItems };
			if (group.title) grouped.section = { title: group.title as string };
			return grouped;
		})
		.filter((group) => group.line_items.length > 0);

	return result.length > 0 ? result : undefined;
}

/** Convert the quotation-level discounts fixedCollection into `discounts`. */
export function buildCommercialDiscounts(value: unknown): IDataObject[] | undefined {
	const raw = extractCollection(value, 'discount');

	const discounts = raw
		.filter((entry) => entry.value !== undefined && entry.value !== '')
		.map((entry) => {
			const discount: IDataObject = { type: 'percentage', value: Number(entry.value) };
			if (entry.description) discount.description = entry.description;
			return discount;
		})
		.filter((entry) => !Number.isNaN(entry.value as number));

	return discounts.length > 0 ? discounts : undefined;
}

/** Build the optional `expiry` object. */
export function buildExpiry(fields: IDataObject): IDataObject | undefined {
	const expiresAfter = toApiDate(fields.expiresAfter);
	const action = fields.actionAfterExpiry as string | undefined;

	if (!expiresAfter && !action) return undefined;

	const expiry: IDataObject = { action_after_expiry: action || 'none' };
	if (expiresAfter) expiry.expires_after = expiresAfter;
	return expiry;
}

/** Map the create/update collections onto the quotations.create/update payload. */
export function buildQuotationPayload(fields: IDataObject): IDataObject {
	const currency = (fields.currency as string) || undefined;

	const payload: IDataObject = {
		text: fields.text,
		document_template_id: extractId(fields.documentTemplateId) || undefined,
	};

	if (currency) {
		const currencyObject: IDataObject = { code: currency };
		if (fields.exchangeRate !== undefined && fields.exchangeRate !== '') {
			const rate = Number(fields.exchangeRate);
			if (!Number.isNaN(rate)) currencyObject.exchange_rate = rate;
		}
		payload.currency = currencyObject;
	}

	const groupedLines = buildGroupedLines(fields.groupedLines, currency);
	if (groupedLines) payload.grouped_lines = groupedLines;

	const discounts = buildCommercialDiscounts(fields.discounts);
	if (discounts) payload.discounts = discounts;

	const expiry = buildExpiry(fields);
	if (expiry) payload.expiry = expiry;

	return cleanObject(payload);
}

/** Build one recipient entry ({ email_address, customer? }). */
function buildRecipient(entry: IDataObject): IDataObject | undefined {
	const email = (entry.emailAddress as string) ?? '';
	if (!email.trim()) return undefined;

	const recipient: IDataObject = { email_address: email.trim() };
	const customerId = extractId(entry.customerId);
	if (customerId) {
		recipient.customer = {
			type: entry.customerType === 'contact' ? 'contact' : 'company',
			id: customerId,
		};
	}
	return recipient;
}

/** Build the `recipients` object for quotations.send. */
export function buildRecipients(fields: IDataObject): IDataObject {
	const recipients: IDataObject = {};

	for (const [key, inner] of [
		['to', 'recipient'],
		['cc', 'recipient'],
		['bcc', 'recipient'],
	] as const) {
		const entries = extractCollection(fields[key], inner)
			.map(buildRecipient)
			.filter((entry): entry is IDataObject => entry !== undefined);
		if (entries.length > 0) recipients[key] = entries;
	}

	return recipients;
}

/** Build the full quotations.send payload. */
export function buildSendPayload(
	quotationIds: string[],
	subject: string,
	content: string,
	language: string,
	options: IDataObject,
): IDataObject {
	const body: IDataObject = {
		quotations: quotationIds,
		subject,
		content,
		language,
		recipients: buildRecipients(options),
	};

	const senderId = extractId(options.senderId);
	const senderEmail = (options.senderEmailAddress as string) ?? '';
	if (senderId && senderEmail.trim()) {
		body.from = {
			sender: { type: options.senderType === 'department' ? 'department' : 'user', id: senderId },
			email_address: senderEmail.trim(),
		};
	}

	const attachments = toStringArray(options.attachments);
	if (attachments.length > 0) body.attachments = attachments;

	return body;
}

export async function executeQuotation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	if (operation === 'get') {
		const id = getRequiredId(this, 'quotationId', i);
		const options = this.getNodeParameter('options', i, {}) as IDataObject;

		const body: IDataObject = { id };
		if (options.includeExpiry) body.includes = 'expiry';

		const response = await teamleaderApiRequest.call(this, '/quotations.info', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'getAll') {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const options = this.getNodeParameter('options', i, {}) as IDataObject;

		const body: IDataObject = {};
		const ids = toStringArray(filters.ids);
		if (ids.length > 0) body.filter = { ids };
		if (options.includeExpiry) body.includes = 'expiry';

		return await teamleaderFetchList.call(this, '/quotations.list', i, body);
	}

	if (operation === 'create') {
		const dealId = getRequiredId(this, 'dealId', i);
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

		const body: IDataObject = { deal_id: dealId, ...buildQuotationPayload(additionalFields) };

		if (!body.grouped_lines && !body.text) {
			throw new NodeOperationError(
				this.getNode(),
				'A quotation needs at least grouped line items or a text',
				{ itemIndex: i },
			);
		}

		const response = await teamleaderApiRequest.call(this, '/quotations.create', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'update') {
		const id = getRequiredId(this, 'quotationId', i);
		const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;

		const body: IDataObject = { id, ...buildQuotationPayload(updateFields) };

		if (Object.keys(body).length === 1) {
			throw new NodeOperationError(this.getNode(), 'Select at least one field to update', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/quotations.update', body);
		return [{ success: true, id }];
	}

	if (operation === 'send') {
		const id = getRequiredId(this, 'quotationId', i);
		const subject = this.getNodeParameter('subject', i) as string;
		const content = this.getNodeParameter('content', i) as string;
		const language = this.getNodeParameter('language', i) as string;
		const options = this.getNodeParameter('sendOptions', i, {}) as IDataObject;

		const extraIds = toStringArray(options.additionalQuotationIds);
		const body = buildSendPayload([id, ...extraIds], subject, content, language, options);

		const recipients = body.recipients as IDataObject;
		if (!Array.isArray(recipients.to) || recipients.to.length === 0) {
			throw new NodeOperationError(this.getNode(), 'At least one "To" recipient is required', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/quotations.send', body);
		return [{ success: true, id, quotations: body.quotations }];
	}

	if (operation === 'accept') {
		const id = getRequiredId(this, 'quotationId', i);
		await teamleaderApiRequest.call(this, '/quotations.accept', { id });
		return [{ success: true, id, status: 'accepted' }];
	}

	if (operation === 'delete') {
		const id = getRequiredId(this, 'quotationId', i);
		await teamleaderApiRequest.call(this, '/quotations.delete', { id });
		return [{ success: true, id }];
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for resource "quotation"`,
		{ itemIndex: i },
	);
}
