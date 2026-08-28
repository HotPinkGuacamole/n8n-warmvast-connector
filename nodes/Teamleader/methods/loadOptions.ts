import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';

import { extractId, teamleaderApiRequestAllItems } from '../helpers/GenericFunctions';

function toOptions(
	items: IDataObject[],
	labelFn: (item: IDataObject) => string,
): INodePropertyOptions[] {
	return items
		.filter((item) => typeof item.id === 'string')
		.map((item) => ({ name: labelFn(item) || (item.id as string), value: item.id as string }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDepartments(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/departments.list', {
		filter: { status: ['active'] },
	});
	return toOptions(items, (item) => item.name as string);
}

export async function getUsers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/users.list', {
		filter: { status: ['active'] },
	});
	return toOptions(items, (item) => {
		const first = (item.first_name as string) ?? '';
		const last = (item.last_name as string) ?? '';
		const name = `${first} ${last}`.trim();
		return name || (item.email as string) || (item.id as string);
	});
}

export async function getDealPipelines(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/dealPipelines.list', {});
	return toOptions(items, (item) => item.name as string);
}

export async function getDealPhases(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const pipelineId = extractId(this.getCurrentNodeParameter('pipelineId'));
	const body: IDataObject = pipelineId ? { filter: { deal_pipeline_id: pipelineId } } : {};
	const items = await teamleaderApiRequestAllItems.call(this, '/dealPhases.list', body);
	// Phases are returned in flow order; keep that order instead of sorting.
	return items
		.filter((item) => typeof item.id === 'string')
		.map((item) => ({ name: (item.name as string) || (item.id as string), value: item.id as string }));
}

/**
 * True when a resolved load-options parameter looks like a real Teamleader ID
 * rather than an unresolved expression placeholder (e.g. `={{ $json.dept }}`).
 * An unresolved expression must never be sent to the API as a literal filter.
 */
function isLiteralId(value: string): boolean {
	return value.length > 0 && !value.includes('{') && !value.includes('}');
}

/**
 * V2 deal phases, scoped to a single pipeline when exactly one is literally
 * selected. Reads whichever of the two V2 pipeline parameters is present:
 * the singular `pipelineId` (Create/Update/Change Phase) or the multi-select
 * `filters.pipelineIds` (Get Many). With zero, multiple, or an unresolved
 * pipeline the list is unscoped and every label is prefixed with its
 * pipeline's name so the choice never becomes ambiguous. Phase order is
 * always preserved (never alphabetised). Kept separate from `getDealPhases`
 * above so V1 (which has no such scoping relationship) is never affected.
 */
export async function getDealPhasesScoped(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const singular = extractId(this.getCurrentNodeParameter('pipelineId'));
	const multi = this.getCurrentNodeParameter('filters.pipelineIds');
	const multiIds = Array.isArray(multi)
		? multi.filter((value): value is string => typeof value === 'string' && isLiteralId(value))
		: [];

	const scopedPipelineId = isLiteralId(singular)
		? singular
		: multiIds.length === 1
			? multiIds[0]
			: undefined;

	if (scopedPipelineId) {
		const items = await teamleaderApiRequestAllItems.call(this, '/dealPhases.list', {
			filter: { deal_pipeline_id: scopedPipelineId },
		});
		return items
			.filter((item) => typeof item.id === 'string')
			.map((item) => ({ name: (item.name as string) || (item.id as string), value: item.id as string }));
	}

	const [phases, pipelines] = await Promise.all([
		teamleaderApiRequestAllItems.call(this, '/dealPhases.list', {}),
		teamleaderApiRequestAllItems.call(this, '/dealPipelines.list', {}),
	]);

	const pipelineNames = new Map<string, string>();
	for (const pipeline of pipelines) {
		if (typeof pipeline.id === 'string') {
			pipelineNames.set(pipeline.id, (pipeline.name as string) || pipeline.id);
		}
	}

	return phases
		.filter((item) => typeof item.id === 'string')
		.map((item) => {
			const pipelineRef = item.deal_pipeline as IDataObject | undefined;
			const pipelineId =
				pipelineRef && typeof pipelineRef.id === 'string' ? pipelineRef.id : undefined;
			const pipelineName = pipelineId ? pipelineNames.get(pipelineId) : undefined;
			const label = (item.name as string) || (item.id as string);
			return {
				name: pipelineName ? `${pipelineName} — ${label}` : label,
				value: item.id as string,
			};
		});
}

