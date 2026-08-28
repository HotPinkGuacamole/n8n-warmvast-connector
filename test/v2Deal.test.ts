import type { IDataObject } from 'n8n-workflow';

import { TeamleaderExecutionContext, resolveDeal } from '../nodes/Teamleader/helpers/context';
import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import {
	buildDealFilter,
	buildEstimatedValue,
	buildEstimatedValueForced,
	executeDeal,
	resolveCustomerReference,
	resolveProbabilityPercent,
} from '../nodes/Teamleader/v2/actions/deal';
import { dealFields } from '../nodes/Teamleader/v2/descriptions/DealDescription';

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

describe('resolveCustomerReference', () => {
	it('derives a company reference from the Company locator mode', () => {
		expect(resolveCustomerReference({ mode: 'companyList', value: 'company-1' }, undefined)).toEqual({
			type: 'company',
			id: 'company-1',
		});
	});

	it('derives a contact reference from the Contact locator mode', () => {
		expect(resolveCustomerReference({ mode: 'contactList', value: 'contact-1' }, undefined)).toEqual({
			type: 'contact',
			id: 'contact-1',
		});
	});

	it('requires the companion Customer Type field in By ID mode', () => {
		expect(resolveCustomerReference({ mode: 'id', value: 'x-1' }, undefined)).toBeUndefined();
		expect(resolveCustomerReference({ mode: 'id', value: 'x-1' }, 'contact')).toEqual({
			type: 'contact',
			id: 'x-1',
		});
		expect(resolveCustomerReference({ mode: 'id', value: 'x-1' }, 'company')).toEqual({
			type: 'company',
			id: 'x-1',
		});
	});
});

describe('Estimated Value money wrapping', () => {
	it('wraps a non-zero amount as Money', () => {
		expect(buildEstimatedValue(500, 'EUR')).toEqual({ amount: 500, currency: 'EUR' });
	});

	it('is omitted entirely when left at the untouched default of 0', () => {
		expect(buildEstimatedValue(0, 'EUR')).toBeUndefined();
	});

	it('defaults to EUR when no currency was supplied', () => {
		expect(buildEstimatedValue(10, undefined)).toEqual({ amount: 10, currency: 'EUR' });
	});

	it('the forced variant keeps an explicit 0, unlike the normal one', () => {
		expect(buildEstimatedValueForced(0, 'EUR')).toEqual({ amount: 0, currency: 'EUR' });
	});
});

describe('Probability (%) conversion and bounds', () => {
	const ctx = makeContext({});

	it.each([
		[0, 0],
		[5, 0.05],
		[50, 0.5],
		[100, 1],
	])('converts %s%% to %s', (percent, fraction) => {
		expect(resolveProbabilityPercent(percent, ctx, 0)).toBe(fraction);
	});

	it('is undefined when untouched', () => {
		expect(resolveProbabilityPercent(undefined, ctx, 0)).toBeUndefined();
	});

	it('rejects a value below 0', () => {
		expect(() => resolveProbabilityPercent(-1, ctx, 0)).toThrow(
			'Probability (%) must be between 0 and 100',
		);
	});

	it('rejects a value above 100', () => {
		expect(() => resolveProbabilityPercent(101, ctx, 0)).toThrow(
			'Probability (%) must be between 0 and 100',
		);
	});
});

describe('buildDealFilter', () => {
	it('maps the Customer locator into a customer filter', () => {
		expect(buildDealFilter({ customerId: { mode: 'companyList', value: 'company-1' } }).customer).toEqual({
			type: 'company',
			id: 'company-1',
		});
	});

	it('omits the customer filter when nothing was set', () => {
		expect(buildDealFilter({}).customer).toBeUndefined();
	});
});

