import type {
  ProductEventPublisher,
  ProductUpsertedEvent,
} from '../app/product-event-publisher';

/** Logs and records facts for local demonstrations; it performs no delivery. */
export class DummyProductEventPublisher implements ProductEventPublisher {
  private readonly events: ProductUpsertedEvent[] = [];

  constructor(
    private readonly log: (event: ProductUpsertedEvent) => void = (event) =>
      console.log('Product upserted event (dummy):', event),
  ) {}

  async publishProductUpserted(event: ProductUpsertedEvent): Promise<void> {
    const copy = cloneEvent(event);
    this.events.push(copy);
    this.log(cloneEvent(copy));
  }

  getPublishedEvents(): readonly ProductUpsertedEvent[] {
    return this.events.map(cloneEvent);
  }

  clearEvents(): void {
    this.events.length = 0;
  }
}

function cloneEvent(event: ProductUpsertedEvent): ProductUpsertedEvent {
  return { ...event, data: { ...event.data } };
}
