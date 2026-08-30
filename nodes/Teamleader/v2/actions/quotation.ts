import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	resolveDeal,
	resolveQuotation,
	type TeamleaderExecutionContext,
} from '../../helpers/context';
import { toApiTemporal } from '../../helpers/dates';
import {
	extractId,
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../../helpers/GenericFunctions';
import type { ITeamleaderReference } from '../../helpers/interfaces';
import { extractCollection, toStringArray } from '../../helpers/utils';
import { QUOTATION_LINE_CONFIG } from '../descriptions/LineEditor';
import { attachWarnings, hydrateAndValidateLines } from '../helpers/hydration';
import { assembleLineGroups, countLines, type INormalizedGroup } from '../helpers/lines';
import {
	buildRecipientsObject,
	readRecipientCollection,
	requireRecipients,
	resolveCustomerRecipient,
	resolveMailTemplate,
	unresolvedShortcodes,
	type IRecipientEntry,
} from '../helpers/send';

/**
 * V2 Quotation.
 *
 * Only V2 parameter names are read here; V1's own `v1/actions/quotation.ts`
 * stays untouched and keeps serving saved V1 workflows.
 *
 * Two payload rules are deliberate and load-bearing:
 *  - the department is never sent. `quotations.create`/`.update` have no such
 *    field — Teamleader owns it through the deal — so the V2 `Lookup Department
 *    Override` exists purely to narrow editor dropdowns.
 *  - editor-only values (`lineType`, `useProductDefaults`, `lineOptions`,
 *    `useSections`, `sectionTitle`, `replaceLines`) and hydration warnings are
 *    resolved into the API shape or into the node output, never forwarded.
 */

/** Fields both Create and Update read from Advanced Options plus the top level. */
interface IQuotationWriteFields {
	text: unknown;
	documentTemplateId: unknown;
	expiresAfter: unknown;
	actionAfterExpiry: unknown;
	advanced: IDataObject;
}

/**
 * `currency` is an object with the code and an optional exchange rate.
 * Exchange Rate alone is meaningless to the API — it lives inside this object —
 * so it is only sent together with a currency, exactly as its description says.
 */
export function buildQuotationCurrency(advanced: IDataObject): IDataObject | undefined {
	const code = typeof advanced.currency === 'string' ? advanced.currency.trim() : '';
	if (!code) return undefined;

	const currency: IDataObject = { code };
	if (advanced.exchangeRate !== undefined && advanced.exchangeRate !== '') {
		const rate = Number(advanced.exchangeRate);
		if (!Number.isNaN(rate)) currency.exchange_rate = rate;
	}
	return currency;
}

/**
 * Quotation-level commercial discounts. Teamleader takes these as plain 0-100
 * percentages (the same scale the line discount uses), so nothing is converted.
 */
export function buildCommercialDiscounts(value: unknown): IDataObject[] | undefined {
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

/**
 * The `expiry` object, and only when a date was actually supplied.
 * `Action After Expiry` has a UI default of `none`; sending that on its own
 * would be a mutation the user never asked for, so no date means no expiry key.
 * `expires_after` is date-only per the shared date table.
 */
export function buildQuotationExpiry(
	expiresAfter: unknown,
	actionAfterExpiry: unknown,
): IDataObject | undefined {
	const date = toApiTemporal('expires_after', expiresAfter);
	if (!date) return undefined;

	return {
		expires_after: date,
		action_after_expiry: actionAfterExpiry === 'lock' ? 'lock' : 'none',
	};
}

/** The fields Create and Update share, mapped onto their API names. */
function buildQuotationWriteBody(fields: IQuotationWriteFields): IDataObject {
	const body: IDataObject = {};

	const text = typeof fields.text === 'string' ? fields.text : '';
	if (text) body.text = text;

	const documentTemplateId = extractId(fields.documentTemplateId);
	if (documentTemplateId) body.document_template_id = documentTemplateId;

	const currency = buildQuotationCurrency(fields.advanced);
	if (currency) body.currency = currency;

	const discounts = buildCommercialDiscounts(fields.advanced.discounts);
	if (discounts) body.discounts = discounts;

	const expiry = buildQuotationExpiry(fields.expiresAfter, fields.actionAfterExpiry);
	if (expiry) body.expiry = expiry;

	return body;
}

/** Read whichever line-editor path the user configured into normalized groups. */
function readLineGroups(context: IExecuteFunctions, i: number): INormalizedGroup[] {
	return assembleLineGroups({
		useSections: context.getNodeParameter('useSections', i, false) as boolean,
		sectionTitle: context.getNodeParameter('sectionTitle', i, ''),
		lines: context.getNodeParameter('lines', i, {}),
		groupedLines: context.getNodeParameter('groupedLines', i, {}),
	});
}


/**
 * Quotation Send.
 *
 * Recipients come from exactly one declared source. Deal-based sources walk
 * quotation -> deal -> customer/contact person and read each record once per
 * execution through the shared cache; if that walk cannot produce an e-mail
 * address the run fails naming the record. There is no fallback to another
 * source, because an offer sent to the wrong person cannot be recalled.
 *
 * `quotations.send` uses `email_address` inside every recipient (invoices.send
 * uses `email`) and accepts no `mail_template_id`: a Teamleader template can
 * only be copied into the message here, and only `#LINK` is documented as being
 * replaced by Teamleader.
 */
async function executeQuotationSend(
	context: IExecuteFunctions,
	executionContext: TeamleaderExecutionContext,
	i: number,
): Promise<IDataObject[]> {
	const node = context.getNode();
	const id = getRequiredId(context, 'quotationId', i);
	const recipientSource = context.getNodeParameter(
		'recipientSource',
		i,
		'dealContactPerson',
	) as string;
	const advanced = context.getNodeParameter('advancedOptions', i, {}) as IDataObject;
	const warnings: string[] = [];

	let to: IRecipientEntry[] = [];

	if (recipientSource === 'custom') {
		to = readRecipientCollection(context.getNodeParameter('to', i, {}));
		requireRecipients(to, node, i, 'Custom Recipients');
	} else {
		const quotation = await executionContext.resolve('fromQuotation', id, (quotationId) =>
			resolveQuotation(context, quotationId),
		);
		if (!quotation.dealId) {
			throw new NodeOperationError(
				node,
				`Could not read the deal of quotation ${id}, so its recipients cannot be resolved`,
				{
					itemIndex: i,
					description: 'Set Recipient Source to Custom Recipients and enter the address yourself.',
				},
			);
		}

		const deal = await executionContext.resolve('fromDeal', quotation.dealId, (dealId) =>
			resolveDeal(context, dealId),
		);

		const wantContactPerson = recipientSource === 'dealContactPerson';
		const source = wantContactPerson ? deal.contactPerson : deal.customer;
		const wanted: ITeamleaderReference | undefined = source
			? { type: source.type, id: source.id }
			: undefined;

		if (!wanted) {
			const label = wantContactPerson ? 'contact person' : 'customer';
			throw new NodeOperationError(
				node,
				`Deal ${quotation.dealId} has no ${label}, so the quotation cannot be sent to one`,
				{
					itemIndex: i,
					description: `Set the ${label} on the deal, or choose another Recipient Source.`,
				},
			);
		}

		const sourceLabel = wantContactPerson ? 'Deal contact person' : 'Deal customer';
		to = [await resolveCustomerRecipient(context, executionContext, wanted, i, sourceLabel)];
	}

	// Message: typed here, or copied out of a Teamleader mail template.
	const messageSource = context.getNodeParameter('messageSource', i, 'manual') as string;
	let subject: string;
	let content: string;

	if (messageSource === 'template') {
		const templateId = extractId(context.getNodeParameter('mailTemplateId', i, ''));
		if (!templateId) {
			throw new NodeOperationError(node, 'Select the mail template to send', {
				itemIndex: i,
				description: 'Choose one from "Mail Template", or switch Message Source to Manual Message.',
			});
		}

		const template = await resolveMailTemplate(
			context,
			executionContext,
			'quotation',
			templateId,
			i,
		);
		subject = template.subject ?? '';
		content = template.body ?? '';

		if (!subject || !content) {
			throw new NodeOperationError(
				node,
				`Mail template ${template.name ?? templateId} has no subject or body to send`,
				{
					itemIndex: i,
					description: 'Complete the template in Teamleader, or switch to a manual message.',
				},
			);
		}

		// Only #LINK is documented as replaced by quotations.send; anything else
		// copied out of the template travels verbatim, so say so instead of
		// implying Teamleader renders it.
		const unresolved = unresolvedShortcodes(`${subject}\n${content}`, ['#LINK']);
		if (unresolved.length > 0) {
			warnings.push(
				`Mail template ${template.name ?? templateId} contains ${unresolved.join(', ')}. Teamleader only replaces #LINK when sending a quotation, so the rest was sent as written.`,
			);
		}
	} else {
		subject = context.getNodeParameter('subject', i, '') as string;
		content = context.getNodeParameter('content', i, '') as string;

		if (!subject.trim() || !content.trim()) {
			throw new NodeOperationError(node, 'Fill in both the subject and the message', {
				itemIndex: i,
			});
		}
	}

	const cc = readRecipientCollection(context.getNodeParameter('cc', i, {}));
	const bcc = readRecipientCollection(context.getNodeParameter('bcc', i, {}));

	const quotations = [id, ...toStringArray(advanced.additionalQuotationIds)];

	const body: IDataObject = {
		quotations,
		recipients: buildRecipientsObject(to, cc, bcc, 'email_address'),
		subject,
		content,
		language: context.getNodeParameter('language', i, 'nl'),
	};

	// `from` is all-or-nothing: the API requires both halves together.
	const senderId = extractId(advanced.senderId);
	const senderEmail =
		typeof advanced.senderEmailAddress === 'string' ? advanced.senderEmailAddress.trim() : '';
	if (senderId && senderEmail) {
		body.from = {
			sender: { type: advanced.senderType === 'department' ? 'department' : 'user', id: senderId },
			email_address: senderEmail,
		};
	} else if (senderId || senderEmail) {
		throw new NodeOperationError(
			node,
			'A custom sender needs both a Sender ID and a Sender Email Address',
			{
				itemIndex: i,
				description:
					'Fill in both advanced fields, or leave both empty to use the Teamleader default sender.',
			},
		);
	}

	const attachments = toStringArray(advanced.attachments);
	if (attachments.length > 0) body.attachments = attachments;

	await teamleaderApiRequest.call(context, '/quotations.send', body);
	return [attachWarnings({ success: true, id, quotations }, warnings)];
}

export async function executeQuotation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
	executionContext: TeamleaderExecutionContext,
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
		const advanced = this.getNodeParameter('advancedOptions', i, {}) as IDataObject;
		const text = this.getNodeParameter('text', i, '') as string;

		const groups = readLineGroups(this, i);
		const lineCount = countLines(groups);

		// Checked before any API call, and on real line items rather than on the
		// presence of the fixedCollection: an empty section shell is not content.
		if (lineCount === 0 && text.trim() === '') {
			throw new NodeOperationError(
				this.getNode(),
				'Add at least one line or some quotation text.',
				{
					itemIndex: i,
					description: 'Teamleader needs a quotation to have line items and/or an introduction text.',
				},
			);
		}

		const hydrated =
			lineCount > 0
				? await hydrateAndValidateLines(
						this,
						executionContext,
						groups,
						QUOTATION_LINE_CONFIG,
						typeof advanced.currency === 'string' ? advanced.currency : undefined,
					)
				: undefined;

		const body: IDataObject = {
			deal_id: dealId,
			...buildQuotationWriteBody({
				text,
				documentTemplateId: this.getNodeParameter('documentTemplateId', i, ''),
				expiresAfter: this.getNodeParameter('expiresAfter', i, ''),
				actionAfterExpiry: this.getNodeParameter('actionAfterExpiry', i, 'none'),
				advanced,
			}),
		};

		if (hydrated && hydrated.groupedLines.length > 0) {
			body.grouped_lines = hydrated.groupedLines;
		}

		const response = await teamleaderApiRequest.call(this, '/quotations.create', body);
		// Warnings are attached to the result only once Teamleader has answered.
		return [attachWarnings((response.data ?? {}) as IDataObject, hydrated?.warnings ?? [])];
	}

	if (operation === 'update') {
		const id = getRequiredId(this, 'quotationId', i);
		const replaceLines = this.getNodeParameter('replaceLines', i, false) as boolean;
		const advanced = this.getNodeParameter('advancedOptions', i, {}) as IDataObject;

		const body: IDataObject = {
			id,
			...buildQuotationWriteBody({
				text: this.getNodeParameter('text', i, ''),
				documentTemplateId: this.getNodeParameter('documentTemplateId', i, ''),
				expiresAfter: this.getNodeParameter('expiresAfter', i, ''),
				actionAfterExpiry: this.getNodeParameter('actionAfterExpiry', i, 'none'),
				advanced,
			}),
		};

		let warnings: string[] = [];

		// With Replace Lines off nothing about the lines is read, no product is
		// fetched, and no `grouped_lines` key exists — so Teamleader keeps them.
		if (replaceLines) {
			const groups = readLineGroups(this, i);
			if (countLines(groups) === 0) {
				throw new NodeOperationError(
					this.getNode(),
					'Replace Lines is on but no lines were provided. This would empty the quotation.',
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
				QUOTATION_LINE_CONFIG,
				typeof advanced.currency === 'string' ? advanced.currency : undefined,
			);
			body.grouped_lines = hydrated.groupedLines;
			warnings = hydrated.warnings;
		}

		if (Object.keys(body).length <= 1) {
			throw new NodeOperationError(this.getNode(), 'Fill in at least one field to update', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/quotations.update', body);
		return [attachWarnings({ success: true, id }, warnings)];
	}

	if (operation === 'send') {
		return await executeQuotationSend(this, executionContext, i);
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
