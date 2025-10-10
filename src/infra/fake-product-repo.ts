import type { Product } from '../domain/product';
import type { ProductRepo } from '../domain/product-repo';

// Deep copy a product, including the updatedAt date. This is important because
// the repo is in-memory and we don't want to return references to stored
// products, which would allow external code to mutate them. We need to clone
// the date so changing an input or returned product cannot change stored data.
const cloneProduct = (product: Product): Product => ({
  ...product,
  updatedAt: new Date(product.updatedAt.getTime()),
});

/**
 * Fake in-memory implementation of ProductRepo for tests and local dev.
 * State is lost on restart and is not shared across processes or instances.
 * Provides no concurrency protection, deduplication or ordering policy.
 */
export class FakeProductRepo implements ProductRepo {
  private readonly store = new Map<string, Product>();

  constructor(initial: readonly Product[] = []) {
    for (const p of initial) this.store.set(p.id, cloneProduct(p));
  }

  async getById(id: string): Promise<Product | null> {
    const found = this.store.get(id) ?? null;
    return found ? cloneProduct(found) : null;
  }

  async list(): Promise<readonly Product[]> {
    return Array.from(this.store.values()).map(cloneProduct);
  }

  async save(product: Product): Promise<Product> {
    // upsert semantics: store the product, return the saved copy
    const toStore = cloneProduct(product);
    this.store.set(toStore.id, toStore);
    return cloneProduct(toStore);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
