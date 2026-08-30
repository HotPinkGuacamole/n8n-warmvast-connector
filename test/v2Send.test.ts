import type { IDataObject, INodeProperties } from 'n8n-workflow';

import { TeamleaderExecutionContext } from '../nodes/Teamleader/helpers/context';
import * as generic from '../nodes/Teamleader/helpers/GenericFunctions';
import { executeInvoice } from '../nodes/Teamleader/v2/actions/invoice';
import { executeQuotation } from '../nodes/Teamleader/v2/actions/quotation';
import { invoiceFields } from '../nodes/Teamleader/v2/descriptions/InvoiceDescription';
import { quotationFields } from '../nodes/Teamleader/v2/descriptions/QuotationDescription';
import {
	buildRecipientsObject,
	readRecipientCollection,
	toApiRecipient,
	unresolvedShortcodes,
} from '../nodes/Teamleader/v2/helpers/send';

jest.mock('../nodes/Teamleader/helpers/GenericFunctions', () => {
	const actual = jest.requireActual('../nodes/Teamleader/helpers/GenericFunctions');
	return { ...actual, teamleaderApiRequest: jest.fn(), teamleaderFetchList: jest.fn() };
});

const apiRequest = generic.teamleaderApiRequest as unknown as jest.Mock;

function makeContext(parameters: IDataObject) {
	return {
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			parameters[name] !== undefined ? parameters[name] : fallback,
		getNode: () => ({ name: 'Teamleader' }),
	} as never;
}

const callsTo = (endpoint: string) => apiRequest.mock.calls.filter((call) => call[0] === endpoint);
const bodyTo = (endpoint: string) => callsTo(endpoint)[0]?.[1] as IDataObject;

async function sendQuotation(parameters: IDataObject, context = new TeamleaderExecutionContext()) {
	return await executeQuotation.call(makeContext(parameters), 'send', 0, context);
}

async function sendInvoice(parameters: IDataObject, context = new TeamleaderExecutionContext()) {
	return await executeInvoice.call(makeContext(parameters), 'send', 0, context);
}

const QUOTATION_INFO = { data: { id: 'quotation-1', deal: { type: 'deal', id: 'deal-1' } } };
const DEAL_INFO = {
	data: {
		id: 'deal-1',
		lead: {
			customer: { type: 'company', id: 'company-1' },
			contact_person: { type: 'contact', id: 'contact-1' },
		},
	},
};
const CONTACT_INFO = {
	data: {
		id: 'contact-1',
		first_name: 'Jan',
		last_name: 'Peeters',
		emails: [
			{ type: 'invoicing', email: 'facturen@example.test' },
			{ type: 'primary', email: 'jan@example.test' },
		],
	},
};
const COMPANY_INFO = {
	data: { id: 'company-1', name: 'Acme BV', emails: [{ type: 'primary', email: 'info@acme.test' }] },
};
const INVOICE_INFO = {
	data: {
		id: 'invoice-1',
		invoicee: {
			name: 'Acme BV',
			email: 'billing@acme.test',
			customer: { type: 'company', id: 'company-1' },
		},
		total: { due: { amount: 121, currency: 'EUR' } },
	},
};

function mockApi(overrides: Record<string, unknown> = {}) {
	apiRequest.mockImplementation(async (endpoint: string) => {
		if (endpoint in overrides) {
			const value = overrides[endpoint];
			if (value instanceof Error) throw value;
			return value;
		}
		if (endpoint === '/quotations.info') return QUOTATION_INFO;
		if (endpoint === '/deals.info') return DEAL_INFO;
		if (endpoint === '/contacts.info') return CONTACT_INFO;
		if (endpoint === '/companies.info') return COMPANY_INFO;
		if (endpoint === '/invoices.info') return INVOICE_INFO;
		if (endpoint === '/mailTemplates.list') {
			return {
				data: [
					{
						id: 'template-1',
						name: 'Standaard offerte',
						language: 'nl',
						content: { subject: 'Uw offerte', body: 'Teken hier: #LINK' },
					},
					{
						id: 'template-2',
						name: 'Met merge fields',
						content: { subject: 'Beste #CONTACT_FIRST_NAME', body: 'Zie #LINK en #COMPANY_NAME' },
					},
					{ id: 'template-empty', name: 'Leeg', content: {} },
				],
			};
		}
		return {};
	});
}

