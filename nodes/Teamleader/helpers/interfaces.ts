import type { IDataObject } from 'n8n-workflow';

/** Standard Teamleader pagination page object. */
export interface ITeamleaderPage {
	size: number;
	number: number;
}

/** Meta block returned by list endpoints. */
export interface ITeamleaderMeta {
	page?: ITeamleaderPage;
	matches?: number;
}

/** Generic envelope returned by every Teamleader endpoint. */
export interface ITeamleaderResponse<T = IDataObject | IDataObject[]> {
	data?: T;
	meta?: ITeamleaderMeta;
	errors?: ITeamleaderError[];
}

export interface ITeamleaderError {
	title?: string;
	status?: number;
	code?: string;
	detail?: string;
	source?: IDataObject;
	meta?: IDataObject;
}

/** Sort instruction accepted by *.list endpoints. */
export interface ITeamleaderSort {
	field: string;
	order?: 'asc' | 'desc';
}

export interface ITeamleaderListOptions {
	filter?: IDataObject;
	sort?: ITeamleaderSort[];
	includes?: string;
	page?: ITeamleaderPage;
}

export interface ITeamleaderReference {
	type: string;
	id: string;
}

export interface ITeamleaderEmail {
	type: string;
	email: string;
}

export interface ITeamleaderTelephone {
	type: string;
	number: string;
}

export interface ITeamleaderAddress {
	line_1?: string;
	postal_code?: string;
	city?: string;
	country?: string;
	area_level_two_id?: string;
	addressee?: string;
}

export interface ITeamleaderTypedAddress {
	type: string;
	address: ITeamleaderAddress;
}

export interface ITeamleaderCustomFieldValue {
	id: string;
	value: unknown;
}

export interface ITeamleaderMoney {
	amount: number;
	currency: string;
}

/** Line item used by quotations and invoices. */
export interface ITeamleaderLineItem {
	quantity: number;
	description: string;
	unit_price: { amount: number; currency?: string; tax?: 'excluding' | 'including' };
	tax_rate_id: string;
	product_id?: string;
	discount?: { value: number; type: 'percentage' };
	extended_description?: string;
	unit_of_measure_id?: string;
	purchase_price?: ITeamleaderMoney;
}

export interface ITeamleaderGroupedLineItem {
	section?: { title: string };
	line_items: ITeamleaderLineItem[];
}
