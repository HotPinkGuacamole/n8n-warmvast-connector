import type { IDataObject } from 'n8n-workflow';

import type { TeamleaderContext } from './GenericFunctions';
import { teamleaderApiRequest } from './GenericFunctions';

/**
 * Shared execution context for V2 operations.
 *
 * Several V2 features need to read a related Teamleader record at execution time
 * (a deal to derive its customer, a product to hydrate line defaults, an invoice
 * to derive its outstanding amount). Those reads must happen at most ONCE per
 * distinct <resolver, id> pair per node execution, no matter how many items or
 * lines reference the same record.
 *
 * Stage 1 provided the cache/typing infrastructure only. Stage 3 adds the first
 * real resolver (`fromDeal`, below) and its first consumer (Deal Update's
 * "Contact Person without a customer change").
 */

/** The kinds of records V2 can resolve extra context from. */
export type ResolverKind =
	| 'fromDeal'
	| 'fromCustomer'
	| 'fromInvoice'
	| 'fromProduct'
	| 'paymentTerms';

/** Cache key for a single resolved record: `<resolver>:<id>`. */
export type ResolverCacheKey = `${ResolverKind}:${string}`;

export function resolverCacheKey(kind: ResolverKind, id: string): ResolverCacheKey {
	return `${kind}:${id}`;
}

/** A customer reference as used across the Teamleader API. */
export interface IResolvedCustomer {
	type: 'company' | 'contact';
	id: string;
	name?: string;
	/** Primary e-mail address, when the source record exposes one. */
	email?: string;
	/** Raw API record, for fields no resolver shape covers yet. */
	raw?: IDataObject;
}

/** Context derived from a deal (`deals.info`). */
export interface IResolvedDeal {
	id: string;
	title?: string;
	departmentId?: string;
	currency?: string;
	customer?: IResolvedCustomer;
	/** The deal's contact person, when one is set. */
	contactPerson?: IResolvedCustomer;
	raw?: IDataObject;
}

/** Context derived from an invoice (`invoices.info`). */
export interface IResolvedInvoice {
	id: string;
	departmentId?: string;
	currency?: string;
	customer?: IResolvedCustomer;
	/** Outstanding amount, used by "Full Outstanding Amount" payment registration. */
	dueAmount?: number;
	/** Currency Teamleader reports the outstanding amount in. Never converted. */
	dueCurrency?: string;
	raw?: IDataObject;
}

/** Context derived from a product (`products.info`), used for line hydration. */
export interface IResolvedProduct {
	id: string;
	name?: string;
	description?: string;
	code?: string;
	sellingPrice?: number;
	sellingPriceCurrency?: string;
	purchasePrice?: number;
	purchasePriceCurrency?: string;
	taxRateId?: string;
	unitOfMeasureId?: string;
	productCategoryId?: string;
	raw?: IDataObject;
}

/** One payment term exactly as `invoices.draft` wants it, plus its Teamleader ID. */
export interface IResolvedPaymentTerm {
	id: string;
	type: string;
	days?: number;
}

/**
 * The account's payment terms plus the ID Teamleader itself marks as the
 * default (`meta.default`). Read once per execution; the default is never
 * guessed from position in the list.
 */
export interface IResolvedPaymentTerms {
	terms: IResolvedPaymentTerm[];
	defaultId?: string;
}

/** Maps a resolver kind to the shape it resolves to. */
export interface IResolvedByKind {
	fromDeal: IResolvedDeal;
	fromCustomer: IResolvedCustomer;
	fromInvoice: IResolvedInvoice;
	fromProduct: IResolvedProduct;
	paymentTerms: IResolvedPaymentTerms;
}

export type ResolvedValue<K extends ResolverKind> = IResolvedByKind[K];

/** A resolver performs exactly one API read for one id. */
export type Resolver<K extends ResolverKind> = (id: string) => Promise<ResolvedValue<K>>;

/**
 * Per-execution cache. One instance is created per node execution and shared by
 * every item and every line, so repeated references cost a single API read.
 *
 * In-flight promises are cached too, so concurrent lookups of the same id never
 * produce two requests.
 */
export class TeamleaderExecutionContext {
	private readonly cache = new Map<ResolverCacheKey, Promise<unknown>>();

	/** Number of distinct <resolver, id> pairs held. Used by tests and diagnostics. */
	get size(): number {
		return this.cache.size;
	}

	has(kind: ResolverKind, id: string): boolean {
		return this.cache.has(resolverCacheKey(kind, id));
	}