const manualMessage = { messageSource: 'manual', subject: 'Your offer', content: 'Sign at #LINK' };

beforeEach(() => {
	apiRequest.mockReset();
	mockApi();
});

// ------------------------------------------------------------------ helpers

describe('Recipient shape helpers', () => {
	it('uses the exact e-mail key each endpoint expects', () => {
		const entry = { email: 'a@b.test', customer: { type: 'contact', id: 'c-1' } };
		expect(toApiRecipient(entry, 'email_address')).toEqual({
			email_address: 'a@b.test',
			customer: { type: 'contact', id: 'c-1' },
		});
		expect(toApiRecipient(entry, 'email')).toEqual({
			email: 'a@b.test',
			customer: { type: 'contact', id: 'c-1' },
		});
	});

	it('drops recipient rows without an address instead of sending blanks', () => {
		expect(
			readRecipientCollection({
				recipient: [{ email: '  ' }, { email: 'ok@example.test' }, { email: '' }],
			}),
		).toEqual([{ email: 'ok@example.test' }]);
	});

	it('links a recipient to a customer only when one was chosen', () => {
		expect(
			readRecipientCollection({
				recipient: [
					{ email: 'a@b.test' },
					{ email: 'c@d.test', customerId: { mode: 'contactList', value: 'contact-2' }, customerType: 'contact' },
				],
			}),
		).toEqual([
			{ email: 'a@b.test' },
			{ email: 'c@d.test', customer: { type: 'contact', id: 'contact-2' } },
		]);
	});

	it('omits empty CC and BCC keys entirely', () => {
		expect(buildRecipientsObject([{ email: 'a@b.test' }], [], [], 'email')).toEqual({
			to: [{ email: 'a@b.test' }],
		});
	});

	it('flags template shortcodes the API will not replace', () => {
		expect(unresolvedShortcodes('Sign at #LINK', ['#LINK'])).toEqual([]);
		expect(unresolvedShortcodes('Dear #CONTACT_FIRST_NAME, see #LINK', ['#LINK'])).toEqual([
			'#CONTACT_FIRST_NAME',
		]);
	});
});

// --------------------------------------------------------- quotation send

