import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
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

/** Map the additionalFields collection onto the Teamleader company payload. */
export function buildCompanyPayload(additionalFields: IDataObject): IDataObject {
	const payload: IDataObject = {
		name: additionalFields.name,
		business_type_id: additionalFields.business_type_id,
		vat_number: additionalFields.vat_number,
		national_identification_number: additionalFields.national_identification_number,
		website: additionalFields.website,
		iban: additionalFields.iban,
		bic: additionalFields.bic,
		language: additionalFields.language,
		responsible_user_id: additionalFields.responsible_user_id,
		remarks: additionalFields.remarks,
		preferred_currency: additionalFields.preferred_currency,
	};

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

/** Map the filters collection onto the companies.list filter object. */
export function buildCompanyFilter(filters: IDataObject): IDataObject {
	const filter: IDataObject = {};

	if (filters.term) filter.term = filters.term;
	if (filters.email) filter.email = { type: 'primary', email: filters.email };
	if (filters.vatNumber) filter.vat_number = filters.vatNumber;
	if (filters.status) filter.status = filters.status;
	if (filters.updatedSince) filter.updated_since = filters.updatedSince;

	const ids = toStringArray(filters.ids);
	if (ids.length > 0) filter.ids = ids;

	const tags = toStringArray(filters.tags);
	if (tags.length > 0) filter.tags = tags;

	return filter;
}

export async function executeCompany(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	if (operation === 'get') {
		const id = getRequiredId(this, 'companyId', i);
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const body: IDataObject = { id };
		if (options.includeCustomFields) body.includes = 'custom_fields';

		const response = await teamleaderApiRequest.call(this, '/companies.info', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'getAll') {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const options = this.getNodeParameter('options', i, {}) as IDataObject;

		const body: IDataObject = {};
		const filter = buildCompanyFilter(filters);
		if (Object.keys(filter).length > 0) body.filter = filter;

		const sort = buildSort(extractCollection(options.sort, 'rule'));
		if (sort) body.sort = sort;
		if (options.includeCustomFields) body.includes = 'custom_fields';

		return await teamleaderFetchList.call(this, '/companies.list', i, body);
	}

	if (operation === 'create') {
		const name = this.getNodeParameter('name', i) as string;
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

		const body = { ...buildCompanyPayload(additionalFields), name };

		const response = await teamleaderApiRequest.call(this, '/companies.add', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'update') {
		const id = getRequiredId(this, 'companyId', i);
		const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const payload = buildCompanyPayload(additionalFields);

		if (Object.keys(payload).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Select at least one field to update', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/companies.update', { id, ...payload });
		return [{ success: true, id }];
	}

	if (operation === 'delete') {
		const id = getRequiredId(this, 'companyId', i);
		await teamleaderApiRequest.call(this, '/companies.delete', { id });
		return [{ success: true, id }];
	}

	if (operation === 'tag' || operation === 'untag') {
		const id = getRequiredId(this, 'companyId', i);
		const tags = toStringArray(this.getNodeParameter('tags', i, '') as string);

		if (tags.length === 0) {
			throw new NodeOperationError(this.getNode(), 'At least one tag is required', { itemIndex: i });
		}

		await teamleaderApiRequest.call(this, `/companies.${operation}`, { id, tags });
		return [{ success: true, id, tags }];
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for resource "company"`,
		{ itemIndex: i },
	);
}
