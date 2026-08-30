import type { IDataObject } from 'n8n-workflow';

import {
	TeamleaderTrigger,
	buildWebhookItem,
	findRegistration,
	normaliseTypes,
	registrationMatches,
	resolveEventTypes,
} from '../nodes/Teamleader/TeamleaderTrigger.node';
import {
	allWebhookTypes,
	commonWebhookTypeOptions,
	webhookEntityOptions,
	webhookTypeOptions,
} from '../nodes/Teamleader/descriptions/WebhookTypes';

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

/**
 * Hook context that carries RAW saved node parameters, the way a real n8n node
 * does. `getNodeParameter` applies declared defaults on top, exactly like n8n —
 * which is what makes the legacy-detection contract testable.
 */
function createSavedNodeContext(savedParameters: IDataObject, listData: IDataObject[] = []) {
	const declaredDefaults: IDataObject = {
		eventSelection: 'specific',
		events: [],
		commonEvents: [],
		entities: [],
	};

	const request = jest.fn().mockImplementation(async (_cred, options) => {
		if (String(options.url).includes('/webhooks.list')) return { data: listData };
		return '';
	});

	return {
		context: {
			getNodeWebhookUrl: () => WEBHOOK_URL,
			getNodeParameter: (name: string, fallback?: unknown) =>
				savedParameters[name] !== undefined
					? savedParameters[name]
					: (declaredDefaults[name] ?? fallback),
			getNode: () => ({
				name: 'Teamleader Trigger',
				type: 'teamleaderTrigger',
				parameters: savedParameters,
			}),
			getCredentials: jest.fn().mockResolvedValue({}),
			helpers: { httpRequestWithAuthentication: request },
		},
		request,
	};
}

const bodyOf = (request: jest.Mock, endpoint: string) =>
	callsTo(request, endpoint)[0]?.[1].body as IDataObject;

describe('trigger migration: workflows saved before Event Selection existed', () => {
	// The exact shape an old workflow stores: `events` present, no eventSelection.
	const LEGACY_SAVED = { events: ['deal.won', 'invoice.booked'] };

	it('keeps registering the saved events, ignoring the new default', () => {
		const types = resolveEventTypes(LEGACY_SAVED, (name, fallback) =>
			name === 'eventSelection' ? 'common' : fallback,
		);
		expect(types).toEqual(['deal.won', 'invoice.booked']);
	});

	it('is not fooled by a default that makes the parameter look present', () => {
		// This is the trap: getNodeParameter happily returns a default for a
		// parameter the workflow never stored.
		const read = (name: string, fallback: unknown) =>
			name === 'eventSelection' ? 'all' : fallback;
		expect(resolveEventTypes(LEGACY_SAVED, read)).toEqual(['deal.won', 'invoice.booked']);
		expect(resolveEventTypes(LEGACY_SAVED, read)).not.toEqual(normaliseTypes(allWebhookTypes));
	});

	it('registers exactly the legacy events end to end', async () => {
		const { context, request } = createSavedNodeContext(LEGACY_SAVED);
		await methods.create.call(context as never);

		expect(bodyOf(request, '/webhooks.register')).toEqual({
			url: WEBHOOK_URL,
			types: ['deal.won', 'invoice.booked'],
		});
	});

	it('still reports an existing legacy registration as existing', async () => {
		const { context } = createSavedNodeContext(LEGACY_SAVED, [
			{ url: WEBHOOK_URL, types: ['deal.won', 'invoice.booked'] },
		]);
		expect(await methods.checkExists.call(context as never)).toBe(true);
	});

	it('unregisters a legacy trigger using what Teamleader has stored', async () => {
		const { context, request } = createSavedNodeContext(LEGACY_SAVED, [
			{ url: WEBHOOK_URL, types: ['deal.won', 'invoice.booked'] },
		]);
		await methods.delete.call(context as never);

		expect(bodyOf(request, '/webhooks.unregister')).toEqual({
			url: WEBHOOK_URL,
			types: ['deal.won', 'invoice.booked'],
		});
	});

	it('treats a stored eventSelection as authoritative once it exists', () => {
		const types = resolveEventTypes(
			{ eventSelection: 'specific', events: ['contact.added'] },
			(name, fallback) => (name === 'events' ? ['contact.added'] : fallback),
		);
		expect(types).toEqual(['contact.added']);
	});
});

