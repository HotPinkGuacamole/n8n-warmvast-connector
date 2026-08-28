import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { executeCompany } from './actions/company';
import { executeContact } from './actions/contact';
import { executeDeal } from './actions/deal';
import { executeProduct } from './actions/product';
import { companyFields, companyOperations } from './descriptions/CompanyDescription';
import { contactFields, contactOperations } from './descriptions/ContactDescription';
import { dealFields, dealOperations } from './descriptions/DealDescription';
import { productFields, productOperations } from './descriptions/ProductDescription';
import * as loadOptions from './methods/loadOptions';
import * as listSearch from './methods/listSearch';

export class Teamleader implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Teamleader',
		name: 'teamleader',
		icon: 'file:teamleader.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Work with the Teamleader Focus API',
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
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Company', value: 'company' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Deal', value: 'deal' },
					{ name: 'Product', value: 'product' },
				],
				default: 'contact',
			},
			...contactOperations,
			...contactFields,
			...companyOperations,
			...companyFields,
			...dealOperations,
			...dealFields,
			...productOperations,
			...productFields,
		],
	};

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
					case 'deal':
						results = await executeDeal.call(this, operation, i);
						break;
					case 'product':
						results = await executeProduct.call(this, operation, i);
						break;
					default:
						throw new NodeOperationError(
							this.getNode(),
							`The resource "${resource}" is not supported`,
							{ itemIndex: i },
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
