const chokidar = require('chokidar');
const { build } = require('./build.js');

chokidar.watch('./src/**/*.{ts,json}').on('all', (event, path) => {
  console.log(path, event);
  build(false);
});
