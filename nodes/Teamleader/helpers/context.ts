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
export type ResolverKind = 'fromDeal' | 'fromCustomer' | 'fromInvoice' | 'fromProduct';

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
	taxRateId?: string;
	unitOfMeasureId?: string;
	productCategoryId?: string;
	raw?: IDataObject;
}

/** Maps a resolver kind to the shape it resolves to. */
export interface IResolvedByKind {
	fromDeal: IResolvedDeal;
	fromCustomer: IResolvedCustomer;
	fromInvoice: IResolvedInvoice;
	fromProduct: IResolvedProduct;
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
