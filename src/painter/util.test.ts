import { DrawnWithNodeIndex } from './types';
import { drawnWithIndexRange } from './util';

test('drawnToRange', () => {
  const drawnList: DrawnWithNodeIndex[] = [
    {
      content: 'aaa',
      nodeIndex: 0,
      nodeUid: '0',
      highlightPositions: [],
    },
    {
      content: 'aaa',
      nodeIndex: 1,
      nodeUid: '1',
      highlightPositions: [],
    },
    {
      content: 'aaa',
      nodeIndex: 2,
      nodeUid: '2',
      highlightPositions: [],
    },
    {
      content: 'aaa',
      nodeIndex: 4,
      nodeUid: '4',
      highlightPositions: [],
    },
    {
      content: 'aaa',
      nodeIndex: 5,
      nodeUid: '5',
      highlightPositions: [],
    },
  ];
  const drawnRangeList = drawnWithIndexRange(drawnList);
  expect(drawnRangeList).toEqual([
    {
      nodeIndexStart: 0,
      nodeIndexEnd: 2,
      drawnList: drawnList.slice(0, 3),
    },
    {
      nodeIndexStart: 4,
      nodeIndexEnd: 5,
      drawnList: drawnList.slice(3, 5),
    },
  ]);
});
