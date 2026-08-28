import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	extractId,
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../../helpers/GenericFunctions';
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

/** Map the additionalFields collection onto the deals.create/update payload. */
export function buildDealPayload(additionalFields: IDataObject, isCreate: boolean): IDataObject {
	const payload: IDataObject = {
		title: additionalFields.title,
		summary: additionalFields.summary,
		source_id: additionalFields.source_id,
		department_id: additionalFields.departmentId,
		responsible_user_id: additionalFields.responsible_user_id,
	};

	// phase_id is only accepted on create; existing deals are moved with deals.move.
	if (isCreate && additionalFields.phase_id) payload.phase_id = additionalFields.phase_id;

	const closingDate = toApiDate(additionalFields.estimated_closing_date);
	if (closingDate) payload.estimated_closing_date = closingDate;

	const value = buildMoney(
		additionalFields.estimated_value,
		(additionalFields.currency as string) || 'EUR',
	);
	if (value) payload.estimated_value = value;

	if (
		additionalFields.estimated_probability !== undefined &&
		additionalFields.estimated_probability !== ''
	) {
		const probability = Number(additionalFields.estimated_probability);
		if (!Number.isNaN(probability)) payload.estimated_probability = probability;
	}

	const customFields = buildCustomFields(additionalFields.customFields);
	if (customFields) payload.custom_fields = customFields;

	return cleanObject(payload);
}

/** Build the `lead` object (customer + optional contact person) for create/update. */
export function buildDealLead(
	customerType: unknown,
	customerId: unknown,
	contactPersonId?: unknown,
): IDataObject {
	const lead: IDataObject = { customer: buildCustomer(customerType, customerId) };
	if (typeof contactPersonId === 'string' && contactPersonId.trim() !== '') {
		lead.contact_person_id = contactPersonId.trim();
	}
	return lead;
}

/** Map the filters collection onto the deals.list filter object. */
export function buildDealFilter(filters: IDataObject): IDataObject {
	const filter: IDataObject = {};

	if (filters.term) filter.term = filters.term;
	if (filters.phaseId) filter.phase_id = filters.phaseId;
	if (filters.responsibleUserId) filter.responsible_user_id = filters.responsibleUserId;
	if (filters.updatedSince) filter.updated_since = filters.updatedSince;

	const customer = buildCustomer(filters.customerType, extractId(filters.customerId));
	if (customer) filter.customer = customer;

	const ids = toStringArray(filters.ids);
	if (ids.length > 0) filter.ids = ids;

	const pipelineIds = toStringArray(filters.pipelineIds);
	if (pipelineIds.length > 0) filter.pipeline_ids = pipelineIds;

	const status = toStringArray(filters.status);
	if (status.length > 0) filter.status = status;

	const from = toApiDate(filters.estimatedClosingDateFrom);
	if (from) filter.estimated_closing_date_from = from;

	const until = toApiDate(filters.estimatedClosingDateUntil);
	if (until) filter.estimated_closing_date_until = until;

	return filter;
}

export async function executeDeal(
	this: IExecuteFunctions,
	operation: string,
	i: number,
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
		const customerType = this.getNodeParameter('customerType', i) as string;
		const customerId = getRequiredId(this, 'customerId', i);
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

		const body: IDataObject = {
			...buildDealPayload(additionalFields, true),
			title,
			lead: buildDealLead(customerType, customerId, additionalFields.contact_person_id),
		};

		const response = await teamleaderApiRequest.call(this, '/deals.create', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'update') {
		const id = getRequiredId(this, 'dealId', i);
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const updateCustomer = this.getNodeParameter('updateCustomer', i, false) as boolean;

		const body: IDataObject = { id, ...buildDealPayload(additionalFields, false) };

		if (updateCustomer) {
			const customerType = this.getNodeParameter('customerType', i) as string;
			const customerId = getRequiredId(this, 'customerId', i);
			body.lead = buildDealLead(customerType, customerId, additionalFields.contact_person_id);
		}

		if (Object.keys(body).length === 1) {
			throw new NodeOperationError(this.getNode(), 'Select at least one field to update', {
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
			throw new NodeOperationError(this.getNode(), 'A phase is required to move a deal', {
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
