import type { IDataObject } from 'n8n-workflow';

import {
	buildContactCreateBody,
	buildContactFilter,
	buildContactUpdateBody,
	executeContact,
} from '../nodes/Teamleader/v2/actions/contact';
import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';

jest.mock('../nodes/Teamleader/helpers/GenericFunctions', () => {
	const actual = jest.requireActual('../nodes/Teamleader/helpers/GenericFunctions');
	return {
		...actual,
		teamleaderApiRequest: jest.fn(),
		teamleaderFetchList: jest.fn(),
	};
});

const apiRequest = generic.teamleaderApiRequest as unknown as jest.Mock;

function makeContext(parameters: IDataObject) {
	return {
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			parameters[name] !== undefined ? parameters[name] : fallback,
		getNode: () => ({ name: 'Teamleader' }),
	} as never;
}

beforeEach(() => {
	apiRequest.mockReset();
});

describe('Contact Create payload', () => {
	it('sends only the required last name for a minimal contact', () => {
		const body = buildContactCreateBody({ lastName: 'Smith' });
		expect(body).toEqual({ last_name: 'Smith' });
	});

	it('includes the first name when given', () => {
		const body = buildContactCreateBody({ firstName: 'John', lastName: 'Smith' });
		expect(body.first_name).toBe('John');
	});

	it('turns the promoted email into a primary emails entry', () => {
		const body = buildContactCreateBody({ lastName: 'Smith', email: 'john@piedpiper.eu' });
		expect(body.emails).toEqual([{ type: 'primary', email: 'john@piedpiper.eu' }]);
	});

	it('turns the promoted phone and its type into a telephones entry', () => {
		const body = buildContactCreateBody({
			lastName: 'Smith',
			phone: '0498 11 22 33',
			phoneType: 'mobile',
		});
		expect(body.telephones).toEqual([{ type: 'mobile', number: '0498 11 22 33' }]);
	});

	it('merges the primary email with additional emails, primary first', () => {
		const body = buildContactCreateBody({
			lastName: 'Smith',
			email: 'john@piedpiper.eu',
			advanced: { additionalEmails: 'sales@piedpiper.eu, support@piedpiper.eu' },
		});
		expect(body.emails).toEqual([
			{ type: 'primary', email: 'john@piedpiper.eu' },
			{ type: 'primary', email: 'sales@piedpiper.eu' },
			{ type: 'primary', email: 'support@piedpiper.eu' },
		]);
	});

	it('never creates a duplicate primary entry for the same address', () => {
		const body = buildContactCreateBody({
			lastName: 'Smith',
			email: 'john@piedpiper.eu',
			advanced: { additionalEmails: 'JOHN@piedpiper.eu, sales@piedpiper.eu' },
		});
		expect(body.emails).toEqual([
			{ type: 'primary', email: 'john@piedpiper.eu' },
			{ type: 'primary', email: 'sales@piedpiper.eu' },
		]);
	});

	it('deduplicates phone numbers regardless of formatting', () => {
		const body = buildContactCreateBody({
			lastName: 'Smith',
			phone: '09 298 06 15',
			advanced: {
				additionalPhones: { phone: [{ number: '092980615', type: 'phone' }, { number: '0498112233', type: 'mobile' }] },
			},
		});
		expect(body.telephones).toEqual([
			{ type: 'phone', number: '09 298 06 15' },
			{ type: 'mobile', number: '0498112233' },
		]);
	});

	it('merges and deduplicates existing tags with New Tags', () => {
		const body = buildContactCreateBody({
			lastName: 'Smith',
			tags: ['prospect', 'expo'],
			newTags: 'Expo, isolation , ',
		});
		expect(body.tags).toEqual(['prospect', 'expo', 'isolation']);
	});

	it('uses the contact-scoped custom fields and sends only date part of birthdate', () => {
		const body = buildContactCreateBody({
			lastName: 'Smith',
			advanced: {
				birthdate: '1989-08-19T00:00:00Z',
				customFields: { field: [{ id: 'cf-1', value: 'yes' }] },
			},
		});
		expect(body.birthdate).toBe('1989-08-19');
		expect(body.custom_fields).toEqual([{ id: 'cf-1', value: 'yes' }]);
	});
});

describe('Contact Create company linking', () => {
	it('creates and then links, in that order', async () => {
		apiRequest
			.mockResolvedValueOnce({ data: { id: 'contact-1', type: 'contact' } })
			.mockResolvedValueOnce({});

		const context = makeContext({
			lastName: 'Smith',
			companyId: { mode: 'list', value: 'company-9' },
			position: 'CEO',
			decisionMaker: true,
		});

		const result = await executeContact.call(context, 'create', 0);

		expect(apiRequest).toHaveBeenCalledTimes(2);
		expect(apiRequest.mock.calls[0][0]).toBe('/contacts.add');
		expect(apiRequest.mock.calls[1][0]).toBe('/contacts.linkToCompany');
		expect(apiRequest.mock.calls[1][1]).toEqual({
			id: 'contact-1',
			company_id: 'company-9',
			position: 'CEO',
			decision_maker: true,
		});
		expect(result[0]).toMatchObject({ id: 'contact-1', linked_to_company: true });
	});

	it('does not link when no company was chosen', async () => {
		apiRequest.mockResolvedValueOnce({ data: { id: 'contact-1' } });
		const result = await executeContact.call(makeContext({ lastName: 'Smith' }), 'create', 0);

		expect(apiRequest).toHaveBeenCalledTimes(1);
		expect(result[0]).toEqual({ id: 'contact-1' });
	});

	it('reports the created contact ID when linking fails', async () => {
		apiRequest
			.mockResolvedValueOnce({ data: { id: 'contact-77' } })
			.mockRejectedValueOnce(new Error('Company not found'));

		const context = makeContext({
			lastName: 'Smith',
			companyId: { mode: 'list', value: 'company-9' },
		});

		await expect(executeContact.call(context, 'create', 0)).rejects.toThrow(
			/contact-77 was created, but linking it to the company failed: Company not found/,
		);
	});
});

