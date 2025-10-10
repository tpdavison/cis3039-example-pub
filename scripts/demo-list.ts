import { listProducts } from '../src/app/list-products';
import { createProduct } from '../src/domain/product';
import { FakeProductRepo } from '../src/infra/fake-product-repo';

async function main(): Promise<void> {
  const created = createProduct({
    id: 'demo-product-1',
    name: 'Wireless headphones',
    pricePence: 7999,
    description: 'An injected fake repository demonstration',
    updatedAt: new Date('2026-10-28T11:00:00.000Z'),
  });
  if (!created.success) {
    throw new Error(
      'The demonstration product unexpectedly failed validation.',
    );
  }

  const productRepo = new FakeProductRepo();
  console.log('Initially empty:', (await listProducts({ productRepo })).data);
  await productRepo.save(created.data);

  const listed = await listProducts({ productRepo });
  console.log(`\nList returned ${listed.data.length} product:`);
  console.log(JSON.stringify(listed.data, null, 2));

  const found = await productRepo.getById(created.data.id);
  console.log(`\ngetById found: ${found?.id ?? 'null'}`);
  console.log(
    `getById missing returns null: ${(await productRepo.getById('missing')) === null}`,
  );
  if (!found) throw new Error('The saved product could not be read.');

  found.updatedAt.setUTCFullYear(2000);
  const readAgain = await productRepo.getById(found.id);
  if (!readAgain) throw new Error('The saved product disappeared.');
  console.log(
    `Stored date after returned Date mutation: ${readAgain.updatedAt.toISOString()}`,
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'The list demonstration failed.',
  );
  process.exitCode = 1;
});
