import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: Object.fromEntries(['index', 'text', 'unicode', 'unicode-fast', 'fast', 'dynamic', 'replace', 'stream', 'stream/filters', 'stream/node', 'stream/web'].map(name => [name, `src/${name}.ts`])),
  format: ['esm', 'cjs'],
  target: 'es2022',
  clean: true,
  // tsc preserves the CommonJS export assignment and its type namespace.
  dts: false,
  onSuccess: 'node ../../scripts/build-declarations.mjs',
  exports: false,
  outExtensions: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  cjsDefault: true,
  outputOptions: (options, format) => ({ ...options, chunkFileNames: `_private/[name]-[hash].${format === 'cjs' ? 'cjs' : 'js'}` }),
})
