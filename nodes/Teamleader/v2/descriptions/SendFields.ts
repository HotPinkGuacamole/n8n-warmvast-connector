import type { INodeProperties } from 'n8n-workflow';

import type { IDisplayScope } from './V2Common';
import { scopeShow } from './V2SharedFields';

/**
 * Recipient and message fields shared by Quotation Send and Invoice Send.
 *
 * The two endpoints take different recipient shapes and different message
 * shapes, so only what is genuinely identical lives here: the recipient editor
 * and the CC/BCC pair. Everything else is declared per resource, because
 * pretending they are the same is how an address ends up in the wrong key.
 */

/** One To/CC/BCC editor. The customer link is optional on every entry. */
export function recipientCollectionField(options: {
	displayName: string;
	name: string;
	description: string;
	scope: IDisplayScope;
	extraShow?: Record<string, unknown>;
}): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Recipient',
		default: {},
		description: options.description,
		displayOptions: scopeShow(options.scope, options.extraShow ?? {}),
		options: [
			{
				displayName: 'Recipient',
				name: 'recipient',
				values: [
					{
						displayName: 'Email Address',
						name: 'email',
						type: 'string',
						placeholder: 'name@email.com',
						default: '',
						description: 'Address the document is sent to',
					},
					{
						displayName: 'Link to Customer',
						name: 'customerId',
						type: 'resourceLocator',
						default: { mode: 'companyList', value: '' },
						description:
							'Optional: the Teamleader company or contact this address belongs to, so the mail is logged on that record',
						modes: [
							{
								displayName: 'Company',
								name: 'companyList',
								type: 'list',
								placeholder: 'Select a company...',
								typeOptions: { searchListMethod: 'searchCompanies', searchable: true },
							},
							{
								displayName: 'Contact',
								name: 'contactList',
								type: 'list',
								placeholder: 'Select a contact...',
								typeOptions: { searchListMethod: 'searchContacts', searchable: true },
							},
							{
								displayName: 'By ID',
								name: 'id',
								type: 'string',
								placeholder: 'e.g. 4b4d2ff7-c56f-0bcf-b4c9-b9d5e6f0f9f0',
								hint: 'Use Customer Type below to say whether this ID is a company or a contact',
							},
						],
					},
					{
						displayName: 'Customer Type',
						name: 'customerType',
						type: 'options',
						options: [
							{ name: 'Company', value: 'company' },
							{ name: 'Contact', value: 'contact' },
						],
						default: 'company',
						description: 'Only used when Link to Customer is set to By ID',
					},
				],
			},
		],
	};
}

/** CC and BCC, always offered together and always secondary to To. */
export function ccBccFields(scope: IDisplayScope): INodeProperties[] {
	return [
		recipientCollectionField({
			displayName: 'CC',
			name: 'cc',
			description: 'Addresses that receive a visible copy',
			scope,
		}),
		recipientCollectionField({
			displayName: 'BCC',
			name: 'bcc',
			description: 'Addresses that receive a hidden copy',
			scope,
		}),
	];
}

/** Attachment file IDs. Teamleader has no file picker in this connector. */
export function attachmentsField(): INodeProperties {
	return {
		displayName: 'Attachment File IDs',
		name: 'attachments',
		type: 'string',
		default: '',
		description:
			'Comma-separated Teamleader file IDs to attach. This connector has no file picker, so paste the IDs or use an expression.',
	};
}
