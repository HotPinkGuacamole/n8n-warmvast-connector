import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	PAYMENT_TERMS_CACHE_ID,
	resolvePaymentTerms,
	type TeamleaderExecutionContext,
} from '../../helpers/context';
import { extractId } from '../../helpers/GenericFunctions';

/**
 * Payment term resolution for `invoices.draft` / `.update` / `.updateBooked`.
 *
 * Teamleader takes the term inline as `{ type, days? }` — never as an ID — so a
 * picked term has to be looked up and translated. Three explicit sources, no
 * guessing anywhere:
 *
 *  - `default`  : the term Teamleader itself marks as the account default
 *                 (`paymentTerms.list` → `meta.default`). If Teamleader does
 *                 not report one, this errors instead of picking a term.
 *  - `select`   : a term chosen from the account's list, translated to its
 *                 own type/days.
 *  - `custom`   : type and days typed by hand.
 *
 * `days` is only meaningful for `end_of_month` and `after_invoice_date`; the
 * API documents it as "not required when type is 'cash'", so it is never sent
 * for a cash term.
 */

/**
 * `keep` exists only on the update operations: it means "do not touch the
 * payment term of this invoice", so no `payment_term` key is sent at all.
 */
export type PaymentTermSource = 'default' | 'select' | 'custom' | 'keep';

/** The exact object shape the API expects. */
export interface ITeamleaderPaymentTerm {
	type: string;
	days?: number;
}

export const PAYMENT_TERM_TYPES = ['cash', 'end_of_month', 'after_invoice_date'] as const;

/** Human labels for the three API types, used in errors and in the UI. */
export const PAYMENT_TERM_TYPE_LABELS: Record<string, string> = {
	cash: 'Cash',
	end_of_month: 'End of month',
	after_invoice_date: 'After invoice date',
};

/** Describe a term the way a person reads it, e.g. "After invoice date + 30 days". */
export function describePaymentTerm(term: { type: string; days?: number }): string {
	const label = PAYMENT_TERM_TYPE_LABELS[term.type] ?? term.type.replace(/_/g, ' ');
	return term.type !== 'cash' && typeof term.days === 'number' && term.days > 0
		? `${label} + ${term.days} days`
		: label;
}

/**
 * Build the API object from a raw type/days pair.
 * `days` is dropped for `cash` and kept for everything else — including an
 * explicit 0, which is a legitimate "end of month, no extra days".
 */
export function buildPaymentTermObject(type: string, days: unknown): ITeamleaderPaymentTerm {
	const term: ITeamleaderPaymentTerm = { type };
	if (type === 'cash') return term;

	if (days !== undefined && days !== null && days !== '') {
		const parsed = typeof days === 'number' ? days : Number(days);
		if (!Number.isNaN(parsed)) term.days = parsed;
	}
	return term;
}

export interface IPaymentTermInput {
	source: PaymentTermSource;
	/** `select` mode: the chosen Teamleader payment term ID (or an expression). */
	paymentTermId?: unknown;
	/** `custom` mode. */
	customType?: unknown;
	customDays?: unknown;
}

/**
 * Resolve the configured payment term into the API object, reading
 * `paymentTerms.list` at most once per node execution.
 *
 * Every failure names the field the user has to fill in; nothing falls back to
 * another term, because paying on the wrong date is a financial error.
 */
export async function resolvePaymentTerm(
	context: IExecuteFunctions,
	executionContext: TeamleaderExecutionContext,
	input: IPaymentTermInput,
	itemIndex: number,
): Promise<ITeamleaderPaymentTerm> {
	const node = context.getNode();

	if (input.source === 'keep') {
		// Callers must not send anything; this guard exists so a mis-wired caller
		// fails loudly instead of silently rewriting the term.
		throw new NodeOperationError(node, 'Payment term "Keep Current" must not be resolved', {
			itemIndex,
			description: 'This is a connector bug: the payment term should have been omitted.',
		});
	}

	if (input.source === 'custom') {
		const type = typeof input.customType === 'string' ? input.customType : '';
		if (!(PAYMENT_TERM_TYPES as readonly string[]).includes(type)) {
			throw new NodeOperationError(node, 'Choose a payment term type', {
				itemIndex,
				description: `"Payment Term Type" must be one of: ${PAYMENT_TERM_TYPES.join(', ')}.`,
			});
		}
		return buildPaymentTermObject(type, input.customDays);
	}

	const resolved = await executionContext.resolve('paymentTerms', PAYMENT_TERMS_CACHE_ID, () =>
		resolvePaymentTerms(context),
	);

	if (input.source === 'select') {
		const id = extractId(input.paymentTermId);
		if (!id) {
			throw new NodeOperationError(node, 'Select a payment term', {
				itemIndex,
				description:
					'Choose one from "Payment Term", or switch Payment Term to Custom Payment Term.',
			});
		}

		const term = resolved.terms.find((entry) => entry.id === id);
		if (!term) {
			throw new NodeOperationError(
				node,
				`Payment term ${id} no longer exists in Teamleader`,
				{
					itemIndex,
					description:
						'It may have been removed or renamed. Pick the term again, or use Custom Payment Term.',
				},
			);
		}
		return buildPaymentTermObject(term.type, term.days);
	}

	// Teamleader Default.
	if (!resolved.defaultId) {
		throw new NodeOperationError(
			node,
			'Teamleader did not report a default payment term for this account',
			{
				itemIndex,
				description:
					'Set Payment Term to "Select Payment Term" or "Custom Payment Term" and choose one explicitly. The connector never picks a term for you.',
			},
		);
	}

	const term = resolved.terms.find((entry) => entry.id === resolved.defaultId);
	if (!term) {
		throw new NodeOperationError(
			node,
			`Teamleader reported default payment term ${resolved.defaultId}, but it was not in the payment term list`,
			{
				itemIndex,
				description: 'Choose the payment term explicitly instead.',
			},
		);
	}

	return buildPaymentTermObject(term.type, term.days);
}

/** Read the three payment-term parameters from wherever the operation put them. */
export function readPaymentTermInput(
	context: IExecuteFunctions,
	itemIndex: number,
): IPaymentTermInput {
	return {
		source: context.getNodeParameter('paymentTermSource', itemIndex, 'default') as PaymentTermSource,
		paymentTermId: context.getNodeParameter('paymentTermId', itemIndex, ''),
		customType: context.getNodeParameter('paymentTermType', itemIndex, ''),
		customDays: context.getNodeParameter('paymentTermDays', itemIndex, ''),
	};
}

/** Guard for a payload key that must never carry connector metadata. */
export function isPaymentTermObject(value: unknown): value is ITeamleaderPaymentTerm {
	if (!value || typeof value !== 'object') return false;
	const keys = Object.keys(value as IDataObject);
	return keys.every((key) => key === 'type' || key === 'days');
}