describe('Quotation Send recipients', () => {
	it('resolves the deal contact person through quotation -> deal -> contact', async () => {
		await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'dealContactPerson',
			...manualMessage,
		});

		expect(callsTo('/quotations.info')[0][1]).toEqual({ id: 'quotation-1' });
		expect(callsTo('/deals.info')[0][1]).toEqual({ id: 'deal-1' });
		expect(callsTo('/contacts.info')[0][1]).toEqual({ id: 'contact-1' });

		expect((bodyTo('/quotations.send').recipients as IDataObject).to).toEqual([
			// The primary address wins over the invoicing one.
			{ email_address: 'jan@example.test', customer: { type: 'contact', id: 'contact-1' } },
		]);
	});

	it('resolves the deal customer through the company endpoint', async () => {
		await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'dealCustomer',
			...manualMessage,
		});

		expect(callsTo('/companies.info')).toHaveLength(1);
		expect(callsTo('/contacts.info')).toHaveLength(0);
		expect((bodyTo('/quotations.send').recipients as IDataObject).to).toEqual([
			{ email_address: 'info@acme.test', customer: { type: 'company', id: 'company-1' } },
		]);
	});

	it('uses custom recipients without reading any Teamleader record', async () => {
		await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'custom',
			to: { recipient: [{ email: 'someone@example.test' }] },
			...manualMessage,
		});

		expect(callsTo('/quotations.info')).toHaveLength(0);
		expect(callsTo('/deals.info')).toHaveLength(0);
		expect((bodyTo('/quotations.send').recipients as IDataObject).to).toEqual([
			{ email_address: 'someone@example.test' },
		]);
	});

	it('never falls back when the contact person has no e-mail address', async () => {
		mockApi({ '/contacts.info': { data: { id: 'contact-1', first_name: 'Jan', emails: [] } } });

		await expect(
			sendQuotation({
				quotationId: { mode: 'list', value: 'quotation-1' },
				recipientSource: 'dealContactPerson',
				...manualMessage,
			}),
		).rejects.toThrow('has no e-mail address in Teamleader');
		expect(callsTo('/quotations.send')).toHaveLength(0);
		// Specifically: it did not quietly try the deal customer instead.
		expect(callsTo('/companies.info')).toHaveLength(0);
	});

	it('never falls back when the deal has no contact person', async () => {
		mockApi({
			'/deals.info': { data: { id: 'deal-1', lead: { customer: { type: 'company', id: 'company-1' } } } },
		});

		await expect(
			sendQuotation({
				quotationId: { mode: 'list', value: 'quotation-1' },
				recipientSource: 'dealContactPerson',
				...manualMessage,
			}),
		).rejects.toThrow('has no contact person');
		expect(callsTo('/quotations.send')).toHaveLength(0);
	});

	it('fails when the quotation carries no deal', async () => {
		mockApi({ '/quotations.info': { data: { id: 'quotation-1' } } });

		await expect(
			sendQuotation({
				quotationId: { mode: 'list', value: 'quotation-1' },
				recipientSource: 'dealCustomer',
				...manualMessage,
			}),
		).rejects.toThrow('Could not read the deal of quotation quotation-1');
	});

	it('fails when Custom Recipients has no usable address', async () => {
		await expect(
			sendQuotation({
				quotationId: { mode: 'list', value: 'quotation-1' },
				recipientSource: 'custom',
				to: { recipient: [{ email: '   ' }] },
				...manualMessage,
			}),
		).rejects.toThrow('No "To" recipient could be determined from Custom Recipients');
	});

	it('reads each record once even when several items send the same quotation', async () => {
		const executionContext = new TeamleaderExecutionContext();
		const parameters = {
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'dealContactPerson',
			...manualMessage,
		};
		await executeQuotation.call(makeContext(parameters), 'send', 0, executionContext);
		await executeQuotation.call(makeContext(parameters), 'send', 1, executionContext);

		expect(callsTo('/quotations.info')).toHaveLength(1);
		expect(callsTo('/deals.info')).toHaveLength(1);
		expect(callsTo('/contacts.info')).toHaveLength(1);
		expect(callsTo('/quotations.send')).toHaveLength(2);
	});
});

describe('Quotation Send request body', () => {
	it('sends the exact quotations.send shape', async () => {
		await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'custom',
			to: { recipient: [{ email: 'a@b.test' }] },
			cc: { recipient: [{ email: 'cc@b.test' }] },
			language: 'en',
			...manualMessage,
		});

		expect(bodyTo('/quotations.send')).toEqual({
			quotations: ['quotation-1'],
			recipients: {
				to: [{ email_address: 'a@b.test' }],
				cc: [{ email_address: 'cc@b.test' }],
			},
			subject: 'Your offer',
			content: 'Sign at #LINK',
			language: 'en',
		});
	});

	it('uses email_address, never the invoice spelling', async () => {
		await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'custom',
			to: { recipient: [{ email: 'a@b.test' }] },
			...manualMessage,
		});

		const serialised = JSON.stringify(bodyTo('/quotations.send').recipients);
		expect(serialised).toContain('email_address');
		expect(serialised).not.toContain('"email"');
	});

	it('carries extra quotations from the same deal', async () => {
		await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'custom',
			to: { recipient: [{ email: 'a@b.test' }] },
			advancedOptions: { additionalQuotationIds: 'quotation-2, quotation-3' },
			...manualMessage,
		});

		expect(bodyTo('/quotations.send').quotations).toEqual([
			'quotation-1',
			'quotation-2',
			'quotation-3',
		]);
	});

	it('sends a custom sender only when both halves are given', async () => {
		await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'custom',
			to: { recipient: [{ email: 'a@b.test' }] },
			advancedOptions: {
				senderId: 'user-1',
				senderEmailAddress: 'sales@warmvast.test',
				senderType: 'user',
				attachments: 'file-1',
			},
			...manualMessage,
		});

		expect(bodyTo('/quotations.send').from).toEqual({
			sender: { type: 'user', id: 'user-1' },
			email_address: 'sales@warmvast.test',
		});
		expect(bodyTo('/quotations.send').attachments).toEqual(['file-1']);
	});

	it('refuses half a sender instead of sending a broken one', async () => {
		await expect(
			sendQuotation({
				quotationId: { mode: 'list', value: 'quotation-1' },
				recipientSource: 'custom',
				to: { recipient: [{ email: 'a@b.test' }] },
				advancedOptions: { senderId: 'user-1' },
				...manualMessage,
			}),
		).rejects.toThrow('needs both a Sender ID and a Sender Email Address');
	});

	it('omits the sender entirely when neither half is set', async () => {
		await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'custom',
			to: { recipient: [{ email: 'a@b.test' }] },
			...manualMessage,
		});
		expect(bodyTo('/quotations.send').from).toBeUndefined();
	});

	it('requires both subject and message in manual mode', async () => {
		await expect(
			sendQuotation({
				quotationId: { mode: 'list', value: 'quotation-1' },
				recipientSource: 'custom',
				to: { recipient: [{ email: 'a@b.test' }] },
				messageSource: 'manual',
				subject: 'Only a subject',
			}),
		).rejects.toThrow('Fill in both the subject and the message');
	});

	it('keeps editor-only fields out of the request', async () => {
		await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'dealContactPerson',
			...manualMessage,
		});

		const serialised = JSON.stringify(bodyTo('/quotations.send'));
		for (const key of ['recipientSource', 'messageSource', 'advancedOptions', 'mailTemplateId']) {
			expect(serialised).not.toContain(key);
		}
	});
});

