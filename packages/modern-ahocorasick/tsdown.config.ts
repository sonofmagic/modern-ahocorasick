import { defineConfig } from 'tsdown'

// Independent bundles keep Unicode case-folding data out of the default entry.
// tsdown cleans all configured outputs before starting any build.
export default defineConfig(['index', 'text'].map(name => defineConfig({
  entry: [`src/${name}.ts`],
  format: ['esm', 'cjs'],
  target: 'es2022',
  clean: true,
  dts: false,
  // tsc preserves the CommonJS constructor/type namespaces for both entries.
  ...(name === 'text' ? { onSuccess: 'node ../../scripts/build-declarations.mjs' } : {}),
  exports: false,
  outExtensions: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  cjsDefault: true,
})))
