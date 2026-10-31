# Product event publisher

This CIS3039 example saves a Product and publishes a
`catalogue.product.upserted` CloudEvent to an Azure Event Grid custom topic.
The publisher runs **locally in the Dev Container**. Event Grid and the
separate subscriber run **in Azure**.

```text
HTTP POST/PUT /api/products
  → HTTP adapter → upsertProduct use case → fake Product repository
                                        → ProductEventPublisher port
                                          → Event Grid adapter → Azure topic
                                            → event subscription → subscriber
```

`src/domain/` holds the Product and repository port; `src/app/` holds use cases
and the publisher port; `src/infra/` implements those ports;
`src/config/composition-root.ts` connects them; and `src/functions/` handles HTTP.
The application assigns the event ID and occurrence time. The Event Grid
adapter maps that event to CloudEvents without assigning another ID.
The use case depends on the `ProductEventPublisher` port rather than the Azure
SDK, so the composition root can supply either the dummy or Event Grid adapter
without changing application logic.

The repository is an in-memory teaching fake: restarting the process loses its
products, and separate processes do not share state. It provides no concurrency
protection. This example implements neither a durable database nor an Outbox,
durable deduplication, dead-letter storage or guaranteed recovery. Subscriber
code lives in [cis3039-example-sub](https://github.com/tpdavison/cis3039-example-sub).

### Code map

| File or folder | Role |
| --- | --- |
| `src/domain/product.ts`, `src/domain/product-repo.ts` | Product model, factory and validation; repository port. |
| `src/app/list-products.ts`, `src/app/upsert-product.ts` | Application use cases; the upsert saves before publishing. |
| `src/app/product-event-publisher.ts` | Event publisher port and application event contract, independent of Azure. |
| `src/infra/fake-product-repo.ts`, `src/infra/dummy-product-event-publisher.ts` | Process-local storage and console-only publication for demonstrations. |
| `src/infra/eventgrid-product-event-publisher.ts` | Event Grid SDK adapter and CloudEvents mapping. |
| `src/config/composition-root.ts` | Hard-coded endpoint, required shell key and lazy dependency assembly. |
| `src/functions/` | HTTP adapters: request parsing, response mapping and function registration. |
| `samples/` | Product request and illustrative CloudEvent JSON. |
| `scripts/` | Domain, fake repository, dummy publisher and partial-failure demonstrations. |

## 1. Create your private repository and open the container

You need Git/GitHub access, VS Code with Dev Containers, Docker running, and
access to your course Azure subscription. Use your chosen permitted region
recorded in Week 1. You can run the local demonstrations without an Azure account.

Use the same history-preserving private-copy process as Weeks 4 and 5. Clone
this maintained example and open it in VS Code:

```sh
git clone https://github.com/tpdavison/cis3039-example-pub.git
cd cis3039-example-pub
code .
```

Choose **Dev Containers: Reopen in Container**. The configuration uses
`ghcr.io/tpdavison/devops-labs:2026-latest`, which supplies Node.js 22, npm,
Azure CLI and Azure Functions Core Tools 4. Core Tools comes from the base
container; do not install another copy through this project's npm dependencies.

Create an empty **private** repository named `cis3039-example-pub` in your
GitHub account, without a README, licence or `.gitignore`. In the container
terminal, replace `YOUR_GITHUB_USERNAME`, change `origin`, and inspect it:

```sh
git remote set-url origin https://github.com/YOUR_GITHUB_USERNAME/cis3039-example-pub.git
git remote -v
git branch --show-current
```

Confirm that the branch is `main` and both remote URLs point to your private
repository. Then push the existing history:

```sh
git push -u origin main
```

Keep that history; do not initialise another Git repository or create a public
fork. Run the remaining shell commands from the repository root in a **Bash
terminal inside the Dev Container**, including when your computer runs Windows.

## 2. Restore, compile and explore locally

Inspect the installed versions, then restore the committed lockfile:

```sh
pwd
node --version
npm --version
func --version
az version
npm ci
npm run typecheck
npm run build
```

Expect Node.js `22.x` and Core Tools `4.x`. `typecheck` checks TypeScript without
writing output; `build` compiles `src/` and `scripts/` into `dist/`.
Successful compilation checks types and produces JavaScript; it does not prove
that the HTTP host or Azure integration works.

Run the demonstrations:

```sh
npm run demo:domain
npm run demo:list
npm run demo:upsert
npm run demo:failure
```

### Command summary

| Command | Purpose and expected result | Azure required? |
| --- | --- | --- |
| `npm ci` | Restore the committed dependency versions. | No; package download access is needed. |
| `npm run typecheck` | Check TypeScript without emitting files; exit 0 on success. | No. |
| `npm run build` | Compile source and scripts into `dist/`; exit 0 on success. | No. |
| `npm run demo:domain` | Show a valid Product and validation issues for invalid domain values. | No. |
| `npm run demo:list` | Show an initially empty fake, a saved Product, lookups and a stored date protected from mutation through a returned object. | No. |
| `npm run demo:upsert` | Show a saved Product, dummy `accepted` result and a list using the same fake; no Event Grid call. | No. |
| `npm run demo:failure` | Simulate a publication exception; show `unconfirmed` and a Product that remains saved. | No. |
| `npm start` | Clean/build and start the local HTTP Functions host. | GET is local; live publication needs a topic and exported key. |
| `npm test` | Print the placeholder message and exit with status 1. | No; it does not run an automated test suite. |

Each demonstration runs in its own process. They do not share products with
each other or the HTTP host, invoke the HTTP handlers, or prove Azure delivery.
They illustrate selected domain and use-case behaviour, rather than providing
comprehensive testing. `npm test` is currently an unsuccessful placeholder,
not an automated test suite. HTTP responses, publication acceptance and
subscriber observations provide separate evidence in the later steps.

## 3. Select Azure resources and create a topic

Sign in with Azure CLI. For a container terminal, device-code sign-in opens a
flow you complete in your computer's browser:

```sh
az login --use-device-code
az account list --query '[].{name:name,id:id,isDefault:isDefault}' --output table
```

Define the non-secret values below once in your Bash terminal. Replace every
`YOUR_...` placeholder. Choose names for a disposable Week 6 resource group,
a globally unique topic and subscriber Function App, and an event subscription.
Use the subscription intended for your course work and your chosen permitted
region. The subscriber can use a different resource group if you record that
group in `SUBSCRIBER_RG`.

```sh
SUBSCRIPTION_ID='YOUR_SUBSCRIPTION_ID'
REGION='YOUR_CHOSEN_PERMITTED_REGION'
RESOURCE_GROUP='week6-YOUR_UID-rg'
TOPIC_NAME='catalogue-YOUR_UID-topic'
EVENT_SUBSCRIPTION_NAME='catalogue-products-sub'
SUBSCRIBER_RG="$RESOURCE_GROUP"
SUBSCRIBER_APP='catalogue-YOUR_UID-sub'
SUBSCRIBER_FUNCTION='productUpsertedEventGrid'

az account set --subscription "$SUBSCRIPTION_ID"
az account show --query '{name:name,id:id,tenantId:tenantId}' --output table
```

Check the account before creating resources. Keep a note of these names and IDs;
if you open a new terminal, define the variables there again. Do not assume
resources from a previous week still exist.

Create the resource group and a **Basic custom Event Grid topic** with CloudEvents
1.0 input. This is an Event Grid topic, rather than an Event Grid namespace or
system topic:

```sh
az group create --name "$RESOURCE_GROUP" --location "$REGION" --output none
az eventgrid topic create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$TOPIC_NAME" \
  --location "$REGION" \
  --input-schema cloudeventschemav1_0 \
  --output none

az eventgrid topic show \
  --resource-group "$RESOURCE_GROUP" --name "$TOPIC_NAME" \
  --query '{id:id,endpoint:endpoint,inputSchema:inputSchema,location:location,provisioningState:provisioningState}' \
  --output json
```

Check that provisioning succeeded, the location is your permitted region and
`inputSchema` is `CloudEventSchemaV1_0`. Record the actual endpoint and resource
ID. The topic provides the publishing endpoint; the event subscription created
later routes events to a receiver. See Microsoft's
[topic CLI reference](https://learn.microsoft.com/en-us/cli/azure/eventgrid/topic?view=azure-cli-latest).

Alternatively, in the Azure portal create an **Event Grid Topic**, choose the
same subscription, group, name and region, **Basic** tier and **Cloud Event
Schema v1.0** input schema. Inspect its overview and JSON view to confirm the
same values. Use either creation route, once.

## 4. Configure the local publisher

Create the ignored settings file for non-secret Functions host settings:

```sh
cp local.settings.template.json local.settings.json
git check-ignore local.settings.json
```

The template contains only non-secret host settings. If you previously added
an `EVENTGRID_KEY` entry to `local.settings.json`, remove it. Keep the file
limited to the non-secret host settings:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node"
  },
  "ConnectionStrings": {}
}
```

In the Bash terminal you will use to start the publisher, retrieve and export
the topic's key without displaying it:

```sh
export EVENTGRID_KEY="$(az eventgrid topic key list \
  --resource-group "$RESOURCE_GROUP" \
  --name "$TOPIC_NAME" \
  --query key1 --output tsv)"

