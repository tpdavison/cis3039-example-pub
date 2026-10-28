import { app } from '@azure/functions';
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import { upsertProduct } from '../app/upsert-product';
import type { UpsertProductCommand } from '../app/upsert-product';
import type { Product } from '../domain/product';
import { createUpsertProductDeps } from '../config/composition-root';

type RequestIssue = { readonly field: string; readonly message: string };
type ParseResult =
  | { readonly success: true; readonly data: UpsertProductCommand }
  | { readonly success: false; readonly issues: readonly RequestIssue[] };
type UpsertProductStage =
  | 'request-parsing'
  | 'dependency-construction'
  | 'use-case-execution'
  | 'response-mapping';

export async function upsertProductHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  let stage: UpsertProductStage = 'request-parsing';
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest([
        { field: 'body', message: 'Request body must contain valid JSON' },
      ]);
    }
    const parsed = parseCommand(body);
    if (!parsed.success) return badRequest(parsed.issues);

    stage = 'dependency-construction';
    const deps = createUpsertProductDeps();
    stage = 'use-case-execution';
    const result = await upsertProduct(deps, parsed.data);
    if (!result.success) return badRequest(result.issues);

    stage = 'response-mapping';
    if (result.publication.status === 'unconfirmed') {
      context.warn('Product saved; event publication unconfirmed', {
        operation: 'upsert-product',
        productId: result.data.id,
        eventId: result.publication.eventId,
      });
    }
    return {
      status: 200,
      jsonBody: {
        product: toProductDto(result.data),
        publication: result.publication,
        ...(result.publication.status === 'unconfirmed'
          ? {
              warning:
                'Product saved; publication is unconfirmed. Do not automatically repeat the write. Inspect saved state and downstream evidence.',
            }
          : {}),
      },
    };
  } catch {
    context.error('Product API request failed', {
      operation: 'upsert-product',
      stage,
      category: 'unexpected',
    });
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

function parseCommand(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      success: false,
      issues: [
        { field: 'body', message: 'Request body must be a JSON object' },
      ],
    };
  }
  const record = body as Record<string, unknown>;
  const issues: RequestIssue[] = [];
  for (const field of ['id', 'name', 'description'] as const) {
    if (typeof record[field] !== 'string')
      issues.push({ field, message: `${field} must be a string` });
  }
  if (typeof record.pricePence !== 'number') {
    issues.push({
      field: 'pricePence',
      message: 'pricePence must be a number',
    });
  }
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.description !== 'string' ||
    typeof record.pricePence !== 'number'
  ) {
    return { success: false, issues };
  }
  return {
    success: true,
    data: {
      id: record.id,
      name: record.name,
      pricePence: record.pricePence,
      description: record.description,
    },
  };
}

function toProductDto(product: Product) {
  return {
    id: product.id,
    name: product.name,
    pricePence: product.pricePence,
    description: product.description,
    updatedAt: product.updatedAt.toISOString(),
  };
}

function badRequest(issues: readonly RequestIssue[]): HttpResponseInit {
  return { status: 400, jsonBody: { issues } };
}

app.http('upsertProductHttp', {
  methods: ['PUT', 'POST'],
  authLevel: 'anonymous',
  route: 'products',
  handler: upsertProductHandler,
});
