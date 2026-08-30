import type { INodeProperties } from 'n8n-workflow';

import { Teamleader } from '../nodes/Teamleader/Teamleader.node';
import {
	companyFields,
	companyOperations,
} from '../nodes/Teamleader/v2/descriptions/CompanyDescription';
import {
	contactFields,
	contactOperations,
} from '../nodes/Teamleader/v2/descriptions/ContactDescription';
import {
	companyFields as v1CompanyFields,
	companyOperations as v1CompanyOperations,
} from '../nodes/Teamleader/v1/descriptions/CompanyDescription';
import {
	contactFields as v1ContactFields,
	contactOperations as v1ContactOperations,
} from '../nodes/Teamleader/v1/descriptions/ContactDescription';

const forOperation = (fields: INodeProperties[], operation: string) =>
	fields.filter((field) =>
		(field.displayOptions?.show?.operation as string[] | undefined)?.includes(operation),
	);

const names = (fields: INodeProperties[]) => fields.map((field) => field.name);

describe('V2 exposes exactly the migrated resources', () => {
	const v2 = new Teamleader().getNodeType(2);

	it('offers Contact, Company, Deal, Product and Quotation only', () => {
		const resource = v2.description.properties.find((property) => property.name === 'resource');
		expect(resource?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'company',
			'contact',
			'deal',
			'product',
			'quotation',
		]);
	});

	it('keeps the full Contact and Company operation sets', () => {
		expect(
			contactOperations[0].options?.map((option) => (option as { value: string }).value).sort(),
		).toEqual([
			'create',
			'delete',
			'get',
			'getAll',
			'linkToCompany',
			'tag',
			'unlinkFromCompany',
			'untag',
			'update',
		]);
		expect(
			companyOperations[0].options?.map((option) => (option as { value: string }).value).sort(),
		).toEqual(['create', 'delete', 'get', 'getAll', 'tag', 'untag', 'update']);
	});
});

describe('V2 Contact Create layout', () => {
	const fields = forOperation(contactFields, 'create');

	it('puts the everyday fields on the form in business order', () => {
		expect(names(fields)).toEqual([
			'firstName',
			'lastName',
			'email',
			'phone',
			'phoneType',
			'companyId',
			'position',
			'decisionMaker',
			'tags',
			'newTags',
			'advancedOptions',
		]);
	});

	it('marks only Last Name as required', () => {
		const required = fields.filter((field) => field.required).map((field) => field.name);
		expect(required).toEqual(['lastName']);
	});

	it('keeps Email and Phone as plain string fields, not nested collections', () => {
		expect(fields.find((field) => field.name === 'email')?.type).toBe('string');
		expect(fields.find((field) => field.name === 'phone')?.type).toBe('string');
	});

	it('shows Phone Type, Position and Decision Maker only once they are relevant', () => {
		const conditionOf = (name: string) =>
			fields.find((field) => field.name === name)?.displayOptions?.show;

		expect(conditionOf('phoneType')).toHaveProperty('phone');
		expect(Object.keys(conditionOf('position') ?? {})).toContain('companyId.value');
		expect(Object.keys(conditionOf('decisionMaker') ?? {})).toContain('companyId.value');
	});

	it('uses a searchable company locator instead of a raw UUID field', () => {
		const company = fields.find((field) => field.name === 'companyId');
		expect(company?.type).toBe('resourceLocator');
		expect(company?.modes?.[0].typeOptions?.searchable).toBe(true);
	});

	it('offers extra e-mails and phones under Advanced Options', () => {
		const advanced = fields.find((field) => field.name === 'advancedOptions');
		expect(advanced?.displayName).toBe('Advanced Options');
		expect(names(advanced?.options as INodeProperties[])).toEqual(
			expect.arrayContaining(['additionalEmails', 'additionalPhones']),
		);
	});

	it('scopes custom fields to the contact context', () => {
		const advanced = forOperation(contactFields, 'create').find(
			(field) => field.name === 'advancedOptions',
		);
		const customFields = (advanced?.options as INodeProperties[]).find(
			(option) => option.name === 'customFields',
		);
		const idField = customFields?.options?.[0] as { values: INodeProperties[] };
		expect(idField.values[0].typeOptions?.loadOptionsMethod).toBe(
			'getContactCustomFieldDefinitions',
		);
	});

	it('uses a language picker rather than free text', () => {
		const advanced = fields.find((field) => field.name === 'advancedOptions');
		const language = (advanced?.options as INodeProperties[]).find(
			(option) => option.name === 'language',
		);
		expect(language?.type).toBe('options');
		expect(language?.options?.length).toBeGreaterThan(5);
	});
});

