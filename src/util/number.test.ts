import { toSubscriptNumbers, unsigned } from './number';

test('unsigned', () => {
  expect(unsigned(-1)).toEqual(0);
  expect(unsigned(0)).toEqual(0);
  expect(unsigned(1)).toEqual(1);
  expect(unsigned(1.8)).toEqual(1);
});

test('toSubscriptNumbers', () => {
  expect(toSubscriptNumbers('✗1234')).toEqual('✗₁₂₃₄');
  expect(toSubscriptNumbers(0.1234)).toEqual('₀.₁₂₃₄');
});
