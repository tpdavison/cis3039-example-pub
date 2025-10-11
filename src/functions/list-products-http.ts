import { app } from '@azure/functions';
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { listProducts } from '../app/list-products';
import type { Product } from '../domain/product';
import { createListProductsDeps } from '../config/composition-root';

type ProductDto = {
  readonly id: string;
  readonly name: string;
  readonly pricePence: number;
  readonly description: string;
  readonly updatedAt: string;
};

type ListProductsStage =
  | 'dependency-construction'
  | 'use-case-execution'
  | 'response-mapping';

const listProductsHandler = async (
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  let stage: ListProductsStage = 'dependency-construction';

  try {
    const deps = createListProductsDeps();
    stage = 'use-case-execution';
    const result = await listProducts(deps);

    stage = 'response-mapping';
    return {
      status: 200,
      jsonBody: result.data.map(toProductDto),
    };
  } catch {
    // Keep internal error messages, SDK objects and configuration out of logs.
    context.error('Product API request failed', {
      operation: 'list-products',
      stage,
      category: 'unexpected',
    });
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
};

function toProductDto(product: Product): ProductDto {
  return {
    id: product.id,
    name: product.name,
    pricePence: product.pricePence,
    description: product.description,
    updatedAt: product.updatedAt.toISOString(),
  };
}

app.http('listProductsHttp', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'products',
  handler: listProductsHandler,
});
