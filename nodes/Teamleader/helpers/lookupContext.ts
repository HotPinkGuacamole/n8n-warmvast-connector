import type { IDataObject, ILoadOptionsFunctions } from 'n8n-workflow';

import { extractId, teamleaderApiRequest, teamleaderApiRequestAllItems } from './GenericFunctions';

/**
 * Editor-time lookup context.
 *
 * Several Teamleader lists are only meaningful inside one department:
 * `documentTemplates.list` requires a department, and `taxRates.list` /
 * `productCategories.list` accept one as a filter. The department itself is
 * *not* a business input on a quotation — Teamleader derives the real one from
 * the deal — so V2 never asks for it as a normal field and never sends it.
 *
 * This module answers one question for load-options methods: "which department
 * should I narrow this dropdown to, if any?" Everything here runs in the n8n
 * editor only. It must therefore never throw and never leave a dropdown empty:
 * when no department can be determined the caller falls back to an unscoped,
 * department-labelled list.
 */

/**
 * True when a resolved parameter looks like a real Teamleader ID rather than an
 * unresolved expression placeholder (e.g. `={{ $json.dept }}`). Sending such a
 * placeholder to the API as a literal filter would silently return nothing.
 */
export function isLiteralId(value: unknown): boolean {
	const id = typeof value === 'string' ? value.trim() : extractId(value);
	return id.length > 0 && !id.includes('{') && !id.includes('}');
}

/**
 * Parameter paths that carry an explicit department choice, most specific
 * first. `advancedOptions.lookupDepartmentId` is the V2 quotation override
 * (context only, never sent); `departmentId` is a real field on resources that
 * genuinely own a department, such as Product.
 */
const EXPLICIT_DEPARTMENT_PARAMETERS = [
	'advancedOptions.lookupDepartmentId',
	'lookupDepartmentId',
	'departmentId',
];

/** Read the department off a literal Deal selection via one `deals.info` call. */
async function departmentFromDeal(context: ILoadOptionsFunctions): Promise<string | undefined> {
	const dealId = extractId(context.getCurrentNodeParameter('dealId'));
	if (!isLiteralId(dealId)) return undefined;

	try {
		const response = await teamleaderApiRequest.call(context, '/deals.info', { id: dealId });
		const data = (response.data ?? {}) as IDataObject;
		const department = data.department as IDataObject | undefined;
		const id = department && typeof department.id === 'string' ? department.id : undefined;
		return id && isLiteralId(id) ? id : undefined;
	} catch {
		// A failed editor lookup degrades to an unscoped list; it never breaks
		// the dropdown the user is currently opening.
		return undefined;
	}
}

/**
 * Resolve the department a dropdown should be narrowed to:
 * explicit override → an owning `departmentId` field → the selected Deal.
 * `undefined` means "no reliable context", not "no department".
 */
export async function resolveLookupDepartmentId(
	context: ILoadOptionsFunctions,
): Promise<string | undefined> {
	for (const path of EXPLICIT_DEPARTMENT_PARAMETERS) {
		const id = extractId(context.getCurrentNodeParameter(path));
		if (isLiteralId(id)) return id;
	}

	return await departmentFromDeal(context);
}

/** List departments; `activeOnly` matches what the Department dropdown offers. */
export async function listDepartments(
	context: ILoadOptionsFunctions,
	activeOnly: boolean,
): Promise<IDataObject[]> {
	const body: IDataObject = activeOnly ? { filter: { status: ['active'] } } : {};
	return await teamleaderApiRequestAllItems.call(context, '/departments.list', body);
}

/** Map department id → display name, for disambiguating an unscoped list. */
export async function departmentNames(
	context: ILoadOptionsFunctions,
): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	for (const department of await listDepartments(context, false)) {
		if (typeof department.id === 'string') {
			names.set(department.id, (department.name as string) || department.id);
		}
	}
	return names;
}