test -n "$EVENTGRID_KEY" && echo "Key configured"
```

Expect `Key configured`. If retrieval fails or the variable is empty, resolve
the CLI error before starting the host; your Azure identity needs permission
to list topic keys. A non-empty value alone does not prove successful publication.
See the [topic key CLI reference](https://learn.microsoft.com/en-us/cli/azure/eventgrid/topic/key?view=azure-cli-latest).

The key is a secret: do not print it, enable shell tracing during retrieval,
commit it, or copy it into TypeScript, settings files, screenshots or notes.
The key and endpoint must belong to the same topic. The publisher reads
`process.env.EVENTGRID_KEY` inherited from the shell; keep that key out of
`local.settings.json`, including blank entries, to maintain one credential source.

The export belongs to the **current shell session** and processes started from
it. Run `npm start` in that terminal. A new terminal or reopened container needs
the retrieval/export repeated, with the resource variables from section 3 set
again. Restart an existing host after changing its environment.

In `src/config/composition-root.ts`, replace the example URL assigned to
`EVENTGRID_ENDPOINT` with the exact endpoint returned by Azure. This example
deliberately keeps non-secret endpoints hard-coded, as in the Week 4 Cosmos
example. Do not put the key in TypeScript or in the tracked settings template.
You may apply the configuration externalisation approach taught in Week 5 to
the endpoint, but that is not an additional required exercise here.

The publisher has only HTTP triggers and no Azure Storage bindings. Its local
settings omit `AzureWebJobsStorage`; no local Azurite setup is needed for these
HTTP operations. A storage-related host warning does not establish readiness
for storage triggers. The subscriber's deployed Function App has separate
hosting-storage requirements. See Microsoft's
[local settings guidance](https://learn.microsoft.com/en-us/azure/azure-functions/functions-develop-local).

## 5. Start the local Functions host

From the publisher root, in the **same terminal where you exported
`EVENTGRID_KEY`**:

```sh
npm start
```

`prestart` cleans and builds before `func start --typescript`. Leave this
terminal running. Look for the registered functions and local routes:

| Function | Methods | Default URL |
| --- | --- | --- |
| `listProductsHttp` | GET | `http://localhost:7071/api/products` |
| `upsertProductHttp` | POST, PUT | `http://localhost:7071/api/products` |

