import type { IDataObject } from 'n8n-workflow';

import {
	extractId,
	teamleaderApiRequest,
	teamleaderApiRequestAllItems,
	DEFAULT_BASE_URL,
} from '../nodes/Teamleader/helpers/GenericFunctions';

type MockContext = {
	getCredentials: jest.Mock;
	getNode: jest.Mock;
	helpers: { httpRequestWithAuthentication: jest.Mock };
};

function createContext(request: jest.Mock, credentials: IDataObject = {}): MockContext {
	return {
		getCredentials: jest.fn().mockResolvedValue(credentials),
		getNode: jest.fn().mockReturnValue({ name: 'Teamleader', type: 'teamleader' }),
		helpers: { httpRequestWithAuthentication: request },
	};
}

describe('teamleaderApiRequest', () => {
	it('POSTs JSON to the RPC endpoint using the OAuth2 credential', async () => {
		const request = jest.fn().mockResolvedValue({ data: { id: 'abc' } });
		const context = createContext(request);

		const response = await teamleaderApiRequest.call(context as never, 'contacts.info', {
			id: 'abc',
		});

		expect(response).toEqual({ data: { id: 'abc' } });
		const [credentialName, options] = request.mock.calls[0];
		expect(credentialName).toBe('teamleaderOAuth2Api');
		expect(options).toMatchObject({
			method: 'POST',
			url: `${DEFAULT_BASE_URL}/contacts.info`,
			body: { id: 'abc' },
			json: true,
		});
	});

	it('honours a custom base URL from the credential', async () => {
		const request = jest.fn().mockResolvedValue({});
		const context = createContext(request, { baseUrl: 'https://api.example.com/' });

		await teamleaderApiRequest.call(context as never, '/companies.list');

		expect(request.mock.calls[0][1].url).toBe('https://api.example.com/companies.list');
	});

	it('normalises empty 204 responses into an empty object', async () => {
		const request = jest.fn().mockResolvedValue(undefined);
		const context = createContext(request);

		await expect(teamleaderApiRequest.call(context as never, 'contacts.update')).resolves.toEqual(
			{},
		);
	});

	it('wraps API failures into a node error carrying the Teamleader message', async () => {
		const request = jest.fn().mockRejectedValue({
			statusCode: 400,
			response: { body: { errors: [{ title: 'Company name must not be empty' }] } },
		});
		const context = createContext(request);

		await expect(teamleaderApiRequest.call(context as never, 'companies.add')).rejects.toThrow(
			/companies\.add/,
		);
		expect(request).toHaveBeenCalledTimes(1);
	});

	it('retries rate limited requests', async () => {
		jest.useFakeTimers();
		const request = jest
			.fn()
			.mockRejectedValueOnce({ statusCode: 429 })
			.mockResolvedValue({ data: [] });
		const context = createContext(request);

		const promise = teamleaderApiRequest.call(context as never, 'contacts.list');
		await jest.runAllTimersAsync();
		await promise;

		expect(request).toHaveBeenCalledTimes(2);
		jest.useRealTimers();
	});
});

describe('teamleaderApiRequestAllItems', () => {
	const page = (size: number) =>
		Array.from({ length: size }, (_unused, index) => ({ id: `id-${index}` }));

	it('follows pages until a short page is returned', async () => {
		const request = jest
			.fn()
			.mockResolvedValueOnce({ data: page(100) })
			.mockResolvedValueOnce({ data: page(30) });
		const context = createContext(request);

		const items = await teamleaderApiRequestAllItems.call(context as never, 'contacts.list');

		expect(items).toHaveLength(130);
		expect(request.mock.calls[0][1].body.page).toEqual({ size: 100, number: 1 });
		expect(request.mock.calls[1][1].body.page).toEqual({ size: 100, number: 2 });
	});

	it('stops once the limit is reached and trims the result', async () => {
		const request = jest.fn().mockResolvedValue({ data: page(100) });
		const context = createContext(request);

		const items = await teamleaderApiRequestAllItems.call(
			context as never,
			'contacts.list',
			{},
			5,
		);

		expect(items).toHaveLength(5);
		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0][1].body.page).toEqual({ size: 5, number: 1 });
	});

	it('keeps the caller supplied filter and sort on every page', async () => {
		const request = jest.fn().mockResolvedValue({ data: [] });
		const context = createContext(request);

		await teamleaderApiRequestAllItems.call(context as never, 'companies.list', {
			filter: { term: 'Acme' },
			sort: [{ field: 'name', order: 'asc' }],
		});

		expect(request.mock.calls[0][1].body).toMatchObject({
			filter: { term: 'Acme' },
			sort: [{ field: 'name', order: 'asc' }],
		});
	});

	it('handles endpoints returning a single object', async () => {
		const request = jest.fn().mockResolvedValue({ data: { id: 'single' } });
		const context = createContext(request);

		await expect(
			teamleaderApiRequestAllItems.call(context as never, 'users.me'),
		).resolves.toEqual([{ id: 'single' }]);
	});
});

describe('extractId', () => {
	it('reads resource locator values and plain strings', () => {
		expect(extractId({ mode: 'list', value: ' uuid ' })).toBe('uuid');
		expect(extractId('uuid')).toBe('uuid');
		expect(extractId(undefined)).toBe('');
	});
});
