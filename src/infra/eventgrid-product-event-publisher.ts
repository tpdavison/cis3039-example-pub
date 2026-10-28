import { EventGridPublisherClient, AzureKeyCredential } from '@azure/eventgrid';
import type {
  ProductEventPublisher,
  ProductUpsertedEvent,
} from '../app/product-event-publisher';

export type EventGridOptions = {
  readonly endpoint: string;
  readonly key: string;
};

type EventGridSender = Pick<EventGridPublisherClient<'CloudEvent'>, 'send'>;

/** Maps an application fact to CloudEvents; never assigns a new event ID. */
export class EventGridProductEventPublisher implements ProductEventPublisher {
  private readonly client: EventGridSender;

  constructor(options: EventGridOptions, client?: EventGridSender) {
    if (!options.endpoint || options.endpoint.trim() === '') {
      throw new Error('Event Grid requires a non-empty endpoint');
    }
    if (!options.key || options.key.trim() === '') {
      throw new Error(
        'EVENTGRID_KEY must be set to a non-empty topic access key',
      );
    }
    this.client =
      client ??
      new EventGridPublisherClient(
        options.endpoint,
        'CloudEvent',
        new AzureKeyCredential(options.key),
        { retryOptions: { maxRetries: 2 } },
      );
  }

  async publishProductUpserted(event: ProductUpsertedEvent): Promise<void> {
    // The SDK adds specversion 1.0 and serializes its Date to an ISO wire string.
    await this.client.send(
      [
        {
          id: event.id,
          time: new Date(event.time),
          source: '/services/catalogue',
          type: 'catalogue.product.upserted',
          subject: `products/${event.data.productId}`,
          datacontenttype: 'application/json',
          data: { ...event.data },
        },
      ],
      { abortSignal: AbortSignal.timeout(10_000) },
    );
  }
}
