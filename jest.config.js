module.exports = {
  preset: 'ts-jest',
  clearMocks: true,
  globalSetup: './node_modules/coc-helper/tests/jest-setup.js',
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
  },
  testPathIgnorePatterns: ['/node_modules/', '/coc.nvim/'],
};
