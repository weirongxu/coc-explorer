import { parseOriginalAction } from './mappings';

test('parseAction', () => {
  expect(parseOriginalAction('open:split:plain')).toEqual({
    name: 'open',
    args: ['split', 'plain'],
  });
});