describe('V2 Contact Update layout', () => {
	const fields = forOperation(contactFields, 'update');

	it('hides the tag replacement fields behind an explicit toggle', () => {
		const replaceTags = fields.find((field) => field.name === 'replaceTags');
		expect(replaceTags?.type).toBe('boolean');
		expect(replaceTags?.default).toBe(false);

		for (const name of ['tags', 'newTags']) {
			expect(fields.find((field) => field.name === name)?.displayOptions?.show?.replaceTags).toEqual(
				[true],
			);
		}
	});

	it('states replacement semantics on the fields that replace a collection', () => {
		expect(fields.find((field) => field.name === 'email')?.description).toMatch(/Replaces/);
		expect(fields.find((field) => field.name === 'phone')?.description).toMatch(/Replaces/);
	});

	it('marks nothing as required beyond the contact itself', () => {
		const required = fields.filter((field) => field.required).map((field) => field.name);
		expect(required).toEqual(['contactId']);
	});
});

describe('V2 Contact destructive and link operations', () => {
	it('warns factually on Delete without a fake confirmation control', () => {
		const notice = forOperation(contactFields, 'delete').find(
			(field) => field.name === 'deleteNotice',
		);
		expect(notice?.type).toBe('notice');
		expect(notice?.displayName).toBe(
			'Permanently deletes this contact in Teamleader. This cannot be undone from n8n.',
		);
		expect(
			forOperation(contactFields, 'delete').some((field) => field.type === 'boolean'),
		).toBe(false);
	});

	it('explains that unlinking deletes nothing', () => {
		const notice = forOperation(contactFields, 'unlinkFromCompany').find(
			(field) => field.name === 'unlinkNotice',
		);
		expect(notice?.displayName).toBe(
			'Removes the link between the contact and company. Neither record is deleted.',
		);
	});

	it('keeps the V1 link layout and makes decision-maker intent explicit', () => {
		expect(names(forOperation(contactFields, 'linkToCompany'))).toEqual([
			'contactId',
			'companyId',
			'position',
			'markAsDecisionMaker',
			'decisionMaker',
		]);
	});

	it('offers New Tags on Tag but not on Untag', () => {
		const newTags = contactFields.find(
			(field) =>
				field.name === 'newTags' &&
				(field.displayOptions?.show?.operation as string[] | undefined)?.includes('tag'),
		);
		expect(newTags?.displayOptions?.show?.operation).toEqual(['tag']);
	});
});

