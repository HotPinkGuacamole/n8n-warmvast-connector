# Usage note

This document is the detailed V2 design baseline written before implementation began. Any internal wording such as “design only” is historical. The current repository is the source of truth for completed implementation, and `CLAUDE.md` contains approved overrides that take precedence where this specification conflicts. A current stage prompt narrows the work for that stage.

---

# Teamleader Connector — V2 UX / Design Specification

Branch: **`v2-ux`**. Status: design only, no implementation.
Baseline: accepted V1 UX audit. Scope: no new API operations, no new resources.

---

## 0. Reading guide

Field classification used everywhere:

- **PRIMARY** — always visible, top of the form, part of the mental model of the task
- **COMMON** — always visible, below primary, frequently but not always needed
- **CONDITIONAL** — visible only when another field's value requires it
- **ADVANCED** — inside the **`Advanced Options`** collection (renamed from **`Additional Fields`** / **`Update Fields`** / **`Send Options`** / **`Options`**)
- **REMOVE FROM V2 UI** — no longer exposed as a direct field (may still be derived internally)

Field notation used in the tables:

**`Display Label`** — **`v2ParamName`** (v1: **`oldName`**) · type · default · required · lookup · visible-when · description

Two hard technical constraints that shape the entire spec (see §G-notes and Global §1.13):

1. n8n node properties are **static declarations**. Nothing can be auto-filled into another field in the editor as a reaction to a selection. Anything "derived" is derived **at execution time** only, and must be visibly labelled as such.
2. **`loadOptions`** **can** read other parameters of the same node (**`getCurrentNodeParameter`**), so dependent dropdowns are possible — but only when the field they depend on holds a **literal** value. If it holds an expression, the dropdown cannot resolve and must degrade to an ID/expression input. Every dependent dropdown in this spec therefore has a documented degradation path.

---

# PART 1 — Per-operation specifications

## A. CONTACT (deep-design)

### Contact → Get

**Primary user goal**: look up one person's details.

**Field layout**

| **ClassSpec** |                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRIMARY       | **`Contact`** — **`contactId`** (unchanged) · resourceLocator (**`From List`** via **`searchContacts`**, searchable; **`By ID`**) · **`{mode:'list',value:''}`** · required · always |
| ADVANCED      | **`Include Custom Fields`** — **`options.includeCustomFields`** (unchanged) · boolean · **`false`** · not required                                                                   |

**Interaction rules**: none.
**Runtime derivation**: **`contacts.info`**; **`includes=custom_fields`** when the toggle is on. No derivation.
**Breaking-change impact**: none. Only the collection label changes (**`Options`** → **`Advanced Options`**), which is display-only and does not affect saved workflows (the parameter name **`options`** is kept).

---

### Contact → Get Many

**Primary user goal**: find a set of contacts by search term, company, tag or change date.

**Field layout**

| **ClassSpec**           |                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRIMARY                 | **`Return All`** — **`returnAll`** · boolean · **`false`** · not required                                                                                                                                                                                                                                                                                                                                                |
| PRIMARY                 | **`Limit`** — **`limit`** · number · **`50`** · not required · visible when **`returnAll = false`**                                                                                                                                                                                                                                                                                                                      |
| COMMON                  | **`Search Term`** — **`filters.term`** (unchanged) · string · **`''`** · promoted to the top of the filter collection by alphabetical-safe label **`Search Term`** (n8n sorts collection options by label; see Global §1.14)                                                                                                                                                                                             |
| COMMON                  | **`Filters`** collection — **`filters`** (unchanged), containing: **`Company`** (**`filters.companyId`**, resourceLocator, **`searchCompanies`**), **`Email`** (**`filters.email`**), **`IDs`** (**`filters.ids`**), **`Search Term`** (**`filters.term`**), **`Status`** (**`filters.status`**, options, **`active`**), **`Tags`** (**changed**, see below), **`Updated Since`** (**`filters.updatedSince`**, dateTime) |
| COMMON (inside Filters) | **`Tags`** — **`filters.tags`** · **multiOptions** (v1: comma-separated string) · **`[]`** · lookup **`getTags`** · degrades to free text via expression                                                                                                                                                                                                                                                                 |
| ADVANCED                | **`Include Custom Fields`** — **`options.includeCustomFields`** · boolean · **`false`**                                                                                                                                                                                                                                                                                                                                  |

**Interaction rules**: **`Return All = true`** hides **`Limit`**. No other dependencies.
**Runtime derivation**: **`contacts.list`** with pagination; **`filters.tags`** array is sent as **`filter.tags`**. Empty filters omitted by **`cleanObject`**.
**Breaking-change impact**: **`filters.tags`** string → array. Migration required (see matrix).

---

### Contact → Create (deep-design)

**Primary user goal**: add a new person to Teamleader with the details a colleague actually has at hand: name, e-mail, phone, company relation.

**Field layout — exact visual order**

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRIMARY       | **`First Name`** — **`firstName`** (v1: **`additionalFields.first_name`**) · string · **`''`** · **not required** · always visible. *Description: "Optional in Teamleader, but normally filled in."*                                                                                                                                                                                                                                                                           |
| PRIMARY       | **`Last Name`** — **`lastName`** (unchanged) · string · **`''`** · **required** (the API requires it) · always visible                                                                                                                                                                                                                                                                                                                                                         |
| PRIMARY       | **`Email`** — **`email`** (v1: **`additionalFields.emails.email[].email`**) · string · **`''`** · not required · placeholder **`name@company.com`**. Sent as **`emails: [{type:'primary', email}]`**                                                                                                                                                                                                                                                                           |
| COMMON        | **`Phone`** — **`phone`** (v1: **`additionalFields.telephones.telephone[].number`**) · string · **`''`** · not required. Sent as **`telephones:[{type: phoneType, number: phone}]`**                                                                                                                                                                                                                                                                                           |
| COMMON        | **`Phone Type`** — **`phoneType`** · options (**`Mobile`**/**`Phone`**/**`Fax`**) · **`mobile`** · not required · visible when **`phone`** is non-empty (**`displayOptions.hide: { phone: [''] }`**)                                                                                                                                                                                                                                                                           |
| COMMON        | **`Company`** — **`companyId`** · resourceLocator (**`searchCompanies`**) · **`{mode:'list',value:''}`** · not required. *Description: "Link the new contact to this company after creation."*                                                                                                                                                                                                                                                                                 |
| CONDITIONAL   | **`Position`** — **`position`** · string · **`''`** · visible when **`companyId`** is set (**`hide: { companyId: [{ _cnd: { eq: '' } }] }`** — if that predicate proves unreliable in the target n8n version, show it unconditionally under COMMON)                                                                                                                                                                                                                            |
| CONDITIONAL   | **`Decision Maker`** — **`decisionMaker`** · boolean · **`false`** · same condition as **`Position`**                                                                                                                                                                                                                                                                                                                                                                          |
| COMMON        | **`Tags`** — **`tags`** · multiOptions · **`[]`** · lookup **`getTags`**                                                                                                                                                                                                                                                                                                                                                                                                       |
| COMMON        | **`New Tags`** — **`newTags`** · string (comma-separated) · **`''`** · *Description: "Tags that don't exist in Teamleader yet. They will be created."*                                                                                                                                                                                                                                                                                                                         |
| ADVANCED      | **`Advanced Options`** — **`additionalFields`** (name retained), containing exactly the V1 members minus the promoted ones: **`Addresses`**, **`BIC`**, **`Birthdate`**, **`Custom Fields`**, **`Emails`** (**renamed** **`Additional Emails`**), **`Gender`**, **`IBAN`**, **`Language`**, **`Marketing Mails Consent`**, **`National Identification Number`**, **`Remarks`**, **`Salutation`**, **`Telephones`** (**renamed** **`Additional Phone Numbers`**), **`Website`** |
| ADVANCED      | **`Language`** — **`additionalFields.language`** · **options** (v1: free string) · **`''`** · lookup: static ISO-639-1 list identical to the quotation **`language`** list, plus **`nl-BE`**/**`fr-BE`** style entries are **not** invented — only the 12 codes Teamleader documents                                                                                                                                                                                           |

**Interaction rules**

- **`Email`** (primary) and **`Additional Emails`** (advanced) are merged at execution: primary first with **`type: 'primary'`**; advanced entries appended with their own types. If both the primary field and an advanced **`primary`**-typed entry are filled, **the primary field wins** and a node warning is not raised (last-writer rule documented in Global §1.11).
- **`Company`** set → after **`contacts.add`** succeeds, a second call **`contacts.linkToCompany`** runs with **`position`**/**`decision_maker`**. If **`contacts.add`** succeeds but the link fails, the node throws with a message containing the created contact ID so the workflow can recover. This is the only multi-call create in the connector and is explicitly documented in the field description.
- **`Tags`** + **`New Tags`** merged, trimmed, de-duplicated case-insensitively, sent as **`tags: string[]`**.

**Runtime derivation**

- API calls: **`contacts.add`**; conditionally **`contacts.linkToCompany`**.
- Derived values: none beyond the field merges above.
- Fallback: no company → single call.
- Overridable: n/a.
- Error behaviour: link failure → **`NodeApiError`** prefixed **`Contact <id> was created, but linking it to the company failed:`**.