describe('trigger Event Selection modes', () => {
	const read = (saved: IDataObject) => (name: string, fallback: unknown) =>
		saved[name] !== undefined ? saved[name] : fallback;

	it('Common Events registers only what was ticked', () => {
		const saved = { eventSelection: 'common', commonEvents: ['deal.won', 'invoice.sent'] };
		expect(resolveEventTypes(saved, read(saved))).toEqual(['deal.won', 'invoice.sent']);
	});

	it('By Entity expands to every event of those entities', () => {
		const saved = { eventSelection: 'entity', entities: ['deal'] };
		const types = resolveEventTypes(saved, read(saved));

		expect(types).toEqual(
			normaliseTypes([
				'deal.created',
				'deal.deleted',
				'deal.lost',
				'deal.moved',
				'deal.updated',
				'deal.won',
			]),
		);
		expect(types.every((type) => type.startsWith('deal.'))).toBe(true);
	});

	it('By Entity across several entities de-duplicates and sorts', () => {
		const saved = { eventSelection: 'entity', entities: ['deal', 'deal', 'product'] };
		const types = resolveEventTypes(saved, read(saved));

		expect(new Set(types).size).toBe(types.length);
		expect([...types]).toEqual([...types].sort());
		expect(types).toContain('product.added');
	});

	it('All Events registers every known type and nothing else', () => {
		const saved = { eventSelection: 'all' };
		const types = resolveEventTypes(saved, read(saved));

		expect(types).toEqual(normaliseTypes(allWebhookTypes));
		expect(types).toHaveLength(new Set(allWebhookTypes).size);
	});

	it('never invents a quotation event type in any mode', () => {
		for (const saved of [
			{ eventSelection: 'all' },
			{ eventSelection: 'entity', entities: webhookEntityOptions.map((option) => option.value) },
		]) {
			const types = resolveEventTypes(saved as IDataObject, read(saved as IDataObject));
			expect(types.some((type) => type.startsWith('quotation.'))).toBe(false);
		}
	});

	it('offers only real event types in the Common Events shortcut', () => {
		const known = new Set(webhookTypeOptions.map((option) => option.value));
		for (const option of commonWebhookTypeOptions) {
			expect(known.has(option.value)).toBe(true);
		}
	});

	it('derives its entity list from the real event types', () => {
		const entities = new Set(webhookEntityOptions.map((option) => option.value));
		for (const option of webhookTypeOptions) {
			expect(entities.has(String(option.value).split('.')[0])).toBe(true);
		}
		expect(entities.has('quotation')).toBe(false);
	});

	it('refuses to register an empty selection', async () => {
		const { context } = createSavedNodeContext({ eventSelection: 'common', commonEvents: [] });
		await expect(methods.create.call(context as never)).rejects.toThrow(
			'Select at least one Teamleader event',
		);
	});

	it('registers a By Entity selection without duplicates', async () => {
		const { context, request } = createSavedNodeContext({
			eventSelection: 'entity',
			entities: ['product'],
		});
		await methods.create.call(context as never);

		const types = bodyOf(request, '/webhooks.register').types as string[];
		expect(types).toEqual(['product.added', 'product.deleted', 'product.updated']);
		expect(new Set(types).size).toBe(types.length);
	});

	it('re-registers when the selection grew, replacing the old registration once', async () => {
		const { context, request } = createSavedNodeContext(
			{ eventSelection: 'specific', events: ['deal.won', 'deal.lost'] },
			[{ url: WEBHOOK_URL, types: ['deal.won'] }],
		);

		expect(await methods.checkExists.call(context as never)).toBe(false);
		await methods.create.call(context as never);

		expect(callsTo(request, '/webhooks.unregister')).toHaveLength(1);
		expect(callsTo(request, '/webhooks.register')).toHaveLength(1);
		expect(bodyOf(request, '/webhooks.register').types).toEqual(['deal.lost', 'deal.won']);
	});

	it('makes no API read while handling an incoming webhook', async () => {
		const request = jest.fn();
		const trigger = new TeamleaderTrigger();
		const result = await trigger.webhook.call({
			getBodyData: () => ({ type: 'deal.won', subject: { type: 'deal', id: 'deal-1' } }),
			helpers: {
				returnJsonArray: (items: IDataObject[]) => items.map((json) => ({ json })),
				httpRequestWithAuthentication: request,
			},
		} as never);

		expect(request).not.toHaveBeenCalled();
		expect(result.workflowData?.[0][0].json).toMatchObject({
			eventType: 'deal.won',
			entityId: 'deal-1',
			entityType: 'deal',
		});
	});
});
