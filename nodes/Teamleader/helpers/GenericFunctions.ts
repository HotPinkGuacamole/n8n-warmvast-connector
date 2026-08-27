import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

import type { ITeamleaderListOptions, ITeamleaderResponse } from './interfaces';
import {
	MAX_PAGE_SIZE,
	buildPage,
	describeApiError,
	isRetryableStatus,
} from './utils';

export const CREDENTIAL_NAME = 'teamleaderOAuth2Api';
export const DEFAULT_BASE_URL = 'https://api.focus.teamleader.eu';

export type TeamleaderContext =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IHookFunctions
	| IWebhookFunctions
	| IPollFunctions;

/** Maximum number of retries for rate limited / transient failures. */
const MAX_RETRIES = 3;

async function resolveBaseUrl(context: TeamleaderContext): Promise<string> {
	try {
		const credentials = await context.getCredentials(CREDENTIAL_NAME);
		const baseUrl = (credentials?.baseUrl as string) ?? '';
		return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
	} catch {
		return DEFAULT_BASE_URL;
	}
}

/**
 * Perform a single authenticated call against a Teamleader Focus API endpoint.
 *
 * Every Teamleader endpoint is an RPC style POST to `/{resource}.{action}`,
 * with a JSON body. Errors are converted into n8n NodeApiError instances and
 * rate limited requests (HTTP 429) are retried with a backoff.
 */
export async function teamleaderApiRequest<T = IDataObject | IDataObject[]>(
	this: TeamleaderContext,
	endpoint: string,
	body: IDataObject = {},
	options: { returnFullResponse?: boolean; encoding?: 'arraybuffer' } = {},
): Promise<ITeamleaderResponse<T>> {
	const baseUrl = await resolveBaseUrl(this);
	const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

	const requestOptions: IHttpRequestOptions = {
		method: 'POST',
		url: `${baseUrl}${path}`,
		body,
		json: true,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
	};

	if (options.encoding === 'arraybuffer') {
		requestOptions.encoding = 'arraybuffer';
		requestOptions.json = false;
	}

	let lastError: unknown;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const response = await this.helpers.httpRequestWithAuthentication.call(
				this,
				CREDENTIAL_NAME,
				requestOptions,
			);

			// 204 responses (update/book/...) come back empty.
			if (response === undefined || response === null || response === '') {
				return {} as ITeamleaderResponse<T>;
			}

			return response as ITeamleaderResponse<T>;
		} catch (error) {
			lastError = error;
			const statusCode = (error as IDataObject)?.httpCode
				? Number((error as IDataObject).httpCode)
				: ((error as IDataObject)?.statusCode as number | undefined);

			if (attempt < MAX_RETRIES && isRetryableStatus(statusCode)) {
				await sleep(2 ** attempt * 1000);
				continue;
			}

			throw new NodeApiError(this.getNode(), error as JsonObject, {
				message: `Teamleader API request to "${path}" failed`,
				description: describeApiError(error),
			});
		}
	}

	throw new NodeApiError(this.getNode(), lastError as JsonObject, {
		message: `Teamleader API request to "${path}" failed`,
	});
}

/** Convenience wrapper that returns only the `data` payload of a response. */
export async function teamleaderApiRequestData<T = IDataObject>(
	this: TeamleaderContext,
	endpoint: string,
	body: IDataObject = {},
): Promise<T> {
	const response = await teamleaderApiRequest.call(this, endpoint, body);
	return (response.data ?? {}) as T;
}

/**
 * Fetch every page of a Teamleader `*.list` endpoint.
 *
 * When `limit` is provided the helper stops as soon as enough items were
 * collected; otherwise it keeps paging until a short page is returned.
 */
export async function teamleaderApiRequestAllItems(
	this: TeamleaderContext,
	endpoint: string,
	body: ITeamleaderListOptions & IDataObject = {},
	limit?: number,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	const pageSize = limit !== undefined ? Math.min(Math.max(limit, 1), MAX_PAGE_SIZE) : MAX_PAGE_SIZE;

	let pageNumber = 1;

	// Hard stop so a misbehaving endpoint can never loop forever.
	const maxPages = 1000;

	while (pageNumber <= maxPages) {
		const response = await teamleaderApiRequest.call(this, endpoint, {
			...body,
			page: buildPage(pageSize, pageNumber),
		});

		const data = response.data;
		if (!Array.isArray(data)) {
			if (data && typeof data === 'object') results.push(data as IDataObject);
			break;
		}

		results.push(...(data as IDataObject[]));

		if (limit !== undefined && results.length >= limit) {
			return results.slice(0, limit);
		}

		if (data.length < pageSize) break;

		pageNumber++;
	}

	return limit !== undefined ? results.slice(0, limit) : results;
}

/** Fetch a list endpoint honouring the `returnAll` / `limit` node parameters. */
export async function teamleaderFetchList(
	this: IExecuteFunctions,
	endpoint: string,
	itemIndex: number,
	body: ITeamleaderListOptions & IDataObject = {},
): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;

	if (returnAll) {
		return await teamleaderApiRequestAllItems.call(this, endpoint, body);
	}

	const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
	if (limit <= 0) {
		throw new NodeOperationError(this.getNode(), 'Limit must be greater than 0', { itemIndex });
	}

	return await teamleaderApiRequestAllItems.call(this, endpoint, body, limit);
}

/**
 * Resource locator values ({ mode: 'list' | 'id', value }) and plain strings
 * are both accepted; this always yields the raw UUID string.
 */
export function extractId(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'object') {
		const rl = value as IDataObject;
		if (typeof rl.value === 'string') return rl.value.trim();
	}
	return String(value).trim();
}

/** Read a resource-locator/string node parameter and require a non-empty id. */
export function getRequiredId(
	context: IExecuteFunctions,
	parameterName: string,
	itemIndex: number,
): string {
	const id = extractId(context.getNodeParameter(parameterName, itemIndex));
	if (!id) {
		throw new NodeOperationError(
			context.getNode(),
			`The parameter "${parameterName}" is required and must contain a Teamleader ID`,
			{ itemIndex },
		);
	}
	return id;
}
