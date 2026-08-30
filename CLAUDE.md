# Teamleader Connector Development Rules

## Scope and source priority

This repository is a private n8n community node for Teamleader Focus used by Warmvast.

Use this priority when instructions conflict:

1. The current stage prompt defines the work to perform now.
2. This `CLAUDE.md` contains permanent project rules and approved overrides.
3. `docs/V2_UX_SPEC.md` is the detailed V2 design baseline.
4. The current repository is the source of truth for what has already been implemented.

Do not redesign completed stages unless the current stage explicitly requires a correction.

## Git and release safety

- `main` is stable production code.
- `v1.0.0` is the stable V1 rollback point.
- All V2 development happens on `v2-ux` until explicitly instructed otherwise.
- Never merge to `main`, tag a release, publish a package, create a tarball, or alter production deployment unless explicitly instructed.
- Commit only after the stage quality gate passes.

## Node architecture

- `Teamleader.node.ts` is a `VersionedNodeType` wrapper.
- V1 is frozen under `nodes/Teamleader/v1/` and must preserve existing saved workflows.
- V2 is the default version and has its own parameter paths and execution mapping.
- Shared request, pagination, error, lookup, and helper infrastructure may be reused where semantics are unchanged.
- The Teamleader Trigger remains unversioned unless a later stage explicitly changes its UI.
- Do not add V2 compatibility fallbacks for V1 parameter paths. Versioning provides compatibility.

## V2 UX principles

- Optimize for a normal Warmvast employee's business mental model, not Teamleader API structure.
- Keep common and API-required fields visible.
- Put rare/API-shaped fields under `Advanced Options`.
- Use business-language labels; do not leak snake_case into display labels or V2 parameter names.
- Prefer searchable `resourceLocator` / dynamic selectors over raw UUID fields.
- Preserve `By ID` / expression modes as the automation escape hatch.
- A field that scopes a lookup must appear above the fields it scopes and at the same nesting level or shallower.
- Dependent dropdowns must have a usable unscoped fallback for expressions rather than becoming unusable.
- Context derivation must be explicit in the UI. Never silently guess a customer, recipient, department, tax rate, price, payment term, contact person, currency, or other important value when ambiguity exists.
- Do not invent Teamleader API functionality.
- Do not fake confirmation dialogs. Use concise notices for destructive actions.
- Keep webhook execution lightweight; do not hydrate trigger payloads with extra API calls.
- Custom-field definition dropdowns must be filtered to the current entity context wherever Teamleader permits it.

## Context architecture

Use the shared `helpers/context.ts` resolver/cache architecture rather than per-operation lookup hacks.

Planned resolver kinds include:

- `fromDeal`
- `fromCustomer`
- `fromInvoice`
- `fromProduct`

Resolvers cache by resolver + ID for the node execution, deduplicate concurrent reads, and never silently fall back to guessed values. Resolver errors must name the source record, the missing value, and the field the user can fill instead.

## Money, percentages, and dates

- Show percentages as 0–100 and convert only at execution when the API expects 0–1.
- Use one currency selector per normal form level unless the underlying Teamleader object genuinely supports independent currencies.
- Do not perform currency conversion or exchange-rate math unless explicitly supported by Teamleader and the operation.
- Use the shared explicit date/timestamp mapping. Never guess whether an API field is date-only or a timestamp.

## Approved overrides to the original V2 design specification

These rules take precedence over conflicting text in `docs/V2_UX_SPEC.md`.

### Product line UX

For Teamleader Product lines with `Use Product Defaults = true`, the normal visible line UI should be minimal:

- Product
- Quantity
- Use Product Defaults

Description, Unit Price, Tax, Unit of Measure, Product Category, Purchase Price, etc. belong under explicit line overrides/options. Custom Line mode directly exposes the fields needed to define the custom line.

Product hydration happens only at execution time; never pretend n8n can reactively auto-fill line editor fields.

### Document text templates are not in the public API

Teamleader's UI offers a saved template selector for the quotation introduction
text (*"Template begeleidende tekst"*). Verified against the official API
blueprint (`teamleadercrm/api`, `apiary.apib`): the public API exposes **no**
endpoint for these saved document text templates. The only template endpoints
are `documentTemplates.list` (PDF/layout) and `mailTemplates.list` (e-mail
subject/body). `quotations.create`/`.update` accept only a resolved `text`
string, and invoices accept only a plain `note`.

Therefore:

- Do not add a `Text Source` selector offering a Teamleader template option.
- Do not invent, guess or probe an endpoint for it.
- Do not call undocumented internal web endpoints for it.
- Keep the plain `Introduction Text` / `Note` fields and say honestly in the
  field description that Teamleader's saved text templates cannot be selected
  through the API.
- Recheck only if Teamleader publishes such an endpoint.

Keep three concepts strictly separate in code and in descriptions:
`Document Template` (layout), document text (`text` / `note`), and
`Mail Template` (send-time e-mail body).

### Purchase price currency

Quotation line `purchase_price` must be in the **account** currency, not the
document currency, and the public API exposes no way to read the account
currency. A hydrated product's own `purchase_price.currency` is authoritative
whenever a product was read; only without one is the document currency used.

### Quotation Send recipients

Quotation Send must eventually expose `Recipient Source` with:

- Deal Contact Person
- Deal Customer
- Custom Recipients

Resolve quotation -> deal -> selected customer/contact context at execution. If the selected source cannot yield a usable email, throw a clear error. Never silently fall back to another recipient source.

### Quotation Department

Department is lookup context for quotation dropdowns, not a normal business input to `quotations.create`. Prefer deriving lookup context from a literal Deal where technically reliable. An Advanced `Lookup Department Override` may be used for expressions/ambiguous cases. Never send this context-only department to `quotations.create`.

### Invoice payment term

The eventual normal Invoice flow should support:

- Teamleader Default
- Select Payment Term
- Custom Payment Term

Use Teamleader's configured default at execution when `paymentTerms.list` reliably identifies one. Do not force employees to reselect a payment term for every invoice when a valid Teamleader default is available.

### Company Create

Both `Email` and `Invoicing Email` are normal/prominent fields. Do not bury Invoicing Email in Advanced Options.

### Product Create / Update field order

Use this dependency-safe order:

1. Name
2. Article Code
3. Selling Price
4. Purchase Price
5. Department
6. Tax Rate
7. Product Category
8. Unit of Measure
9. Description

Department must precede Tax Rate and Product Category because it scopes those lookups.

### Trigger migration

When the Trigger UX is changed later, old saved triggers that have no raw `eventSelection` parameter must continue to use the existing saved `events` value. Do not determine legacy-vs-new state only through `getNodeParameter('eventSelection')`, because a new default can mask raw absence. Add a regression test using an old saved-parameter shape.

## Known design cautions for later stages

- Do not assume quotation `mail_template_id` exists; Teamleader does not provide it for `quotations.send`.
- If quotation mail template text is copied client-side, Teamleader merge variables other than behavior explicitly guaranteed by the API may remain unresolved. Do not promise template rendering.
- Avoid arbitrary locale/country defaults where they are not an actual account/project requirement.
- Verify API requirements before making Product Name stricter than Teamleader itself.
- Be explicit about replacement semantics for Teamleader collection fields such as emails, phones, addresses, tags, and document lines.

## Implementation efficiency

- Inspect only files relevant to the current stage.
- Do not re-audit the repository.
- Do not redesign approved architecture.
- Do not rewrite unrelated working code.
- Do not rewrite README/docs unless the stage explicitly requires it.
- Run focused tests while implementing; run the full build/test/lint quality gate once at the end.
- Do not repeatedly summarize work during implementation.
