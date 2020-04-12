module.exports = {
  preset: 'ts-jest',
  clearMocks: true,
  globalSetup: './jest.js',
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
  },
  testPathIgnorePatterns: ['/node_modules/', '/coc.nvim/'],
};
