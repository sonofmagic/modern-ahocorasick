import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'es2022',
  clean: true,
  // tsc preserves the CommonJS export assignment and its type namespace.
  dts: false,
  onSuccess: 'node ../../scripts/build-declarations.mjs',
  exports: false,
  outExtensions: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  cjsDefault: true,
})
