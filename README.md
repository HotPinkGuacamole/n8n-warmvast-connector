# n8n-nodes-teamleader-warmvast

An n8n community node package for [Teamleader Focus](https://www.teamleader.eu/), built on the
official Teamleader Focus API (`https://api.focus.teamleader.eu`).

The package ships two nodes:

- **Teamleader** — an action node for Contacts, Companies, Deals, Products, Quotations and Invoices.
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

## Supported resources and operations

| Resource | Operations |
| --- | --- |
| **Contact** | Get, Get Many, Create, Update, Delete, Tag, Untag, Link to Company, Unlink From Company |
| **Company** | Get, Get Many, Create, Update, Delete, Tag, Untag |
| **Deal** | Get, Get Many, Create, Update, Change Phase, Mark as Won, Mark as Lost |
| **Product** | Get, Get Many, Create, Update, Delete |
| **Quotation** | Get, Get Many, Create, Update, Delete, Send, Accept |
| **Invoice** | Get, Get Many, Create Draft, Update Draft, Update Booked, Book, Send, Register Payment, Remove Payments, Download, Credit Fully, Credit Partially |

Highlights:

- Searchable dropdowns for contacts, companies, deals, products, quotations and invoices, each with
  a **By ID** mode so raw IDs and expressions keep working.
- Dynamic option lists for departments, users, tax rates, withholding tax rates, product categories,
  units of measure, price lists, payment terms, payment methods, deal pipelines/phases, deal sources,
  lost reasons, document templates, mail templates, currencies, tags and custom field definitions.
- Grouped line items for Quotations and Invoices via nested fixed collections, with optional product
  links, unit of measure, tax rate, discounts and (invoices) product category and withholding tax.
- Automatic pagination (**Return All** / **Limit**), retries on rate limiting and transient errors,
  and Teamleader API errors surfaced as readable n8n errors.
- Empty optional fields are omitted from every request body.
- **Invoice → Download** returns real n8n binary data (PDF, UBL e-FFF, UBL Peppol BIS 3) in a
  configurable output field.

## Teamleader Trigger

Add the **Teamleader Trigger** node, select one or more event types and activate the workflow. On
activation the node registers n8n's production webhook URL with Teamleader
(`webhooks.register`), skipping registration when an equivalent one already exists. On deactivation
it removes only the registration belonging to that URL (`webhooks.unregister`); registrations of
other integrations are never touched.

Supported event groups (official Teamleader webhook types only): account, call, company, contact,
credit note, deal, invoice, meeting, milestone, product, project (legacy and new), project task,
subscription, task, ticket, ticket message, time tracking and user. Teamleader currently publishes
no quotation webhooks.

Each event is emitted as a normal n8n item containing the raw Teamleader payload plus `eventType`,
`entityType` and `entityId` for convenient routing.

> **Webhooks require a publicly reachable HTTPS n8n instance.** Teamleader calls the production
> webhook URL directly, so `localhost`, private IPs and tunnel-less local setups will not receive
> events. Test URLs are not registered — activate the workflow to receive live events.

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

Before releasing, `npm run build`, `npm test` and `npm run lint` must all pass.

## License

MIT
