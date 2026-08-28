import type { IDataObject } from 'n8n-workflow';

import {
	TeamleaderTrigger,
	buildWebhookItem,
	findRegistration,
	normaliseTypes,
	registrationMatches,
} from '../nodes/Teamleader/TeamleaderTrigger.node';
import { webhookTypeOptions } from '../nodes/Teamleader/descriptions/WebhookTypes';

const WEBHOOK_URL = 'https://n8n.example.com/webhook/abc-123/webhook';

/** Minimal IHookFunctions stub. */
function createHookContext(events: string[], listData: IDataObject[] = []) {
	const request = jest.fn().mockImplementation(async (_cred, options) => {
		if (String(options.url).includes('/webhooks.list')) return { data: listData };
		return '';
	});

	return {
		context: {
			getNodeWebhookUrl: () => WEBHOOK_URL,
			getNodeParameter: (name: string) => (name === 'events' ? events : undefined),
			getNode: () => ({ name: 'Teamleader Trigger', type: 'teamleaderTrigger' }),
			getCredentials: jest.fn().mockResolvedValue({}),
			helpers: { httpRequestWithAuthentication: request },
		},
		request,
	};
}

const callsTo = (request: jest.Mock, endpoint: string) =>
	request.mock.calls.filter((call) => String(call[1].url).includes(endpoint));

const methods = new TeamleaderTrigger().webhookMethods.default;

describe('event type selector', () => {
	it('only exposes officially supported Teamleader webhook types', () => {
		const values = webhookTypeOptions.map((option) => option.value);

		expect(values).toContain('contact.added');
		expect(values).toContain('company.updated');
		expect(values).toContain('deal.won');
		expect(values).toContain('invoice.booked');
		expect(values).toContain('product.added');
		// Teamleader does not publish quotation webhooks; none may be invented.
		expect(values.some((value) => String(value).startsWith('quotation.'))).toBe(false);
		expect(new Set(values).size).toBe(values.length);
	});
});

describe('normaliseTypes', () => {
	it('trims, de-duplicates and sorts the selection', () => {
		expect(normaliseTypes(['deal.won', ' contact.added ', 'deal.won', ''])).toEqual([
			'contact.added',
			'deal.won',
		]);
		expect(normaliseTypes(undefined)).toEqual([]);
	});
});

describe('findRegistration / registrationMatches', () => {
	const registrations = [
		{ url: 'https://other.example.com/webhook', types: ['deal.won'] },
		{ url: WEBHOOK_URL, types: ['contact.added', 'deal.won'] },
	];

	it('matches only on this node webhook URL', () => {
		expect(findRegistration(registrations, WEBHOOK_URL)?.types).toEqual([
			'contact.added',
			'deal.won',
		]);
		expect(findRegistration(registrations, 'https://unknown/webhook')).toBeUndefined();
	});

	it('detects when an existing registration already covers the selection', () => {
		const existing = registrations[1];
		expect(registrationMatches(existing, ['deal.won'])).toBe(true);
		expect(registrationMatches(existing, ['contact.added', 'deal.won'])).toBe(true);
		expect(registrationMatches(existing, ['invoice.booked'])).toBe(false);
		expect(registrationMatches(undefined, ['deal.won'])).toBe(false);
	});
});

describe('checkExists', () => {
	it('returns true when the same URL already covers the selected events', async () => {
		const { context } = createHookContext(
			['deal.won'],
			[{ url: WEBHOOK_URL, types: ['contact.added', 'deal.won'] }],
		);

		expect(await methods.checkExists.call(context as never)).toBe(true);
	});

	it('returns false when nothing is registered or the types differ', async () => {
		const none = createHookContext(['deal.won'], []);
		expect(await methods.checkExists.call(none.context as never)).toBe(false);

		const stale = createHookContext(
			['deal.won', 'invoice.booked'],
			[{ url: WEBHOOK_URL, types: ['deal.won'] }],
		);
		expect(await methods.checkExists.call(stale.context as never)).toBe(false);
	});

	it('ignores registrations belonging to other URLs', async () => {
		const { context } = createHookContext(
			['deal.won'],
			[{ url: 'https://other.example.com/webhook', types: ['deal.won'] }],
		);

		expect(await methods.checkExists.call(context as never)).toBe(false);
	});
});

