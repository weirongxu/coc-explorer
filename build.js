const fs = require('fs');
const path = require('path');

exports.build = async (production, options = {}) => {
  const esbuild = require('esbuild');
  const alias = require('esbuild-plugin-alias');
  const result = await esbuild.build({
    platform: 'node',
    target: 'node12.12',
    mainFields: ['es2015', 'module', 'main'],
    minify: production,
    sourcemap: !production,
    entryPoints: ['./src/index.ts'],
    tsconfig: production ? './tsconfig.prod.json' : './tsconfig.json',
    bundle: true,
    external: ['coc.nvim', 'trash'],
    outfile: 'lib/index.js',
    metafile: true,
    plugins: [
      alias({
        rxjs: path.join(__dirname, 'node_modules/rxjs/dist/esm/index.js'),
      }),
    ],
    ...options,
  });
  if (result.metafile) {
    await fs.promises.writeFile(
      './esbuild-meta.json',
      JSON.stringify(result.metafile, null, 2),
    );
  }
};

if (require.main === module) {
  // eslint-disable-next-line no-console
  exports.build(true).catch(console.error);
  // eslint-disable-next-line no-console
  console.log('build done');
}
