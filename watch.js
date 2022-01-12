const chokidar = require('chokidar');
const { build } = require('./build.js');

chokidar
  .watch('./src/**/*.{ts,json}', {
    ignoreInitial: true,
  })
  .on('all', (event, path) => {
    // eslint-disable-next-line no-console
    console.log(path, event);
    // eslint-disable-next-line no-console
    build(false).catch(console.error);
  });