describe('create', () => {
	it('registers the generated n8n webhook URL with the selected types', async () => {
		const { context, request } = createHookContext(['deal.won', 'contact.added']);

		expect(await methods.create.call(context as never)).toBe(true);

		const register = callsTo(request, '/webhooks.register');
		expect(register).toHaveLength(1);
		expect(register[0][1].body).toEqual({
			url: WEBHOOK_URL,
			types: ['contact.added', 'deal.won'],
		});
		expect(callsTo(request, '/webhooks.unregister')).toHaveLength(0);
	});

	it('does not register a duplicate when the registration already matches', async () => {
		const { context, request } = createHookContext(
			['deal.won'],
			[{ url: WEBHOOK_URL, types: ['deal.won'] }],
		);

		expect(await methods.create.call(context as never)).toBe(true);
		expect(callsTo(request, '/webhooks.register')).toHaveLength(0);
		expect(callsTo(request, '/webhooks.unregister')).toHaveLength(0);
	});

	it('replaces an outdated registration for the same URL', async () => {
		const { context, request } = createHookContext(
			['deal.won', 'invoice.booked'],
			[{ url: WEBHOOK_URL, types: ['deal.won'] }],
		);

		await methods.create.call(context as never);

		expect(callsTo(request, '/webhooks.unregister')[0][1].body).toEqual({
			url: WEBHOOK_URL,
			types: ['deal.won'],
		});
		expect(callsTo(request, '/webhooks.register')[0][1].body).toEqual({
			url: WEBHOOK_URL,
			types: ['deal.won', 'invoice.booked'],
		});
	});

	it('refuses to register without events', async () => {
		const { context } = createHookContext([]);

		await expect(methods.create.call(context as never)).rejects.toThrow(
			'Select at least one Teamleader event',
		);
	});
});

describe('delete', () => {
	it('unregisters only the registration of this node', async () => {
		const { context, request } = createHookContext(
			['deal.won'],
			[
				{ url: 'https://other.example.com/webhook', types: ['contact.added'] },
				{ url: WEBHOOK_URL, types: ['deal.won'] },
			],
		);

		expect(await methods.delete.call(context as never)).toBe(true);

		const unregister = callsTo(request, '/webhooks.unregister');
		expect(unregister).toHaveLength(1);
		expect(unregister[0][1].body).toEqual({ url: WEBHOOK_URL, types: ['deal.won'] });
	});

	it('is idempotent when nothing is registered', async () => {
		const { context, request } = createHookContext(['deal.won'], []);

		expect(await methods.delete.call(context as never)).toBe(true);
		expect(callsTo(request, '/webhooks.unregister')).toHaveLength(0);
	});
});

describe('buildWebhookItem', () => {
	it('preserves the event type and entity identifiers', () => {
		expect(
			buildWebhookItem({
				type: 'deal.won',
				subject: { type: 'deal', id: 'deal-1' },
				account: { type: 'account', id: 'acc-1' },
			}),
		).toEqual({
			type: 'deal.won',
			subject: { type: 'deal', id: 'deal-1' },
			account: { type: 'account', id: 'acc-1' },
			eventType: 'deal.won',
			entityType: 'deal',
			entityId: 'deal-1',
		});
	});

	it('falls back to a flat id and keeps unknown payloads intact', () => {
		expect(buildWebhookItem({ type: 'contact.added', id: 'c-1' })).toEqual({
			type: 'contact.added',
			id: 'c-1',
			eventType: 'contact.added',
			entityId: 'c-1',
		});
		expect(buildWebhookItem({ foo: 'bar' })).toEqual({ foo: 'bar' });
	});
});

describe('webhook()', () => {
	it('returns the payload as a normal n8n item', async () => {
		const returnJsonArray = jest.fn((data: IDataObject[]) => data.map((json) => ({ json })));
		const context = {
			getBodyData: () => ({ type: 'invoice.booked', subject: { type: 'invoice', id: 'inv-1' } }),
			helpers: { returnJsonArray },
		};

		const result = await new TeamleaderTrigger().webhook.call(context as never);

		expect(result.workflowData?.[0][0].json).toMatchObject({
			eventType: 'invoice.booked',
			entityType: 'invoice',
			entityId: 'inv-1',
		});
	});
});
