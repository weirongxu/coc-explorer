const jest = require('./node_modules/coc-helper/jest.config.js');

module.exports = {
  ...jest,
  clearMocks: true,
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
    ...jest.moduleNameMapper,
  },
};
