import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../../helpers/GenericFunctions';
import { toApiTimestamp } from '../../helpers/dates';
import { buildSort, extractCollection, toStringArray } from '../../helpers/utils';
import {
	assignIfPresent,
	buildCustomFieldValues,
	mergeAddresses,
	mergeEmails,
	mergeTags,
	mergeTelephones,
} from '../helpers/payload';

/** Advanced Options shared by Company Create and Update. */
function buildAdvancedCompanyFields(advanced: IDataObject): IDataObject {
	const payload: IDataObject = {};

	assignIfPresent(payload, {
		website: advanced.website,
		iban: advanced.iban,
		bic: advanced.bic,
		national_identification_number: advanced.nationalIdentificationNumber,
		remarks: advanced.remarks,
		language: advanced.language,
		preferred_currency: advanced.preferredCurrency,
	});

	if (typeof advanced.marketingMailsConsent === 'boolean') {
		payload.marketing_mails_consent = advanced.marketingMailsConsent;
	}

	const customFields = buildCustomFieldValues(advanced.customFields);
	if (customFields) payload.custom_fields = customFields;

	return payload;
}

interface ICompanyWriteParameters {
	name?: unknown;
	vatNumber?: unknown;
	email?: unknown;
	invoicingEmail?: unknown;
	phone?: unknown;
	phoneType?: unknown;
	responsibleUserId?: unknown;
	businessTypeId?: unknown;
	invoicingAddress?: unknown;
	tags?: unknown;
	newTags?: unknown;
	advanced?: IDataObject;
}

/**
 * Shared body builder for `companies.add` and `companies.update`.
 * Every promoted field is optional here; Create adds the required name itself.
 */
function buildCompanyBody(parameters: ICompanyWriteParameters): IDataObject {
	const advanced = parameters.advanced ?? {};
	const body: IDataObject = {};

	assignIfPresent(body, {
		name: parameters.name,
		vat_number: parameters.vatNumber,
		responsible_user_id: parameters.responsibleUserId,
		business_type_id: parameters.businessTypeId,
	});

	// Companies support both a primary and an invoicing address type. Identical
	// addresses collapse into one entry rather than being sent twice.
	const emails = mergeEmails({
		primary: parameters.email,
		invoicing: parameters.invoicingEmail,
		additional: advanced.additionalEmails,
		allowInvoicing: true,
	});
	if (emails) body.emails = emails;

	const telephones = mergeTelephones({
		primary: parameters.phone,
		primaryType: parameters.phoneType,
		additional: advanced.additionalPhones,
	});
	if (telephones) body.telephones = telephones;

	const addresses = mergeAddresses({
		invoicing: parameters.invoicingAddress,
		additional: advanced.additionalAddresses,
	});
	if (addresses) body.addresses = addresses;

	return { ...body, ...buildAdvancedCompanyFields(advanced) };
}

export function buildCompanyCreateBody(parameters: ICompanyWriteParameters): IDataObject {
	const body = buildCompanyBody(parameters);
	body.name = String(parameters.name ?? '').trim();

	const tags = mergeTags(parameters.tags, parameters.newTags);
	if (tags.length > 0) body.tags = tags;

	return body;
}

export function buildCompanyUpdateBody(
	parameters: ICompanyWriteParameters & { replaceTags?: unknown },
): IDataObject {
	const body = buildCompanyBody(parameters);

	if (parameters.replaceTags === true) {
		body.tags = mergeTags(parameters.tags, parameters.newTags);
	}

	return body;
}

/** Map the V2 filter collection onto the `companies.list` filter object. */
export function buildCompanyFilter(filters: IDataObject): IDataObject {
	const filter: IDataObject = {};

	if (filters.term) filter.term = filters.term;
	if (filters.email) filter.email = { type: 'primary', email: filters.email };
	if (filters.vatNumber) filter.vat_number = filters.vatNumber;
	if (filters.status) filter.status = filters.status;

	const updatedSince = toApiTimestamp(filters.updatedSince);
	if (updatedSince) filter.updated_since = updatedSince;

	const ids = toStringArray(filters.ids);
	if (ids.length > 0) filter.ids = ids;

	const tags = toStringArray(filters.tags);
	if (tags.length > 0) filter.tags = tags;

	return filter;
}

function getRequiredTags(context: IExecuteFunctions, i: number, allowNew: boolean): string[] {
	const selected = context.getNodeParameter('tags', i, []) as string[] | string;
	const created = allowNew ? (context.getNodeParameter('newTags', i, '') as string) : '';
	const tags = mergeTags(selected, created);

	if (tags.length === 0) {
		throw new NodeOperationError(context.getNode(), 'At least one tag is required', {
			itemIndex: i,
			description: allowNew
				? 'Pick existing tags, or type new ones in the New Tags field.'
				: 'Pick at least one tag to remove.',
		});
	}

	return tags;
}

function readWriteParameters(
	context: IExecuteFunctions,
	i: number,
): ICompanyWriteParameters {
	return {
		name: context.getNodeParameter('name', i, ''),
		vatNumber: context.getNodeParameter('vatNumber', i, ''),
		email: context.getNodeParameter('email', i, ''),
		invoicingEmail: context.getNodeParameter('invoicingEmail', i, ''),
		phone: context.getNodeParameter('phone', i, ''),
		phoneType: context.getNodeParameter('phoneType', i, 'phone'),
		responsibleUserId: context.getNodeParameter('responsibleUserId', i, ''),
		businessTypeId: context.getNodeParameter('businessTypeId', i, ''),
		invoicingAddress: context.getNodeParameter('invoicingAddress', i, {}),
		tags: context.getNodeParameter('tags', i, []),
		newTags: context.getNodeParameter('newTags', i, ''),
		advanced: context.getNodeParameter('advancedOptions', i, {}) as IDataObject,
	};
}

export async function executeCompany(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	if (operation === 'create') {
		const body = buildCompanyCreateBody(readWriteParameters(this, i));

		if (!body.name) {
			throw new NodeOperationError(this.getNode(), 'Company Name is required', { itemIndex: i });
		}

		const response = await teamleaderApiRequest.call(this, '/companies.add', body);
		return [(response.data ?? {}) as IDataObject];
	}

	if (operation === 'update') {
		const id = getRequiredId(this, 'companyId', i);
		const body = buildCompanyUpdateBody({
			...readWriteParameters(this, i),
			replaceTags: this.getNodeParameter('replaceTags', i, false),
		});

		if (Object.keys(body).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Fill in at least one field to update', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/companies.update', { id, ...body });
		return [{ success: true, id }];
	}

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

	if (operation === 'delete') {
		const id = getRequiredId(this, 'companyId', i);
		await teamleaderApiRequest.call(this, '/companies.delete', { id });
		return [{ success: true, id }];
	}

	if (operation === 'tag' || operation === 'untag') {
		const id = getRequiredId(this, 'companyId', i);
		const tags = getRequiredTags(this, i, operation === 'tag');

		await teamleaderApiRequest.call(this, `/companies.${operation}`, { id, tags });
		return [{ success: true, id, tags }];
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for resource "company"`,
		{ itemIndex: i },
	);
}