describe('Deal Create execution', () => {
	it('sends a minimal payload for a company customer', async () => {
		apiRequest.mockResolvedValueOnce({ data: { id: 'deal-1' } });

		await executeDeal.call(
			makeContext({
				title: 'New deal',
				customerId: { mode: 'companyList', value: 'company-1' },
			}),
			'create',
			0,
			new TeamleaderExecutionContext(),
		);

		expect(apiRequest.mock.calls[0][0]).toBe('/deals.create');
		expect(apiRequest.mock.calls[0][1]).toEqual({
			title: 'New deal',
			lead: { customer: { type: 'company', id: 'company-1' } },
		});
	});

	it('derives lead.customer.type = company from the Company locator mode', async () => {
		apiRequest.mockResolvedValueOnce({ data: {} });
		await executeDeal.call(
			makeContext({ title: 'D', customerId: { mode: 'companyList', value: 'c-1' } }),
			'create',
			0,
			new TeamleaderExecutionContext(),
		);
		expect((apiRequest.mock.calls[0][1] as IDataObject).lead).toEqual({
			customer: { type: 'company', id: 'c-1' },
		});
	});

	it('derives lead.customer.type = contact from the Contact locator mode', async () => {
		apiRequest.mockResolvedValueOnce({ data: {} });
		await executeDeal.call(
			makeContext({ title: 'D', customerId: { mode: 'contactList', value: 'p-1' } }),
			'create',
			0,
			new TeamleaderExecutionContext(),
		);
		expect((apiRequest.mock.calls[0][1] as IDataObject).lead).toEqual({
			customer: { type: 'contact', id: 'p-1' },
		});
	});

	it('throws when By ID mode is used without an explicit Customer Type', async () => {
		await expect(
			executeDeal.call(
				makeContext({ title: 'D', customerId: { mode: 'id', value: 'x-1' } }),
				'create',
				0,
				new TeamleaderExecutionContext(),
			),
		).rejects.toThrow('Choose Company or Contact for the customer ID');
	});

	it('wraps a supplied estimated value as Money', async () => {
		apiRequest.mockResolvedValueOnce({ data: {} });
		await executeDeal.call(
			makeContext({
				title: 'D',
				customerId: { mode: 'companyList', value: 'c-1' },
				estimatedValue: 1000,
				currency: 'USD',
			}),
			'create',
			0,
			new TeamleaderExecutionContext(),
		);
		expect((apiRequest.mock.calls[0][1] as IDataObject).estimated_value).toEqual({
			amount: 1000,
			currency: 'USD',
		});
	});

	it('does not send an estimated value merely because the numeric default of 0 is visible', async () => {
		apiRequest.mockResolvedValueOnce({ data: {} });
		await executeDeal.call(
			makeContext({
				title: 'D',
				customerId: { mode: 'companyList', value: 'c-1' },
				estimatedValue: 0,
			}),
			'create',
			0,
			new TeamleaderExecutionContext(),
		);
		expect((apiRequest.mock.calls[0][1] as IDataObject).estimated_value).toBeUndefined();
	});

	it('sends only the date part of the estimated closing date', async () => {
		apiRequest.mockResolvedValueOnce({ data: {} });
		await executeDeal.call(
			makeContext({
				title: 'D',
				customerId: { mode: 'companyList', value: 'c-1' },
				estimatedClosingDate: '2026-03-01T10:00:00.000Z',
			}),
			'create',
			0,
			new TeamleaderExecutionContext(),
		);
		expect((apiRequest.mock.calls[0][1] as IDataObject).estimated_closing_date).toBe('2026-03-01');
	});

	it('sends the supported phase_id but never an unsupported pipeline_id', async () => {
		apiRequest.mockResolvedValueOnce({ data: {} });
		await executeDeal.call(
			makeContext({
				title: 'D',
				customerId: { mode: 'companyList', value: 'c-1' },
				pipelineId: 'pipe-1',
				phaseId: 'phase-1',
			}),
			'create',
			0,
			new TeamleaderExecutionContext(),
		);
		const body = apiRequest.mock.calls[0][1] as IDataObject;
		expect(body.phase_id).toBe('phase-1');
		expect(body.pipeline_id).toBeUndefined();
	});
});

