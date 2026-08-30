# n8n-nodes-teamleader-warmvast

An n8n community node package for [Teamleader Focus](https://www.teamleader.eu/), built on the
official Teamleader Focus API (`https://api.focus.teamleader.eu`).

The package ships two nodes:

- **Teamleader** — an action node for Contacts, Companies, Deals, Products, Quotations and Invoices.
  It is a versioned node: new nodes use **V2**, and workflows built on **V1** keep working unchanged.
- **Teamleader Trigger** — a webhook trigger that registers itself with Teamleader when the workflow
  is activated.

Both use the same **Teamleader OAuth2 API** credential.

## Installation (self-hosted n8n)

Install from the n8n UI (**Settings → Community nodes → Install**) using the package name
`n8n-nodes-teamleader-warmvast`, or install it manually into the n8n user folder:

```bash
cd ~/.n8n/nodes          # create it if it does not exist
npm init -y              # only needed the first time
npm install n8n-nodes-teamleader-warmvast
```

Restart n8n afterwards. In Docker, the same folder lives at `/home/node/.n8n/nodes`.

To install a locally built copy instead:

```bash
npm run build
npm pack                                  # produces a .tgz
npm install /path/to/n8n-nodes-teamleader-warmvast-<version>.tgz
```

## Teamleader integration setup

1. Sign in at the [Teamleader Marketplace build section](https://marketplace.focus.teamleader.eu/build)
   and create a new integration.
2. Enable the scopes your workflows need (for example `contacts`, `companies`, `deals`, `products`,
   `quotations`, `invoices`).
3. Add the n8n OAuth callback as an allowed **redirect URI**:

   ```
   https://<your-n8n-host>/rest/oauth2-credential/callback
   ```

   This exact URL is shown in the n8n credential dialog — copy it from there.
4. Copy the **Client ID** and **Client Secret** into a new **Teamleader OAuth2 API** credential in
   n8n and click **Connect**.

The credential exposes an optional **Scope** field (leave empty to use the scopes configured on the
integration) and an **API Base URL** field, which normally stays at its default.

## Node versions: V1 and V2

The **Teamleader** node is a versioned node.

- **Version 2** is what a newly added node uses. It is a redesigned interface built around business
  workflows rather than around API payloads.
- **Version 1** is frozen. Existing workflows keep `typeVersion: 1` and keep V1's fields, defaults
  and request bodies exactly as they were. Nothing in V2 changes how a V1 node behaves, and a V1
  node never reads a V2 parameter.

There is no automatic migration: a V1 node stays on V1 until you replace it deliberately. The two
versions can run side by side in the same workflow.

The **Teamleader Trigger** is unversioned. See *Trigger event selection* below for how workflows
saved before the event-selection field keep working.

## Supported resources and operations

| Resource | Operations |
| --- | --- |
| **Contact** | Get, Get Many, Create, Update, Delete, Tag, Untag, Link to Company, Unlink From Company |
| **Company** | Get, Get Many, Create, Update, Delete, Tag, Untag |
| **Deal** | Get, Get Many, Create, Update, Change Phase, Mark as Won, Mark as Lost |
| **Product** | Get, Get Many, Create, Update, Delete |
| **Quotation** | Get, Get Many, Create, Update, Accept, Delete, Send |
| **Invoice** | Get, Get Many, Create Draft, Update Draft, Update Booked, Book, Download, Send, Register Payment, Remove Payments, Credit Fully, Credit Partially |

Every operation above has automated request-contract coverage: its endpoint and its exact request
body are asserted in the test suite.

## How V2 is built

### Pickers, not UUIDs

Every reference to a Teamleader record is a resource locator with a searchable **From List** mode
and a **By ID** mode. **By ID** always accepts an expression, so automations never depend on the
dropdown. Where Teamleader offers no search this is stated in the field: the quotation picker says
*"Recent quotations; use By ID for older ones"* because `quotations.list` has no term filter, while
the invoice picker really does search server-side.

The only raw ID inputs left are the ones Teamleader gives this connector no lookup for: project IDs,
subscription IDs, attachment file IDs and sender IDs.

### The deal-driven invoice flow

`Invoice → Create Draft` defaults to **Customer Source = From Deal**. At run time the deal is read
once and supplies the invoicee and — unless you fill in **Department** yourself — the department.

Nothing is inferred silently. A deal without a customer, a deal without a department while no
department was chosen, or a missing contact person when you asked for one, each stop the run with a
message naming the record and the field to fill in.

Putting the deal's contact person on the invoice is opt-in through **For Attention Of**; it never
happens by itself.

### Product lines and hydration

A Teamleader Product line shows four things: **Product**, **Quantity**, **Use Product Defaults** and
**Line Options**. With defaults on, the product's description, price, tax rate, unit and (invoices)
product category are read **when the workflow runs** — n8n cannot fill editor fields reactively, and
this connector does not pretend otherwise.

Each distinct product is read once per node execution, no matter how many lines or items reference
it. Fill in a **Line Options** field to override just that value.

**The zero-price rule.** With **Use Product Defaults** on, a Unit Price of `0` means *use the
product's price*. To charge exactly `0.00`, turn **Use Product Defaults** off and enter every value
manually. This is the one place where a `0` is deliberately not taken literally, and the field says
so.

**Purchase price currency.** Teamleader requires a quotation line's purchase price in the *account*
currency, and the public API exposes no way to read that currency. When a product was hydrated, its
own purchase-price currency is used — including for a manually overridden amount. Only without a
product is the document currency used.

### Currency

The connector never converts money. When a product is priced in a different currency than the
document, the amount is used as written and a warning is attached to the node output — the request
body never carries it. Warnings appear as `_warnings` on the returned item, and only after
Teamleader has accepted the request.

### Line replacement safety

`Quotation → Update`, `Invoice → Update Draft` and `Invoice → Update Booked` each have a
**Replace Lines** switch, off by default.

- **Off**: no `grouped_lines` key is sent at all, no product is read, and the document keeps its
  current lines.
- **On**: Teamleader replaces *every* line with what you send. An empty editor is refused with
  *"Replace Lines is on but no lines were provided. This would empty the document."* rather than
  quietly emptying it.

The same explicitness applies to tags (**Replace Tags**), to the invoicee (**Change Invoicee**) and
to the deal's estimated value and the product prices (**Change …** switches), so an untouched field
never becomes an unintended mutation.

### Payment terms

`Invoice → Create Draft` offers **Teamleader Default**, **Select Payment Term** or **Custom Payment
Term**; the update operations add **Keep Current**, which is their default.

**Teamleader Default** uses the term the API itself reports as the account default
(`paymentTerms.list` → `meta.default`). If Teamleader reports no default, the run fails and asks you
to choose — the connector never picks the first term in the list, and never assumes 14 or 30 days.
A selected term that no longer exists fails the same way instead of being substituted.

### Send: recipients

Recipients come from exactly one source you choose, and there is no fallback to another one.

| | Sources |
| --- | --- |
| **Quotation → Send** | Deal Contact Person, Deal Customer, Custom Recipients |
| **Invoice → Send** | Teamleader Default, Invoice Customer, Custom Recipients |

Quotation Send resolves quotation → deal → the customer or contact person you picked, then that
record's primary e-mail. Invoice Send uses the invoicee e-mail from the invoice and only reads the
customer record when the invoice carries none. **Teamleader Default** on an invoice sends no
recipient list at all, which is what makes Teamleader use its own addresses.

If the chosen source has no usable e-mail address, the run fails naming that record.

### Three kinds of template, kept separate

| Concept | What it is | API support |
| --- | --- | --- |
| **Document Template** | The PDF layout / house style | `documentTemplates.list`, sent as `document_template_id` |
| **Document text** | The introduction text on a quotation, the note on an invoice | Plain text only |
| **Mail Template** | Subject and body of the e-mail when sending | `mailTemplates.list` |

**Teamleader's saved document text templates are not available through its public API.** The
Teamleader UI offers a template picker for the quotation introduction text
(*"Template begeleidende tekst"*), but the public API exposes no endpoint for those templates —
verified against the official API blueprint. `quotations.create` accepts only a resolved `text`
string and invoices only a plain `note`. This connector therefore does not offer a text-template
selector, and does not call undocumented internal endpoints to fake one. Paste or build the text in
the **Introduction Text** / **Note** field.

Mail templates behave differently per endpoint, and the connector follows each one:

- `invoices.send` accepts `mail_template_id`, so **Invoice → Send** uses the template natively.
- `quotations.send` does not, so **Quotation → Send** copies the template's subject and body into
  the message. Teamleader only replaces `#LINK` when sending a quotation; if the copied text
  contains other merge fields, the run reports them as a warning instead of implying they will be
  rendered.

### Credit Partially has no line picker

`invoices.info` returns invoice lines without a stable line identifier. A "pick the lines to credit"
convenience could only address lines by position, and a reordered or edited invoice would then
credit the wrong line. **Invoice → Credit Partially** therefore uses the explicit line editor only,
and says so in the operation.

### Dependent dropdowns and lookup context

Document templates, tax rates and product categories are filtered by department. On a quotation the
department is **lookup context only** — `quotations.create` has no department field, and Teamleader
takes the real one from the deal — so it is derived from the selected deal, or from
**Advanced Options → Lookup Department Override**, and is never sent.

When no department can be determined (an expression in the Deal field, or a deal that cannot be
read), the lists stay usable: every department's entries are offered with the department in the
label, instead of the dropdown going empty.

### Dates

Teamleader mixes date-only fields (`invoice_date`, `due_on`, `expires_after`, the book date) with
real timestamps (`paid_at`, `updated_since`). V2 looks every field up in a declared table instead of
truncating everything, so a timestamp filter keeps its time and a date field never shifts a day.

## Teamleader Trigger

Add the **Teamleader Trigger** node, choose which events start the workflow and activate it. On
activation the node registers n8n's production webhook URL with Teamleader (`webhooks.register`),
skipping registration when an equivalent one already exists. On deactivation it removes only the
registration belonging to that URL; other integrations' registrations are never touched.

Webhook handling stays deliberately lightweight: the incoming payload is emitted as-is plus
`eventType`, `entityType` and `entityId`. **No API call is made while handling an event.**

### Trigger event selection

- **Specific Events** — pick exactly the event types you want (the default).
- **Common Events** — the handful most automations use.
- **By Entity** — every event of the entities you choose, e.g. all deal events.
- **All Events** — every Teamleader event type. Expect a lot of traffic.

Teamleader publishes **no quotation webhook types**, and none are invented here.

**Workflows saved before Event Selection existed keep working unchanged.** Which events such a node
registers is read from its raw saved parameters, not from `getNodeParameter`, because that would
return the new field's default for a parameter the workflow never stored. Specific Events is the
default so reopening an old trigger also *shows* what it actually does.

> **Webhooks require a publicly reachable HTTPS n8n instance.** Teamleader calls the production
> webhook URL directly, so `localhost`, private IPs and tunnel-less local setups will not receive
> events. Test URLs are not registered — activate the workflow to receive live events.

## Known API limitations

- **No document text templates.** Teamleader's saved introduction-text templates are not exposed by
  the public API (see above).
- **No quotation webhooks.** Teamleader publishes no `quotation.*` event types.
- **No account currency endpoint.** The account's own currency cannot be read, which is why a
  hydrated product's purchase-price currency is used for quotation purchase prices.
- **No stable invoice line IDs**, so credit lines are entered explicitly.
- **`quotations.list` has no search filter**, so the quotation picker filters the page it loaded and
  says so. `quotations.list` also filters only on IDs.
- **`quotations.send` accepts no mail template ID**, unlike `invoices.send`.
- **Teamleader's own merge fields** in a copied quotation mail template are not rendered by the API;
  only `#LINK` is documented as replaced.
- **`invoices.updateBooked` accepts far fewer fields** than `invoices.update`. Currency, discounts,
  document template, purchase order number and expected payment method cannot be changed on a booked
  invoice, so V2 does not offer them there.
- **Quotation expiry** is only available on Teamleader plans that include it.

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript to dist/ and copy icons
npm run dev          # compile in watch mode
npm test             # run the Jest test suite
npm run test:watch   # run tests in watch mode
npm run lint         # eslint for nodes, credentials and package.json
npm run lintfix      # eslint with --fix
npm run format       # prettier
```

`npm run build`, `npm test` and `npm run lint` must all pass before a release.

### Node entrypoints

n8n's custom-extensions loader discovers nodes by globbing `**/*.node.js` on disk — it does not read
the `n8n` block of `package.json`. Only the two real entrypoints may therefore carry that suffix:

```
dist/nodes/Teamleader/Teamleader.node.js
dist/nodes/Teamleader/TeamleaderTrigger.node.js
```

The version implementations (`v1/TeamleaderV1.ts`, `v2/TeamleaderV2.ts`) are ordinary modules on
purpose: naming them `*.node.ts` made the loader construct them as standalone nodes and broke the
whole directory load. `test/packaging.test.ts` guards this.

### Tests

The suite uses mocked Teamleader responses with fabricated IDs; no account, token or customer data is
needed or stored. Alongside the per-resource suites it contains a contract matrix pinning every
operation's endpoint and request body, a static UX audit of every V2 field, and regression tests for
the packaging contract and the trigger's legacy parameter shape.

## License

MIT
