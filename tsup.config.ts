import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['./src/index.ts'],
  dts: false,
  bundle: true,
  target: 'node14.14',
  tsconfig: 'tsconfig.prod.json',
  format: ['cjs'],
  external: ['coc.nvim', 'trash'],
  metafile: false,
  outDir: 'lib',
});