	/**
	 * Resolve `id` through `resolver`, reusing the cached result (or in-flight
	 * request) when the same pair was already requested in this execution.
	 */
	async resolve<K extends ResolverKind>(
		kind: K,
		id: string,
		resolver: Resolver<K>,
	): Promise<ResolvedValue<K>> {
		const key = resolverCacheKey(kind, id);
		const cached = this.cache.get(key);
		if (cached !== undefined) return (await cached) as ResolvedValue<K>;

		const pending = resolver(id);
		this.cache.set(key, pending);

		try {
			return await pending;
		} catch (error) {
			// A failed read must not poison the cache: a later attempt may succeed
			// (for example after a transient 503 that the request helper surfaced).
			this.cache.delete(key);
			throw error;
		}
	}

	/** Drop everything. Intended for tests; executions get a fresh instance. */
	clear(): void {
		this.cache.clear();
	}
}

/**
 * Uniform failure contract for resolvers: when context cannot be derived we never
 * guess or silently fall back — we tell the user exactly which field to fill in.
 */
export function contextResolutionMessage(
	kind: ResolverKind,
	what: string,
	fieldToFill: string,
): string {
	const source: Record<ResolverKind, string> = {
		fromDeal: 'the selected deal',
		fromCustomer: 'the selected customer',
		fromInvoice: 'the selected invoice',
		fromProduct: 'the selected product',
		paymentTerms: "your Teamleader account's payment terms",
	};
	return `Could not determine ${what} from ${source[kind]}. Set "${fieldToFill}" explicitly.`;
}

/** Read a `{type, id}` reference off a `deals.info` response; `undefined` when unusable. */
function toResolvedCustomer(value: unknown): IResolvedCustomer | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const ref = value as IDataObject;
	const id = typeof ref.id === 'string' && ref.id.trim() !== '' ? ref.id : undefined;
	const type = ref.type === 'contact' ? 'contact' : ref.type === 'company' ? 'company' : undefined;
	if (!id || !type) return undefined;
	return { type, id, raw: ref };
}

/**
 * The `fromDeal` resolver: one `deals.info` read, shaped into `IResolvedDeal`.
 * Only fields reliably present on the response are populated; nothing here
 * guesses a value `deals.info` does not actually return.
 */
export async function resolveDeal(context: TeamleaderContext, id: string): Promise<IResolvedDeal> {
	const response = await teamleaderApiRequest.call(context, '/deals.info', { id });
	const data = (response.data ?? {}) as IDataObject;
	const lead = (data.lead ?? {}) as IDataObject;
	const department = data.department as IDataObject | undefined;
	const estimatedValue = data.estimated_value as IDataObject | undefined;

	return {
		id,
		title: typeof data.title === 'string' ? data.title : undefined,
		departmentId:
			department && typeof department.id === 'string' ? department.id : undefined,
		currency:
			estimatedValue && typeof estimatedValue.currency === 'string'
				? estimatedValue.currency
				: undefined,
		customer: toResolvedCustomer(lead.customer),
		contactPerson: toResolvedCustomer(lead.contact_person),
		raw: data,
	};
}

/** Read a `{id, ...}` reference off a `products.info` response field. */
function referenceId(value: unknown): string | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const id = (value as IDataObject).id;
	return typeof id === 'string' && id.trim() !== '' ? id : undefined;
}

/**
 * The `fromProduct` resolver: one `products.info` read, shaped into
 * `IResolvedProduct`. Generic on purpose — it has no idea whether its caller
 * is a quotation or invoice line; that distinction lives entirely in the
 * hydration helper that consumes this context.
 */
export async function resolveProduct(
	context: TeamleaderContext,
	id: string,
): Promise<IResolvedProduct> {
	const response = await teamleaderApiRequest.call(context, '/products.info', { id });
	const data = (response.data ?? {}) as IDataObject;
	const sellingPrice = data.selling_price as IDataObject | undefined;
	const purchasePrice = data.purchase_price as IDataObject | undefined;

	return {
		id,
		name: typeof data.name === 'string' ? data.name : undefined,
		description: typeof data.description === 'string' ? data.description : undefined,
		code: typeof data.code === 'string' ? data.code : undefined,
		sellingPrice:
			sellingPrice && typeof sellingPrice.amount === 'number' ? sellingPrice.amount : undefined,
		sellingPriceCurrency:
			sellingPrice && typeof sellingPrice.currency === 'string' ? sellingPrice.currency : undefined,
		purchasePrice:
			purchasePrice && typeof purchasePrice.amount === 'number' ? purchasePrice.amount : undefined,
		purchasePriceCurrency:
			purchasePrice && typeof purchasePrice.currency === 'string'
				? purchasePrice.currency
				: undefined,
		taxRateId: referenceId(data.tax_rate),
		unitOfMeasureId: referenceId(data.unit_of_measure),
		productCategoryId: referenceId(data.product_category),
		raw: data,
	};
}

