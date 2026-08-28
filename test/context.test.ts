import type { IResolvedCustomer } from '../nodes/Teamleader/helpers/context';
import {
	TeamleaderExecutionContext,
	contextResolutionMessage,
	resolverCacheKey,
} from '../nodes/Teamleader/helpers/context';

describe('resolverCacheKey', () => {
	it('namespaces ids per resolver kind', () => {
		expect(resolverCacheKey('fromDeal', 'abc')).toBe('fromDeal:abc');
		expect(resolverCacheKey('fromProduct', 'abc')).toBe('fromProduct:abc');
		expect(resolverCacheKey('fromDeal', 'abc')).not.toBe(resolverCacheKey('fromProduct', 'abc'));
	});
});

describe('TeamleaderExecutionContext', () => {
	it('performs one read per distinct <resolver, id> pair', async () => {
		const context = new TeamleaderExecutionContext();
		const resolver = jest.fn(async (id: string) => ({ id, title: `Deal ${id}` }));

		const first = await context.resolve('fromDeal', 'deal-1', resolver);
		const second = await context.resolve('fromDeal', 'deal-1', resolver);

		expect(resolver).toHaveBeenCalledTimes(1);
		expect(second).toBe(first);
		expect(context.size).toBe(1);
		expect(context.has('fromDeal', 'deal-1')).toBe(true);
	});

	it('keeps different ids and different kinds apart', async () => {
		const context = new TeamleaderExecutionContext();
		const dealResolver = jest.fn(async (id: string) => ({ id }));
		const productResolver = jest.fn(async (id: string) => ({ id }));

		await context.resolve('fromDeal', 'a', dealResolver);
		await context.resolve('fromDeal', 'b', dealResolver);
		await context.resolve('fromProduct', 'a', productResolver);

		expect(dealResolver).toHaveBeenCalledTimes(2);
		expect(productResolver).toHaveBeenCalledTimes(1);
		expect(context.size).toBe(3);
	});

	it('deduplicates concurrent lookups of the same id', async () => {
		const context = new TeamleaderExecutionContext();
		const resolver = jest.fn(
			async (id: string) =>
				await new Promise<{ id: string }>((resolve) => setTimeout(() => resolve({ id }), 5)),
		);

		const results = await Promise.all([
			context.resolve('fromInvoice', 'inv-1', resolver),
			context.resolve('fromInvoice', 'inv-1', resolver),
			context.resolve('fromInvoice', 'inv-1', resolver),
		]);

		expect(resolver).toHaveBeenCalledTimes(1);
		expect(results[0]).toBe(results[1]);
		expect(results[1]).toBe(results[2]);
	});

	it('does not cache failures, so a later attempt can succeed', async () => {
		const context = new TeamleaderExecutionContext();
		const resolver = jest
			.fn<Promise<IResolvedCustomer>, [string]>()
			.mockRejectedValueOnce(new Error('503'))
			.mockResolvedValueOnce({ type: 'company', id: 'c-1' });

		await expect(context.resolve('fromCustomer', 'c-1', resolver)).rejects.toThrow('503');
		expect(context.size).toBe(0);

		await expect(context.resolve('fromCustomer', 'c-1', resolver)).resolves.toEqual({
			type: 'company',
			id: 'c-1',
		});
		expect(resolver).toHaveBeenCalledTimes(2);
	});

	it('can be cleared', async () => {
		const context = new TeamleaderExecutionContext();
		await context.resolve('fromDeal', 'x', async (id) => ({ id }));
		context.clear();
		expect(context.size).toBe(0);
	});
});

describe('contextResolutionMessage', () => {
	it('names the source and the field the user must fill', () => {
		expect(contextResolutionMessage('fromDeal', 'a customer', 'Customer')).toBe(
			'Could not determine a customer from the selected deal. Set "Customer" explicitly.',
		);
		expect(contextResolutionMessage('fromInvoice', 'an outstanding amount', 'Amount')).toContain(
			'the selected invoice',
		);
	});
});
