import type { IDataObject } from 'n8n-workflow';

import { extractId } from '../../helpers/GenericFunctions';
import type { ITeamleaderReference } from '../../helpers/interfaces';

/** Resolve a 3-mode customer locator value into the `{type, id}` `lead.customer` needs. */
export function resolveCustomerReference(
	locatorValue: unknown,
	explicitType: unknown,
): ITeamleaderReference | undefined {
	const id = extractId(locatorValue);
	if (!id) return undefined;

	const mode =
		typeof locatorValue === 'object' && locatorValue !== null
			? ((locatorValue as IDataObject).mode as string | undefined)
			: undefined;

	if (mode === 'contactList') return { type: 'contact', id };
	if (mode === 'companyList') return { type: 'company', id };

	// Raw-ID / expression mode: the type can only come from the companion field.
	if (explicitType === 'contact') return { type: 'contact', id };
	if (explicitType === 'company') return { type: 'company', id };
	return undefined;
}
