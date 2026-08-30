import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { teamleaderApiRequest } from './helpers/GenericFunctions';
import {
	allWebhookTypes,
	commonWebhookTypeOptions,
	entityOf,
	webhookEntityOptions,
	webhookTypeOptions,
} from './descriptions/WebhookTypes';

/** A registration as returned by webhooks.list. */
interface ITeamleaderWebhook {
	url: string;
	types: string[];
}

/** Normalise the `types` node parameter into a sorted, de-duplicated list. */
export function normaliseTypes(value: unknown): string[] {
	const raw = Array.isArray(value) ? value : value ? [value] : [];
	const types = raw
		.map((entry) => String(entry).trim())
		.filter((entry) => entry.length > 0);
	return Array.from(new Set(types)).sort();
}

/**
 * Find the registration for this exact n8n webhook URL.
 *
 * Teamleader stores one registration per URL, so matching on the URL alone is
 * enough and guarantees we never touch registrations of other integrations.
 */
export function findRegistration(
	registrations: ITeamleaderWebhook[],
	url: string,
): ITeamleaderWebhook | undefined {
	return registrations.find((entry) => entry?.url === url);
}

/** True when an existing registration already covers every selected type. */
export function registrationMatches(
	registration: ITeamleaderWebhook | undefined,
	types: string[],
): boolean {
	if (!registration) return false;
	const existing = normaliseTypes(registration.types);
	return types.every((type) => existing.includes(type));
}

/** Convert an incoming Teamleader webhook body into the n8n item payload. */
export function buildWebhookItem(body: IDataObject): IDataObject {
	const item: IDataObject = { ...body };

	// Teamleader sends the event name as `type` and the entity as `id` / `subject`.
	if (typeof body.type === 'string') item.eventType = body.type;

	const subject = body.subject as IDataObject | undefined;
	if (subject && typeof subject === 'object') {
		if (typeof subject.id === 'string') item.entityId = subject.id;
		if (typeof subject.type === 'string') item.entityType = subject.type;
	} else if (typeof body.id === 'string') {
		item.entityId = body.id;
	}

	return item;
}


/**
 * Which event types this node should register.
 *
 * MIGRATION CONTRACT. Workflows saved before `eventSelection` existed contain
 * only `events`. `getNodeParameter('eventSelection')` cannot detect that: it
 * happily returns the *default* for a parameter the workflow never stored, so
 * an old trigger would silently start registering something else.
 *
 * The raw saved parameters are therefore the source of truth: if the workflow
 * did not store `eventSelection`, the node keeps registering exactly its saved
 * `events`, whatever the current default happens to be.
 */
export function resolveEventTypes(
	rawParameters: IDataObject | undefined,
	read: (name: string, fallback: unknown) => unknown,
): string[] {
	// A node always carries its saved parameters in n8n; without them nothing can
	// be proven about what was stored, so the pre-existing behaviour is kept.
	if (!rawParameters || typeof rawParameters !== 'object') {
		return normaliseTypes(read('events', []));
	}

	const legacy = !Object.prototype.hasOwnProperty.call(rawParameters, 'eventSelection');
	if (legacy) return normaliseTypes(rawParameters.events);

	const selection = read('eventSelection', 'specific') as string;

	if (selection === 'all') return normaliseTypes(allWebhookTypes);

	if (selection === 'common') return normaliseTypes(read('commonEvents', []));

	if (selection === 'entity') {
		const entities = normaliseTypes(read('entities', []));
		return normaliseTypes(
			allWebhookTypes.filter((type) => entities.includes(entityOf(type))),
		);
	}

	return normaliseTypes(read('events', []));
}