**Breaking-change impact**: **`additionalFields.first_name`** → **`firstName`**; email/phone now also settable at top level (old paths still accepted — see Global §1.15 compatibility rule); **`additionalFields.language`** string → options (values unchanged, so saved values still valid); tags gain **`tags`**/**`newTags`** on create where V1 had none.

---

### Contact → Update (deep-design)

Same layout as Create with these differences:

| **ClassSpec**     |                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRIMARY           | **`Contact`** — **`contactId`** · resourceLocator · required                                                                                                                                                             |
| COMMON            | **`First Name`** / **`Last Name`** / **`Email`** / **`Phone`** — same names as Create, all **not required**, all **`''`** default. Empty = not sent (**`cleanObject`**).                                                 |
| REMOVE FROM V2 UI | **`additionalFields.first_name`** and **`additionalFields.last_name`** (superseded by the top-level fields)                                                                                                              |
| COMMON            | **`Company`** / **`Position`** / **`Decision Maker`** — **not present on Update.** Linking is an explicit operation (**`Link to Company`**). Rationale: silently re-linking on update is hidden behaviour (principle 3). |
| ADVANCED          | identical collection to Create                                                                                                                                                                                           |

**Interaction rules**: nothing is sent that the user did not fill. **`Email`** fills **`emails`** as a **full replacement array** — this is Teamleader's semantics and must be stated in the description: *"Replaces the contact's e-mail addresses. Leave empty to keep them unchanged."* Same wording for **`Phone`**.
**Runtime derivation**: **`contacts.update`** only.
**Breaking-change impact**: **`additionalFields.last_name`** → **`lastName`** (top-level), **`additionalFields.first_name`** → **`firstName`**.

---

### Contact → Delete

| **ClassSpec** |                                                              |
| ------------- | ------------------------------------------------------------ |
| PRIMARY       | **`Contact`** — **`contactId`** · resourceLocator · required |

**Description text (mandatory, principle 9)**: *"Permanently deletes this contact in Teamleader. This cannot be undone from n8n."* placed on the operation (**`description`** + **`action`**) and repeated as a **`notice`**-type property above the locator.
**Runtime derivation**: **`contacts.delete`**. No derivation.
**Breaking-change impact**: none.

---

### Contact → Tag / Untag

| **ClassSpec**     |                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY           | **`Contact`** — **`contactId`** · resourceLocator · required                                                                                                                                                    |
| PRIMARY           | **`Tags`** — **`tags`** · **multiOptions** (v1: comma-separated string) · **`[]`** · lookup **`getTags`** · required-in-effect (validated at runtime, not **`required: true`**, so expressions can supply them) |
| COMMON (Tag only) | **`New Tags`** — **`newTags`** · string · **`''`** · *"Tags that do not exist yet in Teamleader"*                                                                                                               |

**Interaction rules**: **`Untag`** has no **`New Tags`** (untagging a non-existent tag is meaningless).
**Runtime derivation**: **`contacts.tag`** / **`contacts.untag`**. Merge + dedupe as in Create. If the resulting array is empty → **`NodeOperationError`** *"Select at least one tag"*.
**Breaking-change impact**: **`tags`** string → array; **migration required**.

---

### Contact → Link to Company

| **ClassSpec** |                                                                                      |
| ------------- | ------------------------------------------------------------------------------------ |
| PRIMARY       | **`Contact`** — **`contactId`** · resourceLocator · required                         |
| PRIMARY       | **`Company`** — **`companyId`** · resourceLocator (**`searchCompanies`**) · required |
| COMMON        | **`Position`** — **`position`** · string · **`''`**                                  |
| COMMON        | **`Decision Maker`** — **`decisionMaker`** · boolean · **`false`**                   |

Unchanged from V1 apart from ordering. No breaking change.

### Contact → Unlink From Company

| **ClassSpec** |                                            |
| ------------- | ------------------------------------------ |
| PRIMARY       | **`Contact`** — **`contactId`** · required |
| PRIMARY       | **`Company`** — **`companyId`** · required |

Add description: *"Removes the link between contact and company. Neither record is deleted."* No breaking change.

---

## B. COMPANY (deep-design)

### Company → Get / Get Many

Identical treatment to Contact Get / Get Many:

- Get: **`Company`** locator PRIMARY; **`Include Custom Fields`** ADVANCED.
- Get Many: **`Return All`**, **`Limit`**, then **`Filters`** (**`Email`**, **`IDs`**, **`Search Term`**, **`Status`**, **`Tags`** → **multiOptions** with **`getTags`**, **`Updated Since`**, **`VAT Number`**), then ADVANCED **`Include Custom Fields`**.
- Breaking change: **`filters.tags`** string → array.

---

### Company → Create (deep-design)

**Primary user goal**: register a new business relation with the data needed to invoice it.

**Field layout — exact visual order**

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Company Name`** — **`name`** (unchanged) · string · **`''`** · **required**                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| PRIMARY       | **`VAT Number`** — **`vatNumber`** (v1: **`additionalFields.vat_number`**) · string · **`''`** · not required · placeholder **`BE0899623035`**                                                                                                                                                                                                                                                                                                                                                                   |
| PRIMARY       | **`Email`** — **`email`** (v1: nested in **`additionalFields.emails`**) · string · **`''`** · not required · sent as **`emails:[{type:'primary', email}]`**                                                                                                                                                                                                                                                                                                                                                      |
| COMMON        | **`Phone`** — **`phone`** · string · **`''`** · sent as **`telephones:[{type: phoneType, number}]`**                                                                                                                                                                                                                                                                                                                                                                                                             |
| COMMON        | **`Phone Type`** — **`phoneType`** · options (**`Phone`**/**`Fax`**/**`Mobile`**) · **`phone`** · visible when **`phone`** non-empty                                                                                                                                                                                                                                                                                                                                                                             |
| COMMON        | **`Responsible User`** — **`responsibleUserId`** (v1: **`additionalFields.responsible_user_id`**) · options · **`''`** · lookup **`getUsers`**                                                                                                                                                                                                                                                                                                                                                                   |
| COMMON        | **`Invoicing Address`** — **`invoicingAddress`** · **fixedCollection, single value** (**`multipleValues: false`**) with members **`Line 1`**, **`Postal Code`**, **`City`**, **`Country`** (options, ISO-2 list, default **`BE`**) · **`{}`** · not required. Sent as **`addresses:[{type:'invoicing', address:{...}}]`**                                                                                                                                                                                        |
| COMMON        | **`Tags`** — **`tags`** · multiOptions · lookup **`getTags`**                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| COMMON        | **`New Tags`** — **`newTags`** · string                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ADVANCED      | **`Advanced Options`** — **`additionalFields`**, containing: **`Additional Addresses`** (**`addresses`**), **`Additional Emails`** (**`emails`**), **`Additional Phone Numbers`** (**`telephones`**), **`BIC`**, **`Business Type`** (see below), **`Business Type Country`** (see below), **`Custom Fields`**, **`IBAN`**, **`Language`** (options), **`Marketing Mails Consent`**, **`National Identification Number`**, **`Preferred Currency`** (options, **`getCurrencies`**), **`Remarks`**, **`Website`** |

**Country → Business Type dependency (the fix)**

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADVANCED      | **`Business Type Country`** — **`businessTypeCountry`** (name retained) · **options** (v1: free string) · **`BE`** · not required · static ISO-3166-1 alpha-2 list (curated: BE, NL, LU, FR, DE, GB, ES, IT, PL, PT, DK, SE, NO, FI, IE, AT, CH + **`Other (enter code)`** is **not** offered; expressions cover the rest) · description *"Teamleader's list of legal forms is per country. Pick the country first, then the business type."* |
| ADVANCED      | **`Business Type`** — **`businessTypeId`** (v1: **`additionalFields.business_type_id`**) · options · **`''`** · lookup **`getBusinessTypes`** with **`loadOptionsDependsOn: ['additionalFields.businessTypeCountry']`**                                                                                                                                                                                                                       |

Both fields must be **hoisted out of the collection into a nested-path-safe location** or the dependency must use the full absolute path. Concretely: keep both inside **`additionalFields`** but declare the dependency with the **absolute** path **`additionalFields.businessTypeCountry`**, and have **`getBusinessTypes`** read **`getCurrentNodeParameter('additionalFields.businessTypeCountry')`** with a fallback chain **`→ getCurrentNodeParameter('businessTypeCountry') → 'BE'`**. If integration testing shows the collection path does not resolve in the target n8n version, the fallback is to move **both** fields to top-level COMMON with **`Business Type Country`** visible only when **`businessTypeId`** mode is used. This decision must be made by inspection during implementation stage 2, not guessed.

**Interaction rules**

- **`Business Type Country`** only affects the **`Business Type`** dropdown; it is never sent to the API. Its description says so explicitly.
- **`Email`**/**`Phone`**/**`Invoicing Address`** merge with the advanced arrays exactly as for Contact; primary-level values win for their type slot.
- **`Tags`** + **`New Tags`** merged as for Contact.

**Runtime derivation**: single **`companies.add`** call. No inference.
**Breaking-change impact**: **`additionalFields.vat_number`** → **`vatNumber`**; **`additionalFields.responsible_user_id`** → **`responsibleUserId`**; **`additionalFields.business_type_id`** → **`additionalFields.businessTypeId`**; **`businessTypeCountry`** string → options (same values); **`additionalFields.language`** string → options.

---

### Company → Update

As Create, with:

| **ClassSpec**     |                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| PRIMARY           | **`Company`** — **`companyId`** · resourceLocator · required                                                          |
| PRIMARY           | **`Company Name`** — **`name`** · string · **`''`** · **not required** (v1 had it inside **`additionalFields.name`**) |
| REMOVE FROM V2 UI | **`additionalFields.name`**                                                                                           |

Replacement semantics for **`Email`**, **`Phone`**, **`Invoicing Address`** stated in each description: *"Replaces the existing entries of this type."*
**Breaking-change impact**: **`additionalFields.name`** → top-level **`name`**.

---

### Company → Delete / Tag / Untag

Identical pattern to Contact Delete / Tag / Untag (destructive notice on Delete; **`tags`** becomes multiOptions + **`newTags`** on Tag).

---

## C. DEAL (deep-design)

### Deal → Get

| **ClassSpec** |                                                                                         |
| ------------- | --------------------------------------------------------------------------------------- |
| PRIMARY       | **`Deal`** — **`dealId`** · resourceLocator (**`searchDeals`**, searchable) · required  |
| ADVANCED      | **`Include Custom Fields`** — **`options.includeCustomFields`** · boolean · **`false`** |

No change beyond labels.

---

### Deal → Get Many

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Return All`**, **`Limit`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| COMMON        | **`Filters`** — **`filters`**, containing: **`Customer`** (**changed**: **`filters.customerType`** + **`filters.customerId`** become a single **`Customer Source`**-free pair where **`customerId`** is a **resourceLocator** driven by **`customerType`**, mirroring §2 architecture), **`Estimated Closing Date From`**/**`Until`**, **`IDs`**, **`Phase`** (options, **`getDealPhases`**, now **`loadOptionsDependsOn: ['filters.pipelineIds']`** — filtered to the selected pipelines when exactly one is selected, otherwise all phases), **`Pipelines`** (multiOptions), **`Responsible User`**, **`Search Term`**, **`Status`** (multiOptions), **`Updated Since`** |
| ADVANCED      | **`Include Custom Fields`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Interaction rules**: **`Phase`** list narrows when exactly one pipeline is selected; with zero or multiple pipelines it lists all phases with the pipeline name as a prefix (**`Sales — Proposal`**). Phase order preserved (never alphabetised).
**Breaking-change impact**: **`filters.customerId`** string → resourceLocator.

---

### Deal → Create (deep-design)

**Primary user goal**: register a new sales opportunity for a known customer.

