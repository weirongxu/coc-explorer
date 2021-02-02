exports.build = (production) => {
  require('esbuild').build({
    platform: 'node',
    target: 'node10.12',
    mainFields: ['main', 'module'],
    minify: production,
    sourcemap: !production,
    entryPoints: ['./src/index.ts'],
    bundle: true,
    external: [
      'coc.nvim',
      'trash',
      'open',
      'vscode-languageserver-types',
      'vscode-languageserver-protocol',
      'vscode-languageserver-textdocument',
    ],
    outfile: 'lib/index.js',
  });
};

if (require.main === module) {
  exports.build(true);
  console.log('build done');
}
