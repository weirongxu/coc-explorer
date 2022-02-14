import { parseOriginalAction } from './index';

test('parseAction', () => {
  expect(parseOriginalAction('open:split:plain')).toEqual({
    name: 'open',
    args: ['split', 'plain'],
  });
});