export async function getDealSources(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/dealSources.list', {});
	return toOptions(items, (item) => item.name as string);
}

export async function getLostReasons(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/lostReasons.list', {});
	return toOptions(items, (item) => item.name as string);
}

export async function getTaxRates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const departmentId = extractId(this.getCurrentNodeParameter('departmentId'));
	const body: IDataObject = isLiteralId(departmentId) ? { filter: { department_id: departmentId } } : {};
	const items = await teamleaderApiRequestAllItems.call(this, '/taxRates.list', body);
	return toOptions(items, (item) => {
		const description = (item.description as string) ?? '';
		const rate = typeof item.rate === 'number' ? ` (${Math.round(item.rate * 10000) / 100}%)` : '';
		return `${description}${description.includes('%') ? '' : rate}`.trim();
	});
}

export async function getPaymentTerms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/paymentTerms.list', {});
	return items
		.filter((item) => typeof item.id === 'string')
		.map((item) => {
			const type = (item.type as string) ?? '';
			const days = item.days as number | undefined;
			const label = days ? `${type.replace(/_/g, ' ')} + ${days} days` : type.replace(/_/g, ' ');
			return { name: label || (item.id as string), value: item.id as string };
		});
}

export async function getWithholdingTaxRates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/withholdingTaxRates.list', {});
	return toOptions(items, (item) => (item.description as string) ?? (item.id as string));
}

export async function getPaymentMethods(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/paymentMethods.list', {});
	return toOptions(items, (item) => item.name as string);
}

/**
 * Business types are scoped per country. V2 keeps the country field at the top
 * level of the form, where reading the current value is dependable; V1 nests it
 * inside its Additional Fields collection, so that path is tried as well.
 * Anything unusable falls back to BE rather than returning an empty dropdown.
 */
export async function getBusinessTypes(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const candidates = [
		this.getCurrentNodeParameter('businessTypeCountry'),
		this.getCurrentNodeParameter('additionalFields.businessTypeCountry'),
	];

	let country = 'BE';
	for (const candidate of candidates) {
		if (typeof candidate !== 'string') continue;
		const normalised = candidate.trim().toUpperCase();
		if (/^[A-Z]{2}$/.test(normalised)) {
			country = normalised;
			break;
		}
	}

	const items = await teamleaderApiRequestAllItems.call(this, '/businessTypes.list', {
		country,
	});
	return toOptions(items, (item) => item.name as string);
}

export async function getProductCategories(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const departmentId = extractId(this.getCurrentNodeParameter('departmentId'));
	const body: IDataObject = isLiteralId(departmentId)
		? { filter: { department_id: departmentId } }
		: {};
	const items = await teamleaderApiRequestAllItems.call(this, '/productCategories.list', body);
	return toOptions(items, (item) => item.name as string);
}

export async function getUnitsOfMeasure(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/unitsOfMeasure.list', {});
	return toOptions(items, (item) => item.name as string);
}

export async function getPriceLists(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/priceLists.list', {});
	return toOptions(items, (item) => item.name as string);
}

export async function getProducts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/products.list', {});
	return toOptions(items, (item) => {
		const name = (item.name as string) ?? '';
		const code = item.code ? ` [${item.code}]` : '';
		return `${name}${code}`.trim();
	});
}

export async function getWorkTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/workTypes.list', {});
	return toOptions(items, (item) => item.name as string);
}

