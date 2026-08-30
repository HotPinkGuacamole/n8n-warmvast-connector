import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import * as listSearch from '../nodes/Teamleader/methods/listSearch';
import * as loadOptions from '../nodes/Teamleader/methods/loadOptions';
import { Teamleader } from '../nodes/Teamleader/Teamleader.node';
import { TeamleaderTrigger } from '../nodes/Teamleader/TeamleaderTrigger.node';
import { ADVANCED_OPTIONS_DISPLAY_NAME, ADVANCED_OPTIONS_NAME } from '../nodes/Teamleader/v2/descriptions/V2Common';

/**
 * Static UX audit of every V2 field.
 *
 * n8n's editor cannot be rendered in a unit test, but the property tree it
 * renders from can be inspected — and most UX regressions are visible there:
 * a dropdown pointing at a load-options method that no longer exists, a raw
 * API name leaking into a label, a locator that lost its By ID escape hatch,
 * a destructive operation without its notice.
 */

const v2 = new Teamleader().getNodeType(2);
const properties = v2.description.properties;

const resourceField = properties.find((property) => property.name === 'resource');
const resources = (resourceField?.options ?? []).map(
	(option) => (option as INodePropertyOptions).value as string,
);

/** Operations declared for one resource. */
function operationsOf(resource: string): string[] {
	const field = properties.find(
		(property) =>
			property.name === 'operation' &&
			(property.displayOptions?.show?.resource as string[] | undefined)?.includes(resource),
	);
	return (field?.options ?? []).map((option) => (option as INodePropertyOptions).value as string);
}

/** Every field belonging to a resource (its operation selector excluded). */
function fieldsOf(resource: string): INodeProperties[] {
	return properties.filter(
		(property) =>
			property.name !== 'operation' &&
			property.name !== 'resource' &&
			(property.displayOptions?.show?.resource as string[] | undefined)?.includes(resource),
	);
}

/** Walk a property and everything nested inside collections/fixedCollections. */
function walk(property: INodeProperties): INodeProperties[] {
	const nested: INodeProperties[] = [];

	if (property.type === 'collection' && Array.isArray(property.options)) {
		for (const option of property.options as INodeProperties[]) {
			nested.push(option, ...walk(option));
		}
	}

	if (property.type === 'fixedCollection' && Array.isArray(property.options)) {
		for (const group of property.options as Array<{ values?: INodeProperties[] }>) {
			for (const value of group.values ?? []) {
				nested.push(value, ...walk(value));
			}
		}
	}

	return nested;
}

const allV2Fields: INodeProperties[] = resources.flatMap((resource) => {
	const own = fieldsOf(resource);
	return own.flatMap((field) => [field, ...walk(field)]);
});

const triggerFields = new TeamleaderTrigger().description.properties;

describe('V2 field hygiene', () => {
	it('gives every field a default value', () => {
		const missing = allV2Fields
			.filter((field) => field.default === undefined)
			.map((field) => field.name);
		expect(missing).toEqual([]);
	});

	it('uses camelCase parameter names — no API snake_case leaks into V2', () => {
		const snake = allV2Fields.filter((field) => field.name.includes('_')).map((field) => field.name);
		expect(snake).toEqual([]);
	});

	it('uses business language in labels, not raw API field names', () => {
		// Notices carry prose, not labels, so they are judged by readability
		// rather than by the naming rules that apply to inputs.
		const jargon = allV2Fields
			.filter((field) => field.type !== 'notice')
			.filter(
				(field) =>
					/_/.test(field.displayName) ||
					(/\bid\b/i.test(field.displayName) &&
						!/Name or ID|Names or IDs|IDs$|ID$/.test(field.displayName)),
			);
		expect(jargon.map((field) => field.displayName)).toEqual([]);
	});

	it('shows fields only for operations that exist on their resource', () => {
		const problems: string[] = [];

		for (const resource of resources) {
			const declared = new Set(operationsOf(resource));
			for (const field of fieldsOf(resource)) {
				const shown = (field.displayOptions?.show?.operation as string[] | undefined) ?? [];
				for (const operation of shown) {
					if (!declared.has(operation)) problems.push(`${resource}.${operation} (${field.name})`);
				}
				const hidden = (field.displayOptions?.hide?.operation as string[] | undefined) ?? [];
				for (const operation of hidden) {
					if (!declared.has(operation)) problems.push(`${resource}.${operation} (${field.name})`);
				}
			}
		}

		expect(problems).toEqual([]);
	});

	it('names the Advanced Options collection identically everywhere', () => {
		const advanced = allV2Fields.filter((field) => field.name === ADVANCED_OPTIONS_NAME);
		expect(advanced.length).toBeGreaterThan(0);
		for (const field of advanced) {
			expect(field.displayName).toBe(ADVANCED_OPTIONS_DISPLAY_NAME);
			expect(field.type).toBe('collection');
		}
	});
});

