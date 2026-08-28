import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	extractId,
	getRequiredId,
	teamleaderApiRequest,
	teamleaderFetchList,
} from '../../helpers/GenericFunctions';
import { buildSort, cleanObject, extractCollection, toStringArray } from '../../helpers/utils';
import { toApiDateOnly, toApiTimestamp } from '../../helpers/dates';
import {
	assignIfPresent,
	buildCustomFieldValues,
	mergeAddresses,
	mergeEmails,
	mergeTags,
	mergeTelephones,
} from '../helpers/payload';

/**
 * Fields shared by Contact Create and Contact Update that live under Advanced Options.
 * Absent values are omitted so an update never clears a field the user did not touch.
 */
function buildAdvancedContactFields(advanced: IDataObject): IDataObject {
	const payload: IDataObject = {};

	assignIfPresent(payload, {
		salutation: advanced.salutation,
		website: advanced.website,
		iban: advanced.iban,
		bic: advanced.bic,
		national_identification_number: advanced.nationalIdentificationNumber,
		remarks: advanced.remarks,
		language: advanced.language,
	});

	// `unknown` is the neutral default of the picker, so it is not an instruction.
	if (typeof advanced.gender === 'string' && advanced.gender !== '' && advanced.gender !== 'unknown') {
		payload.gender = advanced.gender;
	}

	const birthdate = toApiDateOnly(advanced.birthdate);
	if (birthdate) payload.birthdate = birthdate;

	if (typeof advanced.marketingMailsConsent === 'boolean') {
		payload.marketing_mails_consent = advanced.marketingMailsConsent;
	}

	const customFields = buildCustomFieldValues(advanced.customFields);
	if (customFields) payload.custom_fields = customFields;

	return payload;
}

/** Build the contact body sent to `contacts.add`. */
export function buildContactCreateBody(parameters: {
	firstName?: unknown;
	lastName: unknown;
	email?: unknown;
	phone?: unknown;
	phoneType?: unknown;
	tags?: unknown;
	newTags?: unknown;
	advanced?: IDataObject;
}): IDataObject {
	const advanced = parameters.advanced ?? {};
	const body: IDataObject = { last_name: String(parameters.lastName ?? '').trim() };

	assignIfPresent(body, { first_name: parameters.firstName });

	const emails = mergeEmails({
		primary: parameters.email,
		additional: advanced.additionalEmails,
	});
	if (emails) body.emails = emails;

	const telephones = mergeTelephones({
		primary: parameters.phone,
		primaryType: parameters.phoneType,
		additional: advanced.additionalPhones,
	});
	if (telephones) body.telephones = telephones;

	const addresses = mergeAddresses({ additional: advanced.additionalAddresses });
	if (addresses) body.addresses = addresses;

	const tags = mergeTags(parameters.tags, parameters.newTags);
	if (tags.length > 0) body.tags = tags;

	return { ...body, ...buildAdvancedContactFields(advanced) };
}

/** Build the body sent to `contacts.update`, excluding the id. */
export function buildContactUpdateBody(parameters: {
	firstName?: unknown;
	lastName?: unknown;
	email?: unknown;
	phone?: unknown;
	phoneType?: unknown;
	replaceTags?: unknown;
	tags?: unknown;
	newTags?: unknown;
	advanced?: IDataObject;
}): IDataObject {
	const advanced = parameters.advanced ?? {};
	const body: IDataObject = {};

	assignIfPresent(body, {
		first_name: parameters.firstName,
		last_name: parameters.lastName,
	});

	const emails = mergeEmails({
		primary: parameters.email,
		additional: advanced.additionalEmails,
	});
	if (emails) body.emails = emails;

	const telephones = mergeTelephones({
		primary: parameters.phone,
		primaryType: parameters.phoneType,
		additional: advanced.additionalPhones,
	});
	if (telephones) body.telephones = telephones;

	const addresses = mergeAddresses({ additional: advanced.additionalAddresses });
	if (addresses) body.addresses = addresses;

	// Tags are only ever touched when the user explicitly asked for replacement.
	if (parameters.replaceTags === true) {
		body.tags = mergeTags(parameters.tags, parameters.newTags);
	}

	return { ...body, ...buildAdvancedContactFields(advanced) };
}

/** Map the V2 filter collection onto the `contacts.list` filter object. */
export function buildContactFilter(filters: IDataObject): IDataObject {
	const filter: IDataObject = {};

	if (filters.term) filter.term = filters.term;
	if (filters.email) filter.email = { type: 'primary', email: filters.email };

	const companyId = extractId(filters.companyId);
	if (companyId) filter.company_id = companyId;

	const ids = toStringArray(filters.ids);
	if (ids.length > 0) filter.ids = ids;

	// An empty status means "active and deactivated": the key is simply omitted.
	if (filters.status) filter.status = filters.status;

	const tags = toStringArray(filters.tags);
	if (tags.length > 0) filter.tags = tags;

	const updatedSince = toApiTimestamp(filters.updatedSince);
	if (updatedSince) filter.updated_since = updatedSince;

	return filter;
}

