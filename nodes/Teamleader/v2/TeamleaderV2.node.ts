import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import * as listSearch from '../methods/listSearch';
import * as loadOptions from '../methods/loadOptions';
import { executeCompany } from './actions/company';
import { executeContact } from './actions/contact';
import { companyFields, companyOperations } from './descriptions/CompanyDescription';
import { contactFields, contactOperations } from './descriptions/ContactDescription';
import { v2ResourceField } from './descriptions/V2Common';

/**
 * Teamleader V2.
 *
 * Resources are migrated one at a time. Each migrated resource contributes its
 * own operations/fields and its own action module; nothing here is a generic
 * dispatcher over V1 parameter paths.
 */
export class TeamleaderV2 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			version: 2,
			subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
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
				v2ResourceField([
					{ name: 'Company', value: 'company' },
					{ name: 'Contact', value: 'contact' },
				]),
				...contactOperations,
				...contactFields,
				...companyOperations,
				...companyFields,
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

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let results: IDataObject[];

				switch (resource) {
					case 'contact':
						results = await executeContact.call(this, operation, i);
						break;
					case 'company':
						results = await executeCompany.call(this, operation, i);
						break;
					default:
						throw new NodeOperationError(
							this.getNode(),
							`The resource "${resource}" is not available in Teamleader version 2 yet`,
							{
								itemIndex: i,
								description:
									'Set this node to Teamleader version 1 until this resource has been migrated.',
							},
						);
				}

				returnData.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(results), {
						itemData: { item: i },
					}),
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
