import Pkg from '../package.json';
import fs from 'fs';
import { compile } from 'json-schema-to-typescript';

const fsp = fs.promises;

async function main() {
  const s = await compile(Pkg.contributes.configuration as any, 'Extension', {
    style: {
      semi: true,
      singleQuote: true,
    },
  });
  await fsp.writeFile('src/types/pkg-config.d.ts', s);
}

main().catch(console.error);
