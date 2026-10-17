// The composition root connects concrete infrastructure adapters to application
// use cases, keeping configuration and construction out of business logic.
import type { ListProductsDeps } from '../app/list-products';
import type { ProductRepo } from '../domain/product-repo';
import { FakeProductRepo } from '../infra/fake-product-repo';

let cachedProductRepo: ProductRepo | null = null;

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
