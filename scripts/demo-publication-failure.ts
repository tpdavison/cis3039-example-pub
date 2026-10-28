import { upsertProduct } from '../src/app/upsert-product';
import { FakeProductRepo } from '../src/infra/fake-product-repo';

async function main(): Promise<void> {
  const productRepo = new FakeProductRepo();
  const result = await upsertProduct({
    productRepo,
    now: () => new Date('2026-10-28T11:00:00.000Z'),
    generateEventId: () => '550e8400-e29b-41d4-a716-446655440000',
    productEventPublisher: { publishProductUpserted: async () => {
      throw new Error('Simulated publication outage');
    } },
  }, {
    id: 'prod-12345', name: 'Premium Wireless Headphones',
    pricePence: 7999, description: 'Wireless headphones',
  });
  const saved = await productRepo.getById('prod-12345');
  if (!result.success || result.publication.status !== 'unconfirmed' || !saved) {
    throw new Error('The failure demonstration did not show partial success.');
  }
  console.log('Use-case result after simulated publication failure:');
  console.log(JSON.stringify(result, null, 2));
  console.log('The product is still saved:', JSON.stringify(saved, null, 2));
  console.log('The HTTP adapter maps this outcome to 200 with a warning; this demo does not invoke it.');
  console.log('Repeating the write is a new operation and creates a new event ID.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Failure demo failed.');
  process.exitCode = 1;
});
