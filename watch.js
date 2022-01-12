const { build } = require('./build.js');

build(false, {
  watch: {
    onRebuild(error, result) {
      if (error) {
        // eslint-disable-next-line no-console
        console.error('watch build failed', error);
      } else {
        // eslint-disable-next-line no-console
        console.log('watch build succeeded', result);
      }
    },
  },
  // eslint-disable-next-line no-console
}).catch(console.error);
