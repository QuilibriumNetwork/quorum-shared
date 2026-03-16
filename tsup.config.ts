import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // DTS generation disabled — platform-specific files (.web.tsx/.native.tsx)
  // confuse rollup's resolver. Types are generated separately via tsc.
  // Consuming apps using file: link get types from source directly.
  dts: false,
  clean: true,
  // Resolve .web.tsx files for the web build
  // Native consumers use source files directly via Metro bundler
  esbuildOptions(options) {
    options.resolveExtensions = [
      '.web.tsx',
      '.web.ts',
      '.tsx',
      '.ts',
      '.web.js',
      '.js',
    ];
  },
  // Don't bundle peer dependencies
  external: [
    'react',
    'react-dom',
    'react-native',
    'react-tooltip',
    'react-dropzone',
    '@tabler/icons-react',
    '@tabler/icons-react-native',
    '@react-native-async-storage/async-storage',
    '@gorhom/bottom-sheet',
    'react-native-safe-area-context',
    'expo-haptics',
    'expo-document-picker',
    'expo-image-picker',
    'clsx',
  ],
});