Host startup and route discovery show that Functions loaded the HTTP adapters.
They do not prove that a request succeeds or an event reaches Azure.

Use the address printed by your host if you change the port. Press **Ctrl+C**
to stop it. After changing the endpoint, host settings or exported key, stop
and run `npm start` again from the configured shell. If using a new terminal,
export the key again first. A restart empties the fake repository.

## 6. Save a Product and interpret the response

Open a second Bash terminal in the publisher root for requests. It does not
need the key: the running host inherits it from the first terminal. List the
initial state:

```sh
curl -i http://localhost:7071/api/products
```

Expect HTTP 200 and a JSON array, initially `[]` in a fresh worker. Submit the
provided sample:

```sh
curl -i -X POST http://localhost:7071/api/products \
  -H 'Content-Type: application/json' \
  --data-binary @samples/product-post.json

curl -i http://localhost:7071/api/products
```

PUT uses the same route and body. Both operations upsert by Product ID. The
sample uses `prod-12345`; `pricePence: 7999` means £79.99. The ID, name and
description must be non-empty strings; the price must be a non-negative safe
integer (at most `Number.MAX_SAFE_INTEGER`).
The application supplies timestamps and the event ID.

With successful save and publication, the response has this shape. The timestamp
and event ID below are illustrative; record the values from your own response:

