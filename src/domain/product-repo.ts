import type { Product } from './product';

/**
 * Repository contract for the Product example.
 * Implementations reject promises on storage, authentication or network failures.
 * The operations provide no concurrency protection.
 */
export interface ProductRepo {
  /**
   * Fetch a product by id. Returns null if not found.
   */
  getById(id: string): Promise<Product | null>;

  /**
   * List all products. Returns an empty array when none exist.
   */
  list(): Promise<readonly Product[]>;

  /**
   * Create or replace a product by id (upsert). Returns the saved Product.
   */
  save(product: Product): Promise<Product>;

  /**
   * Remove a product by id. No-op if the product does not exist.
   */
  delete(id: string): Promise<void>;
}
