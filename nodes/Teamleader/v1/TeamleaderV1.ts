import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { executeCompany } from './actions/company';
import { executeContact } from './actions/contact';
import { executeDeal } from './actions/deal';
import { executeInvoice } from './actions/invoice';
import { executeProduct } from './actions/product';
import { executeQuotation } from './actions/quotation';
import { companyFields, companyOperations } from './descriptions/CompanyDescription';
import { contactFields, contactOperations } from './descriptions/ContactDescription';
import { dealFields, dealOperations } from './descriptions/DealDescription';
import { invoiceFields, invoiceOperations } from './descriptions/InvoiceDescription';
import { productFields, productOperations } from './descriptions/ProductDescription';
import { quotationFields, quotationOperations } from './descriptions/QuotationDescription';
import * as listSearch from '../methods/listSearch';
import * as loadOptions from '../methods/loadOptions';

/**
 * Frozen V1 implementation — the compatibility baseline (package v1.0.0).
 * Do NOT apply V2 UX changes here: existing workflows pinned to typeVersion 1
 * must keep the exact same fields, defaults and API payload behaviour.
 */
export class TeamleaderV1 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			version: 1,
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
				{
					displayName: 'Resource',
					name: 'resource',
					type: 'options',
					noDataExpression: true,
					options: [
						{ name: 'Company', value: 'company' },
						{ name: 'Contact', value: 'contact' },
						{ name: 'Deal', value: 'deal' },
						{ name: 'Invoice', value: 'invoice' },
						{ name: 'Product', value: 'product' },
						{ name: 'Quotation', value: 'quotation' },
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
				...quotationOperations,
				...quotationFields,
				...invoiceOperations,
				...invoiceFields,
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
				let results: IDataObject[] | INodeExecutionData[];

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
					case 'quotation':
						results = await executeQuotation.call(this, operation, i);
						break;
					case 'invoice':
						results = await executeInvoice.call(this, operation, i);
						break;
					default:
						throw new NodeOperationError(
							this.getNode(),
							`The resource "${resource}" is not supported`,
							{ itemIndex: i },
						);
				}

				// Binary-producing operations (e.g. invoice download) already return execution data.
				const isExecutionData = results.some(
					(entry) => (entry as INodeExecutionData).binary !== undefined,
				);

				if (isExecutionData) {
					returnData.push(
						...(results as INodeExecutionData[]).map((entry) => ({
							...entry,
							pairedItem: { item: i },
						})),
					);
				} else {
					returnData.push(
						...this.helpers.constructExecutionMetaData(
							this.helpers.returnJsonArray(results as IDataObject[]),
							{ itemData: { item: i } },
						),
					);
				}
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
