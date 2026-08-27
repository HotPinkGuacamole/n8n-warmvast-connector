import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';

import { teamleaderApiRequest } from '../helpers/GenericFunctions';
import { buildPage } from '../helpers/utils';

const PAGE_SIZE = 50;

async function search(
	context: ILoadOptionsFunctions,
	endpoint: string,
	filter: IDataObject,
	labelFn: (item: IDataObject) => string,
	paginationToken?: string,
	sort?: IDataObject[],
): Promise<INodeListSearchResult> {
	const pageNumber = paginationToken ? Number(paginationToken) : 1;

	const body: IDataObject = {
		filter,
		page: buildPage(PAGE_SIZE, pageNumber),
	};
	if (sort) body.sort = sort;

	const response = await teamleaderApiRequest.call(context, endpoint, body);
	const data = Array.isArray(response.data) ? (response.data as IDataObject[]) : [];

	const results: INodeListSearchItems[] = data
		.filter((item) => typeof item.id === 'string')
		.map((item) => ({
			name: labelFn(item) || (item.id as string),
			value: item.id as string,
			url: typeof item.web_url === 'string' ? (item.web_url as string) : undefined,
		}));

	return {
		results,
		paginationToken: data.length === PAGE_SIZE ? String(pageNumber + 1) : undefined,
	};
}

export async function searchContacts(
	this: ILoadOptionsFunctions,
	filterTerm?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const filter: IDataObject = { status: 'active' };
	if (filterTerm) filter.term = filterTerm;

	return await search(
		this,
		'/contacts.list',
		filter,
		(item) => {
			const name = `${(item.first_name as string) ?? ''} ${(item.last_name as string) ?? ''}`.trim();
			const emails = item.emails as Array<{ email?: string }> | undefined;
			const email = emails?.[0]?.email;
			return email ? `${name} (${email})` : name;
		},
		paginationToken,
		[{ field: 'name', order: 'asc' }],
	);
}

export async function searchCompanies(
	this: ILoadOptionsFunctions,
	filterTerm?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const filter: IDataObject = { status: 'active' };
	if (filterTerm) filter.term = filterTerm;

	return await search(
		this,
		'/companies.list',
		filter,
		(item) => item.name as string,
		paginationToken,
		[{ field: 'name', order: 'asc' }],
	);
}

export async function searchDeals(
	this: ILoadOptionsFunctions,
	filterTerm?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const filter: IDataObject = {};
	if (filterTerm) filter.term = filterTerm;

	return await search(this, '/deals.list', filter, (item) => item.title as string, paginationToken);
}

export async function searchProducts(
	this: ILoadOptionsFunctions,
	filterTerm?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const filter: IDataObject = {};
	if (filterTerm) filter.term = filterTerm;

	return await search(
		this,
		'/products.list',
		filter,
		(item) => {
			const name = (item.name as string) ?? '';
			const code = item.code ? ` [${item.code}]` : '';
			return `${name}${code}`;
		},
		paginationToken,
	);
}

export async function searchInvoices(
	this: ILoadOptionsFunctions,
	_filterTerm?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	return await search(
		this,
		'/invoices.list',
		{},
		(item) => {
			const number = (item.invoice_number as string) ?? (item.id as string);
			const date = (item.invoice_date as string) ?? '';
			return date ? `${number} (${date})` : number;
		},
		paginationToken,
	);
}

export async function searchQuotations(
	this: ILoadOptionsFunctions,
	_filterTerm?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	return await search(
		this,
		'/quotations.list',
		{},
		(item) => {
			const deal = item.deal as IDataObject | undefined;
			return (item.reference as string) ?? (deal?.id as string) ?? (item.id as string);
		},
		paginationToken,
	);
}
