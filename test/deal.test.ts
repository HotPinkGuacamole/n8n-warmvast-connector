import type { IDataObject } from 'n8n-workflow';

import {
	buildDealFilter,
	buildDealLead,
	buildDealPayload,
	executeDeal,
} from '../nodes/Teamleader/v1/actions/deal';

/** Minimal IExecuteFunctions stub driven by a parameter map. */
function createContext(params: IDataObject, request = jest.fn().mockResolvedValue({ data: {} })) {
	return {
		context: {
			getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
				name in params ? params[name] : fallback,
			getNode: () => ({ name: 'Teamleader', type: 'teamleader' }),
			getCredentials: jest.fn().mockResolvedValue({}),
			helpers: { httpRequestWithAuthentication: request },
		},
		request,
	};
}

const lastCall = (request: jest.Mock) => request.mock.calls[request.mock.calls.length - 1][1];

describe('buildDealPayload', () => {
	it('maps create fields including money, probability and closing date', () => {
		expect(
			buildDealPayload(
				{
					summary: 'Additional information',
					source_id: 'source-1',
					departmentId: 'dept-1',
					responsible_user_id: 'user-1',
					phase_id: 'phase-1',
					estimated_value: 1500,
					currency: 'USD',
					estimated_probability: 0.75,
					estimated_closing_date: '2026-05-09T00:00:00.000Z',
					customFields: { field: [{ id: 'cf-1', value: 'v' }] },
				},
				true,
			),
		).toEqual({
			summary: 'Additional information',
			source_id: 'source-1',
			department_id: 'dept-1',
			responsible_user_id: 'user-1',
			phase_id: 'phase-1',
			estimated_value: { amount: 1500, currency: 'USD' },
			estimated_probability: 0.75,
			estimated_closing_date: '2026-05-09',
			custom_fields: [{ id: 'cf-1', value: 'v' }],
		});
	});

	it('defaults the estimated value currency to EUR', () => {
		expect(buildDealPayload({ estimated_value: 10 }, true)).toEqual({
			estimated_value: { amount: 10, currency: 'EUR' },
		});
	});

	it('drops phase_id on update because deals.move handles phases', () => {
		expect(buildDealPayload({ title: 'New title', phase_id: 'phase-1' }, false)).toEqual({
			title: 'New title',
		});
	});

	it('omits every empty optional field', () => {
		expect(
			buildDealPayload(
				{
					summary: '',
					source_id: '',
					departmentId: '',
					responsible_user_id: '',
					estimated_value: '',
					estimated_closing_date: '',
					estimated_probability: '',
					customFields: {},
				},
				true,
			),
		).toEqual({});
		expect(buildDealPayload({}, true)).toEqual({});
	});
});

describe('buildDealLead', () => {
	it('supports a company customer', () => {
		expect(buildDealLead('company', 'company-1')).toEqual({
			customer: { type: 'company', id: 'company-1' },
		});
	});

	it('supports a contact customer with a contact person', () => {
		expect(buildDealLead('contact', 'contact-1', 'person-1')).toEqual({
			customer: { type: 'contact', id: 'contact-1' },
			contact_person_id: 'person-1',
		});
	});

	it('omits an empty contact person', () => {
		expect(buildDealLead('company', 'company-1', '  ')).toEqual({
			customer: { type: 'company', id: 'company-1' },
		});
	});
});

describe('buildDealFilter', () => {
	it('maps the supported list filters', () => {
		expect(
			buildDealFilter({
				term: 'Roof',
				customerType: 'contact',
				customerId: { mode: 'id', value: 'contact-1' },
				ids: 'a,b',
				pipelineIds: ['p1'],
				status: ['open', 'won'],
				phaseId: 'phase-1',
				responsibleUserId: 'user-1',
				estimatedClosingDateFrom: '2026-01-01T00:00:00.000Z',
				estimatedClosingDateUntil: '2026-01-31T00:00:00.000Z',
			}),
		).toEqual({
			term: 'Roof',
			customer: { type: 'contact', id: 'contact-1' },
			ids: ['a', 'b'],
			pipeline_ids: ['p1'],
			status: ['open', 'won'],
			phase_id: 'phase-1',
			responsible_user_id: 'user-1',
			estimated_closing_date_from: '2026-01-01',
			estimated_closing_date_until: '2026-01-31',
		});
	});

	it('returns an empty filter when nothing is set', () => {
		expect(buildDealFilter({})).toEqual({});
	});
});

