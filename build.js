exports.build = async (production, options = {}) => {
  const esbuild = require('esbuild');
  const result = await esbuild.build({
    platform: 'node',
    target: 'node10.12',
    mainFields: ['main', 'module'],
    minify: production,
    sourcemap: !production,
    entryPoints: ['./src/index.ts'],
    bundle: true,
    external: ['coc.nvim', 'trash', 'open'],
    outfile: 'lib/index.js',
    ...options,
  });
  if (metafile) {
    const text = await esbuild.analyzeMetafile(result.metafile);
    // eslint-disable-next-line no-console
    console.log(text);
  }
};

if (require.main === module) {
  // eslint-disable-next-line no-console
  exports.build(true).catch(console.error);
  // eslint-disable-next-line no-console
  console.log('build done');
}