describe('V2 Company layout', () => {
	const create = forOperation(companyFields, 'create');

	it('promotes both e-mail addresses onto the normal form', () => {
		expect(names(create)).toEqual([
			'name',
			'vatNumber',
			'email',
			'invoicingEmail',
			'phone',
			'phoneType',
			'responsibleUserId',
			'invoicingAddress',
			'businessTypeCountry',
			'businessTypeId',
			'tags',
			'newTags',
			'advancedOptions',
		]);
	});

	it('marks only the company name as required', () => {
		expect(create.filter((field) => field.required).map((field) => field.name)).toEqual(['name']);
	});

	it('puts Business Type Country before Business Type and declares the dependency', () => {
		const countryIndex = names(create).indexOf('businessTypeCountry');
		const typeIndex = names(create).indexOf('businessTypeId');
		expect(countryIndex).toBeLessThan(typeIndex);

		const businessType = create.find((field) => field.name === 'businessTypeId');
		expect(businessType?.typeOptions?.loadOptionsDependsOn).toEqual(['businessTypeCountry']);
	});

	it('explains that the business-type country is not sent to Teamleader', () => {
		const country = create.find((field) => field.name === 'businessTypeCountry');
		expect(country?.description).toMatch(/not sent to Teamleader/);
		expect(country?.type).toBe('options');
	});

	it('offers the invoicing address as a flat block, not a generic address list', () => {
		const address = create.find((field) => field.name === 'invoicingAddress');
		expect(address?.type).toBe('fixedCollection');
		expect(address?.typeOptions?.multipleValues).toBeUndefined();
	});

	it('uses a country picker inside the address', () => {
		const address = create.find((field) => field.name === 'invoicingAddress');
		const values = (address?.options?.[0] as { values: INodeProperties[] }).values;
		expect(values.find((value) => value.name === 'country')?.type).toBe('options');
	});

	it('scopes company custom fields to the company context', () => {
		const advanced = create.find((field) => field.name === 'advancedOptions');
		const customFields = (advanced?.options as INodeProperties[]).find(
			(option) => option.name === 'customFields',
		);
		const idField = customFields?.options?.[0] as { values: INodeProperties[] };
		expect(idField.values[0].typeOptions?.loadOptionsMethod).toBe(
			'getCompanyCustomFieldDefinitions',
		);
	});

	it('keeps the same update layout and tag conventions as Contact', () => {
		const update = forOperation(companyFields, 'update');
		expect(names(update).slice(0, 6)).toEqual([
			'companyId',
			'updateNotice',
			'name',
			'vatNumber',
			'email',
			'invoicingEmail',
		]);
		expect(update.find((field) => field.name === 'replaceTags')?.default).toBe(false);
	});
});

describe('V2 UI conventions', () => {
	const allFields = [...contactFields, ...companyFields];

	it('never shows a raw snake_case display label', () => {
		const collect = (fields: INodeProperties[]): string[] =>
			fields.flatMap((field) => [
				field.displayName,
				...((field.options ?? []) as Array<{ values?: INodeProperties[] }>).flatMap((option) =>
					option.values ? collect(option.values) : [],
				),
				...(field.type === 'collection' ? collect((field.options ?? []) as INodeProperties[]) : []),
			]);

		for (const label of collect(allFields)) {
			expect(label).not.toMatch(/^[a-z0-9]+_[a-z0-9_]+$/);
		}
	});

	it('calls the rarely-used collection Advanced Options, never Additional Fields', () => {
		const collections = allFields.filter((field) => field.type === 'collection');
		for (const collection of collections) {
			expect(collection.displayName).not.toBe('Additional Fields');
		}
		expect(
			allFields.filter((field) => field.name === 'advancedOptions').length,
		).toBeGreaterThan(0);
	});

	it('keeps expression support on every dynamic dropdown', () => {
		const dynamic = allFields.filter((field) => field.typeOptions?.loadOptionsMethod);
		for (const field of dynamic) {
			expect(field.noDataExpression).not.toBe(true);
		}
	});
});

describe('V1 descriptions are untouched by Stage 2', () => {
	it('keeps the V1 contact operation set and its Additional Fields collection', () => {
		expect(
			v1ContactOperations[0].options?.map((option) => (option as { value: string }).value).sort(),
		).toEqual([
			'create',
			'delete',
			'get',
			'getAll',
			'linkToCompany',
			'tag',
			'unlinkFromCompany',
			'untag',
			'update',
		]);
		expect(v1ContactFields.some((field) => field.name === 'additionalFields')).toBe(true);
		// V2-only concepts must not have leaked into V1.
		expect(v1ContactFields.some((field) => field.name === 'replaceTags')).toBe(false);
		expect(v1ContactFields.some((field) => field.name === 'newTags')).toBe(false);
	});

	it('keeps the V1 company operation set and its Additional Fields collection', () => {
		expect(
			v1CompanyOperations[0].options?.map((option) => (option as { value: string }).value).sort(),
		).toEqual(['create', 'delete', 'get', 'getAll', 'tag', 'untag', 'update']);
		expect(v1CompanyFields.some((field) => field.name === 'additionalFields')).toBe(true);
		expect(v1CompanyFields.some((field) => field.name === 'invoicingEmail')).toBe(false);
	});
});