describe('Contact Update payload', () => {
	it('omits every promoted field left empty', () => {
		const body = buildContactUpdateBody({
			firstName: '',
			lastName: '',
			email: '',
			phone: '',
		});
		expect(body).toEqual({});
	});

	it('sends only the fields the user filled in', () => {
		const body = buildContactUpdateBody({ firstName: 'Jane', email: '', phone: '' });
		expect(body).toEqual({ first_name: 'Jane' });
	});

	it('replaces the email collection when an email is provided', () => {
		const body = buildContactUpdateBody({ email: 'new@piedpiper.eu' });
		expect(body.emails).toEqual([{ type: 'primary', email: 'new@piedpiper.eu' }]);
	});

	it('never touches tags unless Replace Tags is switched on', () => {
		const untouched = buildContactUpdateBody({
			firstName: 'Jane',
			tags: ['prospect'],
			newTags: 'expo',
		});
		expect(untouched.tags).toBeUndefined();

		const replaced = buildContactUpdateBody({
			replaceTags: true,
			tags: ['prospect'],
			newTags: 'expo',
		});
		expect(replaced.tags).toEqual(['prospect', 'expo']);
	});

	it('allows Replace Tags to deliberately clear all tags', () => {
		const body = buildContactUpdateBody({ replaceTags: true, tags: [], newTags: '' });
		expect(body.tags).toEqual([]);
	});
});

describe('Contact Tag / Untag', () => {
	it('merges selected tags with New Tags on Tag', async () => {
		apiRequest.mockResolvedValueOnce({});
		const context = makeContext({
			contactId: 'contact-1',
			tags: ['prospect'],
			newTags: 'expo, isolation',
		});

		const result = await executeContact.call(context, 'tag', 0);

		expect(apiRequest.mock.calls[0][0]).toBe('/contacts.tag');
		expect(apiRequest.mock.calls[0][1]).toEqual({
			id: 'contact-1',
			tags: ['prospect', 'expo', 'isolation'],
		});
		expect(result[0]).toMatchObject({ success: true });
	});

	it('ignores New Tags on Untag because the field is not offered', async () => {
		apiRequest.mockResolvedValueOnce({});
		const context = makeContext({
			contactId: 'contact-1',
			tags: ['prospect'],
			newTags: 'should-be-ignored',
		});

		await executeContact.call(context, 'untag', 0);

		expect(apiRequest.mock.calls[0][1]).toEqual({ id: 'contact-1', tags: ['prospect'] });
	});

	it('refuses an empty tag selection', async () => {
		const context = makeContext({ contactId: 'contact-1', tags: [], newTags: '' });
		await expect(executeContact.call(context, 'tag', 0)).rejects.toThrow(
			'At least one tag is required',
		);
		expect(apiRequest).not.toHaveBeenCalled();
	});
});

describe('Contact Link / Unlink', () => {
	it('omits decision_maker unless the user opted in', async () => {
		apiRequest.mockResolvedValueOnce({});
		const context = makeContext({
			contactId: 'contact-1',
			companyId: 'company-9',
			position: 'CEO',
			markAsDecisionMaker: false,
		});

		await executeContact.call(context, 'linkToCompany', 0);

		expect(apiRequest.mock.calls[0][1]).toEqual({
			id: 'contact-1',
			company_id: 'company-9',
			position: 'CEO',
		});
	});

	it('sends decision_maker when explicitly opted in', async () => {
		apiRequest.mockResolvedValueOnce({});
		const context = makeContext({
			contactId: 'contact-1',
			companyId: 'company-9',
			markAsDecisionMaker: true,
			decisionMaker: false,
		});

		await executeContact.call(context, 'linkToCompany', 0);

		expect(apiRequest.mock.calls[0][1]).toEqual({
			id: 'contact-1',
			company_id: 'company-9',
			decision_maker: false,
		});
	});

	it('unlinks without deleting anything', async () => {
		apiRequest.mockResolvedValueOnce({});
		const context = makeContext({ contactId: 'contact-1', companyId: 'company-9' });

		await executeContact.call(context, 'unlinkFromCompany', 0);

		expect(apiRequest.mock.calls[0][0]).toBe('/contacts.unlinkFromCompany');
	});
});

describe('Contact filters', () => {
	it('omits status when the user asked for active and deactivated', () => {
		expect(buildContactFilter({ status: '' }).status).toBeUndefined();
		expect(buildContactFilter({ status: 'active' }).status).toBe('active');
	});

	it('sends updated_since as a full timestamp, not a truncated date', () => {
		const filter = buildContactFilter({ updatedSince: '2026-03-01T14:45:30Z' });
		expect(filter.updated_since).toBe('2026-03-01T14:45:30+00:00');
	});

	it('accepts a company resource locator or a raw id', () => {
		expect(buildContactFilter({ companyId: { mode: 'list', value: 'c-1' } }).company_id).toBe('c-1');
		expect(buildContactFilter({ companyId: 'c-2' }).company_id).toBe('c-2');
	});
});