export async function getCurrencies(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	// Currencies are a fixed enum in the API; no endpoint returns the plain list.
	return ['BAM', 'CAD', 'CHF', 'CLP', 'CNY', 'COP', 'CZK', 'DKK', 'EUR', 'GBP', 'INR', 'ISK', 'JPY', 'MAD', 'MXN', 'NOK', 'PEN', 'PLN', 'RON', 'SEK', 'TRY', 'USD', 'ZAR']
		.map((code) => ({ name: code, value: code }));
}

/** Document templates require a department and a document type. */
async function documentTemplates(
	context: ILoadOptionsFunctions,
	documentType: string,
): Promise<INodePropertyOptions[]> {
	const departmentId = extractId(context.getCurrentNodeParameter('departmentId'));
	if (!departmentId) return [];

	const items = await teamleaderApiRequestAllItems.call(context, '/documentTemplates.list', {
		filter: {
			department_id: departmentId,
			document_type: documentType,
			status: ['active'],
		},
	});
	return toOptions(items, (item) => item.name as string);
}

export async function getInvoiceTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await documentTemplates(this, 'invoice');
}

export async function getQuotationTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await documentTemplates(this, 'quotation');
}

/**
 * `mailTemplates.list` requires `filter.type`; calling it without one fails.
 * Always go through this helper with an explicit template type.
 */
async function mailTemplates(
	context: ILoadOptionsFunctions,
	type: 'invoice' | 'quotation' | 'work_order' | 'credit_note',
): Promise<INodePropertyOptions[]> {
	const departmentId = extractId(context.getCurrentNodeParameter('departmentId'));
	const filter: IDataObject = { type };
	if (departmentId) filter.department_id = departmentId;

	const items = await teamleaderApiRequestAllItems.call(context, '/mailTemplates.list', {
		filter,
	});
	return toOptions(items, (item) => item.name as string);
}

export async function getMailTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	// Historically used by the invoice send operation only.
	return await mailTemplates(this, 'invoice');
}

export async function getInvoiceMailTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await mailTemplates(this, 'invoice');
}

export async function getQuotationMailTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await mailTemplates(this, 'quotation');
}

export async function getCreditNoteMailTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await mailTemplates(this, 'credit_note');
}

export async function getTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/tags.list', {});
	return items
		.filter((item) => typeof item.name === 'string')
		.map((item) => ({ name: item.name as string, value: item.name as string }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Contexts supported by `customFieldDefinitions.list`. */
export type CustomFieldContext =
	| 'contact'
	| 'company'
	| 'deal'
	| 'project'
	| 'milestone'
	| 'product'
	| 'invoice'
	| 'subscription'
	| 'ticket';

/**
 * Load custom field definitions, optionally scoped to a single Teamleader context.
 * Scoping is done server-side through `filter.context`; when a context is given the
 * `[context]` label suffix is dropped because every entry belongs to that context.
 */
async function customFieldDefinitions(
	context: ILoadOptionsFunctions,
	scope?: CustomFieldContext,
): Promise<INodePropertyOptions[]> {
	const body: IDataObject = scope ? { filter: { context: scope } } : {};
	const items = await teamleaderApiRequestAllItems.call(
		context,
		'/customFieldDefinitions.list',
		body,
	);

	return toOptions(items, (item) => {
		const label = (item.label as string) ?? (item.id as string);
		if (scope) return label;
		const itemContext = item.context ? ` [${item.context}]` : '';
		return `${label}${itemContext}`;
	});
}

export async function getCustomFieldDefinitions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await customFieldDefinitions(this);
}

export async function getContactCustomFieldDefinitions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await customFieldDefinitions(this, 'contact');
}

export async function getCompanyCustomFieldDefinitions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await customFieldDefinitions(this, 'company');
}

export async function getDealCustomFieldDefinitions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await customFieldDefinitions(this, 'deal');
}

export async function getProductCustomFieldDefinitions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await customFieldDefinitions(this, 'product');
}

export async function getInvoiceCustomFieldDefinitions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await customFieldDefinitions(this, 'invoice');
}