describe('Quotation Send mail templates', () => {
	it('copies the template subject and body, because the endpoint takes no template ID', async () => {
		await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'custom',
			to: { recipient: [{ email: 'a@b.test' }] },
			messageSource: 'template',
			mailTemplateId: 'template-1',
		});

		expect(callsTo('/mailTemplates.list')[0][1]).toEqual({ filter: { type: 'quotation' } });
		expect(bodyTo('/quotations.send')).toMatchObject({
			subject: 'Uw offerte',
			content: 'Teken hier: #LINK',
		});
		expect(bodyTo('/quotations.send').mail_template_id).toBeUndefined();
	});

	it('warns about merge fields Teamleader will not replace, without blocking the send', async () => {
		const result = await sendQuotation({
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'custom',
			to: { recipient: [{ email: 'a@b.test' }] },
			messageSource: 'template',
			mailTemplateId: 'template-2',
		});

		expect(callsTo('/quotations.send')).toHaveLength(1);
		const warnings = (result[0] as IDataObject)._warnings as string[];
		expect(warnings[0]).toContain('#CONTACT_FIRST_NAME');
		expect(warnings[0]).toContain('#COMPANY_NAME');
		expect(warnings[0]).not.toContain('#LINK.');
		// Warnings never travel to Teamleader.
		expect(JSON.stringify(bodyTo('/quotations.send'))).not.toContain('_warnings');
	});

	it('fails on a template that no longer exists rather than picking another', async () => {
		await expect(
			sendQuotation({
				quotationId: { mode: 'list', value: 'quotation-1' },
				recipientSource: 'custom',
				to: { recipient: [{ email: 'a@b.test' }] },
				messageSource: 'template',
				mailTemplateId: 'template-gone',
			}),
		).rejects.toThrow('was not found among your quotation templates');
	});

	it('fails on a template with no subject or body', async () => {
		await expect(
			sendQuotation({
				quotationId: { mode: 'list', value: 'quotation-1' },
				recipientSource: 'custom',
				to: { recipient: [{ email: 'a@b.test' }] },
				messageSource: 'template',
				mailTemplateId: 'template-empty',
			}),
		).rejects.toThrow('has no subject or body to send');
	});

	it('reads the template list once per execution', async () => {
		const executionContext = new TeamleaderExecutionContext();
		const parameters = {
			quotationId: { mode: 'list', value: 'quotation-1' },
			recipientSource: 'custom',
			to: { recipient: [{ email: 'a@b.test' }] },
			messageSource: 'template',
			mailTemplateId: 'template-1',
		};
		await executeQuotation.call(makeContext(parameters), 'send', 0, executionContext);
		await executeQuotation.call(makeContext(parameters), 'send', 1, executionContext);

		expect(callsTo('/mailTemplates.list')).toHaveLength(1);
	});
});

