/** A full product snapshot. Timestamp strings are serialized ISO instants. */
export type ProductUpsertedData = {
  readonly productId: string;
  readonly name: string;
  readonly pricePence: number;
  readonly description: string;
  readonly updatedAt: string;
};

/**
 * One product upsert fact. The application assigns identity and occurrence time
 * once; retrying publication of this event must retain both. This identity is
 * distinct from data.productId. It does not make the original write idempotent.
 */
export type ProductUpsertedEvent = {
  readonly id: string;
  readonly time: string;
  readonly data: ProductUpsertedData;
};

export interface ProductEventPublisher {
  /** Resolves on transport acceptance, not downstream business completion. */
  publishProductUpserted(event: ProductUpsertedEvent): Promise<void>;
}
