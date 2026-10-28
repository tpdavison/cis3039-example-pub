import { createProduct } from '../domain/product';
import type { Product, ProductValidationIssue } from '../domain/product';
import type { ProductRepo } from '../domain/product-repo';
import type { ProductEventPublisher } from './product-event-publisher';

export type UpsertProductCommand = Omit<Product, 'updatedAt'>;

export type UpsertProductDeps = {
  readonly productRepo: ProductRepo;
  readonly now: () => Date;
  readonly generateEventId: () => string;
  readonly productEventPublisher: ProductEventPublisher;
};

export type PublicationOutcome = {
  readonly status: 'accepted' | 'unconfirmed';
  readonly eventId: string;
};

export type UpsertProductResult =
  | {
      readonly success: true;
      readonly data: Product;
      readonly publication: PublicationOutcome;
    }
  | {
      readonly success: false;
      readonly issues: readonly ProductValidationIssue[];
    };

/** Save, then publish. Success confirms the save; inspect publication separately. */
export async function upsertProduct(
  deps: UpsertProductDeps,
  command: UpsertProductCommand
): Promise<UpsertProductResult> {
  const creation = createProduct({ ...command, updatedAt: deps.now() });
  if (!creation.success) {
    // The application clock is an operational dependency, not client input.
    if (creation.issues.some((issue) => issue.field === 'updatedAt')) {
      throw new Error('Generated product updatedAt is invalid');
    }
    return creation;
  }

  // Resolve infrastructure only for valid input, before any save. Configuration
  // errors must propagate rather than becoming an unconfirmed publication.
  const productEventPublisher = deps.productEventPublisher;

  // Obtain generated metadata before saving so generator faults cannot follow a save.
  const eventId = deps.generateEventId();
  const occurredAt = deps.now();
  if (typeof eventId !== 'string' || eventId.trim() === '') {
    throw new Error('Generated event ID is invalid');
  }
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    throw new Error('Generated event time is invalid');
  }

  // Storage failures propagate to the HTTP adapter, rather than becoming 400s.
  const saved = await deps.productRepo.save(creation.data);

  // A crash here can leave a saved product without a published event. There is
  // no transaction spanning the fake repository and Event Grid, and no Outbox.
  try {
    await productEventPublisher.publishProductUpserted({
      id: eventId,
      time: occurredAt.toISOString(),
      data: {
        productId: saved.id,
        name: saved.name,
        pricePence: saved.pricePence,
        description: saved.description,
        updatedAt: saved.updatedAt.toISOString(),
      },
    });
  } catch {
    // A timeout/failure does not prove that the broker rejected the event.
    // The save is not rolled back; repeating the write creates another event.
    return { success: true, data: saved, publication: { status: 'unconfirmed', eventId } };
  }
  return { success: true, data: saved, publication: { status: 'accepted', eventId } };
}
