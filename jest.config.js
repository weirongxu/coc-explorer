// @ts-check

const { defaultsDeep } = require('lodash');
// @ts-ignore
const jest = require('./node_modules/coc-helper/jest.config.js');

module.exports = defaultsDeep(jest, {
  clearMocks: true,
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
});
