import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	extractId,
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../../helpers/GenericFunctions';
import {
	buildAddresses,
	buildCustomFields,
	buildEmails,
	buildSort,
	buildTelephones,
	cleanObject,
	extractCollection,
	toStringArray,
} from '../../helpers/utils';

/** Map the additionalFields collection onto the Teamleader contact payload. */
export function buildContactPayload(additionalFields: IDataObject): IDataObject {
	const payload: IDataObject = {
		first_name: additionalFields.first_name,
		last_name: additionalFields.last_name,
		salutation: additionalFields.salutation,
		website: additionalFields.website,
		language: additionalFields.language,
		gender: additionalFields.gender,
		iban: additionalFields.iban,
		bic: additionalFields.bic,
		national_identification_number: additionalFields.national_identification_number,
		remarks: additionalFields.remarks,
	};

	if (additionalFields.birthdate) {
		payload.birthdate = String(additionalFields.birthdate).slice(0, 10);
	}
	if (typeof additionalFields.marketing_mails_consent === 'boolean') {
		payload.marketing_mails_consent = additionalFields.marketing_mails_consent;
	}

	const emails = buildEmails(additionalFields.emails);
	if (emails) payload.emails = emails;

	const telephones = buildTelephones(additionalFields.telephones);
	if (telephones) payload.telephones = telephones;

	const addresses = buildAddresses(additionalFields.addresses);
	if (addresses) payload.addresses = addresses;

	const customFields = buildCustomFields(additionalFields.customFields);
	if (customFields) payload.custom_fields = customFields;

	const tags = toStringArray(additionalFields.tags);
	if (tags.length > 0) payload.tags = tags;

	return cleanObject(payload);
}

/** Map the filters collection onto the contacts.list filter object. */
export function buildContactFilter(filters: IDataObject): IDataObject {
	const filter: IDataObject = {};

	if (filters.term) filter.term = filters.term;
	if (filters.email) filter.email = { type: 'primary', email: filters.email };

	const companyId = extractId(filters.companyId);
	if (companyId) filter.company_id = companyId;

	const ids = toStringArray(filters.ids);
	if (ids.length > 0) filter.ids = ids;

	if (filters.status) filter.status = filters.status;

	const tags = toStringArray(filters.tags);
	if (tags.length > 0) filter.tags = tags;

	if (filters.updatedSince) filter.updated_since = filters.updatedSince;

	return filter;
}

export async function executeContact(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	if (operation === 'get') {
		const id = getRequiredId(this, 'contactId', i);
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const body: IDataObject = { id };
		if (options.includeCustomFields) body.includes = 'custom_fields';

		const response = await teamleaderApiRequest.call(this, '/contacts.info', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'getAll') {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const options = this.getNodeParameter('options', i, {}) as IDataObject;

		const body: IDataObject = {};
		const filter = buildContactFilter(filters);
		if (Object.keys(filter).length > 0) body.filter = filter;

		const sort = buildSort(extractCollection(options.sort, 'rule'));
		if (sort) body.sort = sort;
		if (options.includeCustomFields) body.includes = 'custom_fields';

		return await teamleaderFetchList.call(this, '/contacts.list', i, body);
	}

	if (operation === 'create') {
		const lastName = this.getNodeParameter('lastName', i) as string;
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

		const body = { ...buildContactPayload(additionalFields), last_name: lastName };

		const response = await teamleaderApiRequest.call(this, '/contacts.add', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'update') {
		const id = getRequiredId(this, 'contactId', i);
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const payload = buildContactPayload(additionalFields);

		if (Object.keys(payload).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Select at least one field to update', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/contacts.update', { id, ...payload });
		return [{ success: true, id }];
	}

	if (operation === 'delete') {
		const id = getRequiredId(this, 'contactId', i);
		await teamleaderApiRequest.call(this, '/contacts.delete', { id });
		return [{ success: true, id }];
	}

	if (operation === 'tag' || operation === 'untag') {
		const id = getRequiredId(this, 'contactId', i);
		const tags = toStringArray(this.getNodeParameter('tags', i, '') as string);

		if (tags.length === 0) {
			throw new NodeOperationError(this.getNode(), 'At least one tag is required', { itemIndex: i });
		}

		await teamleaderApiRequest.call(this, `/contacts.${operation}`, { id, tags });
		return [{ success: true, id, tags }];
	}

	if (operation === 'linkToCompany') {
		const id = getRequiredId(this, 'contactId', i);
		const companyId = getRequiredId(this, 'companyId', i);
		const position = this.getNodeParameter('position', i, '') as string;
		const decisionMaker = this.getNodeParameter('decisionMaker', i, false) as boolean;

		const body: IDataObject = { id, company_id: companyId, decision_maker: decisionMaker };
		if (position) body.position = position;

		await teamleaderApiRequest.call(this, '/contacts.linkToCompany', body);
		return [{ success: true, id, company_id: companyId }];
	}

	if (operation === 'unlinkFromCompany') {
		const id = getRequiredId(this, 'contactId', i);
		const companyId = getRequiredId(this, 'companyId', i);

		await teamleaderApiRequest.call(this, '/contacts.unlinkFromCompany', {
			id,
			company_id: companyId,
		});
		return [{ success: true, id, company_id: companyId }];
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for resource "contact"`,
		{ itemIndex: i },
	);
}
