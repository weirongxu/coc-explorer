module.exports = {
  preset: 'ts-jest',
  clearMocks: true,
  globalSetup: './jest.js',
  testPathIgnorePatterns: ['/node_modules/', '/coc.nvim/'],
};
