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

/**
 * Unlike quotations, `invoices.list` does support a `term` filter (invoice
 * number, purchase order number, payment reference and invoicee), so this is a
 * genuine server-side search rather than a filter over one loaded page.
 */
export async function searchInvoices(
	this: ILoadOptionsFunctions,
	filterTerm?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const filter: IDataObject = {};
	if (filterTerm) filter.term = filterTerm;

	return await search(
		this,
		'/invoices.list',
		filter,
		(item) => {
			const number = (item.invoice_number as string) ?? (item.id as string);
			const date = (item.invoice_date as string) ?? '';
			return date ? `${number} (${date})` : number;
		},
		paginationToken,
	);
}

/**
 * `quotations.list` has no term filter, so a typed search can only match inside
 * the page already loaded. That is filtered client-side here and stated in the
 * locator's hint ("Recent quotations; use By ID for older ones") — the picker
 * never pretends to search the whole history. Pagination stays driven by the
 * raw page size so paging past a filtered page still works.
 */
export async function searchQuotations(
	this: ILoadOptionsFunctions,
	filterTerm?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const page = await search(
		this,
		'/quotations.list',
		{},
		(item) => {
			const deal = item.deal as IDataObject | undefined;
			return (item.reference as string) ?? (deal?.id as string) ?? (item.id as string);
		},
		paginationToken,
	);

	const term = filterTerm?.trim().toLowerCase();
	if (!term) return page;

	return {
		...page,
		results: page.results.filter(
			(result) =>
				result.name.toLowerCase().includes(term) ||
				String(result.value).toLowerCase().includes(term),
		),
	};
}
