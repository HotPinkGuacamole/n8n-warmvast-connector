import { VersionedNodeType } from 'n8n-workflow';

import { Teamleader } from '../nodes/Teamleader/Teamleader.node';
import { TeamleaderV1 } from '../nodes/Teamleader/v1/TeamleaderV1.node';
import { TeamleaderV2 } from '../nodes/Teamleader/v2/TeamleaderV2.node';

describe('Teamleader versioned node', () => {
	const node = new Teamleader();

	it('is a versioned node type', () => {
		expect(node).toBeInstanceOf(VersionedNodeType);
		expect(typeof node.getNodeType).toBe('function');
	});

	it('registers V1 as version 1 and V2 as version 2', () => {
		expect(node.nodeVersions[1]).toBeInstanceOf(TeamleaderV1);
		expect(node.nodeVersions[2]).toBeInstanceOf(TeamleaderV2);
		expect(Object.keys(node.nodeVersions).sort()).toEqual(['1', '2']);
	});

	it('defaults to version 2', () => {
		expect(node.description.defaultVersion).toBe(2);
		expect(node.getNodeType()).toBeInstanceOf(TeamleaderV2);
		expect(node.getNodeType().description.version).toBe(2);
	});

	it('resolves typeVersion 1 to the frozen V1 implementation', () => {
		const v1 = node.getNodeType(1);
		expect(v1).toBeInstanceOf(TeamleaderV1);
		expect(v1.description.version).toBe(1);
	});

	it('appears once in the node picker under a single node name', () => {
		expect(node.description.name).toBe('teamleader');
		expect(node.getNodeType(1).description.name).toBe('teamleader');
		expect(node.getNodeType(2).description.name).toBe('teamleader');
	});

	it('keeps the credential type unchanged on every version', () => {
		for (const version of [1, 2]) {
			expect(node.getNodeType(version).description.credentials).toEqual([
				{ name: 'teamleaderOAuth2Api', required: true },
			]);
		}
	});

	it('keeps the V1 resource and operation set available', () => {
		const properties = node.getNodeType(1).description.properties;
		const resource = properties.find((property) => property.name === 'resource');

		expect(resource?.options?.map((option) => (option as { value: string }).value).sort()).toEqual([
			'company',
			'contact',
			'deal',
			'invoice',
			'product',
			'quotation',
		]);

		const operationsFor = (res: string) =>
			properties
				.filter(
					(property) =>
						property.name === 'operation' &&
						(property.displayOptions?.show?.resource as string[] | undefined)?.includes(res),
				)
				.flatMap((property) =>
					(property.options ?? []).map((option) => (option as { value: string }).value),
				);

		expect(operationsFor('contact')).toEqual(
			expect.arrayContaining([
				'get',
				'getAll',
				'create',
				'update',
				'delete',
				'tag',
				'untag',
				'linkToCompany',
				'unlinkFromCompany',
			]),
		);
		expect(operationsFor('company')).toEqual(
			expect.arrayContaining(['get', 'getAll', 'create', 'update', 'delete', 'tag', 'untag']),
		);
		expect(operationsFor('deal')).toEqual(
			expect.arrayContaining(['get', 'getAll', 'create', 'update', 'move', 'win', 'lose']),
		);
		expect(operationsFor('product')).toEqual(
			expect.arrayContaining(['get', 'getAll', 'create', 'update', 'delete']),
		);
		expect(operationsFor('quotation')).toEqual(
			expect.arrayContaining(['get', 'getAll', 'create', 'update', 'delete', 'send', 'accept']),
		);
		expect(operationsFor('invoice')).toEqual(
			expect.arrayContaining([
				'get',
				'getAll',
				'draft',
				'update',
				'book',
				'updateBooked',
				'send',
				'registerPayment',
				'removePayments',
				'download',
				'credit',
				'creditPartially',
			]),
		);
	});

	it('exposes loadOptions and listSearch on both versions', () => {
		for (const version of [1, 2]) {
			const methods = (node.getNodeType(version) as { methods?: Record<string, unknown> }).methods;
			expect(methods?.loadOptions).toBeDefined();
			expect(methods?.listSearch).toBeDefined();
		}
	});
});

describe('Teamleader V2 skeleton', () => {
	const v2 = new Teamleader().getNodeType(2);

	it('carries the shared base description', () => {
		expect(v2.description.displayName).toBe('Teamleader');
		expect(v2.description.icon).toBe('file:teamleader.svg');
		expect(v2.description.inputs).toEqual(['main']);
		expect(v2.description.outputs).toEqual(['main']);
	});

	it('has a resource property ready to receive migrated resources', () => {
		const resource = v2.description.properties.find((property) => property.name === 'resource');
		expect(resource).toBeDefined();
		expect(resource?.type).toBe('options');
	});

	it('exposes only the resources migrated so far', () => {
		const resource = v2.description.properties.find((property) => property.name === 'resource');
		expect(resource?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'company',
			'contact',
		]);
	});
});
