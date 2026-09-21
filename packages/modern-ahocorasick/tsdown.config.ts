import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  clean: true,
  dts: true,
  exports: false,
  outExtensions: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js', dts: format === 'cjs' ? '.d.cts' : '.d.ts' }),
  cjsDefault: true,
})