export class TeamleaderTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Teamleader Trigger',
		name: 'teamleaderTrigger',
		icon: 'file:teamleader.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{ $parameter["eventSelection"] === "all" ? "All events" : ($parameter["events"] || []).join(", ") }}',
		description: 'Starts the workflow when a Teamleader Focus event fires',
		defaults: {
			name: 'Teamleader Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'teamleaderOAuth2Api',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event Selection',
				name: 'eventSelection',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Specific Events',
						value: 'specific',
						description: 'Pick exactly the event types you want',
					},
					{
						name: 'Common Events',
						value: 'common',
						description: 'Choose from the handful of events most automations use',
					},
					{
						name: 'By Entity',
						value: 'entity',
						description: 'Every event of the entities you choose, e.g. all deal events',
					},
					{
						name: 'All Events',
						value: 'all',
						description: 'Every Teamleader event type. Expect a lot of traffic.',
					},
				],
				// Specific Events is the default so a trigger saved before this field
				// existed still shows its own saved event list when it is reopened.
				default: 'specific',
				description: 'How to choose which Teamleader events start this workflow',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: [],
				description: 'The Teamleader event types that trigger this workflow',
				options: webhookTypeOptions,
				displayOptions: { show: { eventSelection: ['specific'] } },
			},
			{
				displayName: 'Common Events',
				name: 'commonEvents',
				type: 'multiOptions',
				required: true,
				default: [],
				description: 'The everyday Teamleader events that trigger this workflow',
				options: commonWebhookTypeOptions,
				displayOptions: { show: { eventSelection: ['common'] } },
			},
			{
				displayName: 'Entities',
				name: 'entities',
				type: 'multiOptions',
				required: true,
				default: [],
				description: 'Every event type of these entities triggers this workflow',
				options: webhookEntityOptions,
				displayOptions: { show: { eventSelection: ['entity'] } },
			},
			{
				displayName:
					'All Events registers every Teamleader event type on this webhook. Filter early in the workflow, or the executions list fills up quickly.',
				name: 'allEventsNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { eventSelection: ['all'] } },
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const types = resolveEventTypes(this.getNode().parameters, (name, fallback) =>
					this.getNodeParameter(name, fallback),
				);

				const response = await teamleaderApiRequest.call(this, '/webhooks.list', {});
				const registrations = (
					Array.isArray(response.data) ? response.data : []
				) as ITeamleaderWebhook[];

				const existing = findRegistration(registrations, webhookUrl);

				// Only treat it as existing when it already covers every selected type,
				// otherwise let create() re-register with the current selection.
				return registrationMatches(existing, types);
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const types = resolveEventTypes(this.getNode().parameters, (name, fallback) =>
					this.getNodeParameter(name, fallback),
				);

				if (types.length === 0) {
					throw new NodeOperationError(this.getNode(), 'Select at least one Teamleader event');
				}

				if (!webhookUrl || webhookUrl.includes('//localhost')) {
					throw new NodeOperationError(
						this.getNode(),
						'Teamleader cannot reach this webhook URL. Use a publicly reachable n8n instance.',
					);
				}

				// Replace an outdated registration for this exact URL before creating a new one.
				const response = await teamleaderApiRequest.call(this, '/webhooks.list', {});
				const registrations = (
					Array.isArray(response.data) ? response.data : []
				) as ITeamleaderWebhook[];
				const existing = findRegistration(registrations, webhookUrl);

				if (existing) {
					if (registrationMatches(existing, types)) return true;
					await teamleaderApiRequest.call(this, '/webhooks.unregister', {
						url: webhookUrl,
						types: normaliseTypes(existing.types),
					});
				}

				await teamleaderApiRequest.call(this, '/webhooks.register', {
					url: webhookUrl,
					types,
				});

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const types = resolveEventTypes(this.getNode().parameters, (name, fallback) =>
					this.getNodeParameter(name, fallback),
				);

				const response = await teamleaderApiRequest.call(this, '/webhooks.list', {});
				const registrations = (
					Array.isArray(response.data) ? response.data : []
				) as ITeamleaderWebhook[];
				const existing = findRegistration(registrations, webhookUrl);

				// Nothing registered for this node's URL: deactivation is already idempotent.
				if (!existing) return true;

				await teamleaderApiRequest.call(this, '/webhooks.unregister', {
					url: webhookUrl,
					types: normaliseTypes(existing.types).length > 0 ? normaliseTypes(existing.types) : types,
				});

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;

		return {
			workflowData: [this.helpers.returnJsonArray([buildWebhookItem(body)])],
		};
	}
}
