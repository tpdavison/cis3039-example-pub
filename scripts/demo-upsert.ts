import { upsertProduct } from '../src/app/upsert-product';
import { listProducts } from '../src/app/list-products';
import { FakeProductRepo } from '../src/infra/fake-product-repo';
import { DummyProductEventPublisher } from '../src/infra/dummy-product-event-publisher';

async function main(): Promise<void> {
  const productRepo = new FakeProductRepo();
  const result = await upsertProduct(
    {
      productRepo,
      now: () => new Date('2026-10-28T11:00:00.000Z'),
      generateEventId: () => '550e8400-e29b-41d4-a716-446655440000',
      productEventPublisher: new DummyProductEventPublisher(),
    },
    {
      id: 'prod-12345',
      name: 'Premium Wireless Headphones',
      pricePence: 7999,
      description: 'Wireless headphones',
    },
  );
  if (!result.success) throw new Error('The demonstration product is invalid.');
  console.log('Upsert returned the saved product:');
  console.log(JSON.stringify(result.data, null, 2));
  console.log('Publication via the dummy only:', result.publication);
  console.log('List uses the same fake repository:');
  console.log(
    JSON.stringify((await listProducts({ productRepo })).data, null, 2),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Upsert demo failed.');
  process.exitCode = 1;
});