/** Cache id used by the account-wide (non-per-record) payment-term resolver. */
export const PAYMENT_TERMS_CACHE_ID = 'account';

/**
 * Read a customer's primary e-mail from the `emails` array of a
 * `contacts.info` / `companies.info` response. Teamleader marks one entry
 * `primary`; without that marker the first usable address is taken, and an
 * empty list yields `undefined` rather than an invented address.
 */
function primaryEmail(value: unknown): string | undefined {
	if (!Array.isArray(value)) return undefined;
	const entries = value.filter(
		(entry): entry is IDataObject => !!entry && typeof entry === 'object',
	);
	const usable = entries.filter(
		(entry) => typeof entry.email === 'string' && (entry.email as string).trim() !== '',
	);
	const primary = usable.find((entry) => entry.type === 'primary') ?? usable[0];
	return primary ? (primary.email as string).trim() : undefined;
}

/**
 * The `fromCustomer` resolver: one `contacts.info` / `companies.info` read.
 * Cached per <type, id>, because the same UUID space is shared by both
 * endpoints and a contact must never be resolved through the company endpoint.
 */
export async function resolveCustomer(
	context: TeamleaderContext,
	type: 'contact' | 'company',
	id: string,
): Promise<IResolvedCustomer> {
	const endpoint = type === 'contact' ? '/contacts.info' : '/companies.info';
	const response = await teamleaderApiRequest.call(context, endpoint, { id });
	const data = (response.data ?? {}) as IDataObject;

	const name =
		type === 'contact'
			? `${(data.first_name as string) ?? ''} ${(data.last_name as string) ?? ''}`.trim() ||
				undefined
			: ((data.name as string) ?? undefined);

	return {
		type,
		id,
		name,
		email: primaryEmail(data.emails),
		raw: data,
	};
}

/** Cache id for a customer: the type matters, so both halves are in the key. */
export function customerCacheId(type: 'contact' | 'company', id: string): string {
	return `${type}:${id}`;
}

/**
 * The `fromInvoice` resolver: one `invoices.info` read, shaped into
 * `IResolvedInvoice`. `dueAmount` is the invoice's outstanding total as
 * Teamleader reports it (`total.due`); nothing here computes or estimates it.
 */
export async function resolveInvoice(
	context: TeamleaderContext,
	id: string,
): Promise<IResolvedInvoice> {
	const response = await teamleaderApiRequest.call(context, '/invoices.info', { id });
	const data = (response.data ?? {}) as IDataObject;
	const invoicee = (data.invoicee ?? {}) as IDataObject;
	const total = (data.total ?? {}) as IDataObject;
	const due = total.due as IDataObject | undefined;

	const customer = toResolvedCustomer(invoicee.customer);
	if (customer && typeof invoicee.email === 'string' && invoicee.email.trim() !== '') {
		// `invoices.info` exposes the invoicee e-mail directly; prefer it over a
		// second read of the customer record.
		customer.email = invoicee.email.trim();
	}
	if (customer && typeof invoicee.name === 'string') customer.name = invoicee.name;

	return {
		id,
		departmentId: referenceId(data.department),
		currency: typeof data.currency === 'string' ? data.currency : undefined,
		customer,
		dueAmount: due && typeof due.amount === 'number' ? due.amount : undefined,
		dueCurrency: due && typeof due.currency === 'string' ? due.currency : undefined,
		raw: data,
	};
}

/**
 * The `paymentTerms` resolver: one `paymentTerms.list` read.
 *
 * Uses `teamleaderApiRequest` rather than the paging helper on purpose — the
 * account default lives in `meta.default`, which the paging helper discards.
 * The default is whatever Teamleader says it is; it is never inferred from the
 * order of the list.
 */
export async function resolvePaymentTerms(
	context: TeamleaderContext,
): Promise<IResolvedPaymentTerms> {
	const response = await teamleaderApiRequest.call(context, '/paymentTerms.list', {});
	const data = Array.isArray(response.data) ? (response.data as IDataObject[]) : [];
	const meta = (response.meta ?? {}) as IDataObject;

	const terms = data
		.filter((entry) => typeof entry.id === 'string' && typeof entry.type === 'string')
		.map((entry) => {
			const term: IResolvedPaymentTerm = {
				id: entry.id as string,
				type: entry.type as string,
			};
			if (typeof entry.days === 'number') term.days = entry.days;
			return term;
		});

	return {
		terms,
		defaultId: typeof meta.default === 'string' ? meta.default : undefined,
	};
}
