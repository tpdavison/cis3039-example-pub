import { createProduct } from '../domain/product';
import type { Product, ProductValidationIssue } from '../domain/product';
import type { ProductRepo } from '../domain/product-repo';

export type UpsertProductCommand = Omit<Product, 'updatedAt'>;

export type UpsertProductDeps = {
  readonly productRepo: ProductRepo;
  readonly now: () => Date;
};

export type UpsertProductResult =
  | { readonly success: true; readonly data: Product }
  | {
      readonly success: false;
      readonly issues: readonly ProductValidationIssue[];
    };

/** Validate and save a full replacement, returning the repository's result. */
export async function upsertProduct(
  deps: UpsertProductDeps,
  command: UpsertProductCommand,
): Promise<UpsertProductResult> {
  const creation = createProduct({ ...command, updatedAt: deps.now() });
  if (!creation.success) {
    // The application clock is an operational dependency, not client input.
    if (creation.issues.some((issue) => issue.field === 'updatedAt')) {
      throw new Error('Generated product updatedAt is invalid');
    }
    return creation;
  }

  // Storage failures propagate to the HTTP adapter, rather than becoming 400s.
  const saved = await deps.productRepo.save(creation.data);
  return { success: true, data: saved };
}