/** Read the tags of a Tag/Untag operation and require a non-empty result. */
function getRequiredTags(
	context: IExecuteFunctions,
	i: number,
	allowNew: boolean,
): string[] {
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

export async function executeContact(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject[]> {
	if (operation === 'create') {
		const body = buildContactCreateBody({
			firstName: this.getNodeParameter('firstName', i, ''),
			lastName: this.getNodeParameter('lastName', i),
			email: this.getNodeParameter('email', i, ''),
			phone: this.getNodeParameter('phone', i, ''),
			phoneType: this.getNodeParameter('phoneType', i, 'phone'),
			tags: this.getNodeParameter('tags', i, []),
			newTags: this.getNodeParameter('newTags', i, ''),
			advanced: this.getNodeParameter('advancedOptions', i, {}) as IDataObject,
		});

		if (!body.last_name) {
			throw new NodeOperationError(this.getNode(), 'Last Name is required', { itemIndex: i });
		}

		const response = await teamleaderApiRequest.call(this, '/contacts.add', body);
		const created = (response.data ?? {}) as IDataObject;

		const companyId = extractId(this.getNodeParameter('companyId', i, ''));
		if (!companyId) return [created];

		const contactId = created.id as string | undefined;
		const linkBody: IDataObject = { id: contactId, company_id: companyId };

		const position = this.getNodeParameter('position', i, '') as string;
		if (position) linkBody.position = position;

		const decisionMaker = this.getNodeParameter('decisionMaker', i, false) as boolean;
		if (decisionMaker) linkBody.decision_maker = true;

		try {
			await teamleaderApiRequest.call(this, '/contacts.linkToCompany', linkBody);
		} catch (error) {
			// The contact exists. Surfacing this as a plain failure would hide it.
			throw new NodeOperationError(
				this.getNode(),
				`Contact ${contactId ?? '(unknown ID)'} was created, but linking it to the company failed: ${
					(error as Error).message
				}`,
				{
					itemIndex: i,
					description:
						'The contact was NOT rolled back. Use the Link to Company operation on this contact ID to finish the link.',
				},
			);
		}

		return [{ ...created, company_id: companyId, linked_to_company: true }];
	}

	if (operation === 'update') {
		const id = getRequiredId(this, 'contactId', i);
		const body = buildContactUpdateBody({
			firstName: this.getNodeParameter('firstName', i, ''),
			lastName: this.getNodeParameter('lastName', i, ''),
			email: this.getNodeParameter('email', i, ''),
			phone: this.getNodeParameter('phone', i, ''),
			phoneType: this.getNodeParameter('phoneType', i, 'phone'),
			replaceTags: this.getNodeParameter('replaceTags', i, false),
			tags: this.getNodeParameter('tags', i, []),
			newTags: this.getNodeParameter('newTags', i, ''),
			advanced: this.getNodeParameter('advancedOptions', i, {}) as IDataObject,
		});

		if (Object.keys(body).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Fill in at least one field to update', {
				itemIndex: i,
			});
		}

		await teamleaderApiRequest.call(this, '/contacts.update', { id, ...body });
		return [{ success: true, id }];
	}

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

	if (operation === 'delete') {
		const id = getRequiredId(this, 'contactId', i);
		await teamleaderApiRequest.call(this, '/contacts.delete', { id });
		return [{ success: true, id }];
	}

	if (operation === 'tag' || operation === 'untag') {
		const id = getRequiredId(this, 'contactId', i);
		const tags = getRequiredTags(this, i, operation === 'tag');

		await teamleaderApiRequest.call(this, `/contacts.${operation}`, { id, tags });
		return [{ success: true, id, tags }];
	}

	if (operation === 'linkToCompany') {
		const id = getRequiredId(this, 'contactId', i);
		const companyId = getRequiredId(this, 'companyId', i);

		const body: IDataObject = { id, company_id: companyId };

		const position = this.getNodeParameter('position', i, '') as string;
		if (position) body.position = position;

		// `decision_maker` is optional on this endpoint. Only send it when the
		// user opted in, so an existing value is never reset to false silently.
		const markAsDecisionMaker = this.getNodeParameter('markAsDecisionMaker', i, false) as boolean;
		if (markAsDecisionMaker) {
			body.decision_maker = this.getNodeParameter('decisionMaker', i, true) as boolean;
		}

		await teamleaderApiRequest.call(this, '/contacts.linkToCompany', body);
		return [cleanObject({ success: true, id, company_id: companyId })];
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
