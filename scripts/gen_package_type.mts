import fs from 'fs';
import type { JSONSchema4 } from 'json-schema';
import { compile } from 'json-schema-to-typescript';
import Pkg from '../package.json' assert { type: 'json' };

const fsp = fs.promises;

async function main() {
  const s = await compile(
    Pkg.contributes.configuration as JSONSchema4,
    'Extension',
    {
      strictIndexSignatures: true,
      style: {
        semi: true,
        singleQuote: true,
      },
    },
  );
  await fsp.writeFile('src/types/pkg-config.d.ts', s);
}

main().catch(console.error);