**Field layout — exact visual order**

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRIMARY       | **`Title`** — **`title`** (unchanged) · string · **`''`** · **required**                                                                                                                                                                                                                                                                                                                                                                                                       |
| PRIMARY       | **`Customer`** — **`customerId`** (unchanged name, **new type**) · resourceLocator with **three modes**: **`Company`** (list, **`searchCompanies`**), **`Contact`** (list, **`searchContacts`**), **`By ID`** (string, requires **`Customer Type`**) · **`{mode:'company',value:''}`** · required                                                                                                                                                                              |
| CONDITIONAL   | **`Customer Type`** — **`customerType`** (unchanged) · options (**`Company`**/**`Contact`**) · **`company`** · visible **only** when **`customerId.mode = 'id'`**. *Description: "Only needed when you supply a raw ID or expression."*                                                                                                                                                                                                                                        |
| COMMON        | **`Contact Person`** — **`contactPersonId`** (v1: **`additionalFields.contact_person_id`**, free string) · resourceLocator (**`searchContacts`**) · **`{mode:'list',value:''}`** · not required · *"The person at the customer this deal runs through."*                                                                                                                                                                                                                       |
| COMMON        | **`Pipeline`** — **`pipelineId`** (v1: **`additionalFields.pipelineId`**) · options · **`''`** · lookup **`getDealPipelines`** · not required · *"Determines which phases you can choose."*                                                                                                                                                                                                                                                                                    |
| CONDITIONAL   | **`Phase`** — **`phaseId`** (v1: **`additionalFields.phase_id`**) · options · **`''`** · lookup **`getDealPhases`**, **`loadOptionsDependsOn: ['pipelineId']`** · visible when **`pipelineId`** is non-empty · *"Leave empty to start in the pipeline's first phase."*                                                                                                                                                                                                         |
| COMMON        | **`Estimated Value`** — **`estimatedValue`** (v1: **`additionalFields.estimated_value`**) · number · **`0`** · not required                                                                                                                                                                                                                                                                                                                                                    |
| CONDITIONAL   | **`Currency`** — **`currency`** (v1: **`additionalFields.currency`**) · options · **`EUR`** · lookup **`getCurrencies`** · visible when **`estimatedValue ≠ 0`** (**`hide: { estimatedValue: [0] }`**)                                                                                                                                                                                                                                                                         |
| COMMON        | **`Responsible User`** — **`responsibleUserId`** (v1: **`additionalFields.responsible_user_id`**) · options · **`''`** · **`getUsers`**                                                                                                                                                                                                                                                                                                                                        |
| COMMON        | **`Estimated Closing Date`** — **`estimatedClosingDate`** (v1: **`additionalFields.estimated_closing_date`**) · dateTime · **`''`**                                                                                                                                                                                                                                                                                                                                            |
| ADVANCED      | **`Advanced Options`** — **`additionalFields`**, containing: **`Custom Fields`**, **`Department`** (options, **`getDepartments`**, description *"Only needed if this deal belongs to a non-default department"*), **`Exchange Rate`** (number, **`1`**, visible when currency ≠ account currency is not knowable statically → always visible inside Advanced), **`Probability (%)`** (see below), **`Source`** (options, **`getDealSources`**), **`Summary`** (string, 3 rows) |
| ADVANCED      | **`Probability (%)`** — **`probabilityPercent`** (v1: **`additionalFields.estimated_probability`**, 0–1 fraction) · number · **`50`** · **`typeOptions: { minValue: 0, maxValue: 100, numberPrecision: 0 }`** · converted to **`estimated_probability = value / 100`** at execution. Description: *"Percentage between 0 and 100."*                                                                                                                                            |

**Interaction rules**

```
Customer.mode = company | contact  → customer_type derived from the mode, Customer Type hidden
Customer.mode = id                 → Customer Type shown and required
Pipeline empty                     → Phase hidden, deal lands in the pipeline default phase
Pipeline set (literal)             → Phase lists only that pipeline's phases, in Teamleader order
Pipeline set (expression)          → Phase dropdown cannot resolve; user switches Phase to an expression
Estimated Value = 0                → Currency hidden (not sent)

```

**Runtime derivation**

- API calls: **`deals.create`** only.
- Derived: **`lead.customer.type`** from the locator mode; **`estimated_probability`** from the percentage; **`estimated_value = { amount, currency }`**.
- Fallback: no pipeline/phase → Teamleader defaults apply.
- Overridable: everything is explicit; nothing is inferred from another record.
- Errors: **`Customer`** in **`By ID`** mode without **`Customer Type`** → **`NodeOperationError`** *"Choose Company or Contact for the customer ID"*. Probability outside 0–100 → **`NodeOperationError`** naming the field and the accepted range.

**Breaking-change impact**: **`customerId`** string/resourceLocator-per-type → single 3-mode resourceLocator; **`customerType`** visibility narrows; six fields move out of **`additionalFields`** to top level; **`estimated_probability`** fraction → **`probabilityPercent`** percentage (**semantics changed**, migration required).

---

### Deal → Update (deep-design)

| **ClassSpec**         |                                                                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY               | **`Deal`** — **`dealId`** · resourceLocator · required                                                                                                                                                                                                         |
| COMMON                | **`Title`** — **`title`** · string · **`''`** · not required                                                                                                                                                                                                   |
| COMMON                | **`Change Customer`** — **`updateCustomer`** (unchanged) · boolean · **`false`** · *"Only turn this on if the deal must be moved to another customer."*                                                                                                        |
| CONDITIONAL           | **`Customer`** — **`customerId`** · 3-mode resourceLocator · visible when **`updateCustomer = true`**                                                                                                                                                          |
| CONDITIONAL           | **`Customer Type`** — **`customerType`** · visible when **`updateCustomer = true`** **and** **`customerId.mode = 'id'`**                                                                                                                                       |
| COMMON                | **`Contact Person`** — **`contactPersonId`** · resourceLocator · *"Sent only together with a customer change (Teamleader groups them in ****`lead`****)."* — see interaction rules                                                                             |
| COMMON                | **`Estimated Value`** + **`Currency`**, **`Responsible User`**, **`Estimated Closing Date`** — same specs as Create                                                                                                                                            |
| ADVANCED              | **`Advanced Options`** — **`Custom Fields`**, **`Department`**, **`Exchange Rate`**, **`Probability (%)`**, **`Source`**, **`Summary`**                                                                                                                        |
| **REMOVE FROM V2 UI** | **`Phase`** — **`additionalFields.phase_id`**. **`deals.update`**** has no phase field in the official API**; V1 silently discarded it. V2 removes it and the operation description says: *"To move a deal to another phase, use the Change Phase operation."* |

**Interaction rules**

```
Change Customer = false → customer/contact-person are not part of `lead`; if Contact Person is
                          filled it CANNOT be sent alone (the API's `lead` object requires
                          `customer`). V2 therefore resolves the current customer first.

```

**Runtime derivation for Contact Person without a customer change**

- API call: **`deals.info`** on the target deal, **only** when **`updateCustomer = false`** and **`contactPersonId`** is filled.
- Derived: **`lead.customer`** = the deal's existing **`lead.customer`**, so **`contact_person_id`** can be sent legally.
- Overridable: yes — turning on **`Change Customer`** replaces it.
- Error: if **`deals.info`** returns no **`lead.customer`**, throw *"Could not read the current customer of this deal, so the contact person cannot be changed. Enable Change Customer and select the customer explicitly."*
- This is the connector's only implicit read, it is documented in the **`Contact Person`** description (*"Reads the deal's current customer so the contact person can be updated on its own."*), and it happens **at most once per item**.

**Breaking-change impact**: **`additionalFields.phase_id`** **removed** (was already ignored — no behavioural regression, but the parameter disappears); other moves identical to Create.

---

### Deal → Change Phase

**Primary user goal**: move a deal forward in the sales pipeline.

| **ClassSpec** |                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Deal`** — **`dealId`** · resourceLocator · required                                                                                                                        |
| PRIMARY       | **`Pipeline`** — **`pipelineId`** (unchanged) · options · **`''`** · **`getDealPipelines`** · not required · *"Only used to filter the phase list — not sent to Teamleader."* |
| PRIMARY       | **`Phase`** — **`phaseId`** (unchanged) · options · **`''`** · **`getDealPhases`** with **`loadOptionsDependsOn: ['pipelineId']`** · required · phase order preserved         |

**Interaction rules**: with no pipeline chosen, **`Phase`** lists **all** phases prefixed with their pipeline name so the choice is never ambiguous. With **`dealId`** as an expression the pipeline is unknown and the prefixing is what keeps this usable.
**Runtime derivation**: **`deals.move`**. No lookups.
**Errors**: empty phase → *"Select the phase to move the deal to"*.
**Breaking-change impact**: none (labels/description only). The duplicated/garbled V1 descriptions on these two fields are rewritten.

---

### Deal → Mark as Won

| **ClassSpec** |                                                        |
| ------------- | ------------------------------------------------------ |
| PRIMARY       | **`Deal`** — **`dealId`** · resourceLocator · required |

Operation description: *"Marks the deal as won. Teamleader may create follow-up records according to your account settings."* No fields added. No breaking change.

---

### Deal → Mark as Lost

| **ClassSpec** |                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------ |
| PRIMARY       | **`Deal`** — **`dealId`** · required                                                       |
| COMMON        | **`Lost Reason`** — **`reasonId`** (unchanged) · options · **`''`** · **`getLostReasons`** |
| COMMON        | **`Remark`** — **`extraInfo`** (unchanged) · string (3 rows) · **`''`**                    |

Description on the operation: *"Closes the deal as lost. This is reversible in Teamleader but not from n8n."* No breaking change.

---

## D. PRODUCT (deep-design)

### Product → Get

| **ClassSpec** |                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Product`** — **`productId`** · resourceLocator (**`searchProducts`**, searchable) · required |
| ADVANCED      | **`Include Suppliers`** — **`options.includeSuppliers`** · boolean · **`false`**                |

### Product → Get Many

| **ClassSpec** |                                                                               |
| ------------- | ----------------------------------------------------------------------------- |
| PRIMARY       | **`Return All`**, **`Limit`**                                                 |
| COMMON        | **`Filters`** — **`IDs`**, **`Search Term`**, **`Updated Since`** (unchanged) |

No breaking changes in either.

---

### Product → Create (deep-design)

**Primary user goal**: add an article to the Teamleader catalogue so it can be used on quotations and invoices.

**Field layout — exact visual order**

| **ClassSpec** |                                                                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Name`** — **`name`** (unchanged) · string · **`''`** · **required**                                                                                                                                                                                |
| PRIMARY       | **`Article Code`** — **`code`** (v1: **`additionalFields.code`**) · string · **`''`** · not required · *"Your internal article number. Shown in product pickers."*                                                                                    |
| PRIMARY       | **`Selling Price`** — **`sellingPrice`** (v1: **`additionalFields.sellingPrice`**) · number · **`0`** · not required                                                                                                                                  |
| COMMON        | **`Purchase Price`** — **`purchasePrice`** (v1: **`additionalFields.purchasePrice`**) · number · **`0`** · not required                                                                                                                               |
| COMMON        | **`Tax Rate`** — **`taxRateId`** (v1: **`additionalFields.taxRateId`**) · options · **`''`** · **`getTaxRates`**, **`loadOptionsDependsOn: ['departmentId']`**                                                                                        |
| COMMON        | **`Department`** — **`departmentId`** (v1: **`additionalFields.departmentId`**) · options · **`''`** · **`getDepartments`** · *"Scopes the tax rate and category lists below."* Placed **above** the fields that depend on it (see interaction rules) |
| COMMON        | **`Product Category`** — **`productCategoryId`** (v1: **`additionalFields.productCategoryId`**) · options · **`''`** · **`getProductCategories`**, **`loadOptionsDependsOn: ['departmentId']`**                                                       |
| COMMON        | **`Unit of Measure`** — **`unitOfMeasureId`** (v1: **`additionalFields.unitOfMeasureId`**) · options · **`''`** · **`getUnitsOfMeasure`**                                                                                                             |
| COMMON        | **`Description`** — **`description`** (v1: **`additionalFields.description`**) · string (3 rows) · **`''`** · *"Markdown"*                                                                                                                            |
| ADVANCED      | **`Advanced Options`** — **`additionalFields`**, containing: **`Currency`** (single field, see below), **`Price List Prices`** (**`priceListPrices`**, unchanged shape), **`Stock Amount`**, **`Stock Threshold Minimum`**                            |

**Currency handling (the "don't let EUR dominate" rule)**

- V1 had **three** currency dropdowns (**`sellingPriceCurrency`**, **`purchasePriceCurrency`**, plus one per price-list row).
- V2 exposes **one** **`Currency`** — **`currency`** · options · **`EUR`** · **`getCurrencies`** · ADVANCED. It applies to both selling and purchase price.
- Per-price-list rows keep their own **`currency`** field (they genuinely can differ), defaulting to the value of the top-level **`currency`**… which is **not** expressible statically, so the per-row default stays **`EUR`** and its description says *"Defaults to EUR; set it if this price list uses another currency."*
- Rationale documented in-field: *"Warmvast invoices in EUR; change this only for foreign-currency articles."*

**Interaction rules — the dependent-dropdown fix**

```
Department (top-level, literal)  → Tax Rate list scoped to that department
                                 → Product Category list scoped to that department
Department empty                 → Tax Rate lists all rates, label prefixed with the department name
                                 → Product Category lists all categories, prefixed likewise
Department is an expression      → both dropdowns cannot resolve; the node shows the loadOptions
                                   error verbatim and the user switches those fields to expressions

```

Ordering rule (connector-wide): **a field that scopes a lookup must appear above the fields it scopes**, and must never live inside a collection while its dependants are outside one.

**Runtime derivation**: **`products.add`**. **`sellingPrice`**/**`purchasePrice`** wrapped as **`{amount, currency}`**. No inference.
**Errors**: none specific.
**Breaking-change impact**: eight fields move out of **`additionalFields`** to top level; **`sellingPriceCurrency`** + **`purchasePriceCurrency`** collapse into **`additionalFields.currency`** (**migration required**).

---

### Product → Update

Identical layout to Create with **`Product`** locator PRIMARY at the top and **`Name`** demoted to COMMON/not-required. All other rules identical.
**Breaking-change impact**: same field moves; **`Name`** moves from **`additionalFields.name`** semantics to top-level optional.

---

### Product → Delete

| **ClassSpec** |                                            |
| ------------- | ------------------------------------------ |
| PRIMARY       | **`Product`** — **`productId`** · required |

Description: *"Permanently deletes the article. Existing quotations and invoices keep their line text but lose the product reference."* (Statement limited to what the API guarantees: the reference is **`product_id`** on lines; do **not** claim more.)

---

## E. SHARED QUOTATION / INVOICE LINE EDITOR (deep-design)

This section defines one conceptual component, instantiated twice with different member sets.

### E.1 What is technically possible

| **Desired behaviourPossible with standard n8n node properties?**                 |                                                                                                      |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A **`Line Type`** selector switching visible fields inside a fixedCollection row | **Yes** — **`displayOptions.show`** works on sibling values inside a fixedCollection entry           |
| Product dropdown inside the line, populated from **`products.list`**             | **Yes** (**`loadOptions`**)                                                                          |
| Auto-filling description/price/tax into the *editor* when a product is picked    | **No.** n8n has no reactive parameter writes. Any promise of this is impossible UI.                  |
| Fetching product values at **execution** and using them                          | **Yes** — **`products.info`** per distinct product ID, cached per node run                           |
| Per-line override of a fetched value                                             | **Yes** — leave the field empty to take the product value, fill it to override                       |
| Showing the fetched value greyed-out as a placeholder                            | **No.** Placeholders are static strings. The description text must carry the explanation instead.    |
| Flat line list without a group                                                   | **Yes** — a top-level **`Lines`** fixedCollection plus a separate **`Sections`** structure (see E.3) |
| Reordering lines by drag                                                         | **Yes**, native fixedCollection behaviour                                                            |

### E.2 Line structure

Top-level field on Quotation Create/Update and Invoice Draft/Update/Update Booked/Credit Partially:

**`Lines`** — **`lines`** · fixedCollection, **`multipleValues: true`**, placeholder **`Add Line`** · **`{}`** · PRIMARY.

Each entry (**`line`**) has, in exact order:

| **ClassSpec**          |                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY                | **`Line Type`** — **`lineType`** · options: **`Teamleader Product`** (**`product`**) / **`Custom Line`** (**`custom`**) · default **`custom`**                                                                                                      |
| PRIMARY (product mode) | **`Product`** — **`productId`** · options · **`''`** · **`getProducts`** · visible when **`lineType = product`**                                                                                                                                    |
| PRIMARY (product mode) | **`Use Product Defaults`** — **`useProductDefaults`** · boolean · **`true`** · visible when **`lineType = product`** · *"Fetches description, price, tax rate and unit from Teamleader when the workflow runs. Fill a field below to override it."* |
| PRIMARY                | **`Description`** — **`description`** · string · **`''`** · required only when **`lineType = custom`** (validated at runtime, not **`required: true`**) · visible always · description in product mode: *"Leave empty to use the product name."*    |
| PRIMARY                | **`Quantity`** — **`quantity`** · number · **`1`** · always                                                                                                                                                                                         |
| PRIMARY                | **`Unit Price (Excl. Tax)`** — **`unitPrice`** · number · **`0`** · always · in product mode: *"Leave at 0 to use the product's selling price."* → see the precedence caveat in §3 of the global spec                                               |
| COMMON                 | **`Tax Rate`** — **`taxRateId`** · options · **`''`** · **`getTaxRates`** · always · in product mode: *"Leave empty to use the product's tax rate."*                                                                                                |
| ADVANCED-in-line       | **`Line Options`** — **`lineOptions`** · collection · **`{}`** · containing per document type:                                                                                                                                                      |
| — both                 | **`Discount (%)`** — **`discount`** · number · **`0`** · **`minValue 0, maxValue 100`**                                                                                                                                                             |
| — both                 | **`Extended Description`** — **`extendedDescription`** · string, 3 rows · Markdown                                                                                                                                                                  |
| — both                 | **`Unit of Measure`** — **`unitOfMeasureId`** · options · **`getUnitsOfMeasure`**                                                                                                                                                                   |
| — quotation only       | **`Purchase Price`** — **`purchasePrice`** · number · *"Must be in the account currency"*                                                                                                                                                           |
| — invoice only         | **`Product Category`** — **`productCategoryId`** · options · **`getProductCategories`**                                                                                                                                                             |
| — invoice only         | **`Withholding Tax Rate`** — **`withholdingTaxRateId`** · options · **`getWithholdingTaxRates`**                                                                                                                                                    |

**`Discount (%)`** semantics fix: V2 sends the discount object **whenever the user added the ****`Discount (%)`**** key to ****`Line Options`**, including value **`0`**, because collection membership is explicit intent. When the key is absent, no discount object is sent. This removes the V1 ambiguity where a legitimate 0 % was stripped.

### E.3 Sections/groups without forced nesting

**`Section Title`** — **`sectionTitle`** · string · **`''`** · COMMON, **top-level, next to ****`Lines`**.

Rules:

- No section title → one unnamed group containing all lines: **`grouped_lines: [{ line_items: [...] }]`**.
- One section title → one named group: **`grouped_lines: [{ section: { title }, line_items: [...] }]`**.
- **Multiple sections**: **`Use Multiple Sections`** — **`useSections`** · boolean · **`false`** · COMMON. When **`true`**, **`Lines`** is hidden and the V1-style **`Grouped Lines`** (**`groupedLines`**) fixedCollection is shown instead, unchanged in shape. This preserves full capability for the rare multi-section document while keeping the normal case one level deep.

So the normal path is **Lines → line fields** (one nesting level), and the power path is **Grouped Lines → Group → Line Items → Item** (V1, three levels), reached only by an explicit opt-in toggle.

### E.4 Execution-time assembly

1. If **`useSections = true`** → build from **`groupedLines`** exactly as V1 does today.
2. Else → build a single group from **`lines`** + **`sectionTitle`**.
3. For each line with **`lineType = product`** and **`useProductDefaults = true`**, hydrate per §3 of the global spec.
4. Validate: every line must end up with a non-empty **`description`**, a **`tax_rate_id`**, and a numeric **`unit_price.amount`**. Any line failing this throws a **`NodeOperationError`** naming the line index (1-based) and the missing field.

---

## F. QUOTATION (deep-design)

### Quotation → Get

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Quotation`** — **`quotationId`** · resourceLocator · required · **`From List`** uses **`searchQuotations`** with **`searchable: true`** (V1 had **`false`**); the list method filters client-side on the loaded page when the API offers no term filter, and the mode description states *"Recent quotations; use By ID for older ones."* |
| ADVANCED      | **`Include Expiry`** — **`options.includeExpiry`** · boolean · **`false`**                                                                                                                                                                                                                                                                   |

### Quotation → Get Many

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Return All`**, **`Limit`**                                                                                                                                                                                                                                                                                                                                                |
| COMMON        | **`Deal`** — **`filters.dealId`** · resourceLocator (**`searchDeals`**) — **new**, only if **`quotations.list`** supports a deal filter in the account's API version; if the blueprint filter set is limited to **`ids`**, this field is **not added** (no invented filters). Per the current blueprint: only **`IDs`** is available, so **`Filters`** keeps just **`IDs`**. |
| ADVANCED      | **`Include Expiry`**                                                                                                                                                                                                                                                                                                                                                         |

No breaking change.

---

### Quotation → Create (deep-design)

**Primary user goal**: put a priced proposal on an existing deal.

**Field layout — exact visual order**

| **ClassSpec** |                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRIMARY       | **`Deal`** — **`dealId`** · resourceLocator (**`searchDeals`**) · required · *"The quotation is always created on a deal; the customer comes from the deal."*                                                                                    |
| PRIMARY       | **`Document Template`** — **`documentTemplateId`** (v1: **`additionalFields.documentTemplateId`**) · options · **`''`** · **`getQuotationTemplates`**, **`loadOptionsDependsOn: ['departmentId']`**                                              |
| PRIMARY       | **`Section Title`** — **`sectionTitle`** · string · **`''`**                                                                                                                                                                                     |
| PRIMARY       | **`Lines`** — **`lines`** · shared line editor (§E), quotation member set                                                                                                                                                                        |
| COMMON        | **`Use Multiple Sections`** — **`useSections`** · boolean · **`false`**                                                                                                                                                                          |
| CONDITIONAL   | **`Grouped Lines`** — **`groupedLines`** (v1 shape retained) · visible when **`useSections = true`**                                                                                                                                             |
| COMMON        | **`Introduction Text`** — **`text`** (v1: **`additionalFields.text`**) · string, 5 rows · **`''`** · *"Markdown. A quotation needs lines and/or text."*                                                                                          |
| COMMON        | **`Expires After`** — **`expiresAfter`** (v1: **`additionalFields.expiresAfter`**) · dateTime · **`''`** · *"Only available if quotation expiry is enabled in your Teamleader plan."*                                                            |
| CONDITIONAL   | **`Action After Expiry`** — **`actionAfterExpiry`** (v1: **`additionalFields.actionAfterExpiry`**) · options (**`None`**/**`Lock`**) · **`none`** · visible when **`expiresAfter`** non-empty                                                    |
| COMMON        | **`Department`** — **`departmentId`** (unchanged) · options · **`''`** · **`getDepartments`** · **not sent to the API** · *"Only used to filter the template, tax-rate and category lists. Teamleader takes the real department from the deal."* |
| ADVANCED      | **`Advanced Options`** — **`additionalFields`**: **`Currency`** (options, **`getCurrencies`**), **`Discounts`** (**`discounts`**, unchanged), **`Exchange Rate`** (number, **`1`**)                                                              |

**Interaction rules**

```
Department (literal)  → scopes Document Template, line Tax Rate, line Product Category lists
Department empty      → those lists are unscoped and label-prefixed with the department name
useSections = false   → Lines + Section Title visible, Grouped Lines hidden
useSections = true    → Grouped Lines visible, Lines + Section Title hidden
expiresAfter empty    → Action After Expiry hidden and not sent

```

**Runtime derivation**

- API calls: **`quotations.create`**; plus **`products.info`** per distinct hydrated product (§3).
- Derived: **`grouped_lines`** from the line editor; **`currency`** object from **`currency`** + **`exchangeRate`**.
- **Not** derived: the customer and the real department — Teamleader owns both via the deal. The connector never sends a department on **`quotations.create`** (the API has no such field).
- Errors: no lines and no text → **`NodeOperationError`** *"Add at least one line or some quotation text"*, raised before the API call.

**Breaking-change impact**: **`additionalFields.documentTemplateId`**, **`.text`**, **`.expiresAfter`**, **`.actionAfterExpiry`** → top level; **`groupedLines`** gains an alternative **`lines`** path; **`departmentId`** semantics clarified (it was already not sent).

---

### Quotation → Update

| **ClassSpec** |                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Quotation`** — **`quotationId`** · resourceLocator · required                                                                                                                                                      |
| PRIMARY       | **`Replace Lines`** — **`replaceLines`** · boolean · **`false`** · **new** · *"Teamleader replaces ALL lines of the quotation with what you send here. Turn this on only when you supply the complete new line set."* |
| CONDITIONAL   | **`Section Title`**, **`Lines`**, **`Use Multiple Sections`**, **`Grouped Lines`** — visible when **`replaceLines = true`**                                                                                           |
| COMMON        | **`Document Template`**, **`Introduction Text`**, **`Expires After`**, **`Action After Expiry`**, **`Department`** (context-only)                                                                                     |
| ADVANCED      | **`Advanced Options`** — **`updateFields`**: **`Currency`**, **`Discounts`**, **`Exchange Rate`**                                                                                                                     |

**Interaction rules**: with **`replaceLines = false`** no **`grouped_lines`** key is sent at all, so existing lines survive. This makes the destructive replacement an explicit, labelled act instead of a side effect of touching the collection.
**Runtime derivation**: **`quotations.update`** (+ product hydration when lines are sent).
**Errors**: **`replaceLines = true`** with zero lines → *"Replace Lines is on but no lines were provided. This would empty the quotation."*
**Breaking-change impact**: line submission now gated behind **`replaceLines`**; **`updateFields.*`** promotions as in Create.

---

### Quotation → Send (deep-design, recipient-first)

**Primary user goal**: e-mail a proposal to the customer's contact person.

**What the API actually supports** (**`quotations.send`**): **`quotations`** (array, required, same deal), **`recipients.to`** (**required**, entries use **`email_address`** + optional **`customer{type,id}`**), **`cc`**, **`bcc`**, **`subject`** (required), **`content`** (required, **`#LINK`** shortcode is replaced by Teamleader), **`language`** (required), **`attachments`**, **`from.sender{type,id}`** + **`from.email_address`**. **There is no ****`mail_template_id`****.**

**Field layout — exact visual order**

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRIMARY       | **`Quotation`** — **`quotationId`** · resourceLocator · required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PRIMARY       | **`To`** — **`to`** (v1: **`sendOptions.to`**) · fixedCollection, multi, placeholder **`Add Recipient`** · **`{}`** · **required in effect** · each entry: **`Email Address`** — **`emailAddress`** · string · required; **`Link To`** — **`customerMode`** · options **`Not Linked`** / **`Contact`** / **`Company`** · default **`Not Linked`**; **`Contact`** — **`contactId`** · resourceLocator (**`searchContacts`**) visible when **`customerMode = contact`**; **`Company`** — **`companyId`** · resourceLocator (**`searchCompanies`**) visible when **`customerMode = company`** |
| PRIMARY       | **`Language`** — **`language`** (unchanged) · options (the 12 documented codes) · **`nl`** · required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| PRIMARY       | **`Message Source`** — **`messageSource`** · options: **`Write Message`** (**`manual`**) / **`Teamleader Mail Template`** (**`template`**) · default **`manual`** · **new**                                                                                                                                                                                                                                                                                                                                                                                                                |
| CONDITIONAL   | **`Mail Template`** — **`mailTemplateId`** · options · **`''`** · lookup **`getQuotationMailTemplates`** (new: **`mailTemplates.list`** with **`filter.type = 'quotation'`**, optional **`department_id`**) · visible when **`messageSource = template`**                                                                                                                                                                                                                                                                                                                                  |
| CONDITIONAL   | **`Subject`** — **`subject`** (unchanged) · string · **`''`** · visible when **`messageSource = manual`** · required there                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CONDITIONAL   | **`Message`** — **`content`** (unchanged) · string, 8 rows · **`''`** · visible when **`messageSource = manual`** · required there · *"Add ****`#LINK`**** where the signing link should appear."*                                                                                                                                                                                                                                                                                                                                                                                         |
| CONDITIONAL   | **`Override Subject`** — **`subjectOverride`** · string · **`''`** · visible when **`messageSource = template`** · *"Leave empty to use the template's subject."*                                                                                                                                                                                                                                                                                                                                                                                                                          |
| CONDITIONAL   | **`Override Message`** — **`contentOverride`** · string, 8 rows · visible when **`messageSource = template`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ADVANCED      | **`Advanced Options`** — **`sendOptions`**: **`CC`** (**`cc`**, same recipient shape), **`BCC`** (**`bcc`**), **`Attachment File IDs`** (**`attachments`**), **`Additional Quotations`** (**`additionalQuotationIds`**, description keeps *"must belong to the same deal"*), **`Sender Type`** (**`senderType`**), **`Sender`** (**`senderId`**, options — **`getUsers`** when type = user, **`getDepartments`** when type = department, via two conditional fields **`senderUserId`**/**`senderDepartmentId`**), **`Sender Email Address`** (**`senderEmailAddress`**)                    |

**Mail-template translation — feasibility and risks (explicit answer to the brief)**

Feasible, and this is exactly how it must work:

1. At execution, when **`messageSource = template`**, call **`mailTemplates.list`** with **`{ filter: { type: 'quotation' } }`** (plus **`department_id`** if a department context exists) and select the entry whose **`id`** matches **`mailTemplateId`**.
2. Take **`content.subject`** → **`subject`**, **`content.body`** → **`content`**.
3. Apply **`subjectOverride`** / **`contentOverride`** when non-empty.
4. Send via **`quotations.send`**.

**Risks that must be surfaced in the field description and the README**:

- Teamleader renders merge variables server-side for templates it sends itself. A template body pulled through the API is **raw**; any placeholder other than **`#LINK`** (which **`quotations.send`** does resolve) will be delivered literally. The description must read: *"The template's text is copied as-is. Only ****`#LINK`**** is filled in by Teamleader — other placeholders are not."*
- The template has its own **`language`**; the **`Language`** field of the operation is separate and Teamleader uses it for the quotation document. If they differ the mail text and the document language will not match. V2 does **not** auto-sync them (that would be hidden magic); instead the **`Mail Template`** description states: *"Pick a template in the same language you selected above."*
- If the template ID cannot be found in the list → **`NodeOperationError`** *"Mail template not found for quotations. It may belong to another department or another document type."*

**Runtime derivation summary**

- Calls: optional **`mailTemplates.list`**; then **`quotations.send`**.
- Derived: subject/body from the template; **`recipients.to[].customer`** from the per-entry locator; **`quotations`** array = **`[quotationId, ...additionalQuotationIds]`**.
- Overridable: yes, both subject and body.
- Errors: empty **`to`** → *"Add at least one recipient — Teamleader requires an explicit recipient for quotations"* (keeps the existing V1 guard, now unreachable by accident because the field is primary).

**Breaking-change impact**: **`sendOptions.to/cc/bcc`** → top-level **`to`** + **`sendOptions.cc/bcc`**; recipient entry keys **`customerType`**/**`customerId`** (free text) → **`customerMode`** + **`contactId`**/**`companyId`** locators; **`subject`**/**`content`** become conditional on the new **`messageSource`**.

---

### Quotation → Accept

| **ClassSpec** |                                                                  |
| ------------- | ---------------------------------------------------------------- |
| PRIMARY       | **`Quotation`** — **`quotationId`** · resourceLocator · required |

Description: *"Marks the quotation as accepted on behalf of the customer. Teamleader may move the deal according to your settings."* No breaking change.

### Quotation → Delete

| **ClassSpec** |                                                |
| ------------- | ---------------------------------------------- |
| PRIMARY       | **`Quotation`** — **`quotationId`** · required |

Destructive notice as per Global §1.16.

---

## G. INVOICE (deep-design — the flagship flow)

### Invoice → Get

| **ClassSpec** |                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Invoice`** — **`invoiceId`** · resourceLocator · required · **`From List`** **`searchInvoices`** with **`searchable: true`** (client-side filter over the loaded page, description: *"Recent invoices"*) |
| ADVANCED      | **`Include Late Fees`** — **`options.includeLateFees`** · boolean · **`false`**                                                                                                                             |

### Invoice → Get Many

Keep V1's excellent filter coverage; only these changes:

- **`Customer`** — **`filters.customerId`** becomes a resourceLocator paired with **`filters.customerType`** exactly as in Deal Get Many.
- **`Deal`** — **`filters.dealId`** becomes a resourceLocator (**`searchDeals`**).
- **`Status`** stays multiOptions.
- **`Return All`** / **`Limit`** stay PRIMARY.

**Breaking-change impact**: **`filters.customerId`**, **`filters.dealId`** string → resourceLocator.

---

### Invoice → Create Draft (deep-design)

**Primary user goal**: turn agreed work — usually a won deal — into a draft invoice, ready to check and book.

**Field layout — exact visual order**

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Customer Source`** — **`customerSource`** · options: **`From Deal`** (**`deal`**) / **`Select Manually`** (**`manual`**) · default **`manual`** · **new** · *"From Deal takes the customer (and department) from the deal when the workflow runs."*                                                                                                     |
| CONDITIONAL   | **`Deal`** — **`dealId`** · resourceLocator (**`searchDeals`**) · required when **`customerSource = deal`** · *"Works directly with the entity ID from a Teamleader Trigger."*                                                                                                                                                                             |
| CONDITIONAL   | **`Customer`** — **`customerId`** · 3-mode resourceLocator (Company / Contact / By ID) · required when **`customerSource = manual`**                                                                                                                                                                                                                       |
| CONDITIONAL   | **`Customer Type`** — **`customerType`** · options · **`company`** · visible when **`customerSource = manual`** **and** **`customerId.mode = 'id'`**                                                                                                                                                                                                       |
| PRIMARY       | **`Department`** — **`departmentId`** (unchanged) · options · **`''`** · **`getDepartments`** · **required when ****`customerSource = manual`**; when **`customerSource = deal`** it is optional and labelled *"Leave empty to use the deal's department"*                                                                                                 |
| PRIMARY       | **`Payment Term`** — **`paymentTermId`** · options · **`''`** · lookup **`getPaymentTerms`** · **new** · *"Uses the payment terms configured in Teamleader."*                                                                                                                                                                                              |
| CONDITIONAL   | **`Custom Payment Term`** — **`customPaymentTerm`** · boolean · **`false`** · ADVANCED-adjacent but shown at primary level under Payment Term · *"Only if the term you need is not configured in Teamleader."*                                                                                                                                             |
| CONDITIONAL   | **`Payment Term Type`** — **`paymentTermType`** (v1: **`additionalFields.paymentTermType`**) · options (**`cash`** / **`end_of_month`** / **`after_invoice_date`**) · **`after_invoice_date`** · visible when **`customPaymentTerm = true`**                                                                                                               |
| CONDITIONAL   | **`Payment Term Days`** — **`paymentTermDays`** (v1: **`additionalFields.paymentTermDays`**) · number · **`30`** · visible when **`customPaymentTerm = true`** **and** **`paymentTermType ≠ cash`**                                                                                                                                                        |
| PRIMARY       | **`Invoice Date`** — **`invoiceDate`** (v1: **`additionalFields.invoiceDate`**) · dateTime · **`''`** · *"Leave empty for today (Teamleader's default)."*                                                                                                                                                                                                  |
| PRIMARY       | **`Document Template`** — **`documentTemplateId`** (v1: **`additionalFields.documentTemplateId`**) · options · **`''`** · **`getInvoiceTemplates`**, **`loadOptionsDependsOn: ['departmentId']`**                                                                                                                                                          |
| PRIMARY       | **`Section Title`** — **`sectionTitle`** · string · **`''`**                                                                                                                                                                                                                                                                                               |
| PRIMARY       | **`Lines`** — **`lines`** · shared line editor (§E), invoice member set · effectively required (**`grouped_lines`** is required by the API)                                                                                                                                                                                                                |
| COMMON        | **`Use Multiple Sections`** — **`useSections`** · boolean · **`false`**                                                                                                                                                                                                                                                                                    |
| CONDITIONAL   | **`Grouped Lines`** — **`groupedLines`** · visible when **`useSections = true`**                                                                                                                                                                                                                                                                           |
| COMMON        | **`For Attention Of`** — **`forAttentionOfMode`** · options: **`Not Set`** / **`Contact`** / **`Name`** · **`notSet`**                                                                                                                                                                                                                                     |
| CONDITIONAL   | **`Attention Contact`** — **`forAttentionOfContactId`** (v1: free string) · resourceLocator (**`searchContacts`**) · visible when mode = **`contact`**                                                                                                                                                                                                     |
| CONDITIONAL   | **`Attention Name`** — **`forAttentionOfName`** (unchanged) · string · visible when mode = **`name`**                                                                                                                                                                                                                                                      |
| ADVANCED      | **`Advanced Options`** — **`additionalFields`**: **`Currency`** (options), **`Discounts`**, **`Exchange Rate`**, **`Expected Payment Method`** (options), **`Expected Payment Reference`**, **`Note`**, **`Project ID`** (kept as string — no project lookup exists in this connector and none is added), **`Purchase Order Number`**, **`Custom Fields`** |

**Interaction rules**

```
customerSource = manual
  → show Customer (+ Customer Type when mode = id)
  → hide Deal
  → Department is REQUIRED

customerSource = deal
  → show Deal
  → hide Customer and Customer Type
  → Department optional; empty means "take it from the deal"
  → at execution: deals.info(dealId) → invoicee.customer = lead.customer
                                     → department_id = deal.department.id (only if Department empty)

customPaymentTerm = false → Payment Term dropdown is used; type+days derived (see below)
customPaymentTerm = true  → Payment Term dropdown hidden; Type (+ Days unless cash) shown

Department (literal) → scopes Document Template, line Tax Rate, line Product Category
useSections toggles Lines ↔ Grouped Lines as in §E

```

**Runtime derivation**

| **ItemDetail**          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API calls               | **`deals.info`** (only when **`customerSource = deal`**, once per item); **`paymentTerms.list`** (only when **`customPaymentTerm = false`**, cached for the whole node run); **`products.info`** per distinct hydrated product; then **`invoices.draft`**                                                                                                                                                                                                                     |
| Derived: customer       | **`invoicee.customer = { type, id }`** from **`deals.info → data.lead.customer`**                                                                                                                                                                                                                                                                                                                                                                                             |
| Derived: department     | **`department_id = deals.info → data.department.id`**, **only when the Department field is empty**                                                                                                                                                                                                                                                                                                                                                                            |
| Derived: contact person | **Not** derived automatically. Instead **`For Attention Of`** gets a fourth mode **`Deal Contact Person`** (visible only when **`customerSource = deal`**), which maps to **`deals.info → data.lead.contact_person.id`**. Explicit, opt-in, no guessing.                                                                                                                                                                                                                      |
| Derived: payment term   | **`paymentTerms.list`** → the entry whose **`id = paymentTermId`** → send **`payment_term = { type, days }`**. **This translation is mandatory: ****`invoices.draft`**** takes a PaymentTerm object, not a payment-term ID.** The dropdown's description says: *"Uses the type and number of days configured for this term."*                                                                                                                                                 |
| Overridable             | Department: yes (fill the field). Customer: switch to Manual. Payment term: switch to Custom. Contact person: choose another mode.                                                                                                                                                                                                                                                                                                                                            |
| Fallbacks               | No **`deal.department`** → the Department field must be filled, else error. Payment term list empty → error pointing at Custom Payment Term.                                                                                                                                                                                                                                                                                                                                  |
| Errors                  | **`customerSource = deal`** and **`deals.info`** returns no **`lead.customer`** → *"Deal \<id> has no customer, so the invoice cannot be drafted."* Department empty and not derivable → *"No department found on the deal. Select a department."* **`paymentTermId`** not in the list → *"The selected payment term no longer exists in Teamleader."* Neither **`paymentTermId`** nor a custom term → *"Choose a payment term — Teamleader requires one for every invoice."* |

**Breaking-change impact**: **`customerType`**/**`customerId`** restructured; **`additionalFields.invoiceDate`**, **`.documentTemplateId`**, **`.paymentTermType`**, **`.paymentTermDays`**, **`.forAttentionOfContactId`**, **`.forAttentionOfName`** promoted; new required-in-effect **`paymentTermId`** replaces the type+days pair for the normal path (**semantics changed**, migration required); **`forAttentionOfContactId`** string → resourceLocator; **`groupedLines`** gains the **`lines`** alternative.

---

### Invoice → Update (draft invoices)

| **ClassSpec** |                                                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Invoice`** — **`invoiceId`** · resourceLocator · required · notice above it: *"Only draft invoices can be updated. Booked invoices need Update Booked Invoice."*                                                                                            |
| COMMON        | **`Change Customer`** — **`updateCustomer`** (unchanged) · boolean · **`false`**                                                                                                                                                                               |
| CONDITIONAL   | **`Customer Source`** / **`Deal`** / **`Customer`** / **`Customer Type`** — same component as Draft, visible when **`updateCustomer = true`**                                                                                                                  |
| COMMON        | **`Payment Term`** (+ **`Custom Payment Term`** / **`Type`** / **`Days`**) — optional here; empty = unchanged                                                                                                                                                  |
| COMMON        | **`Invoice Date`**, **`Document Template`**                                                                                                                                                                                                                    |
| PRIMARY       | **`Replace Lines`** — **`replaceLines`** · boolean · **`false`** · *"Teamleader replaces ALL lines with what you send here."*                                                                                                                                  |
| CONDITIONAL   | **`Section Title`**, **`Lines`**, **`Use Multiple Sections`**, **`Grouped Lines`** — visible when **`replaceLines = true`**                                                                                                                                    |
| ADVANCED      | **`Advanced Options`** — **`updateFields`**: **`Currency`**, **`Discounts`**, **`Exchange Rate`**, **`Expected Payment Method`**, **`Expected Payment Reference`**, **`Note`**, **`Purchase Order Number`**, **`Custom Fields`**, **`For Attention Of`** group |

**Runtime derivation**: as Draft, but every derivation is skipped when its trigger field is untouched.
**Errors**: **`replaceLines = true`** with no lines → *"Replace Lines is on but no lines were provided."*
**Breaking-change impact**: as Draft, plus line submission gated behind **`replaceLines`**.

---

### Invoice → Update Booked Invoice

| **ClassSpec** |                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Invoice`** — **`invoiceId`** · required                                                                                                                                                   |
| PRIMARY       | notice property: *"Booked invoices accept only a limited set of changes. Currency, template, discounts, expected payment method and purchase order number cannot be changed after booking."* |
| COMMON        | **`Change Customer`** + customer component (as Update)                                                                                                                                       |
| COMMON        | **`Invoice Date`**, **`Payment Term`** group                                                                                                                                                 |
| PRIMARY       | **`Replace Lines`** + line editor                                                                                                                                                            |
| ADVANCED      | **`Advanced Options`** — **`updateFields`** restricted to the fields the operation actually accepts: **`Note`**, **`Custom Fields`**, **`For Attention Of`**                                 |

**Change from V1**: V1 silently stripped unsupported fields. V2 **does not offer them at all** for this operation, so nothing is silently discarded. The runtime strip logic stays as a safety net for expression-supplied objects, but when it drops a key it now emits a node warning in the output item (**`_warnings: ['<field> is ignored on booked invoices']`**) rather than staying silent.
**Breaking-change impact**: several **`updateFields`** members no longer exist for this operation.

---

### Invoice → Book

| **ClassSpec** |                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | notice: *"Booking finalises the invoice and assigns its number. This cannot be undone; corrections are made with a credit note."* |
| PRIMARY       | **`Invoice`** — **`invoiceId`** · required                                                                                        |
| PRIMARY       | **`Booking Date`** — **`bookDate`** (unchanged) · dateTime · **`''`** · required · *"The date the invoice is booked on."*         |

No breaking change.

---

### Invoice → Send (deep-design, recipient-first)

**What the API supports** (**`invoices.send`**): **`id`**, **`content.{subject, body, mail_template_id}`** — subject and body **required even with a template** — **`recipients.{to,cc,bcc}`** **optional** (entries use **`email`**, not **`email_address`**), **`attachments`**.

Because **`recipients`** is optional, the "Teamleader Default" mode is genuinely implementable: omit the key entirely and Teamleader uses the invoice's own invoicee addresses.

**Field layout — exact visual order**

| **ClassSpec** |                                                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Invoice`** — **`invoiceId`** · resourceLocator · required                                                                                                                                                                                              |
| PRIMARY       | **`Recipient Source`** — **`recipientSource`** · options: **`Teamleader Default`** (**`default`**) / **`Invoice Customer`** (**`invoiceCustomer`**) / **`Custom Recipients`** (**`custom`**) · default **`default`** · **new**                            |
| CONDITIONAL   | **`To`** — **`to`** (v1: **`sendOptions.to`**) · fixedCollection, multi · visible when **`recipientSource = custom`** · entry shape identical to Quotation Send but the API key is **`email`**                                                            |
| PRIMARY       | **`Message Source`** — **`messageSource`** · options: **`Write Message`** (**`manual`**) / **`Teamleader Mail Template`** (**`template`**) · default **`manual`**                                                                                         |
| CONDITIONAL   | **`Mail Template`** — **`mailTemplateId`** (v1: **`sendOptions.mailTemplateId`**) · options · **`''`** · lookup **`getInvoiceMailTemplates`** (**`mailTemplates.list`** with **`filter.type = 'invoice'`**) · visible when **`messageSource = template`** |
| PRIMARY       | **`Subject`** — **`subject`** (unchanged) · string · **`''`** · always visible · required in **`manual`** mode; in **`template`** mode labelled *"Leave empty to use the template's subject"*                                                             |
| PRIMARY       | **`Message`** — **`body`** (unchanged) · string, 8 rows · **`''`** · always visible · same conditional requirement wording                                                                                                                                |
| ADVANCED      | **`Advanced Options`** — **`sendOptions`**: **`CC`** (**`cc`**), **`BCC`** (**`bcc`**), **`Attachment File IDs`** (**`attachments`**)                                                                                                                     |

**Exact behaviour of Subject/Body with a mail template (required by the brief)**

**`invoices.send`** requires **`content.subject`** and **`content.body`** **even when ****`mail_template_id`**** is supplied**, and Teamleader's own rendering of the template is not guaranteed to override them. V2 therefore:

1. Sends **`mail_template_id`** when **`messageSource = template`**.
2. If **`Subject`** / **`Message`** are filled → sends them verbatim. The user's text wins.
3. If either is empty → calls **`mailTemplates.list`** (**`filter.type = 'invoice'`**), finds the template, and fills the missing one from **`content.subject`** / **`content.body`**.
4. If the template cannot be found and the field is empty → **`NodeOperationError`** *"Fill in a subject and message, or pick a mail template that still exists."*
5. The **`Mail Template`** description states plainly: *"Teamleader always needs a subject and a message. If you leave them empty, the template's text is copied as-is — merge fields are not filled in."*

**Recipient derivation**

| **ModeBehaviour**        |                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`Teamleader Default`** | **`recipients`** key omitted entirely. Description: *"Teamleader sends to the invoice's own e-mail addresses."*                                                                                                                                                                                                                                  |
| **`Invoice Customer`**   | **`invoices.info(invoiceId)`** → **`data.invoicee.email`**; if present, **`recipients.to = [{ email, customer: data.invoicee.customer }]`**. If **`invoicee.email`** is null → **`NodeOperationError`** *"This invoice's customer has no e-mail address in Teamleader. Use Teamleader Default or Custom Recipients."* — never a silent fallback. |
| **`Custom Recipients`**  | Exactly what the user entered; empty list → *"Add at least one recipient or switch to Teamleader Default."*                                                                                                                                                                                                                                      |

**Breaking-change impact**: **`sendOptions.to/cc/bcc`** → **`to`** (top-level) + **`sendOptions.cc/bcc`**; **`sendOptions.mailTemplateId`** → top-level **`mailTemplateId`**; recipient entry **`customerType`**/**`customerId`** → **`customerMode`** + locators; **`subject`**/**`body`** requiredness now conditional.

---

## H. FINANCIAL OPERATIONS (deep-design)

### Invoice → Register Payment

The V1 layout is good and is preserved; only the amount source is added.

| **ClassSpec** |                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Invoice`** — **`invoiceId`** · required                                                                                                                                    |
| PRIMARY       | **`Amount Source`** — **`amountSource`** · options: **`Full Outstanding Amount`** (**`outstanding`**) / **`Specific Amount`** (**`manual`**) · default **`manual`** · **new** |
| CONDITIONAL   | **`Amount`** — **`amount`** (unchanged) · number · **`0`** · visible when **`amountSource = manual`** · required there                                                        |
| CONDITIONAL   | **`Currency`** — **`currency`** (unchanged) · options · **`EUR`** · **`getCurrencies`** · visible when **`amountSource = manual`**                                            |
| PRIMARY       | **`Paid At`** — **`paidAt`** (unchanged) · dateTime · **`''`** · required                                                                                                     |
| PRIMARY       | **`Payment Method`** — **`paymentMethodId`** (unchanged) · options · **`''`** · **`getPaymentMethods`**                                                                       |

**Full Outstanding Amount — reliability assessment**: **`invoices.info`** returns **`data.total.due`** as a Money object (**`amount`** + **`currency`**). This is the authoritative outstanding balance and already accounts for registered payments, so the mode is safe to implement.

- API call: **`invoices.info(invoiceId)`**; use **`data.total.due.amount`** and **`.currency`**.
- Error if **`total.due`** is missing → *"Could not read the outstanding amount of this invoice. Enter the amount manually."*
- Error if **`total.due.amount <= 0`** → *"This invoice has nothing outstanding."* (registering a zero/negative payment is never the intent).
- Not overridable while the mode is active — switching to **`Specific Amount`** is the override.
- The mode description states: *"Reads the invoice's outstanding balance when the workflow runs."*

**Breaking-change impact**: **`amount`**/**`currency`** become conditional; existing workflows keep **`amountSource`** defaulting to **`manual`**, so behaviour is unchanged.

---

### Invoice → Remove Payments

| **ClassSpec** |                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | notice: *"Removes ALL registered payments from this invoice. The invoice returns to outstanding. This cannot be undone from n8n."* |
| PRIMARY       | **`Invoice`** — **`invoiceId`** · required                                                                                         |

No breaking change.

---

### Invoice → Credit Fully

| **ClassSpec** |                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | notice: *"Creates a credit note for the full invoice amount. The credit note is a permanent bookkeeping document."* |
| PRIMARY       | **`Invoice`** — **`invoiceId`** · required                                                                          |
| ADVANCED      | **`Credit Note Date`** — **`options.creditNoteDate`** · dateTime · **`''`**                                         |

No breaking change.

---

### Invoice → Credit Partially (realistic design)

**The constraint, stated honestly**: **`invoices.creditPartially`** requires a full **`grouped_lines`** payload. There is **no** n8n mechanism to render an editable, pre-populated copy of the invoice's existing lines in the editor. A **`loadOptions`**-backed multi-select of existing lines **is** possible (it can call **`invoices.info`** using the current **`invoiceId`**), but only when **`invoiceId`** holds a literal value, and such a list can only offer *whole-line* selection — per-line partial quantities cannot be edited that way.

**Field layout**

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | notice: *"Creates a credit note for part of the invoice. You describe what is being credited; Teamleader does not copy the original lines for you."*                                                                                                                                                                                                                                                                                                              |
| PRIMARY       | **`Invoice`** — **`invoiceId`** · required                                                                                                                                                                                                                                                                                                                                                                                                                        |
| PRIMARY       | **`Credit Method`** — **`creditMethod`** · options: **`Credit Selected Invoice Lines`** (**`selectLines`**) / **`Credit an Amount`** (**`amount`**) / **`Enter Lines Manually`** (**`manual`**) · default **`amount`** · **new**                                                                                                                                                                                                                                  |
| CONDITIONAL   | **`Lines to Credit`** — **`linesToCredit`** · multiOptions · **`[]`** · lookup **`getInvoiceLines`** (**new**: **`invoices.info`** on the current **`invoiceId`**, one option per line, label **`"<description> — <qty> × <unit price>"`**, value = a stable index **`groupIndex.lineIndex`**) · visible when **`creditMethod = selectLines`** · description: *"Only works when you picked the invoice from the list or typed its ID. Whole lines are credited."* |
| CONDITIONAL   | **`Credit Description`** — **`creditDescription`** · string · **`'Credit note'`** · visible when **`creditMethod = amount`** · required there                                                                                                                                                                                                                                                                                                                     |
| CONDITIONAL   | **`Amount (Excl. Tax)`** — **`creditAmount`** · number · **`0`** · visible when **`creditMethod = amount`** · required there                                                                                                                                                                                                                                                                                                                                      |
| CONDITIONAL   | **`Tax Rate`** — **`creditTaxRateId`** · options · **`''`** · **`getTaxRates`** · visible when **`creditMethod = amount`** · required there                                                                                                                                                                                                                                                                                                                       |
| CONDITIONAL   | **`Section Title`** / **`Lines`** / **`Use Multiple Sections`** / **`Grouped Lines`** — the shared line editor, visible when **`creditMethod = manual`**                                                                                                                                                                                                                                                                                                          |
| ADVANCED      | **`Advanced Options`** — **`additionalFields`**: **`Credit Note Date`**, **`Discounts`**                                                                                                                                                                                                                                                                                                                                                                          |

**Runtime derivation**

| **MethodBehaviour** |                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`selectLines`**   | **`invoices.info(invoiceId)`** → rebuild **`grouped_lines`** containing only the selected lines, copying **`description`**, **`quantity`**, **`unit_price.amount`**, **`tax.id`**, **`unit.id`**, **`product.id`**, **`discount`**. Any selected index no longer present (invoice changed since the dropdown loaded) → **`NodeOperationError`** *"The invoice lines have changed since you selected them. Re-open the list."* |
| **`amount`**        | One synthetic line: **`quantity: 1`**, **`description = creditDescription`**, **`unit_price = { amount: creditAmount, tax: 'excluding' }`**, **`tax_rate_id = creditTaxRateId`**.                                                                                                                                                                                                                                             |
| **`manual`**        | Standard §E assembly, no reads.                                                                                                                                                                                                                                                                                                                                                                                               |

**What is deliberately not promised**: partial quantities per existing line in the **`selectLines`** mode; a spreadsheet-like line grid; pre-filled editable copies of invoice lines. Users needing partial quantities use **`manual`** (optionally fed by an **`Invoice → Get`** node and an expression).

**Breaking-change impact**: **`additionalFields.groupedLines`** moves out of the collection into the conditional line editor.

---

### Invoice → Download

Unchanged — it is already correct.

| **ClassSpec** |                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Invoice`** — **`invoiceId`** · required                                                                 |
| PRIMARY       | **`Format`** — **`format`** · options (**`PDF`**, **`UBL (e-fff)`**, **`UBL (Peppol BIS 3)`**) · **`pdf`** |
| COMMON        | **`Put Output File in Field`** — **`binaryPropertyName`** · string · **`data`** · required                 |

No breaking change.

---

## I. TEAMLEADER TRIGGER (deep-design)

**Primary user goal**: start a workflow when something changes in Teamleader.

**Field layout — exact visual order**

| **ClassSpec** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRIMARY       | **`Event Selection`** — **`eventSelection`** · options: **`Common Events`** (**`common`**) / **`By Entity`** (**`byEntity`**) / **`All Events`** (**`all`**) · default **`common`** · **new**                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| CONDITIONAL   | **`Events`** — **`commonEvents`** · multiOptions · **`[]`** · visible when **`eventSelection = common`** · static curated list for Warmvast: **`deal.won`**, **`deal.lost`**, **`deal.created`**, **`deal.updated`**, **`deal.moved`**(only if it exists in the official list — no invented values), **`invoice.booked`**, **`invoice.paymentRegistered`**, **`invoice.drafted`**, **`contact.added`**, **`contact.updated`**, **`company.added`**, **`company.updated`**, **`product.added`**, **`product.updated`**. The list is a **filter over the existing 71-entry ****`webhookTypeOptions`**** constant**; any entry that does not exist there is not included. |
| CONDITIONAL   | **`Entities`** — **`entities`** · multiOptions · **`[]`** · visible when **`eventSelection = byEntity`** · derived list of the distinct entity prefixes present in **`webhookTypeOptions`** (Account, Call, Company, Contact, CreditNote, Deal, Invoice, Meeting, Milestone, Product, Project, Subscription, Task, TimeTracking, User, …)                                                                                                                                                                                                                                                                                                                              |
| CONDITIONAL   | **`Events`** — **`entityEvents`** · multiOptions · **`[]`** · visible when **`eventSelection = byEntity`** · lookup **`getWebhookEventsForEntities`** (new **`loadOptions`**, **no API call** — filters the static list by **`getCurrentNodeParameter('entities')`**), **`loadOptionsDependsOn: ['entities']`**                                                                                                                                                                                                                                                                                                                                                        |
| CONDITIONAL   | **`Events`** — **`events`** (**v1 name retained**) · multiOptions · **`[]`** · visible when **`eventSelection = all`** · the full 71-entry list, unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Quotation note (must be visible in the UI, not only the README)**: a **`notice`**-type property, always visible:
*"Teamleader does not publish webhook events for quotations. To react to quotations, use deal or invoice events, or poll with a Schedule Trigger."*

**Interaction rules**

```
eventSelection = common   → commonEvents used
eventSelection = byEntity → Entities scopes the Events list (client-side filter, always resolvable)
eventSelection = all      → the untouched 71-item list (existing saved workflows land here)

```

The effective subscription set = the union of whichever field is active. All 71 events remain reachable via **`All Events`**, and 100 % of them are reachable via **`By Entity`** too.

**Webhook lifecycle**: unchanged. **`checkExists`** / **`create`** / **`delete`** keep matching on this node's own webhook URL, stay idempotent, refuse empty selections and unreachable/localhost URLs. **No API calls are added inside the webhook execution path** — the enriched payload keeps exactly its current shape (**`eventType`**, **`entityType`**, **`entityId`**, plus the raw body). Hydration stays the responsibility of the downstream action nodes, which is why Invoice Draft's **`From Deal`** mode and every resourceLocator's **`By ID`** mode accept a bare **`entityId`** expression directly.

**Breaking-change impact**: **`events`** keeps its name and meaning but becomes conditional on **`eventSelection`**. Existing saved triggers have no **`eventSelection`** value; the node's **`default`** must therefore be handled so that **a workflow saved before V2 continues to read ****`events`**. Implementation rule: if **`eventSelection`** is absent from the saved parameters, treat it as **`all`**. This is checked in the migration test suite.

---

# PART 2 — Global specification

## 1. Global V2 design system

**1.1 Primary vs advanced.** A field is PRIMARY only if a normal Warmvast employee needs it on more than half of that operation's real uses, or the API requires it. Everything else that is business-meaningful is COMMON. **`Advanced Options`** holds API-shaped or rare fields. No operation shows more than \~10 fields before **`Advanced Options`**.

**1.2 Naming.** Display labels are business language, never API language: **`Article Code`** not **`Code`**, **`Message`** not **`Body`**, **`Company Name`** not **`Name`**. Parameter names are camelCase and stable; the API's snake\_case never leaks into a parameter name (V1's **`first_name`**, **`phase_id`**, **`business_type_id`**, **`responsible_user_id`**, **`estimated_value`** etc. are all renamed). The lint-driven **`... Name or ID`** suffix is kept where n8n requires it, but the description is rewritten to be human ("Choose from the list, or use an expression").

**1.3 Resource locators.** Every reference to a Teamleader record is a **`resourceLocator`** with at minimum **`From List`** (searchable where a search endpoint exists) and **`By ID`** (accepts expressions). Customer references use the 3-mode locator (**`Company`** / **`Contact`** / **`By ID`**). No free-text UUID field survives anywhere in the UI except **`Project ID`** and **`Attachment File IDs`**, for which this connector has no lookup and invents none.

**1.4 From List / By ID / expressions.** **`From List`** is the default mode everywhere. **`By ID`** always exists and always accepts expressions — this is the automation escape hatch and is never removed. Where a **`From List`** cannot be searched server-side, the mode description says so (*"Recent items"*).

**1.5 Money.** One amount field (**`number`**) plus a **`Currency`** dropdown that defaults to **`EUR`** and lives in **`Advanced Options`** wherever it is not central. Never more than one currency selector per form level. Amounts are always tax-exclusive where the API says **`tax: 'excluding'`**, and the label says **`(Excl. Tax)`**.

**1.6 Percentages.** Always presented 0–100 with **`minValue`**/**`maxValue`**, converted at execution where the API wants a 0–1 fraction (deal probability). Discounts are already 0–100 in the API and stay so. Label always ends in **`(%)`**.

**1.7 Dates.** **`dateTime`** pickers everywhere; **`toApiDate`** is fixed so that date-only API fields (**`invoice_date`**, **`book date`**, **`credit_note_date`**, **`estimated_closing_date`**, **`expires_after`**, **`birthdate`**) truncate to **`YYYY-MM-DD`** while true timestamps (**`paid_at`**, **`updated_since`**) keep the full ISO-8601 value. The truncation rule is per-field, declared in one table in **`utils.ts`**, never inferred.

**1.8 Language.** Free-text language inputs become **`options`** restricted to the codes Teamleader documents, everywhere (contact, company, quotation send). Default **`nl`**.

**1.9 Country.** Free-text country inputs become **`options`** from a curated ISO-3166-1 alpha-2 list (address country, business-type country). Expressions remain possible.

**1.10 Tags.** Everywhere tags appear: **`Tags`** multiOptions backed by **`getTags`** **plus** a sibling **`New Tags`** comma-separated string for values not yet in Teamleader. Merged, trimmed, de-duplicated case-insensitively at execution. This finally uses the **`getTags`** lookup that V1 implemented but never wired.

**1.11 Custom fields.** Unchanged structure (**`fixedCollection`** of definition + value), but the value field becomes **`Value`** (string) with a description naming the expected format, and the definition dropdown label keeps the **`[context]`** suffix so a user can tell a company field from a deal field. Typed value inputs per definition type are **out of scope** (see non-goals).

**1.12 Merge/replacement semantics.** Any field that replaces a whole array in Teamleader (emails, phones, addresses, lines) says so in its description in one standard sentence: *"Replaces the existing …. Leave empty to keep them unchanged."* Line replacement is additionally gated behind an explicit **`Replace Lines`** toggle.

**1.13 Dependent dropdowns.** Rules: (a) the scoping field appears **above** its dependants; (b) the scoping field is at the same nesting level or shallower; (c) **`loadOptionsDependsOn`** uses the absolute parameter path; (d) the loader always has a fallback that returns the unscoped list, with the scope name prefixed into each label, so an expression in the scoping field never produces an empty dropdown; (e) every scope-only field says *"Only used to filter the lists below — not sent to Teamleader"* when that is true (quotation **`Department`**, deal **`Pipeline`** on Change Phase, company **`Business Type Country`**).

**1.14 Collection option ordering.** n8n sorts collection members by display label and the repo's lint rules enforce alphabetical ordering of **`fixedCollection`** value fields. Design accordingly: do not rely on ordering inside collections for meaning; anything order-sensitive goes to top level.

**1.15 Backwards-compatible reads.** Where a field moved out of a collection, the V2 execution code reads the new path first and falls back to the old path (**`additionalFields.first_name`** etc.) **only if** the versioned-node approach in §5 is not adopted. If versioning is adopted (recommended), V2 code reads V2 paths only and V1 code is frozen.

**1.16 Warnings and destructive actions.** n8n custom nodes cannot show confirmation dialogs; V2 does not fake any. Instead: (a) the operation's **`description`**/**`action`** states the consequence; (b) a **`notice`**-type property at the top of the form repeats it in one sentence; (c) irreversible operations (**`Delete`**, **`Book`**, **`Remove Payments`**, **`Credit Fully`**, **`Credit Partially`**, **`Mark as Lost`**) use the word *"cannot be undone from n8n"* consistently.

**1.17 Collection names.** Exactly three collection names are used across the connector: **`Advanced Options`** (**`additionalFields`** on create-type operations, **`updateFields`** on update-type operations — names retained for compatibility), **`Filters`** (**`filters`**), and **`Options`** (**`options`**, only for read-shaping toggles like **`Include Custom Fields`**). **`Send Options`** disappears as a concept.

---

## 2. Context-aware automation architecture

One shared, reusable module — **`helpers/context.ts`** — not per-operation hacks.

**2.1 The ****`SourceSelector`**** pattern.** Any operation that can take data from another record declares a **`<thing> Source`** options field with **`Select Manually`** as one of its values. Rules:

- The source selector is always the **first** field of the form.
- Selecting a non-manual source **hides** the manual fields (never shows both).
- Every derived value has a corresponding visible field that, when filled, overrides the derivation.
- The derivation is described in the source selector's own description, in one sentence, naming the record it reads.

**2.2 Declared context resolvers.** Each resolver is a function **`(this: IExecuteFunctions, id: string) => Promise<Context>`** with a per-node-run cache keyed by **`resolver:id`**, so ten items referencing the same deal cause one **`deals.info`** call.

| **ResolverAPI callProvides** |                                                             |                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **`fromDeal`**               | **`deals.info`**                                            | **`customer {type,id}`**, **`contactPersonId`**, **`departmentId`**, **`currency`**, **`title`**, **`responsibleUserId`**                  |
| **`fromCustomer`**           | **`contacts.info`** / **`companies.info`** (chosen by type) | **`primaryEmail`**, **`invoicingEmail`**, **`language`**, **`preferredCurrency`**, **`responsibleUserId`**                                 |
| **`fromInvoice`**            | **`invoices.info`**                                         | **`invoicee {customer,email}`**, **`departmentId`**, **`total.due`**, **`groupedLines`**, **`paymentTerm`**                                |
| **`fromProduct`**            | **`products.info`**                                         | **`name`**, **`description`**, **`code`**, **`sellingPrice`**, **`purchasePrice`**, **`taxRateId`**, **`unitId`**, **`productCategoryId`** |

**2.3 Consumers.**

| **OperationResolverFields derived**                    |                   |                                               |
| ------------------------------------------------------ | ----------------- | --------------------------------------------- |
| Invoice Draft (**`customerSource = deal`**)            | **`fromDeal`**    | customer, department, contact person (opt-in) |
| Invoice Send (**`recipientSource = invoiceCustomer`**) | **`fromInvoice`** | recipient e-mail + customer link              |
| Register Payment (**`amountSource = outstanding`**)    | **`fromInvoice`** | amount + currency                             |
| Credit Partially (**`creditMethod = selectLines`**)    | **`fromInvoice`** | line set                                      |
| Deal Update (contact person without customer change)   | **`fromDeal`**    | current customer                              |
| Any line with **`useProductDefaults`**                 | **`fromProduct`** | description, price, tax, unit                 |

**2.4 Failure contract (identical everywhere).** A resolver that cannot produce a required value throws a **`NodeOperationError`** whose message names: the source record and ID, the value that could not be derived, and the exact field the user should fill instead. Resolvers never fall back to a "reasonable guess" and never pick between multiple plausible values.

---

## 3. Product hydration architecture

**3.1 When it happens.** Only at execution, only for lines with **`lineType = product`** **and** **`useProductDefaults = true`**. Never in the editor. The **`Use Product Defaults`** label plus its description is the entire UI contract.

**3.2 How.** Collect the distinct **`productId`**s across all lines of the current item, issue one **`products.info`** per distinct ID (cached across items in the same node run), then apply precedence per field.

**3.3 Precedence rules.**

| **Line fieldPrecedence**          |                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **`description`**                 | user value if non-empty → product **`name`** → **error** if both empty (the API requires a description) |
| **`extendedDescription`**         | user value if non-empty → product **`description`** → omitted                                           |
| **`unitPrice`**                   | **see 3.4** → product **`selling_price.amount`** → **error** if neither                                 |
| **`taxRateId`**                   | user value if non-empty → product **`tax.id`** → **error** if neither (the API requires it)             |
| **`unitOfMeasureId`**             | user value if non-empty → product **`unit.id`** → omitted                                               |
| **`productCategoryId`** (invoice) | user value if non-empty → product **`product_category.id`** → omitted                                   |
| **`purchasePrice`** (quotation)   | user value if non-zero → product **`purchase_price.amount`** if the account has access to it → omitted  |
| **`quantity`**                    | user value always (default 1); never derived                                                            |
| **`discount`**                    | user value always; never derived                                                                        |
| **`product_id`**                  | always sent, so the reference exists in Teamleader                                                      |

**3.4 The zero-price problem, resolved explicitly.** **`unitPrice`** is a **`number`** with default **`0`**, so "empty" and "free of charge" are indistinguishable. Rule: in **product mode with ****`useProductDefaults = true`**, a value of exactly **`0`** means *"take the product price"*. To invoice a product line at genuinely **`0.00`**, the user sets **`Use Product Defaults = Off`**, which is stated in the **`Unit Price`** description for product mode: *"0 means: use the product's selling price. To charge 0.00, switch Use Product Defaults off."* In **custom mode** and with defaults off, **`0`** always means **`0.00`**.

**3.5 Currency.** Product prices are returned as Money with their own currency. Hydration copies **only the amount**; the document's currency governs. If the product's **`selling_price.currency`** differs from the document currency, the item gains a warning **`_warnings: ['Product <name> is priced in <X>; the amount was used as-is in <Y>']`** and no conversion is attempted. No exchange-rate maths is ever invented.

**3.6 Failure.** **`products.info`** failing for a hydrated line → **`NodeOperationError`** naming the line index and the product ID. Product deleted since selection → same error with *"This product no longer exists in Teamleader."*

**3.7 Cost.** Worst case per node run = number of distinct products across all items, not per line and not per item. Documented in the README.

---

## 4. Breaking-change matrix

| **V1 Resource/OperationV1 parameterV2 parameterType changed?Semantics changed?Migration required?** |                                                                                                                               |                                                                                 |                          |                                         |                           |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------ | --------------------------------------- | ------------------------- |
| Contact Create                                                                                      | **`additionalFields.first_name`**                                                                                             | **`firstName`**                                                                 | no                       | no                                      | yes (path)                |
| Contact Create/Update                                                                               | **`additionalFields.emails`** (primary entry)                                                                                 | **`email`** + **`additionalFields.emails`**                                     | no                       | merge rule added                        | optional                  |
| Contact Create/Update                                                                               | **`additionalFields.telephones`** (first entry)                                                                               | **`phone`** + **`phoneType`** + **`additionalFields.telephones`**               | no                       | merge rule added                        | optional                  |
| Contact Update                                                                                      | **`additionalFields.last_name`**                                                                                              | **`lastName`**                                                                  | no                       | no                                      | yes (path)                |
| Contact Create/Update                                                                               | **`additionalFields.language`**                                                                                               | same path, **`options`**                                                        | string → options         | no                                      | no                        |
| Contact/Company Tag, Untag                                                                          | **`tags`**                                                                                                                    | **`tags`** (+ **`newTags`**)                                                    | string → array           | no                                      | **yes**                   |
| Contact/Company Get Many                                                                            | **`filters.tags`**                                                                                                            | **`filters.tags`**                                                              | string → array           | no                                      | **yes**                   |
| Company Create                                                                                      | **`additionalFields.vat_number`**                                                                                             | **`vatNumber`**                                                                 | no                       | no                                      | yes (path)                |
| Company Create                                                                                      | **`additionalFields.responsible_user_id`**                                                                                    | **`responsibleUserId`**                                                         | no                       | no                                      | yes (path)                |
| Company Create/Update                                                                               | **`additionalFields.business_type_id`**                                                                                       | **`additionalFields.businessTypeId`**                                           | no                       | no                                      | yes (path)                |
| Company Create/Update                                                                               | **`additionalFields.businessTypeCountry`**                                                                                    | same path, **`options`**                                                        | string → options         | no                                      | no                        |
| Company Update                                                                                      | **`additionalFields.name`**                                                                                                   | **`name`**                                                                      | no                       | no                                      | yes (path)                |
| Deal Create/Update                                                                                  | **`customerId`** (+ **`customerType`**)                                                                                       | **`customerId`** 3-mode locator                                                 | resourceLocator shape    | type now from mode                      | **yes**                   |
| Deal Create/Update                                                                                  | **`additionalFields.estimated_probability`**                                                                                  | **`additionalFields.probabilityPercent`**                                       | no                       | **0–1 → 0–100**                         | **yes**                   |
| Deal Create/Update                                                                                  | **`additionalFields.contact_person_id`**                                                                                      | **`contactPersonId`**                                                           | string → resourceLocator | no                                      | **yes**                   |
| Deal Create/Update                                                                                  | **`additionalFields.{pipelineId,phase_id,estimated_value,currency,responsible_user_id,estimated_closing_date}`**              | top-level equivalents                                                           | no                       | no                                      | yes (path)                |
| Deal Update                                                                                         | **`additionalFields.phase_id`**                                                                                               | **removed**                                                                     | —                        | was already ignored                     | yes (removal)             |
| Deal Get Many                                                                                       | **`filters.customerId`**                                                                                                      | **`filters.customerId`** locator                                                | string → resourceLocator | no                                      | **yes**                   |
| Product Create/Update                                                                               | **`additionalFields.{code,sellingPrice,purchasePrice,taxRateId,departmentId,productCategoryId,unitOfMeasureId,description}`** | top-level equivalents                                                           | no                       | no                                      | yes (path)                |
| Product Create/Update                                                                               | **`additionalFields.sellingPriceCurrency`** + **`.purchasePriceCurrency`**                                                    | **`additionalFields.currency`**                                                 | two → one                | applies to both prices                  | **yes**                   |
| Quotation Create/Update                                                                             | **`additionalFields.{documentTemplateId,text,expiresAfter,actionAfterExpiry}`**                                               | top-level                                                                       | no                       | no                                      | yes (path)                |
| Quotation/Invoice lines                                                                             | **`groupedLines`**                                                                                                            | **`lines`** + **`sectionTitle`** (or **`groupedLines`** when **`useSections`**) | new flat shape           | equivalent output                       | optional                  |
| Quotation Update                                                                                    | (lines always sent when present)                                                                                              | gated behind **`replaceLines`**                                                 | no                       | **explicit opt-in**                     | **yes**                   |
| Quotation Send                                                                                      | **`sendOptions.to/cc/bcc`**                                                                                                   | **`to`** top-level; **`sendOptions.cc/bcc`**                                    | no                       | no                                      | **yes**                   |
| Quotation Send                                                                                      | recipient **`customerType`** + **`customerId`**                                                                               | **`customerMode`** + **`contactId`**/**`companyId`**                            | string → locator         | no                                      | **yes**                   |
| Quotation Send                                                                                      | **`subject`**, **`content`**                                                                                                  | conditional on **`messageSource`**                                              | no                       | template mode added                     | no (default **`manual`**) |
| Invoice Draft                                                                                       | **`customerType`** + **`customerId`**                                                                                         | **`customerSource`** + **`dealId`**/**`customerId`**                            | new + locator            | deal derivation added                   | **yes**                   |
| Invoice Draft/Update                                                                                | **`additionalFields.paymentTermType`** + **`.paymentTermDays`**                                                               | **`paymentTermId`** (normal) or **`customPaymentTerm`** + type/days             | new field                | term now chosen from Teamleader         | **yes**                   |
| Invoice Draft/Update                                                                                | **`additionalFields.{invoiceDate,documentTemplateId,forAttentionOfName}`**                                                    | top-level                                                                       | no                       | no                                      | yes (path)                |
| Invoice Draft/Update                                                                                | **`additionalFields.forAttentionOfContactId`**                                                                                | **`forAttentionOfMode`** + **`forAttentionOfContactId`** locator                | string → locator         | no                                      | **yes**                   |
| Invoice Update Booked                                                                               | **`updateFields.{currency,documentTemplateId,discounts,expectedPaymentMethod,purchaseOrderNumber}`**                          | **removed from this operation**                                                 | —                        | were silently dropped                   | yes (removal)             |
| Invoice Update                                                                                      | (lines always sent when present)                                                                                              | gated behind **`replaceLines`**                                                 | no                       | explicit opt-in                         | **yes**                   |
| Invoice Send                                                                                        | **`sendOptions.to/cc/bcc`**                                                                                                   | **`to`** top-level; **`sendOptions.cc/bcc`**                                    | no                       | **`recipientSource`** added             | **yes**                   |
| Invoice Send                                                                                        | **`sendOptions.mailTemplateId`**                                                                                              | **`mailTemplateId`** top-level                                                  | no                       | template hydration added                | yes (path)                |
| Invoice Register Payment                                                                            | **`amount`**, **`currency`**                                                                                                  | conditional on **`amountSource`**                                               | no                       | new outstanding mode                    | no (default **`manual`**) |
| Invoice Credit Partially                                                                            | **`additionalFields.groupedLines`**                                                                                           | **`creditMethod`** + mode-specific fields                                       | new                      | three explicit methods                  | **yes**                   |
| Invoice Get Many                                                                                    | **`filters.customerId`**, **`filters.dealId`**                                                                                | locators                                                                        | string → resourceLocator | no                                      | **yes**                   |
| Trigger                                                                                             | **`events`**                                                                                                                  | **`eventSelection`** + **`commonEvents`**/**`entityEvents`**/**`events`**       | no (for **`events`**)    | absent **`eventSelection`** ⇒ **`all`** | no                        |

---

## 5. Node versioning recommendation

**Recommendation: yes — make ****`Teamleader`**** a versioned node, ****`defaultVersion: 2`****, with V1 frozen.**

Basis in current n8n custom-node capabilities:

- n8n supports **`VersionedNodeType`** in community packages: a wrapper class exposing **`nodeVersions = { 1: TeamleaderV1, 2: TeamleaderV2 }`** with **`description.defaultVersion = 2`**. Saved workflows store **`typeVersion`** on the node, so existing nodes keep loading the V1 property set and the V1 execute path, byte-for-byte.
- The alternative — in-place parameter renaming with runtime fallbacks — would require every V2 executor to read both old and new paths forever, cannot express the changed semantics of **`estimated_probability`** (0–1 vs 0–100) or the currency collapse without guessing which convention a saved value follows, and cannot restore removed **`updateFields`** members. That is exactly the class of silent-behaviour-change principle 3 forbids.

Concrete structure to implement later:

```
nodes/Teamleader/Teamleader.node.ts        → VersionedNodeType wrapper
nodes/Teamleader/v1/TeamleaderV1.node.ts   → current descriptions + actions, frozen, tests kept
nodes/Teamleader/v2/TeamleaderV2.node.ts   → new descriptions + actions
nodes/Teamleader/helpers/                  → shared (GenericFunctions, utils, interfaces)
nodes/Teamleader/methods/                  → shared loadOptions/listSearch (additive only)

```

Rules for the split:

- **`helpers/GenericFunctions.ts`** (auth, retry, pagination, error formatting) stays **shared and unversioned** — bug fixes there benefit both versions.
- **`methods/loadOptions.ts`** stays shared; V2 adds methods (**`getInvoiceMailTemplates`**, **`getQuotationMailTemplates`**, **`getWebhookEventsForEntities`**, **`getInvoiceLines`**) and **fixes** **`getMailTemplates`** (which currently omits the required **`filter.type`** and is therefore broken in V1 too — this is the single exception where a V1-visible fix is acceptable, because the V1 behaviour is an API error, not a behaviour anyone depends on).
- **`utils.ts`** builders are duplicated where semantics change (**`buildLineItem`**, **`toApiDate`** field rules); shared where they do not (**`cleanObject`**, **`buildCustomer`**, **`buildMoney`**).
- The **Trigger node is not versioned**: its only change is additive and **`events`** keeps its meaning (**`eventSelection`** absent ⇒ **`all`**). A versioned trigger would complicate the webhook lifecycle for no user-visible gain.

---

## 6. Implementation stages

Each stage: narrow scope, independently buildable (**`npm run build`**), independently testable (**`npm test`**), lint-clean, and with an explicit manual inspection list for the deployed n8n instance.

**Stage 1 — V2 foundation**
Scope: **`VersionedNodeType`** wrapper; move current code to **`v1/`** untouched; empty **`v2/`** skeleton with resource selector only; shared **`helpers/context.ts`** (resolver + cache scaffolding, no consumers); **`descriptions/v2/SharedFields.ts`** with the new building blocks (3-mode customer locator, tag pair, **`Advanced Options`** naming, percentage helper, per-field date rules); fix **`getMailTemplates`** into type-scoped variants.
Tests: V1 test suite unchanged and green; new unit tests for the shared builders and the date-rule table.
Manual inspection in n8n: the node still appears once; existing saved Teamleader nodes still open with their V1 fields; a freshly added node shows **`typeVersion 2`** and the empty V2 resource list; no duplicate node entries in the palette.

**Stage 2 — Contact + Company (V2)**
Scope: all 16 contact/company operations; tag pair; language/country option lists; the business-type country dependency and its verification.
Tests: request-body assertions for create/update merges (primary e-mail wins), tag merge/dedupe, tag arrays on tag/untag/filters.
Manual inspection: Contact Create form order and that nothing but Last Name is starred; picking a company on Create and confirming the link call in the execution log; Business Type list actually changing when the country changes; **`getTags`** dropdown populating.

**Stage 3 — Deal + Product (V2)**
Scope: deal 7 operations incl. removal of Phase from Update and the **`fromDeal`** resolver's first consumer (Deal Update contact person); product 5 operations with the department-scoped lookups and the single currency.
Tests: probability conversion both directions incl. bounds; phase absent from **`deals.update`** body; deal customer mode → **`lead.customer.type`**; product money wrapping.
Manual inspection: Pipeline → Phase filtering with phase order intact; Change Phase without a pipeline showing prefixed phase names; Product Create with Department set vs. empty (category and tax lists); confirm no lingering third currency dropdown.

**Stage 4 — Shared line editor + product hydration**
Scope: **`lines`** / **`sectionTitle`** / **`useSections`** component, the invoice and quotation member sets, **`fromProduct`** resolver, precedence rules, warnings.
Tests: flat lines → **`grouped_lines`** shape; sections toggle; hydration precedence table driven by fixtures incl. the zero-price rule, missing tax rate error, currency-mismatch warning; call-count assertion proving one **`products.info`** per distinct product per run.
Manual inspection: adding a normal line takes ≤ 3 clicks; toggling Use Multiple Sections swaps the editors without data loss warnings; a product line with everything blank produces correct output in a real execution.

**Stage 5 — Quotation Create/Update/Get/Get Many/Accept/Delete**
Scope: quotation forms, **`replaceLines`** gating, department-as-context framing, searchable quotation locator.
Tests: no **`grouped_lines`** sent when **`replaceLines = false`**; "lines or text" guard; template lookup scoped by department.
Manual inspection: Create form reads Deal → Template → Lines → Expiry; Update makes the replacement warning impossible to miss.

**Stage 6 — Invoice Draft/Update/Update Booked/Book/Get/Get Many/Download**
Scope: the full customer-source architecture, payment-term translation, promoted fields, booked-invoice field restriction with warnings.
Tests: **`From Deal`** derivation incl. department fallback and every error message; payment-term id → **`{type, days}`** incl. the cash case (no days); booked-invoice stripping emitting warnings; unchanged download binary behaviour.
Manual inspection: build the target automation end-to-end (Trigger → Deal Won → Create Draft Invoice) with **nothing** re-selected by hand; verify the drafted invoice in Teamleader has the right customer, department, payment term and lines.

**Stage 7 — Send operations (Quotation Send + Invoice Send)**
Scope: recipient-first layouts, **`messageSource`**, mail-template hydration for both, **`recipientSource`** for invoices.
Tests: quotation **`email_address`** vs invoice **`email`** key correctness; recipients omitted entirely in Teamleader Default mode; template subject/body fill-in and override precedence; every error path.
Manual inspection: send a real quotation to an internal address and confirm **`#LINK`** renders; send an invoice in each of the three recipient modes; confirm the template text arrives as the description promises (raw placeholders visible where warned).

**Stage 8 — Financial operations + Trigger**
Scope: Register Payment amount source, Remove Payments/Book/Credit notices, Credit Partially's three methods incl. **`getInvoiceLines`**, trigger event-selection modes.
Tests: outstanding-amount derivation incl. zero/negative guard; line-selection rebuild and the stale-index error; trigger **`eventSelection`** absent ⇒ **`all`**; the existing assertion that no quotation webhook types exist stays.
Manual inspection: **`Lines to Credit`** populating for a literal invoice and degrading cleanly for an expression; trigger registering exactly the union of selected events, and re-activating without creating duplicates.

**Stage 9 — Regression, consistency, release**
Scope: V1↔V2 side-by-side workflow test matrix; every description proof-read against the naming rules; README rewritten with the V2 forms, the hydration contract, the payment-term translation, the mail-template caveats and the migration matrix; version bump to 2.0.0; annotated tag.
Manual inspection: open one saved V1 node of every resource and confirm zero visual/behavioural change; run the node-linter clean; install the packed tarball on a clean n8n and walk the four flagship flows.

---

## 7. Explicit non-goals

V2 deliberately does **not**:

1. Add any Teamleader API operation not already implemented (no **`invoices.delete`**, **`invoices.copy`**, **`quotations.download`**, subscriptions, projects, time tracking, calls, meetings, tasks, users, credit-note resources).
2. Invent a quotation webhook event, an HMAC/signature verification step, or any other mechanism Teamleader does not document.
3. Pretend **`quotations.send`** supports **`mail_template_id`**. Template use there is an explicit client-side copy with its limitations spelled out in the UI.
4. Render merge fields, resolve Teamleader placeholders, or otherwise simulate Teamleader's own mail rendering.
5. Auto-fill any field in the n8n editor in reaction to another field. All derivation is at execution and labelled.
6. Guess a customer, department, tax rate, price, payment term, contact person or recipient when more than one plausible value exists. Ambiguity always becomes an error naming the field to fill.
7. Perform currency conversion or exchange-rate maths. Mismatches produce warnings, not conversions.
8. Fake confirmation dialogs, "are you sure" checkboxes-as-gates, or dry-run modes for destructive operations. Clear text is the mechanism.
9. Hydrate trigger payloads with extra API calls inside the webhook path. The trigger stays fast and its output shape is unchanged.
10. Provide typed custom-field inputs per definition type, a spreadsheet-style line grid, per-line partial credit quantities in the line-picker mode, or product-picker autofill in the editor — all four require frontend behaviour n8n custom nodes do not offer.
11. Migrate saved V1 workflows automatically. V1 keeps running as V1; migration is a documented, manual, opt-in act.
12. Change authentication, the OAuth credential, the request helper's retry policy, the pagination contract or the error formatter beyond bug fixes.
13. Localise the node UI into Dutch. Labels stay English, matching n8n itself; only the wording becomes plain-language.

---

**Deliverable status**: specification complete for all 48 existing operations plus the trigger, the global design system, the context and hydration architectures, the breaking-change matrix, the versioning decision and a nine-stage implementation plan. No files were changed, nothing was committed or pushed. Ready for your review before Stage 1.