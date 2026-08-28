import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { resolveDeal, type TeamleaderExecutionContext } from '../../helpers/context';
import { toApiDateOnly, toApiTimestamp } from '../../helpers/dates';
import {
	extractId,
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../../helpers/GenericFunctions';
import type { ITeamleaderMoney, ITeamleaderReference } from '../../helpers/interfaces';
import { buildSort, cleanObject, extractCollection, toStringArray } from '../../helpers/utils';
import { buildCustomFieldValues } from '../helpers/payload';

/**
 * V2 Deal payload builders.
 *
 * Only V2 parameter names are read here — versioning keeps V1's own
 * `v1/actions/deal.ts` completely separate and untouched.
 */

/** Resolve a 3-mode customer locator value into the `{type, id}` `lead.customer` needs. */
export function resolveCustomerReference(
	locatorValue: unknown,
	explicitType: unknown,
): ITeamleaderReference | undefined {
	const id = extractId(locatorValue);
	if (!id) return undefined;

	const mode =
		typeof locatorValue === 'object' && locatorValue !== null
			? ((locatorValue as IDataObject).mode as string | undefined)
			: undefined;

	if (mode === 'contactList') return { type: 'contact', id };
	if (mode === 'companyList') return { type: 'company', id };

	// Raw-ID / expression mode: the type can only come from the companion field.
	if (explicitType === 'contact') return { type: 'contact', id };
	if (explicitType === 'company') return { type: 'company', id };
	return undefined;
}

/** Estimated Value: only sent when the user actually supplied a non-zero amount. */
export function buildEstimatedValue(amount: unknown, currency: unknown): ITeamleaderMoney | undefined {
	if (amount === undefined || amount === null || amount === '') return undefined;
	const parsed = typeof amount === 'number' ? amount : Number(amount);
	if (Number.isNaN(parsed) || parsed === 0) return undefined;
	return { amount: parsed, currency: (currency as string) || 'EUR' };
}

/** Estimated Value on Update, once the Change Estimated Value gate is on: 0 is a real value here. */
export function buildEstimatedValueForced(amount: unknown, currency: unknown): ITeamleaderMoney {
	const parsed = typeof amount === 'number' ? amount : Number(amount);
	return { amount: Number.isNaN(parsed) ? 0 : parsed, currency: (currency as string) || 'EUR' };
}

/** Convert and validate Probability (%): throws for anything outside 0-100, never clamps silently. */
export function resolveProbabilityPercent(
	value: unknown,
	context: IExecuteFunctions,
	itemIndex: number,
): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = typeof value === 'number' ? value : Number(value);
	if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
		throw new NodeOperationError(
			context.getNode(),
			'Probability (%) must be between 0 and 100',
			{ itemIndex },
		);
	}
	return parsed / 100;
}

interface IDealCommonFields {
	responsibleUserId?: unknown;
	estimatedClosingDate?: unknown;
	estimatedValueAmount?: unknown;
	estimatedValueForced: boolean;
	currency?: unknown;
	advanced?: IDataObject;
}

/** Fields shared by Deal Create and Update, outside of `lead`/`phase_id`/`title`. */
function buildDealCommonBody(
	fields: IDealCommonFields,
	context: IExecuteFunctions,
	itemIndex: number,
): IDataObject {
	const advanced = fields.advanced ?? {};

	const estimatedValue = fields.estimatedValueForced
		? buildEstimatedValueForced(fields.estimatedValueAmount, fields.currency)
		: buildEstimatedValue(fields.estimatedValueAmount, fields.currency);

	return cleanObject({
		responsible_user_id: extractId(fields.responsibleUserId),
		estimated_closing_date: toApiDateOnly(fields.estimatedClosingDate),
		estimated_value: estimatedValue,
		department_id: extractId(advanced.departmentId),
		source_id: extractId(advanced.sourceId),
		summary: advanced.summary,
		estimated_probability: resolveProbabilityPercent(advanced.probabilityPercent, context, itemIndex),
		custom_fields: buildCustomFieldValues(advanced.customFields),
	});
}

