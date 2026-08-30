import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	customerCacheId,
	mailTemplateCacheId,
	resolveCustomer,
	resolveMailTemplates,
	type IResolvedCustomer,
	type IResolvedMailTemplate,
	type TeamleaderExecutionContext,
} from '../../helpers/context';
import { extractId } from '../../helpers/GenericFunctions';
import type { ITeamleaderReference } from '../../helpers/interfaces';
import { extractCollection } from '../../helpers/utils';

/**
 * Shared building blocks for Quotation Send and Invoice Send.
 *
 * The two endpoints look alike and are not:
 *
 *   quotations.send  recipients.to[] = { email_address, customer? }   REQUIRED
 *   invoices.send    recipients.to[] = { email,         customer? }   OPTIONAL
 *
 * That one key difference is why the e-mail key is a parameter here and why
 * both spellings are covered by request-body tests. Getting it wrong means
 * Teamleader silently receives no address.
 *
 * Recipient resolution never falls back to another source: if the source the
 * user picked cannot produce an address, the run fails naming the record. A
 * quotation mailed to the wrong person cannot be recalled.
 */

/** The e-mail property name each endpoint expects inside a recipient entry. */
export type RecipientEmailKey = 'email' | 'email_address';

export interface IRecipientEntry {
	email: string;
	customer?: ITeamleaderReference;
}

/** Turn one resolved recipient into the exact object shape an endpoint wants. */
export function toApiRecipient(entry: IRecipientEntry, emailKey: RecipientEmailKey): IDataObject {
	const recipient: IDataObject = { [emailKey]: entry.email };
	if (entry.customer) recipient.customer = entry.customer;
	return recipient;
}

/**
 * Read a `To`/`CC`/`BCC` fixedCollection into recipient entries.
 * Entries without a usable address are dropped rather than sent as blanks;
 * the caller decides whether an empty result is an error.
 */
export function readRecipientCollection(value: unknown): IRecipientEntry[] {
	return extractCollection(value, 'recipient')
		.map((entry) => {
			const email = typeof entry.email === 'string' ? entry.email.trim() : '';
			if (!email) return undefined;

			const recipient: IRecipientEntry = { email };
			const customerId = extractId(entry.customerId);
			if (customerId) {
				recipient.customer = {
					type: entry.customerType === 'contact' ? 'contact' : 'company',
					id: customerId,
				};
			}
			return recipient;
		})
		.filter((entry): entry is IRecipientEntry => entry !== undefined);
}

/** Build the `recipients` object, omitting empty CC/BCC keys entirely. */
export function buildRecipientsObject(
	to: IRecipientEntry[],
	cc: IRecipientEntry[],
	bcc: IRecipientEntry[],
	emailKey: RecipientEmailKey,
): IDataObject {
	const recipients: IDataObject = {};
	if (to.length > 0) recipients.to = to.map((entry) => toApiRecipient(entry, emailKey));
	if (cc.length > 0) recipients.cc = cc.map((entry) => toApiRecipient(entry, emailKey));
	if (bcc.length > 0) recipients.bcc = bcc.map((entry) => toApiRecipient(entry, emailKey));
	return recipients;
}

/** Describe a customer for an error message, preferring its name over its ID. */
export function describeCustomer(customer: IResolvedCustomer | ITeamleaderReference): string {
	const named = customer as IResolvedCustomer;
	return named.name ? `${named.name} (${customer.type} ${customer.id})` : `${customer.type} ${customer.id}`;
}

/**
 * Resolve one Teamleader customer reference into a recipient, reading the
 * contact/company record at most once per execution. A record without an
 * e-mail address is an error naming that record — never a silent switch to
 * another recipient.
 */
export async function resolveCustomerRecipient(
	context: IExecuteFunctions,
	executionContext: TeamleaderExecutionContext,
	reference: ITeamleaderReference,
	itemIndex: number,
	sourceLabel: string,
): Promise<IRecipientEntry> {
	const type = reference.type === 'contact' ? 'contact' : 'company';
	const resolved = await executionContext.resolve(
		'fromCustomer',
		customerCacheId(type, reference.id),
		() => resolveCustomer(context, type, reference.id),
	);

	if (!resolved.email) {
		throw new NodeOperationError(
			context.getNode(),
			`${sourceLabel} ${describeCustomer(resolved)} has no e-mail address in Teamleader`,
			{
				itemIndex,
				description:
					'Add an e-mail address to that record, or switch Recipient Source to Custom Recipients and type one.',
			},
		);
	}

	return {
		email: resolved.email,
		customer: { type: resolved.type, id: resolved.id },
	};
}

/** Fail with a consistent message when the chosen source produced no recipient. */
export function requireRecipients(
	to: IRecipientEntry[],
	node: INode,
	itemIndex: number,
	sourceLabel: string,
): void {
	if (to.length > 0) return;
	throw new NodeOperationError(node, `No "To" recipient could be determined from ${sourceLabel}`, {
		itemIndex,
		description: 'Add at least one recipient, or choose a different Recipient Source.',
	});
}

/**
 * Look up a chosen mail template inside its type's list.
 *
 * `mailTemplates.list` has no per-ID endpoint, so the template is found in the
 * listed set. A template ID that no longer exists is an error, not a fallback
 * to the first template.
 */
export async function resolveMailTemplate(
	context: IExecuteFunctions,
	executionContext: TeamleaderExecutionContext,
	type: 'invoice' | 'quotation' | 'credit_note' | 'work_order',
	templateId: string,
	itemIndex: number,
): Promise<IResolvedMailTemplate> {
	const templates = await executionContext.resolve(
		'mailTemplates',
		mailTemplateCacheId(type),
		() => resolveMailTemplates(context, type),
	);

	const template = templates.find((entry) => entry.id === templateId);
	if (!template) {
		throw new NodeOperationError(
			context.getNode(),
			`Mail template ${templateId} was not found among your ${type} templates`,
			{
				itemIndex,
				description:
					'It may have been removed or renamed. Pick the template again, or switch to a manual message.',
			},
		);
	}
	return template;
}

/**
 * Teamleader shortcodes look like `#LINK`. Only `#LINK` is documented as being
 * replaced by `quotations.send`; anything else copied out of a template is sent
 * verbatim, so the user is told rather than left to discover it in the mailbox.
 */
export function unresolvedShortcodes(text: string, replacedByApi: string[]): string[] {
	const found = text.match(/#[A-Z][A-Z0-9_]*/g) ?? [];
	const unique = Array.from(new Set(found));
	return unique.filter((code) => !replacedByApi.includes(code));
}