describe('Deal Update execution', () => {
	it('never exposes or sends phase_id (use Change Phase instead)', () => {
		const updateFields = dealFields.filter((field) =>
			(field.displayOptions?.show?.operation as string[] | undefined)?.includes('update'),
		);
		expect(updateFields.some((field) => field.name === 'phaseId')).toBe(false);
	});

	it('refuses an update with nothing to change, without sending accidental defaults', async () => {
		await expect(
			executeDeal.call(
				makeContext({ dealId: 'deal-1' }),
				'update',
				0,
				new TeamleaderExecutionContext(),
			),
		).rejects.toThrow('Fill in at least one field to update');
		expect(apiRequest).not.toHaveBeenCalled();
	});

	it('only sends estimated_value when Change Estimated Value is on, including an explicit 0', async () => {
		apiRequest.mockResolvedValueOnce({});
		await executeDeal.call(
			makeContext({
				dealId: 'deal-1',
				changeEstimatedValue: true,
				estimatedValue: 0,
				currency: 'EUR',
			}),
			'update',
			0,
			new TeamleaderExecutionContext(),
		);
		expect((apiRequest.mock.calls[0][1] as IDataObject).estimated_value).toEqual({
			amount: 0,
			currency: 'EUR',
		});
	});

	it('resolves the existing customer via fromDeal when Contact Person is set without Change Customer', async () => {
		apiRequest.mockResolvedValueOnce({
			data: { lead: { customer: { type: 'company', id: 'company-9' } } },
		});
		apiRequest.mockResolvedValueOnce({});

		await executeDeal.call(
			makeContext({ dealId: 'deal-1', contactPersonId: { mode: 'list', value: 'contact-5' } }),
			'update',
			0,
			new TeamleaderExecutionContext(),
		);

		expect(apiRequest.mock.calls[0][0]).toBe('/deals.info');
		expect(apiRequest.mock.calls[1][0]).toBe('/deals.update');
		expect((apiRequest.mock.calls[1][1] as IDataObject).lead).toEqual({
			customer: { type: 'company', id: 'company-9' },
			contact_person_id: 'contact-5',
		});
	});

	it('reads the deal at most once per execution context, however many items reference it', async () => {
		apiRequest.mockResolvedValueOnce({
			data: { lead: { customer: { type: 'company', id: 'company-9' } } },
		});
		apiRequest.mockResolvedValue({});

		const executionContext = new TeamleaderExecutionContext();
		const context = makeContext({
			dealId: 'deal-1',
			contactPersonId: { mode: 'list', value: 'contact-5' },
		});

		await executeDeal.call(context, 'update', 0, executionContext);
		await executeDeal.call(context, 'update', 1, executionContext);

		const infoCalls = apiRequest.mock.calls.filter((call) => call[0] === '/deals.info');
		expect(infoCalls).toHaveLength(1);
	});

	it('does not perform the existing-customer lookup when Change Customer is on', async () => {
		apiRequest.mockResolvedValueOnce({});
		await executeDeal.call(
			makeContext({
				dealId: 'deal-1',
				updateCustomer: true,
				customerId: { mode: 'companyList', value: 'company-2' },
				contactPersonId: { mode: 'list', value: 'contact-5' },
			}),
			'update',
			0,
			new TeamleaderExecutionContext(),
		);
		expect(apiRequest).toHaveBeenCalledTimes(1);
		expect(apiRequest.mock.calls[0][0]).toBe('/deals.update');
		expect((apiRequest.mock.calls[0][1] as IDataObject).lead).toEqual({
			customer: { type: 'company', id: 'company-2' },
			contact_person_id: 'contact-5',
		});
	});

	it('throws an actionable error when the deal has no readable customer to attach the contact person to', async () => {
		apiRequest.mockResolvedValueOnce({ data: {} });
		await expect(
			executeDeal.call(
				makeContext({ dealId: 'deal-1', contactPersonId: { mode: 'list', value: 'contact-5' } }),
				'update',
				0,
				new TeamleaderExecutionContext(),
			),
		).rejects.toThrow('Could not read the current customer of this deal');
	});
});

describe('Deal Change Phase execution', () => {
	it('sends only the supported move payload', async () => {
		apiRequest.mockResolvedValueOnce({});
		await executeDeal.call(
			makeContext({ dealId: 'deal-1', phaseId: 'phase-2' }),
			'move',
			0,
			new TeamleaderExecutionContext(),
		);
		expect(apiRequest.mock.calls[0]).toEqual(['/deals.move', { id: 'deal-1', phase_id: 'phase-2' }]);
	});

	it('requires a phase', async () => {
		await expect(
			executeDeal.call(
				makeContext({ dealId: 'deal-1', phaseId: '' }),
				'move',
				0,
				new TeamleaderExecutionContext(),
			),
		).rejects.toThrow('Select the phase to move the deal to');
	});
});

describe('fromDeal resolver', () => {
	it('shapes deals.info into the declared IResolvedDeal context', async () => {
		apiRequest.mockResolvedValueOnce({
			data: {
				title: 'Big Deal',
				department: { id: 'dept-1' },
				estimated_value: { amount: 500, currency: 'USD' },
				lead: {
					customer: { type: 'contact', id: 'contact-1' },
					contact_person: { type: 'contact', id: 'contact-2' },
				},
			},
		});

		const resolved = await resolveDeal(makeContext({}), 'deal-1');

		expect(resolved.id).toBe('deal-1');
		expect(resolved.title).toBe('Big Deal');
		expect(resolved.departmentId).toBe('dept-1');
		expect(resolved.currency).toBe('USD');
		expect(resolved.customer).toEqual({
			type: 'contact',
			id: 'contact-1',
			raw: { type: 'contact', id: 'contact-1' },
		});
		expect(resolved.contactPerson).toEqual({
			type: 'contact',
			id: 'contact-2',
			raw: { type: 'contact', id: 'contact-2' },
		});
	});

	it('leaves customer/contactPerson undefined when deals.info has no usable lead', async () => {
		apiRequest.mockResolvedValueOnce({ data: {} });
		const resolved = await resolveDeal(makeContext({}), 'deal-2');
		expect(resolved.customer).toBeUndefined();
		expect(resolved.contactPerson).toBeUndefined();
	});
});