/** Map the V2 filter collection onto the `deals.list` filter object. */
export function buildDealFilter(filters: IDataObject): IDataObject {
	const filter: IDataObject = {};

	if (filters.term) filter.term = filters.term;

	const ids = toStringArray(filters.ids);
	if (ids.length > 0) filter.ids = ids;

	const pipelineIds = toStringArray(filters.pipelineIds);
	if (pipelineIds.length > 0) filter.pipeline_ids = pipelineIds;

	const phaseId = extractId(filters.phaseId);
	if (phaseId) filter.phase_id = phaseId;

	const status = toStringArray(filters.status);
	if (status.length > 0) filter.status = status;

	const responsibleUserId = extractId(filters.responsibleUserId);
	if (responsibleUserId) filter.responsible_user_id = responsibleUserId;

	const updatedSince = toApiTimestamp(filters.updatedSince);
	if (updatedSince) filter.updated_since = updatedSince;

	const from = toApiDateOnly(filters.estimatedClosingDateFrom);
	if (from) filter.estimated_closing_date_from = from;

	const until = toApiDateOnly(filters.estimatedClosingDateUntil);
	if (until) filter.estimated_closing_date_until = until;

	const customer = resolveCustomerReference(filters.customerId, filters.customerType ?? 'company');
	if (customer) filter.customer = customer;

	return filter;
}

