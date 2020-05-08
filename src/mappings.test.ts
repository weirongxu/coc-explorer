import { parseAction } from './mappings';

test('parseAction', () => {
  expect(parseAction('open:split:plain')).toEqual({
    name: 'open',
    args: ['split', 'plain'],
  });
});