// ------------------------------------------------------------ invoice send

describe('Invoice Send recipients', () => {
	it('omits the recipients key entirely for Teamleader Default', async () => {
		await sendInvoice({
			invoiceId: { mode: 'list', value: 'invoice-1' },
			recipientSource: 'default',
			messageSource: 'manual',
			subject: 'Invoice',
			body: 'Please find it attached',
		});

		expect(bodyTo('/invoices.send')).toEqual({
			id: 'invoice-1',
			content: { subject: 'Invoice', body: 'Please find it attached' },
		});
		expect(Object.keys(bodyTo('/invoices.send'))).not.toContain('recipients');
		expect(callsTo('/invoices.info')).toHaveLength(0);
	});

	it('uses the invoicee e-mail from invoices.info without a second read', async () => {
		await sendInvoice({
			invoiceId: { mode: 'list', value: 'invoice-1' },
			recipientSource: 'invoiceCustomer',
			messageSource: 'manual',
			subject: 'Invoice',
			body: 'Attached',
		});

		expect(callsTo('/invoices.info')).toHaveLength(1);
		expect(callsTo('/companies.info')).toHaveLength(0);
		expect((bodyTo('/invoices.send').recipients as IDataObject).to).toEqual([
			{ email: 'billing@acme.test', customer: { type: 'company', id: 'company-1' } },
		]);
	});

	it('falls back to the customer record only when the invoice carries no e-mail', async () => {
		mockApi({
			'/invoices.info': {
				data: { id: 'invoice-1', invoicee: { customer: { type: 'company', id: 'company-1' } } },
			},
		});

		await sendInvoice({
			invoiceId: { mode: 'list', value: 'invoice-1' },
			recipientSource: 'invoiceCustomer',
			messageSource: 'manual',
			subject: 'Invoice',
			body: 'Attached',
		});

		expect(callsTo('/companies.info')).toHaveLength(1);
		expect((bodyTo('/invoices.send').recipients as IDataObject).to).toEqual([
			{ email: 'info@acme.test', customer: { type: 'company', id: 'company-1' } },
		]);
	});

	it('fails when neither the invoice nor the customer has an address', async () => {
		mockApi({
			'/invoices.info': {
				data: { id: 'invoice-1', invoicee: { customer: { type: 'company', id: 'company-1' } } },
			},
			'/companies.info': { data: { id: 'company-1', name: 'Acme BV', emails: [] } },
		});

		await expect(
			sendInvoice({
				invoiceId: { mode: 'list', value: 'invoice-1' },
				recipientSource: 'invoiceCustomer',
				messageSource: 'manual',
				subject: 'Invoice',
				body: 'Attached',
			}),
		).rejects.toThrow('has no e-mail address in Teamleader');
		expect(callsTo('/invoices.send')).toHaveLength(0);
	});

	it('fails when the invoice has no customer at all', async () => {
		mockApi({ '/invoices.info': { data: { id: 'invoice-1', invoicee: {} } } });

		await expect(
			sendInvoice({
				invoiceId: { mode: 'list', value: 'invoice-1' },
				recipientSource: 'invoiceCustomer',
				messageSource: 'manual',
				subject: 'Invoice',
				body: 'Attached',
			}),
		).rejects.toThrow('Could not read the customer of invoice invoice-1');
	});

	it('uses email, never the quotation spelling', async () => {
		await sendInvoice({
			invoiceId: { mode: 'list', value: 'invoice-1' },
			recipientSource: 'custom',
			to: { recipient: [{ email: 'a@b.test' }] },
			bcc: { recipient: [{ email: 'archive@b.test' }] },
			messageSource: 'manual',
			subject: 'Invoice',
			body: 'Attached',
		});

		const recipients = bodyTo('/invoices.send').recipients as IDataObject;
		expect(recipients).toEqual({
			to: [{ email: 'a@b.test' }],
			bcc: [{ email: 'archive@b.test' }],
		});
		expect(JSON.stringify(recipients)).not.toContain('email_address');
	});
});