export async function executeDeal(
	this: IExecuteFunctions,
	operation: string,
	i: number,
	executionContext: TeamleaderExecutionContext,
): Promise<IDataObject[]> {
	if (operation === 'get') {
		const id = getRequiredId(this, 'dealId', i);
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const body: IDataObject = { id };
		if (options.includeCustomFields) body.includes = 'custom_fields';

		const response = await teamleaderApiRequest.call(this, '/deals.info', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'getAll') {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const options = this.getNodeParameter('options', i, {}) as IDataObject;

		const body: IDataObject = {};
		const filter = buildDealFilter(filters);
		if (Object.keys(filter).length > 0) body.filter = filter;

		const sort = buildSort(extractCollection(options.sort, 'rule'));
		if (sort) body.sort = sort;
		if (options.includeCustomFields) body.includes = 'custom_fields';

		return await teamleaderFetchList.call(this, '/deals.list', i, body);
	}

	if (operation === 'create') {
		const title = this.getNodeParameter('title', i) as string;

		const customerLocatorValue = this.getNodeParameter('customerId', i);
		const customerType = this.getNodeParameter('customerType', i, '');
		const customer = resolveCustomerReference(customerLocatorValue, customerType);
		if (!customer) {
			throw new NodeOperationError(this.getNode(), 'Choose Company or Contact for the customer ID', {
				itemIndex: i,
				description: 'Set "Customer Type" when supplying a raw customer ID or expression.',
			});
		}

		const lead: IDataObject = { customer };
		const contactPersonId = extractId(this.getNodeParameter('contactPersonId', i, ''));
		if (contactPersonId) lead.contact_person_id = contactPersonId;

		// pipeline_id is lookup-only context; deals.create has no such field.
		const phaseId = extractId(this.getNodeParameter('phaseId', i, ''));

		const advanced = this.getNodeParameter('advancedOptions', i, {}) as IDataObject;

		const body: IDataObject = {
			title,
			lead,
			phase_id: phaseId,
			...buildDealCommonBody(
				{
					responsibleUserId: this.getNodeParameter('responsibleUserId', i, ''),
					estimatedClosingDate: this.getNodeParameter('estimatedClosingDate', i, ''),
					estimatedValueAmount: this.getNodeParameter('estimatedValue', i, 0),
					estimatedValueForced: false,
					currency: this.getNodeParameter('currency', i, 'EUR'),
					advanced,
				},
				this,
				i,
			),
		};

		const response = await teamleaderApiRequest.call(this, '/deals.create', cleanObject(body));
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'update') {
		const id = getRequiredId(this, 'dealId', i);
		const title = this.getNodeParameter('title', i, '') as string;
		const updateCustomer = this.getNodeParameter('updateCustomer', i, false) as boolean;
		const contactPersonId = extractId(this.getNodeParameter('contactPersonId', i, ''));
		const changeEstimatedValue = this.getNodeParameter('changeEstimatedValue', i, false) as boolean;
		const advanced = this.getNodeParameter('advancedOptions', i, {}) as IDataObject;

		const body: IDataObject = {
			id,
			...buildDealCommonBody(
				{
					responsibleUserId: this.getNodeParameter('responsibleUserId', i, ''),
					estimatedClosingDate: this.getNodeParameter('estimatedClosingDate', i, ''),
					estimatedValueAmount: changeEstimatedValue
						? this.getNodeParameter('estimatedValue', i, 0)
						: undefined,
					estimatedValueForced: changeEstimatedValue,
					currency: this.getNodeParameter('currency', i, 'EUR'),
					advanced,
				},
				this,
				i,
			),
		};
		if (title) body.title = title;

		if (updateCustomer) {
			const customerLocatorValue = this.getNodeParameter('customerId', i);
			const customerType = this.getNodeParameter('customerType', i, 'company');
			const customer = resolveCustomerReference(customerLocatorValue, customerType);
			if (!customer) {
				throw new NodeOperationError(this.getNode(), 'Choose Company or Contact for the customer ID', {
					itemIndex: i,
					description: 'Set "Customer Type" when supplying a raw customer ID or expression.',
				});
			}
			const lead: IDataObject = { customer };
			if (contactPersonId) lead.contact_person_id = contactPersonId;
			body.lead = lead;
		} else if (contactPersonId) {
			// The first real consumer of the shared fromDeal resolver: read the
			// deal's current customer so the contact person can be changed alone,
			// cached per <fromDeal, dealId> for the whole node execution.
			const resolved = await executionContext.resolve('fromDeal', id, (dealId) =>
				resolveDeal(this, dealId),
			);

			if (!resolved.customer) {
				throw new NodeOperationError(
					this.getNode(),
					`Could not read the current customer of this deal, so the contact person cannot be changed.`,
					{
						itemIndex: i,
						description: 'Enable Change Customer and select the customer explicitly.',
					},
				);
			}

			body.lead = {
				customer: { type: resolved.customer.type, id: resolved.customer.id },
				contact_person_id: contactPersonId,
			};
		}

		if (Object.keys(body).length <= 1) {
			throw new NodeOperationError(this.getNode(), 'Fill in at least one field to update', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/deals.update', body);
		return [{ success: true, id }];
	}

	if (operation === 'move') {
		const id = getRequiredId(this, 'dealId', i);
		const phaseId = extractId(this.getNodeParameter('phaseId', i));

		if (!phaseId) {
			throw new NodeOperationError(this.getNode(), 'Select the phase to move the deal to', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/deals.move', { id, phase_id: phaseId });
		return [{ success: true, id, phase_id: phaseId }];
	}

	if (operation === 'win') {
		const id = getRequiredId(this, 'dealId', i);
		await teamleaderApiRequest.call(this, '/deals.win', { id });
		return [{ success: true, id, status: 'won' }];
	}

	if (operation === 'lose') {
		const id = getRequiredId(this, 'dealId', i);
		const reasonId = extractId(this.getNodeParameter('reasonId', i, ''));
		const extraInfo = this.getNodeParameter('extraInfo', i, '') as string;

		const body: IDataObject = { id };
		if (reasonId) body.reason_id = reasonId;
		if (extraInfo) body.extra_info = extraInfo;

		await teamleaderApiRequest.call(this, '/deals.lose', body);
		return [{ success: true, id, status: 'lost' }];
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for resource "deal"`,
		{ itemIndex: i },
	);
}
