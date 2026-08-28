import type { IDataObject } from 'n8n-workflow';

import {
	buildCompanyCreateBody,
	buildCompanyFilter,
	buildCompanyUpdateBody,
	executeCompany,
} from '../nodes/Teamleader/v2/actions/company';
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

describe('Company Create payload', () => {
	it('sends only the required name for a minimal company', () => {
		expect(buildCompanyCreateBody({ name: 'Pied Piper' })).toEqual({ name: 'Pied Piper' });
	});

	it('maps the promoted email to a primary entry', () => {
		const body = buildCompanyCreateBody({ name: 'Pied Piper', email: 'info@piedpiper.eu' });
		expect(body.emails).toEqual([{ type: 'primary', email: 'info@piedpiper.eu' }]);
	});

	it('maps the invoicing email to an invoicing entry', () => {
		const body = buildCompanyCreateBody({
			name: 'Pied Piper',
			invoicingEmail: 'invoices@piedpiper.eu',
		});
		expect(body.emails).toEqual([{ type: 'invoicing', email: 'invoices@piedpiper.eu' }]);
	});

	it('sends both e-mails when they differ', () => {
		const body = buildCompanyCreateBody({
			name: 'Pied Piper',
			email: 'info@piedpiper.eu',
			invoicingEmail: 'invoices@piedpiper.eu',
		});
		expect(body.emails).toEqual([
			{ type: 'primary', email: 'info@piedpiper.eu' },
			{ type: 'invoicing', email: 'invoices@piedpiper.eu' },
		]);
	});

	it('collapses identical primary and invoicing addresses into one entry', () => {
		const body = buildCompanyCreateBody({
			name: 'Pied Piper',
			email: 'info@piedpiper.eu',
			invoicingEmail: 'INFO@piedpiper.eu',
		});
		expect(body.emails).toEqual([{ type: 'primary', email: 'info@piedpiper.eu' }]);
	});

	it('sends the VAT number and responsible user', () => {
		const body = buildCompanyCreateBody({
			name: 'Pied Piper',
			vatNumber: 'BE0899623035',
			responsibleUserId: 'user-1',
		});
		expect(body.vat_number).toBe('BE0899623035');
		expect(body.responsible_user_id).toBe('user-1');
	});

	it('turns the flat invoicing address block into a typed address', () => {
		const body = buildCompanyCreateBody({
			name: 'Pied Piper',
			invoicingAddress: {
				address: {
					line_1: 'Dok Noord 3A 101',
					postal_code: '9000',
					city: 'Ghent',
					country: 'BE',
					addressee: 'Accounting',
				},
			},
		});
		expect(body.addresses).toEqual([
			{
				type: 'invoicing',
				address: {
					line_1: 'Dok Noord 3A 101',
					postal_code: '9000',
					city: 'Ghent',
					country: 'BE',
					addressee: 'Accounting',
				},
			},
		]);
	});

	it('keeps the invoicing address and appends additional addresses', () => {
		const body = buildCompanyCreateBody({
			name: 'Pied Piper',
			invoicingAddress: { address: { city: 'Ghent', country: 'BE' } },
			advanced: {
				additionalAddresses: {
					address: [
						{ type: 'primary', city: 'Brussels', country: 'BE', addressee: 'dropped' },
						{ type: 'invoicing', city: 'Antwerp', country: 'BE' },
					],
				},
			},
		});
		expect(body.addresses).toEqual([
			{ type: 'invoicing', address: { city: 'Ghent', country: 'BE' } },
			{ type: 'primary', address: { city: 'Brussels', country: 'BE' } },
		]);
	});

	it('uses company phone types and merges tags with New Tags', () => {
		const body = buildCompanyCreateBody({
			name: 'Pied Piper',
			phone: '09 298 06 15',
			phoneType: 'fax',
			tags: ['lead'],
			newTags: 'Lead, expo',
		});
		expect(body.telephones).toEqual([{ type: 'fax', number: '09 298 06 15' }]);
		expect(body.tags).toEqual(['lead', 'expo']);
	});

	it('uses the company-scoped custom field values', () => {
		const body = buildCompanyCreateBody({
			name: 'Pied Piper',
			advanced: { customFields: { field: [{ id: 'cf-9', value: '42' }] } },
		});
		expect(body.custom_fields).toEqual([{ id: 'cf-9', value: '42' }]);
	});
});

describe('Company Update payload', () => {
	it('omits every promoted field left empty', () => {
		expect(
			buildCompanyUpdateBody({ name: '', vatNumber: '', email: '', invoicingEmail: '', phone: '' }),
		).toEqual({});
	});

	it('sends only what the user filled in', () => {
		expect(buildCompanyUpdateBody({ vatNumber: 'BE0899623035' })).toEqual({
			vat_number: 'BE0899623035',
		});
	});

	it('replaces the email collection with both promoted addresses together', () => {
		const body = buildCompanyUpdateBody({
			email: 'info@piedpiper.eu',
			invoicingEmail: 'invoices@piedpiper.eu',
		});
		expect(body.emails).toEqual([
			{ type: 'primary', email: 'info@piedpiper.eu' },
			{ type: 'invoicing', email: 'invoices@piedpiper.eu' },
		]);
	});

	it('never touches tags unless Replace Tags is switched on', () => {
		expect(buildCompanyUpdateBody({ name: 'X', tags: ['lead'] }).tags).toBeUndefined();
		expect(buildCompanyUpdateBody({ replaceTags: true, tags: ['lead'] }).tags).toEqual(['lead']);
	});

	it('leaves addresses alone when no address field was filled in', () => {
		expect(buildCompanyUpdateBody({ name: 'X' }).addresses).toBeUndefined();
	});
});

describe('Company execution', () => {
	it('requires a company name on create', async () => {
		await expect(executeCompany.call(makeContext({ name: '' }), 'create', 0)).rejects.toThrow(
			'Company Name is required',
		);
	});

	it('refuses an update with nothing to change', async () => {
		const context = makeContext({ companyId: 'company-1' });
		await expect(executeCompany.call(context, 'update', 0)).rejects.toThrow(
			'Fill in at least one field to update',
		);
	});

	it('merges tags on Tag and refuses an empty selection', async () => {
		apiRequest.mockResolvedValueOnce({});
		await executeCompany.call(
			makeContext({ companyId: 'company-1', tags: ['lead'], newTags: 'expo' }),
			'tag',
			0,
		);
		expect(apiRequest.mock.calls[0][1]).toEqual({ id: 'company-1', tags: ['lead', 'expo'] });

		apiRequest.mockReset();
		await expect(
			executeCompany.call(makeContext({ companyId: 'company-1', tags: [] }), 'untag', 0),
		).rejects.toThrow('At least one tag is required');
	});
});

describe('Company filters', () => {
	it('omits status when both statuses are wanted', () => {
		expect(buildCompanyFilter({ status: '' }).status).toBeUndefined();
	});

	it('sends updated_since as a full timestamp', () => {
		expect(buildCompanyFilter({ updatedSince: '2026-03-01T14:45:30Z' }).updated_since).toBe(
			'2026-03-01T14:45:30+00:00',
		);
	});
});
