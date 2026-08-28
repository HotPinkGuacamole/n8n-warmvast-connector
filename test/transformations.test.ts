import { buildCompanyFilter, buildCompanyPayload } from '../nodes/Teamleader/v1/actions/company';
import { buildContactFilter, buildContactPayload } from '../nodes/Teamleader/v1/actions/contact';

describe('buildContactPayload', () => {
	it('maps a full contact payload', () => {
		expect(
			buildContactPayload({
				first_name: 'Erlich',
				salutation: 'Mr',
				birthdate: '1987-04-25T00:00:00.000Z',
				marketing_mails_consent: false,
				emails: { email: [{ type: 'primary', email: 'info@piedpiper.eu' }] },
				telephones: { telephone: [{ type: 'mobile', number: '+32470' }] },
				addresses: { address: [{ type: 'invoicing', line_1: 'Main 1', city: 'Gent' }] },
				customFields: { field: [{ id: 'cf-1', value: 'v' }] },
				tags: 'expo, prospect',
				website: '',
			}),
		).toEqual({
			first_name: 'Erlich',
			salutation: 'Mr',
			birthdate: '1987-04-25',
			marketing_mails_consent: false,
			emails: [{ type: 'primary', email: 'info@piedpiper.eu' }],
			telephones: [{ type: 'mobile', number: '+32470' }],
			addresses: [{ type: 'invoicing', address: { line_1: 'Main 1', city: 'Gent' } }],
			custom_fields: [{ id: 'cf-1', value: 'v' }],
			tags: ['expo', 'prospect'],
		});
	});

	it('returns an empty payload when nothing was filled in', () => {
		expect(buildContactPayload({})).toEqual({});
	});
});

describe('buildContactFilter', () => {
	it('maps filters including resource locator company IDs', () => {
		expect(
			buildContactFilter({
				term: 'James',
				email: 'info@piedpiper.eu',
				companyId: { mode: 'list', value: 'company-uuid' },
				ids: 'a,b',
				status: 'active',
				tags: 'expo',
				updatedSince: '2016-02-04T16:44:33+00:00',
			}),
		).toEqual({
			term: 'James',
			email: { type: 'primary', email: 'info@piedpiper.eu' },
			company_id: 'company-uuid',
			ids: ['a', 'b'],
			status: 'active',
			tags: ['expo'],
			updated_since: '2016-02-04T16:44:33+00:00',
		});
	});

	it('produces an empty filter when unused', () => {
		expect(buildContactFilter({})).toEqual({});
	});
});

describe('buildCompanyPayload', () => {
	it('maps company specific fields', () => {
		expect(
			buildCompanyPayload({
				name: 'Pied Piper',
				vat_number: 'BE0899623035',
				business_type_id: 'bt-1',
				responsible_user_id: 'user-1',
				preferred_currency: 'EUR',
				emails: { email: [{ type: 'invoicing', email: 'billing@piedpiper.eu' }] },
				tags: '',
			}),
		).toEqual({
			name: 'Pied Piper',
			vat_number: 'BE0899623035',
			business_type_id: 'bt-1',
			responsible_user_id: 'user-1',
			preferred_currency: 'EUR',
			emails: [{ type: 'invoicing', email: 'billing@piedpiper.eu' }],
		});
	});
});

describe('buildCompanyFilter', () => {
	it('maps vat number and tags', () => {
		expect(buildCompanyFilter({ vatNumber: 'BE123', tags: 'lead,expo' })).toEqual({
			vat_number: 'BE123',
			tags: ['lead', 'expo'],
		});
	});
});