describe('Invoice Send message', () => {
	it('uses the native mail_template_id together with the template content', async () => {
		mockApi({
			'/mailTemplates.list': {
				data: [
					{
						id: 'invoice-template-1',
						name: 'Standaard factuur',
						content: { subject: 'Uw factuur', body: 'In bijlage' },
					},
				],
			},
		});

		await sendInvoice({
			invoiceId: { mode: 'list', value: 'invoice-1' },
			recipientSource: 'default',
			messageSource: 'template',
			mailTemplateId: 'invoice-template-1',
		});

		expect(callsTo('/mailTemplates.list')[0][1]).toEqual({ filter: { type: 'invoice' } });
		expect(bodyTo('/invoices.send').content).toEqual({
			subject: 'Uw factuur',
			body: 'In bijlage',
			mail_template_id: 'invoice-template-1',
		});
	});

	it('requires a template to have been chosen in template mode', async () => {
		await expect(
			sendInvoice({
				invoiceId: { mode: 'list', value: 'invoice-1' },
				recipientSource: 'default',
				messageSource: 'template',
			}),
		).rejects.toThrow('Select the mail template to send');
	});

	it('requires both subject and message in manual mode', async () => {
		await expect(
			sendInvoice({
				invoiceId: { mode: 'list', value: 'invoice-1' },
				recipientSource: 'default',
				messageSource: 'manual',
				subject: 'Only a subject',
			}),
		).rejects.toThrow('Fill in both the subject and the message');
	});

	it('attaches files by ID when given', async () => {
		await sendInvoice({
			invoiceId: { mode: 'list', value: 'invoice-1' },
			recipientSource: 'default',
			messageSource: 'manual',
			subject: 'Invoice',
			body: 'Attached',
			advancedOptions: { attachments: 'file-1, file-2' },
		});

		expect(bodyTo('/invoices.send').attachments).toEqual(['file-1', 'file-2']);
	});
});

// -------------------------------------------------------------------- UX

describe('Send UX', () => {
	const quotationSend = quotationFields.filter((field) =>
		(field.displayOptions?.show?.operation as string[] | undefined)?.includes('send'),
	);
	const invoiceSend = invoiceFields.filter((field) =>
		(field.displayOptions?.show?.operation as string[] | undefined)?.includes('send'),
	);
	const names = (fields: INodeProperties[]) => fields.map((field) => field.name);

	it('offers the three approved quotation recipient sources', () => {
		const source = quotationSend.find((field) => field.name === 'recipientSource');
		expect(source?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'dealContactPerson',
			'dealCustomer',
			'custom',
		]);
	});

	it('offers the three approved invoice recipient sources', () => {
		const source = invoiceSend.find((field) => field.name === 'recipientSource');
		expect(source?.options?.map((option) => (option as { value: string }).value)).toEqual([
			'default',
			'invoiceCustomer',
			'custom',
		]);
		expect(source?.default).toBe('default');
	});

	it('shows the recipient editor only for Custom Recipients', () => {
		for (const fields of [quotationSend, invoiceSend]) {
			const to = fields.find((field) => field.name === 'to');
			expect(to?.displayOptions?.show?.recipientSource).toEqual(['custom']);
		}
	});

	it('keeps quotation language required and does not invent one for invoices', () => {
		expect(quotationSend.find((field) => field.name === 'language')?.required).toBe(true);
		expect(names(invoiceSend)).not.toContain('language');
	});

	it('is honest that a quotation template is copied, not applied by Teamleader', () => {
		const messageSource = quotationSend.find((field) => field.name === 'messageSource');
		expect(messageSource?.description).toContain('takes no template ID');
		expect(messageSource?.description).toContain('#LINK');
	});

	it('hides the manual subject and message in template mode', () => {
		for (const fields of [quotationSend, invoiceSend]) {
			const subject = fields.find((field) => field.name === 'subject');
			expect(subject?.displayOptions?.show?.messageSource).toEqual(['manual']);
		}
	});
});
