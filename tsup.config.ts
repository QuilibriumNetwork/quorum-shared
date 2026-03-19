import { defineConfig } from 'tsup';

const external = [
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
];

export default defineConfig([
  // Web build (consumed by Vite, webpack)
  {
    entry: { index: 'src/index.ts' },
    outDir: 'dist',
    format: ['esm', 'cjs'],
    dts: false, // Types generated separately via tsc (see tsconfig.build.json)
    clean: true,
    external,
    esbuildOptions(options) {
      options.resolveExtensions = ['.web.tsx', '.web.ts', '.tsx', '.ts', '.js'];
    },
  },
  // Native build (consumed by Metro via react-native condition)
  {
    entry: { 'index.native': 'src/index.ts' },
    outDir: 'dist',
    format: ['cjs'],
    clean: false, // Don't clean — web build already ran
    external,
    esbuildOptions(options) {
      options.resolveExtensions = ['.native.tsx', '.native.ts', '.tsx', '.ts', '.js'];
    },
  },
]);
