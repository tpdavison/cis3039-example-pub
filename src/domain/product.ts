export type Product = {
  readonly id: string;
  readonly name: string;
  readonly pricePence: number;
  readonly description: string;
  readonly updatedAt: Date;
};

export type CreateProductParams = Product;

export type ProductValidationIssue = {
  readonly field: keyof CreateProductParams;
  readonly message: string;
};

export type CreateProductResult =
  | { readonly success: true; readonly data: Product }
  | {
      readonly success: false;
      readonly issues: readonly ProductValidationIssue[];
    };

/** Runtime validation is needed even when callers use TypeScript. */
export function createProduct(params: CreateProductParams): CreateProductResult {
  const issues: ProductValidationIssue[] = [];

  if (!params.id || typeof params.id !== 'string' || params.id.trim() === '') {
    issues.push({ field: 'id', message: 'Product id must be a non-empty string.' });
  }
  if (
    !params.name ||
    typeof params.name !== 'string' ||
    params.name.trim() === ''
  ) {
    issues.push({ field: 'name', message: 'Product name must be a non-empty string.' });
  }
  if (
    typeof params.pricePence !== 'number' ||
    !Number.isFinite(params.pricePence) ||
    params.pricePence < 0 ||
    !Number.isSafeInteger(params.pricePence)
  ) {
    issues.push({
      field: 'pricePence',
      message: 'Product pricePence must be a non-negative safe integer.',
    });
  }
  if (
    !params.description ||
    typeof params.description !== 'string' ||
    params.description.trim() === ''
  ) {
    issues.push({
      field: 'description',
      message: 'Product description must be a non-empty string.',
    });
  }
  if (
    !(params.updatedAt instanceof Date) ||
    !Number.isFinite(params.updatedAt.getTime())
  ) {
    issues.push({
      field: 'updatedAt',
      message: 'updatedAt must be a valid Date object.',
    });
  }
  if (issues.length > 0) return { success: false, issues };

  return {
    success: true,
    data: {
      id: params.id,
      name: params.name,
      pricePence: params.pricePence,
      description: params.description,
      updatedAt: params.updatedAt,
    },
  };
}
