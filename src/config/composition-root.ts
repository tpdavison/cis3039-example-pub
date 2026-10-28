// The composition root connects concrete infrastructure adapters to application
// use cases, keeping configuration and construction out of business logic.
import type { ListProductsDeps } from '../app/list-products';
import type { UpsertProductDeps } from '../app/upsert-product';
import type { ProductRepo } from '../domain/product-repo';
import { FakeProductRepo } from '../infra/fake-product-repo';
import { randomUUID } from 'node:crypto';
import type { ProductEventPublisher } from '../app/product-event-publisher';
import { EventGridProductEventPublisher } from '../infra/eventgrid-product-event-publisher';

// Deliberately hard-coded non-secret configuration: externalise using Week 5 techniques.
const EVENTGRID_ENDPOINT = 'https://example.eventgrid.azure.net/api/events';

let cachedProductRepo: ProductRepo | null = null;
let cachedProductEventPublisher: ProductEventPublisher | null = null;

// Lazily construct one fake per process; importing this module creates no client.
export const getProductRepo = (): ProductRepo => {
  if (!cachedProductRepo) {
    cachedProductRepo = new FakeProductRepo();
  }
  return cachedProductRepo;
};

export const createListProductsDeps = (): ListProductsDeps => ({
  productRepo: getProductRepo(),
});

export const createUpsertProductDeps = (): UpsertProductDeps => ({
  productRepo: getProductRepo(),
  now: () => new Date(),
  generateEventId: randomUUID,
  // The use case reads this dependency after domain validation, before saving.
  get productEventPublisher() {
    return getProductEventPublisher();
  },
});

export const getProductEventPublisher = (): ProductEventPublisher => {
  if (!cachedProductEventPublisher) {
    const key = process.env.EVENTGRID_KEY;
    if (!key || key.trim() === '') {
      throw new Error(
        'EVENTGRID_KEY must be set to a non-empty topic access key',
      );
    }
    cachedProductEventPublisher = new EventGridProductEventPublisher({
      endpoint: EVENTGRID_ENDPOINT,
      key,
    });
  }
  return cachedProductEventPublisher;
};
