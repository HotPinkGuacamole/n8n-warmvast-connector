# n8n-nodes-teamleader-warmvast

A private [n8n](https://n8n.io) community node package for **Teamleader Focus**, built on the official
[Teamleader Focus API](https://developer.focus.teamleader.eu/).

- OAuth2 credential (`Teamleader OAuth2 API`)
- One action node (`Teamleader`) with a Resource / Operation UI
- Reusable, typed API request helper with automatic pagination, retries and n8n-native error handling
- Dynamic dropdowns (`loadOptions`) and searchable resource locators (`listSearch`) — no hardcoded UUIDs anywhere
- Expressions work in every user input field

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Package architecture, OAuth2 credential, API helper, **Contact**, **Company** | Implemented, built and tested |
| 2 | **Deal**, **Quotation**, **Invoice**, **Product** | Planned |
| 3 | **Teamleader Trigger** node (webhooks) | Planned |

## Implemented resources

### Contact
`Get`, `Get Many` (list/search with filters, sorting and pagination), `Create`, `Update`, `Delete`,
`Tag`, `Untag`, `Link to Company`, `Unlink from Company`.

### Company
`Get`, `Get Many`, `Create`, `Update`, `Delete`, `Tag`, `Untag`.

Both resources support addresses, emails, telephones, tags and custom fields, and can optionally
include custom field values in read operations (`includes=custom_fields`).

## Requirements

- Self-hosted n8n (community nodes are not available on n8n Cloud for private packages)
- Node.js 20.15 or newer
- A Teamleader Focus integration registered on the
  [Teamleader Marketplace build page](https://marketplace.focus.teamleader.eu/build)

## Installation on self-hosted n8n

### Option A — Install from the n8n UI (recommended)

1. Publish the package to npm (or a private registry).
2. In n8n, go to **Settings → Community nodes → Install a community node**.
3. Enter `n8n-nodes-teamleader-warmvast` and confirm.
4. Restart n8n if prompted.

### Option B — Install into the n8n user folder

```bash
cd ~/.n8n
mkdir -p nodes && cd nodes
npm install n8n-nodes-teamleader-warmvast
# then restart n8n
```

### Option C — Local development / linking (no npm publish)

```bash
git clone <this-repo> n8n-nodes-teamleader-warmvast
cd n8n-nodes-teamleader-warmvast
npm install
npm run build
npm link

# in the n8n custom nodes folder
mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes
npm init -y            # only the first time
npm link n8n-nodes-teamleader-warmvast

# restart n8n
n8n start
```

### Option D — Docker

Mount a folder containing the built package into the n8n custom extensions directory:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    environment:
      - N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom
    volumes:
      - ./n8n-nodes-teamleader-warmvast:/home/node/.n8n/custom/n8n-nodes-teamleader-warmvast
```

Only the `dist` folder and `package.json` are required at runtime.

## Credential setup

1. Create an integration on <https://marketplace.focus.teamleader.eu/build>.
2. Add the n8n OAuth callback URL (shown in the credential dialog, typically
   `https://<your-n8n-host>/rest/oauth2-credential/callback`) as an allowed redirect URI.
3. Select every scope your workflows need (contacts, companies, deals, invoices, products, …).
4. In n8n, create a **Teamleader OAuth2 API** credential and fill in the `Client ID` and
   `Client Secret` from your integration, then click **Connect**.

The credential is preconfigured with:

| Field | Value |
| --- | --- |
| Authorization URL | `https://focus.teamleader.eu/oauth2/authorize` |
| Access Token URL | `https://focus.teamleader.eu/oauth2/access_token` |
| API Base URL | `https://api.focus.teamleader.eu` |

Access tokens expire after one hour; n8n refreshes them automatically with the stored refresh token.

## Architecture

```
credentials/
  TeamleaderOAuth2Api.credentials.ts   OAuth2 authorization-code credential
nodes/Teamleader/
  Teamleader.node.ts                   Node description + execute() dispatcher
  actions/
    contact.ts                         Contact operations + payload/filter builders
    company.ts                         Company operations + payload/filter builders
  descriptions/
    SharedFields.ts                    Reusable UI field factories
    ContactDescription.ts              Contact resource UI
    CompanyDescription.ts              Company resource UI
  helpers/
    GenericFunctions.ts                teamleaderApiRequest / ...AllItems / fetchList
    interfaces.ts                      Typed API interfaces
    utils.ts                           Pure transformation helpers (unit tested)
  methods/
    loadOptions.ts                     Dynamic dropdowns
    listSearch.ts                      Searchable resource locators
test/                                  Jest tests for the helper and transformations
```

### API helper

Every Teamleader endpoint is an RPC-style `POST /{resource}.{action}` with a JSON body.

- `teamleaderApiRequest(endpoint, body)` — one authenticated call, returns the full `{ data, meta }` envelope.
  Empty `204` responses are normalised to `{}`.
- `teamleaderApiRequestAllItems(endpoint, body, limit?)` — pages through a `*.list` endpoint using
  `page: { size, number }` (size clamped to the API maximum of 100) until a short page is returned
  or the limit is reached.
- `teamleaderFetchList(endpoint, itemIndex, body)` — honours the node's `Return All` / `Limit` parameters.

Failures are wrapped in `NodeApiError` with the Teamleader `errors[].title` / `detail` message.
`429`, `502`, `503` and `504` responses are retried up to three times with exponential backoff, so
the API's sliding-window rate limit does not break a workflow.

### Dynamic options

`loadOptions` methods are available for departments, users, deal pipelines, deal phases (scoped to
the selected pipeline), deal sources, lost reasons, tax rates (scoped to the selected department),
payment terms, withholding tax rates, payment methods, business types, product categories, units of
measure, work types, currencies, invoice/quotation document templates (scoped to department), mail
templates, tags and custom field definitions.

`listSearch` methods back searchable resource locators for contacts, companies, deals, products,
invoices and quotations. Every resource locator also accepts a raw ID, so expressions such as
`{{ $json.company_id }}` work everywhere.

## Development

```bash
npm install       # install dependencies
npm run build     # type-check, compile to dist/ and copy icons
npm run dev       # tsc --watch
npm run lint      # eslint (n8n community node rules) for nodes, credentials and package.json
npm run lintfix   # autofix lint issues
npm test          # jest unit tests
npm run format    # prettier
```

## Testing

Unit tests cover:

- `teamleaderApiRequest`: request shaping (method, URL, body, credential), custom base URL,
  `204` handling, error wrapping and rate-limit retry behaviour.
- `teamleaderApiRequestAllItems`: multi-page traversal, limit handling, filter/sort preservation,
  single-object responses.
- Pure transformations: pagination clamping, sort mapping, emails/telephones/addresses/custom
  fields builders, money construction, error formatting, contact and company payload/filter mapping.

Run them with `npm test`.

## License

MIT