describe('executeDeal', () => {
	it('creates a deal with title and lead', async () => {
		const { context, request } = createContext({
			title: 'New roof',
			customerType: 'company',
			customerId: { mode: 'list', value: 'company-1' },
			additionalFields: { responsible_user_id: 'user-1' },
		});

		await executeDeal.call(context as never, 'create', 0);

		expect(lastCall(request)).toMatchObject({
			url: expect.stringContaining('/deals.create'),
			body: {
				title: 'New roof',
				responsible_user_id: 'user-1',
				lead: { customer: { type: 'company', id: 'company-1' } },
			},
		});
	});

	it('updates a deal without touching the customer by default', async () => {
		const { context, request } = createContext({
			dealId: { mode: 'id', value: 'deal-1' },
			additionalFields: { title: 'Renamed' },
			updateCustomer: false,
		});

		await executeDeal.call(context as never, 'update', 0);

		const body = lastCall(request).body;
		expect(body).toEqual({ id: 'deal-1', title: 'Renamed' });
		expect(body.lead).toBeUndefined();
	});

	it('updates the customer when requested', async () => {
		const { context, request } = createContext({
			dealId: { mode: 'id', value: 'deal-1' },
			additionalFields: {},
			updateCustomer: true,
			customerType: 'contact',
			customerId: { mode: 'id', value: 'contact-9' },
		});

		await executeDeal.call(context as never, 'update', 0);

		expect(lastCall(request).body).toEqual({
			id: 'deal-1',
			lead: { customer: { type: 'contact', id: 'contact-9' } },
		});
	});

	it('rejects an update with no fields selected', async () => {
		const { context } = createContext({
			dealId: { mode: 'id', value: 'deal-1' },
			additionalFields: {},
			updateCustomer: false,
		});

		await expect(executeDeal.call(context as never, 'update', 0)).rejects.toThrow(
			/at least one field/i,
		);
	});

	it('moves a deal to another phase', async () => {
		const { context, request } = createContext({
			dealId: { mode: 'id', value: 'deal-1' },
			phaseId: 'phase-2',
		});

		const result = await executeDeal.call(context as never, 'move', 0);

		expect(lastCall(request)).toMatchObject({
			url: expect.stringContaining('/deals.move'),
			body: { id: 'deal-1', phase_id: 'phase-2' },
		});
		expect(result).toEqual([{ success: true, id: 'deal-1', phase_id: 'phase-2' }]);
	});

	it('requires a phase when moving', async () => {
		const { context } = createContext({ dealId: { mode: 'id', value: 'deal-1' }, phaseId: '' });

		await expect(executeDeal.call(context as never, 'move', 0)).rejects.toThrow(/phase is required/i);
	});

	it('marks a deal as won', async () => {
		const { context, request } = createContext({ dealId: { mode: 'id', value: 'deal-1' } });

		const result = await executeDeal.call(context as never, 'win', 0);

		expect(lastCall(request)).toMatchObject({
			url: expect.stringContaining('/deals.win'),
			body: { id: 'deal-1' },
		});
		expect(result).toEqual([{ success: true, id: 'deal-1', status: 'won' }]);
	});

	it('marks a deal as lost with reason and remark', async () => {
		const { context, request } = createContext({
			dealId: { mode: 'id', value: 'deal-1' },
			reasonId: 'reason-1',
			extraInfo: 'Decision postponed',
		});

		const result = await executeDeal.call(context as never, 'lose', 0);

		expect(lastCall(request)).toMatchObject({
			url: expect.stringContaining('/deals.lose'),
			body: { id: 'deal-1', reason_id: 'reason-1', extra_info: 'Decision postponed' },
		});
		expect(result).toEqual([{ success: true, id: 'deal-1', status: 'lost' }]);
	});

	it('omits the optional lost reason and remark when empty', async () => {
		const { context, request } = createContext({
			dealId: { mode: 'id', value: 'deal-1' },
			reasonId: '',
			extraInfo: '',
		});

		await executeDeal.call(context as never, 'lose', 0);

		expect(lastCall(request).body).toEqual({ id: 'deal-1' });
	});

	it('sends includes only when custom fields are requested', async () => {
		const { context, request } = createContext({
			dealId: { mode: 'id', value: 'deal-1' },
			options: {},
		});

		await executeDeal.call(context as never, 'get', 0);

		expect(lastCall(request).body).toEqual({ id: 'deal-1' });
	});

	it('rejects an unsupported operation', async () => {
		const { context } = createContext({});

		await expect(executeDeal.call(context as never, 'archive', 0)).rejects.toThrow(
			/not supported for resource "deal"/,
		);
	});
});
