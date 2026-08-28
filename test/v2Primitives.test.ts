import {
	ADVANCED_OPTIONS_DISPLAY_NAME,
	ADVANCED_OPTIONS_NAME,
	advancedOptions,
	customerLocator,
	customerTypeField,
	destructiveNotice,
	fractionToPercent,
	moneyField,
	percentToFraction,
	percentageField,
	resourceLocatorField,
	tagFields,
	v2ResourceField,
} from '../nodes/Teamleader/v2/descriptions/V2Common';

const scope = { resource: 'invoice', operations: ['draft'] };

describe('v2ResourceField', () => {
	it('sorts resources and defaults to the first one', () => {
		const field = v2ResourceField([
			{ name: 'Invoice', value: 'invoice' },
			{ name: 'Company', value: 'company' },
		]);
		expect(field.options?.map((option) => (option as { value: string }).value)).toEqual([
			'company',
			'invoice',
		]);
		expect(field.default).toBe('company');
		expect(field.noDataExpression).toBe(true);
	});
});

describe('advancedOptions', () => {
	it('uses one consistent name and sorts its options', () => {
		const collection = advancedOptions(scope, [
			{ displayName: 'Zeta', name: 'zeta', type: 'string', default: '' },
			{ displayName: 'Alpha', name: 'alpha', type: 'string', default: '' },
		]);
		expect(collection.displayName).toBe(ADVANCED_OPTIONS_DISPLAY_NAME);
		expect(collection.name).toBe(ADVANCED_OPTIONS_NAME);
		expect(collection.type).toBe('collection');
		expect(collection.options?.map((option) => (option as { name: string }).name)).toEqual([
			'alpha',
			'zeta',
		]);
		expect(collection.displayOptions?.show?.resource).toEqual(['invoice']);
	});
});

describe('customerLocator', () => {
	const locator = customerLocator(scope);

	it('offers company, contact and raw-ID modes', () => {
		expect(locator.type).toBe('resourceLocator');
		expect(locator.modes?.map((mode) => mode.name)).toEqual(['companyList', 'contactList', 'id']);
	});

	it('keeps both list modes searchable', () => {
		for (const mode of locator.modes ?? []) {
			if (mode.type !== 'list') continue;
			expect(mode.typeOptions?.searchable).toBe(true);
			expect(typeof mode.typeOptions?.searchListMethod).toBe('string');
		}
	});

	it('asks for a customer type only in raw-ID mode', () => {
		const typeField = customerTypeField(scope);
		expect(typeField.name).toBe('customerType');
		expect(typeField.displayOptions?.show?.['customer.mode']).toEqual(['id']);
	});
});

describe('resourceLocatorField', () => {
	it('produces the standard From List + By ID pair', () => {
		const field = resourceLocatorField({
			displayName: 'Deal',
			name: 'dealId',
			searchListMethod: 'searchDeals',
			scope,
			description: 'The deal to use',
		});
		expect(field.modes?.map((mode) => mode.name)).toEqual(['list', 'id']);
		expect(field.default).toEqual({ mode: 'list', value: '' });
		expect(field.modes?.[0].typeOptions?.searchable).toBe(true);
	});
});

describe('tagFields', () => {
	it('pairs an existing-tag selector with a new-tag input', () => {
		const [existing, created] = tagFields(scope);
		expect(existing.type).toBe('multiOptions');
		expect(existing.typeOptions?.loadOptionsMethod).toBe('getTags');
		expect(created.name).toBe('newTags');
		expect(created.type).toBe('string');
	});
});

describe('moneyField', () => {
	it('uses two-decimal precision and is optional by default', () => {
		const field = moneyField({
			displayName: 'Amount',
			name: 'amount',
			scope,
			description: 'Amount to register',
		});
		expect(field.type).toBe('number');
		expect(field.typeOptions?.numberPrecision).toBe(2);
		expect(field.required).toBe(false);
	});
});

describe('percentage helpers', () => {
	it('constrains the input to 0-100', () => {
		const field = percentageField({
			displayName: 'Probability',
			name: 'probabilityPercent',
			scope,
			description: 'How likely this deal is to close',
		});
		expect(field.typeOptions?.minValue).toBe(0);
		expect(field.typeOptions?.maxValue).toBe(100);
	});

	it('converts a 0-100 percentage into the API fraction', () => {
		expect(percentToFraction(0)).toBe(0);
		expect(percentToFraction(50)).toBe(0.5);
		expect(percentToFraction(100)).toBe(1);
		expect(percentToFraction('75')).toBe(0.75);
	});

	it('clamps out-of-range values and ignores empty input', () => {
		expect(percentToFraction(150)).toBe(1);
		expect(percentToFraction(-10)).toBe(0);
		expect(percentToFraction('')).toBeUndefined();
		expect(percentToFraction('abc')).toBeUndefined();
	});

	it('round-trips back into a percentage', () => {
		expect(fractionToPercent(0.5)).toBe(50);
		expect(fractionToPercent(0.075)).toBe(7.5);
		expect(fractionToPercent(percentToFraction(30))).toBe(30);
	});
});

describe('destructiveNotice', () => {
	it('renders a notice describing the effect, not a fake dialog', () => {
		const notice = destructiveNotice(scope, {
			name: 'deleteNotice',
			text: 'This permanently deletes the invoice in Teamleader. This cannot be undone.',
		});
		expect(notice.type).toBe('notice');
		expect(notice.displayName).toContain('cannot be undone');
		expect(notice.default).toBe('');
	});
});
