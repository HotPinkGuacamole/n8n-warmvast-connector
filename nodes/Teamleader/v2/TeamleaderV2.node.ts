import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import * as listSearch from '../methods/listSearch';
import * as loadOptions from '../methods/loadOptions';
import { v2ResourceField } from './descriptions/V2Common';

/**
 * V2 skeleton.
 *
 * Stage 1 only proves that the versioned node loads, that V2 is the default
 * version and that the credential is wired at node-definition level.
 * Resource descriptions and actions are added in later stages by extending
 * `properties` and the dispatch switch below — the versioned wrapper does not
 * need to change for that.
 */
export class TeamleaderV2 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			version: 2,
			subtitle: '={{$parameter["resource"]}}',
			defaults: {
				name: 'Teamleader',
			},
			inputs: ['main'],
			outputs: ['main'],
			usableAsTool: true,
			credentials: [
				{
					name: 'teamleaderOAuth2Api',
					required: true,
				},
			],
			properties: [
				{
					displayName:
						'This is the new Teamleader experience. Resources are being migrated one by one — use a Teamleader node set to version 1 for anything not offered here yet.',
					name: 'v2Notice',
					type: 'notice',
					default: '',
				},
				v2ResourceField([]),
			],
		};
	}

	methods = {
		loadOptions,
		listSearch,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i, '') as string;

				throw new NodeOperationError(
					this.getNode(),
					`The resource "${resource}" is not available in Teamleader version 2 yet`,
					{
						itemIndex: i,
						description:
							'Set this node to Teamleader version 1 until this resource has been migrated.',
					},
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
