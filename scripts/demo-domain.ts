import { createProduct } from '../src/domain/product';

const valid = createProduct({
  id: 'demo-product-1',
  name: 'Wireless headphones',
  pricePence: 7999,
  description: 'A Product domain demonstration',
  updatedAt: new Date('2026-10-28T11:00:00.000Z'),
});

if (!valid.success) {
  throw new Error('The valid domain demonstration unexpectedly failed.');
}
console.log('Valid product:');
console.log(JSON.stringify(valid.data, null, 2));

const invalid = createProduct({
  id: ' ',
  name: '',
  pricePence: -1,
  description: ' ',
  updatedAt: new Date('invalid'),
});

if (invalid.success) {
  throw new Error('The invalid domain demonstration unexpectedly succeeded.');
}
console.log('\nInvalid product issues:');
for (const issue of invalid.issues) {
  console.log(`- ${issue.field}: ${issue.message}`);
}
