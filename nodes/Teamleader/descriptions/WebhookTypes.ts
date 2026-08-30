import type { INodePropertyOptions } from 'n8n-workflow';

/**
 * Every webhook type supported by the official Teamleader Focus API.
 *
 * Names are prefixed with their entity so the common Warmvast entities
 * (contacts, companies, deals, quotations, invoices, products) group together
 * in the n8n multi-select, which sorts alphabetically.
 */
export const webhookTypeOptions: INodePropertyOptions[] = [
	{ name: 'Account: Deactivated', value: 'account.deactivated' },
	{ name: 'Account: Deleted', value: 'account.deleted' },
	{ name: 'Call: Added', value: 'call.added' },
	{ name: 'Call: Completed', value: 'call.completed' },
	{ name: 'Call: Deleted', value: 'call.deleted' },
	{ name: 'Call: Updated', value: 'call.updated' },
	{ name: 'Company: Added', value: 'company.added' },
	{ name: 'Company: Deleted', value: 'company.deleted' },
	{ name: 'Company: Updated', value: 'company.updated' },
	{ name: 'Contact: Added', value: 'contact.added' },
	{ name: 'Contact: Deleted', value: 'contact.deleted' },
	{ name: 'Contact: Linked to Company', value: 'contact.linkedToCompany' },
	{ name: 'Contact: Link to Company Updated', value: 'contact.updatedLinkToCompany' },
	{ name: 'Contact: Unlinked From Company', value: 'contact.unlinkedFromCompany' },
	{ name: 'Contact: Updated', value: 'contact.updated' },
	{ name: 'Credit Note: Booked', value: 'creditNote.booked' },
	{ name: 'Credit Note: Deleted', value: 'creditNote.deleted' },
	{ name: 'Credit Note: Sent', value: 'creditNote.sent' },
	{ name: 'Credit Note: Updated', value: 'creditNote.updated' },
	{ name: 'Deal: Created', value: 'deal.created' },
	{ name: 'Deal: Deleted', value: 'deal.deleted' },
	{ name: 'Deal: Lost', value: 'deal.lost' },
	{ name: 'Deal: Moved', value: 'deal.moved' },
	{ name: 'Deal: Updated', value: 'deal.updated' },
	{ name: 'Deal: Won', value: 'deal.won' },
	{ name: 'Invoice: Booked', value: 'invoice.booked' },
	{ name: 'Invoice: Deleted', value: 'invoice.deleted' },
	{ name: 'Invoice: Drafted', value: 'invoice.drafted' },
	{ name: 'Invoice: Payment Registered', value: 'invoice.paymentRegistered' },
	{ name: 'Invoice: Payment Removed', value: 'invoice.paymentRemoved' },
	{ name: 'Invoice: Sent', value: 'invoice.sent' },
	{ name: 'Invoice: Updated', value: 'invoice.updated' },
	{ name: 'Meeting: Completed', value: 'meeting.completed' },
	{ name: 'Meeting: Created', value: 'meeting.created' },
	{ name: 'Meeting: Deleted', value: 'meeting.deleted' },
	{ name: 'Meeting: Updated', value: 'meeting.updated' },
	{ name: 'Milestone: Created', value: 'milestone.created' },
	{ name: 'Milestone: Updated', value: 'milestone.updated' },
	{ name: 'Product: Added', value: 'product.added' },
	{ name: 'Product: Deleted', value: 'product.deleted' },
	{ name: 'Product: Updated', value: 'product.updated' },
	{ name: 'Project (Legacy): Created', value: 'project.created' },
	{ name: 'Project (Legacy): Deleted', value: 'project.deleted' },
	{ name: 'Project (Legacy): Updated', value: 'project.updated' },
	{ name: 'Project: Closed', value: 'nextgenProject.closed' },
	{ name: 'Project: Created', value: 'nextgenProject.created' },
	{ name: 'Project: Deleted', value: 'nextgenProject.deleted' },
	{ name: 'Project: Updated', value: 'nextgenProject.updated' },
	{ name: 'Project Task: Completed', value: 'nextgenTask.completed' },
	{ name: 'Project Task: Created', value: 'nextgenTask.created' },
	{ name: 'Project Task: Deleted', value: 'nextgenTask.deleted' },
	{ name: 'Project Task: Updated', value: 'nextgenTask.updated' },
	{ name: 'Subscription: Added', value: 'subscription.added' },
	{ name: 'Subscription: Deactivated', value: 'subscription.deactivated' },
	{ name: 'Subscription: Deleted', value: 'subscription.deleted' },
	{ name: 'Subscription: Updated', value: 'subscription.updated' },
	{ name: 'Task: Completed', value: 'task.completed' },
	{ name: 'Task: Created', value: 'task.created' },
	{ name: 'Task: Deleted', value: 'task.deleted' },
	{ name: 'Task: Updated', value: 'task.updated' },
	{ name: 'Ticket: Closed', value: 'ticket.closed' },
	{ name: 'Ticket: Created', value: 'ticket.created' },
	{ name: 'Ticket: Deleted', value: 'ticket.deleted' },
	{ name: 'Ticket: Reopened', value: 'ticket.reopened' },
	{ name: 'Ticket: Updated', value: 'ticket.updated' },
	{ name: 'Ticket Message: Added', value: 'ticketMessage.added' },
	{ name: 'Time Tracking: Added', value: 'timeTracking.added' },
	{ name: 'Time Tracking: Deleted', value: 'timeTracking.deleted' },
	{ name: 'Time Tracking: Updated', value: 'timeTracking.updated' },
	{ name: 'User: Deactivated', value: 'user.deactivated' },
];

/**
 * The events a Warmvast employee actually builds automations on. Kept short on
 * purpose: this is the "Common Events" shortcut, not a second full list.
 *
 * Every value here must exist in `webhookTypeOptions` above — Teamleader
 * publishes no quotation webhook types, so none are invented here.
 */
export const commonWebhookTypeOptions: INodePropertyOptions[] = [
	{ name: 'Company: Added', value: 'company.added' },
	{ name: 'Company: Updated', value: 'company.updated' },
	{ name: 'Contact: Added', value: 'contact.added' },
	{ name: 'Contact: Updated', value: 'contact.updated' },
	{ name: 'Deal: Created', value: 'deal.created' },
	{ name: 'Deal: Lost', value: 'deal.lost' },
	{ name: 'Deal: Moved', value: 'deal.moved' },
	{ name: 'Deal: Won', value: 'deal.won' },
	{ name: 'Invoice: Booked', value: 'invoice.booked' },
	{ name: 'Invoice: Drafted', value: 'invoice.drafted' },
	{ name: 'Invoice: Payment Registered', value: 'invoice.paymentRegistered' },
	{ name: 'Invoice: Sent', value: 'invoice.sent' },
];

/** Entity prefix of an event type, e.g. `deal` for `deal.won`. */
export function entityOf(eventType: string): string {
	return eventType.split('.')[0];
}

/** Every entity that has webhook types, as multi-select options. */
export const webhookEntityOptions: INodePropertyOptions[] = Array.from(
	new Set(webhookTypeOptions.map((option) => entityOf(option.value as string))),
)
	.map((entity) => ({
		// `nextgenProject` -> `Nextgen Project`, `creditNote` -> `Credit Note`.
		name: entity
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, (character) => character.toUpperCase())
			.trim(),
		value: entity,
	}))
	.sort((a, b) => a.name.localeCompare(b.name));

/** Every known event type, used by the All Events selection. */
export const allWebhookTypes: string[] = webhookTypeOptions.map(
	(option) => option.value as string,
);