```json
{
  "product": {
    "id": "prod-12345",
    "name": "Premium Wireless Headphones",
    "pricePence": 7999,
    "description": "Wireless headphones",
    "updatedAt": "2026-10-28T11:00:00.000Z"
  },
  "publication": {
    "status": "accepted",
    "eventId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

| HTTP result | Meaning |
| --- | --- |
| 400 with `issues` | Invalid JSON, field types or domain values; no save or publication. Invalid input is rejected before requiring an Event Grid key. |
| 500 with `error` | An unexpected configuration, storage or other operational failure. A missing shell key on a valid request fails before saving. Inspect the host's safe stage/category logs. |
| 200 with `publication.status: "accepted"` | The Product was saved and the live adapter reported Event Grid acceptance. This does **not** prove subscriber delivery or application processing. |
| 200 with `publication.status: "unconfirmed"` and `warning` | The Product was saved, but publication threw or timed out. Event Grid might still have accepted the event. |

The warning says: “Product saved; publication is unconfirmed. Do not
automatically repeat the write. Inspect saved state and downstream evidence.”
Use GET to inspect current local state, then correlate the event ID with the
subscriber. Repeating a write is a new operation that generates a new event ID,
even when the Product ID stays the same.

These commands use container Bash on all host platforms. If sending a request
from Windows PowerShell instead, use `curl.exe` and quote the file argument:

```powershell
curl.exe -i -X POST http://localhost:7071/api/products -H "Content-Type: application/json" --data-binary "@samples/product-post.json"
```

## 7. Deploy a subscriber and connect the topic

Use [cis3039-example-sub](https://github.com/tpdavison/cis3039-example-sub) as
the companion receiver. Create a private copy using the process in section 1,
substituting `cis3039-example-sub` for the repository name, and open that copy
in its own VS Code Dev Container window.

The receiver must accept this contract; use
`samples/product-upserted.cloudevent.json` in the publisher as a readable example:

| Field | Value |
| --- | --- |
| `specversion` | `1.0` |
| `type` | `catalogue.product.upserted` |
| `source` | `/services/catalogue` |
| `subject` | `products/{productId}` |
| `id` | The HTTP response's `publication.eventId` |
| `data.productId` | The saved Product's `id` |
| `time`, `data.updatedAt` | ISO timestamp strings on the wire |
| Other `data` fields | `name`, `pricePence`, `description` |

The SDK supplies `specversion` and serialises the event time. A fixture illustrates
the contract; use the received event to inspect what was actually delivered.

If you already have a deployed subscriber, confirm its subscription, resource
group and function name. Otherwise, provision it in the Azure portal:

1. Create a **Function App** using **Consumption**, Linux, Node.js 22 and your
   chosen permitted region, in the intended subscription and resource group.
   Use the unique name recorded as `SUBSCRIBER_APP`.
2. Create its hosting Storage account when prompted, and enable Application
   Insights with a Log Analytics workspace so you can observe invocations.
   Record all created resources. These support the subscriber; the publisher
   continues running locally.
3. In the subscriber's container terminal, sign in to Azure CLI, select the
   same intended subscription, and restore/build/publish from **the subscriber
   root**, replacing `YOUR_SUBSCRIBER_APP_NAME`:

   ```sh
   npm ci
   npm run clean
   npm run build
   func azure functionapp publish YOUR_SUBSCRIBER_APP_NAME --no-build
   ```

4. In the portal, open the deployed Function App and confirm its Event Grid
   trigger appears in **Functions**. Record that actual registered name in
   `SUBSCRIBER_FUNCTION` in the publisher terminal. Configure any application
   settings required by the subscriber in its Azure Function App; publishing
   code does not copy local settings. The topic publishing key belongs to the
   local publisher and is not needed to receive events.

Microsoft documents [Function App creation](https://learn.microsoft.com/en-us/azure/azure-functions/functions-create-function-app-portal?pivots=programming-language-javascript)
and [TypeScript deployment](https://learn.microsoft.com/en-us/azure/azure-functions/typescript-build-options).

Back in the **publisher** terminal with your resource variables, inspect the
deployed function names and confirm `SUBSCRIBER_FUNCTION`. The companion
registers `productUpsertedEventGrid`; if your deployed registration differs,
set the variable to that actual name. A function registration name is separate
from the event type `catalogue.product.upserted`:

```sh
az functionapp function list \
  --resource-group "$SUBSCRIBER_RG" --name "$SUBSCRIBER_APP" \
  --query '[].name' --output tsv

