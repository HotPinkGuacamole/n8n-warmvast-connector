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
	const body: IDataObject = departmentId ? { filter: { department_id: departmentId } } : {};
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

export async function getBusinessTypes(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const country = (this.getCurrentNodeParameter('businessTypeCountry') as string) || 'BE';
	const items = await teamleaderApiRequestAllItems.call(this, '/businessTypes.list', {
		country,
	});
	return toOptions(items, (item) => item.name as string);
}

export async function getProductCategories(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const departmentId = extractId(this.getCurrentNodeParameter('departmentId'));
	const body: IDataObject = departmentId ? { filter: { department_id: departmentId } } : {};
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

export async function getMailTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/mailTemplates.list', {});
	return toOptions(items, (item) => item.name as string);
}

export async function getTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/tags.list', {});
	return items
		.filter((item) => typeof item.name === 'string')
		.map((item) => ({ name: item.name as string, value: item.name as string }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCustomFieldDefinitions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const items = await teamleaderApiRequestAllItems.call(this, '/customFieldDefinitions.list', {});
	return toOptions(items, (item) => {
		const label = (item.label as string) ?? (item.id as string);
		const context = item.context ? ` [${item.context}]` : '';
		return `${label}${context}`;
	});
}
