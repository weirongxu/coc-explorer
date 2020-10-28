const Pkg = require('../package.json');
const fs = require('fs');
const { compile } = require('json-schema-to-typescript');

const fsp = fs.promises;

async function main() {
  const s = await compile(Pkg.contributes.configuration, 'Extension', {
    style: {
      semi: true,
      singleQuote: true,
    },
  });
  await fsp.writeFile('src/types/pkg-config.d.ts', s);
}

main().then(console.error);