TOPIC_ID=$(az eventgrid topic show \
  --resource-group "$RESOURCE_GROUP" --name "$TOPIC_NAME" --query id --output tsv)
SUBSCRIBER_APP_ID=$(az functionapp show \
  --resource-group "$SUBSCRIBER_RG" --name "$SUBSCRIBER_APP" --query id --output tsv)
```

Use just the function name in `SUBSCRIBER_FUNCTION`, without an `app-name/`
prefix. Confirm that both resource IDs identify the intended resources before
creating the subscription:

```sh
az eventgrid event-subscription create \
  --name "$EVENT_SUBSCRIPTION_NAME" \
  --source-resource-id "$TOPIC_ID" \
  --endpoint-type azurefunction \
  --endpoint "$SUBSCRIBER_APP_ID/functions/$SUBSCRIBER_FUNCTION" \
  --event-delivery-schema cloudeventschemav1_0 \
  --included-event-types catalogue.product.upserted \
  --subject-begins-with products/ \
  --output none

az eventgrid event-subscription show \
  --name "$EVENT_SUBSCRIPTION_NAME" --source-resource-id "$TOPIC_ID" \
  --query '{state:provisioningState,schema:eventDeliverySchema,destination:destination,filter:filter}' \
  --output json
```

Check successful provisioning, CloudEvents delivery, the function resource ID
and the event-type/subject filters. Alternatively, use **your topic → Event
Subscriptions → + Event Subscription** in the portal: select CloudEvents 1.0
delivery, the `catalogue.product.upserted` type, subject prefix `products/`, and
**Azure Function** as destination; choose your deployed function. Use either
subscription-creation route, once. CloudEvents input requires CloudEvents
delivery; see [CloudEvents with Event Grid](https://learn.microsoft.com/en-us/azure/event-grid/cloud-event-schema)
and the [event subscription CLI reference](https://learn.microsoft.com/en-us/cli/azure/eventgrid/event-subscription?view=azure-cli-latest).

## 8. Observe delivery and the subscriber outcome

Create the subscription **before** sending the Product whose delivery you want
to observe. Return to the local publisher, send the POST from section 6, and
record its actual `publication.eventId`, Product ID and timestamp.

In the Azure portal, open the subscriber's Event Grid function, then its
**Monitor** view and invocation details. Use the linked Application Insights
resource's **Logs** to search the event ID, for example:

```kusto
traces
| where timestamp > ago(30m)
| where message contains "PASTE_THE_ACTUAL_EVENT_ID_HERE"
| project timestamp, message, operation_Id
| order by timestamp desc
```

Allow time for telemetry to arrive and adjust the time range if necessary.
Match the received `id`, `type`, `source`, `subject` and `data.productId` against
the publisher response and contract. A handler that only logs the envelope
demonstrates receipt; it does not demonstrate a business effect. To establish
application processing when a receiver invokes a use case, inspect its reported
outcome or resulting state. Claim only the behaviour you observe; a successful
invocation alone does not establish that outcome.
Microsoft's
[monitoring guidance](https://learn.microsoft.com/en-us/azure/azure-functions/functions-monitoring)
explains invocation and Application Insights views.

Inspect the Event Grid topic's **Metrics** for published events, matched events
and delivery failures, selecting a time range that includes your POST. Metrics
support investigation; aggregate counts do not correlate an individual event
as precisely as its ID. Publisher acceptance, delivery and application processing
are separate observations. This journey does not establish ordering, duplicate
prevention or durable recovery.

## 9. Explore partial failure

```sh
npm run demo:failure
```

The demonstration uses a fake repository and a publisher that deliberately
throws. It shows that the Product stays saved and publication is `unconfirmed`.
It does not create a live Event Grid outage or invoke the HTTP handler. The
handler maps this use-case result to HTTP 200 with the warning described above.

The use case saves first, then publishes. A process crash between these steps
can leave a Product without a published event. A network timeout can leave the
sender uncertain even if Event Grid accepted the event. SDK retries for the
same application event retain its ID; a new client upsert generates a new ID.
Do not automatically repeat the original HTTP write to resolve that uncertainty.

An Outbox would durably record the state change and pending event together,
then arrange publication separately. This example does not implement it, and
the fake repository cannot provide durable recovery.

## 10. Troubleshooting

| Symptom | What to inspect |
| --- | --- |
| `func` not found | Reopen in the course Dev Container and check `func --version`. Use the container's Core Tools installation. |
| Compilation fails or functions are absent | Check Node 22, run `npm ci` and `npm run build` in the correct root, and confirm `dist/src/functions/*.js` exists. Read the host's startup errors. |
| Missing shell key; valid POST returns 500 | Stop the host, retrieve/export the key in that terminal (section 4), then restart there. Remove any key entry from `local.settings.json`. |
| Other HTTP 500 or host configuration error | Check that ignored `local.settings.json` exists and `FUNCTIONS_WORKER_RUNTIME` is `node`. Inspect the host's safe stage/category logs; restart after configuration changes. |
| POST returns 400 | Read `issues`; check JSON, strings and non-negative safe integer pence. No Product is saved for invalid input. |
| 200 with `unconfirmed`; incorrect endpoint or rejected key | Check the code URL against the topic endpoint; re-export its key and restart. Check schema, key authentication and network access. Inspect saved state and subscriber evidence. |
| Local route cannot be reached | Keep the host running, check its printed address/port, VS Code port forwarding and whether another host occupies port 7071. |
| GET loses products | Restarting the worker clears the fake. Separate workers and demo processes do not share it. |
| Azure creation or lookup fails | Check `az account show`, resource names, your chosen permitted region and subscription permissions. If provider registration is requested, follow the course subscription's permitted process. |
| Subscriber receives nothing | Check it is deployed and reachable in Azure, the event subscription succeeded before the POST, its destination/function name is correct, and schema/type/subject filters match. Inspect topic delivery failures and subscriber invocation errors. |
| No correlated log yet | Check Application Insights is connected, the correct resource and time range are selected, and allow for log ingestion delay. An HTTP 200 from the publisher does not prove subscriber delivery. |

## 11. Security and safe completion

The anonymous local HTTP routes are a teaching simplification. They do not
provide production client authentication. Keep the topic key secret and rotate
it in the topic's **Access keys** view if exposed. Repeat section 4's key
retrieval/export to obtain the replacement key, then restart the host from that
shell. Do not commit `local.settings.json` or deploy the local publisher merely
to make the demonstration work.

Stop the host with **Ctrl+C**, then remove the key from its Bash session:

```sh
unset EVENTGRID_KEY
```

Save and push your code to your private repository before cloud cleanup.
Check that no credentials or local settings are staged. Retain non-secret notes:
resource names/IDs, region, topic schema/endpoint, event subscription filters,
event ID, Product ID, HTTP result and observed subscriber outcome. Avoid
unnecessary personal data in sample events or logs. Azure topics, Functions,
Storage and monitoring can incur charges; stopping a local process does not
delete cloud resources.

Before cleanup, confirm the active subscription and inspect the exact resources:

```sh
az account show --query '{name:name,id:id}' --output table
az resource list --resource-group "$RESOURCE_GROUP" \
  --query '[].{name:name,type:type,location:location}' --output table
az eventgrid event-subscription show \
  --name "$EVENT_SUBSCRIPTION_NAME" --source-resource-id "$TOPIC_ID" \
  --query '{id:id,state:provisioningState}' --output json
```

To remove only this event subscription and disposable topic, after checking
their IDs:

```sh
az eventgrid event-subscription delete \
  --name "$EVENT_SUBSCRIPTION_NAME" --source-resource-id "$TOPIC_ID"
az eventgrid event-subscription list --source-resource-id "$TOPIC_ID" \
  --query '[].name' --output tsv
az eventgrid topic delete --resource-group "$RESOURCE_GROUP" --name "$TOPIC_NAME"
az eventgrid topic list --resource-group "$RESOURCE_GROUP" \
  --query '[].name' --output tsv
```

After deleting the event subscription, its name should be absent from the first
list. After deleting the topic, its name should be absent from the second list;
unrelated topics should remain. Do not treat an authentication or lookup error
as evidence of deletion.

Deleting only the topic and event subscription does **not** delete the
subscriber Function App, its Storage account or monitoring resources.
If the subscriber is in a separate group, inspect that group as well:

```sh
az group show --name "$SUBSCRIBER_RG" \
  --query '{name:name,id:id,location:location}' --output table
az resource list --resource-group "$SUBSCRIBER_RG" \
  --query '[].{name:name,type:type,location:location}' --output table
```

Retain assessment, shared and unrelated resources. If the separate group is
entirely disposable and belongs to this exercise, use the same group-deletion
and existence checks below with `"$SUBSCRIBER_RG"` in place of
`"$RESOURCE_GROUP"`. Otherwise, select only your disposable subscriber resources
in the portal and verify those exact resources disappear; ask your tutor if
ownership or dependencies are unclear. Include separately recorded Storage
and monitoring resources in that inspection.

Only if the entire resource group is disposable, belongs to this exercise, and
every resource listed can be removed, delete it instead:

```sh
az group delete --name "$RESOURCE_GROUP"
```

Read the confirmation before accepting. Deleting a resource group removes **all**
its resources, including any subscriber, Storage and monitoring it contains;
never delete a shared or assessment resource group. Once deletion finishes:

```sh
az group exists --name "$RESOURCE_GROUP"
```

Expect `false`. If the group still exists, inspect deletion status and resolve
the failure. Keep your code and non-secret notes; do not send another Product
request as a cleanup check. Future cloud work requires a configured target and
a fresh key export. See Microsoft's
[resource group deletion reference](https://learn.microsoft.com/en-us/cli/azure/group?view=azure-cli-latest#az-group-delete).