describe('V2 dropdowns point at methods that exist', () => {
	const loadOptionNames = new Set(
		Object.keys(loadOptions).filter(
			(key) => typeof (loadOptions as Record<string, unknown>)[key] === 'function',
		),
	);
	const searchNames = new Set(
		Object.keys(listSearch).filter(
			(key) => typeof (listSearch as Record<string, unknown>)[key] === 'function',
		),
	);

	it('resolves every loadOptionsMethod', () => {
		const missing = allV2Fields
			.map((field) => field.typeOptions?.loadOptionsMethod)
			.filter((method): method is string => typeof method === 'string')
			.filter((method) => !loadOptionNames.has(method));
		expect(Array.from(new Set(missing))).toEqual([]);
	});

	it('resolves every searchListMethod', () => {
		const missing = allV2Fields
			.flatMap((field) => field.modes ?? [])
			.map((mode) => mode.typeOptions?.searchListMethod)
			.filter((method): method is string => typeof method === 'string')
			.filter((method) => !searchNames.has(method));
		expect(Array.from(new Set(missing))).toEqual([]);
	});

	it('resolves every loadOptionsDependsOn path to a real parameter', () => {
		const knownNames = new Set(allV2Fields.map((field) => field.name));
		const problems: string[] = [];

		for (const field of allV2Fields) {
			for (const dependency of field.typeOptions?.loadOptionsDependsOn ?? []) {
				// Paths look like `dealId.value` or `advancedOptions.lookupDepartmentId`.
				const root = String(dependency).split('.')[0];
				const leaf = String(dependency).split('.').pop() as string;
				if (!knownNames.has(root) && !knownNames.has(leaf)) {
					problems.push(`${field.name} -> ${dependency}`);
				}
			}
		}

		expect(problems).toEqual([]);
	});
});

describe('V2 keeps the automation escape hatch', () => {
	it('gives every resourceLocator a By ID mode', () => {
		const locators = allV2Fields.filter((field) => field.type === 'resourceLocator');
		expect(locators.length).toBeGreaterThan(10);

		const withoutById = locators
			.filter((field) => !(field.modes ?? []).some((mode) => mode.name === 'id'))
			.map((field) => field.name);
		expect(withoutById).toEqual([]);
	});

	it('makes every By ID mode a free-text field, so expressions work', () => {
		for (const field of allV2Fields.filter((entry) => entry.type === 'resourceLocator')) {
			const byId = (field.modes ?? []).find((mode) => mode.name === 'id');
			expect(byId?.type).toBe('string');
		}
	});

	it('offers a picker for every entity reference that has a search method', () => {
		// A raw string field named `...Id` is only acceptable where this connector
		// genuinely has no lookup: projects, files and payment/tax-style options.
		const allowedRawIdFields = [
			'projectId',
			'subscriptionId',
			'attachments',
			'senderId',
			'additionalQuotationIds',
			'ids',
		];

		const rawIdFields = allV2Fields
			.filter((field) => field.type === 'string' && /Ids?$/.test(field.name))
			.map((field) => field.name)
			.filter((name) => !allowedRawIdFields.includes(name));

		expect(rawIdFields).toEqual([]);
	});
});

describe('V2 is honest about destructive actions', () => {
	const destructive: Array<[string, string]> = [
		['contact', 'delete'],
		['company', 'delete'],
		['product', 'delete'],
		['quotation', 'delete'],
		['invoice', 'book'],
		['invoice', 'removePayments'],
		['invoice', 'credit'],
	];

	it.each(destructive)('%s.%s carries a notice', (resource, operation) => {
		const notices = fieldsOf(resource).filter(
			(field) =>
				field.type === 'notice' &&
				(field.displayOptions?.show?.operation as string[] | undefined)?.includes(operation),
		);
		expect(notices.length).toBeGreaterThan(0);
		expect(notices[0].displayName.length).toBeGreaterThan(20);
	});

	it('never fakes a confirmation checkbox', () => {
		const fakes = allV2Fields
			.filter((field) => field.type === 'boolean' && /confirm/i.test(field.name))
			.map((field) => field.name);
		expect(fakes).toEqual([]);
	});
});

describe('V2 form size stays workable', () => {
	it.each(
		resources.flatMap((resource) =>
			operationsOf(resource).map((operation) => [resource, operation] as [string, string]),
		),
	)('%s.%s shows a manageable number of always-visible fields', (resource, operation) => {
		// An Update form legitimately lists every editable field of its record,
		// so it gets a little more room than a Create or a read.
		const budget = operation.startsWith('update') ? 14 : 12;
		const shown = fieldsOf(resource).filter((field) => {
			const show = field.displayOptions?.show ?? {};
			if (!(show.operation as string[] | undefined)?.includes(operation)) return false;
			// Count only fields with no further condition: those are always on screen.
			const conditions = Object.keys(show).filter(
				(key) => key !== 'resource' && key !== 'operation',
			);
			return conditions.length === 0;
		});

		expect(shown.length).toBeLessThanOrEqual(budget);
	});

	it('puts Advanced Options last on every operation that has one', () => {
		for (const resource of resources) {
			const fields = fieldsOf(resource);
			for (const operation of operationsOf(resource)) {
				const forOperation = fields.filter((field) =>
					(field.displayOptions?.show?.operation as string[] | undefined)?.includes(operation),
				);
				const index = forOperation.findIndex((field) => field.name === ADVANCED_OPTIONS_NAME);
				if (index === -1) continue;

				const after = forOperation.slice(index + 1).map((field) => field.name);
				// Only notices may follow Advanced Options; real inputs may not.
				const realInputsAfter = forOperation
					.slice(index + 1)
					.filter((field) => field.type !== 'notice')
					.map((field) => field.name);
				expect({ resource, operation, after: realInputsAfter }).toEqual({
					resource,
					operation,
					after: [],
				});
				expect(after.length).toBeLessThan(6);
			}
		}
	});
});

describe('Trigger stays lightweight and honest', () => {
	it('declares one webhook and no polling', () => {
		const trigger = new TeamleaderTrigger();
		expect(trigger.description.webhooks).toHaveLength(1);
		expect(trigger.description.polling).toBeFalsy();
	});

	it('gives every trigger field a default', () => {
		for (const field of triggerFields) {
			expect(field.default).toBeDefined();
		}
	});

	it('keeps the legacy Events field available for workflows that use it', () => {
		const events = triggerFields.find((field) => field.name === 'events');
		expect(events).toBeDefined();
		expect(events?.type).toBe('multiOptions');
	});
});
