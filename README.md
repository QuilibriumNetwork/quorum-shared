# @quilibrium/quorum-shared

Shared types, utilities, and cross-platform UI primitives for the Quorum ecosystem.

## Package Structure

```
src/
├── types/        # Shared TypeScript types and interfaces
├── primitives/   # Cross-platform UI components (.web.tsx + .native.tsx)
├── hooks/        # React Query hooks (planned migration)
├── utils/        # Shared utilities (planned migration)
├── api/          # API client and endpoints
├── crypto/       # E2E encryption (Wasm-based)
├── signing/      # Ed448 message signing
├── transport/    # HTTP and WebSocket clients
├── sync/         # Hash-based delta synchronization
└── storage/      # Storage adapter interface
```

## Installation

```bash
npm install @quilibrium/quorum-shared
```

## Modules

### Types
Shared TypeScript interfaces for the entire ecosystem: `Message`, `Space`, `Channel`, `UserConfig`, `SpaceMember`, `NavItem`, `Bookmark`, thread types, notification types, etc. All apps import types from here to stay in sync.

### Crypto & Signing
End-to-end encryption (Wasm-based) and Ed448 message signing. Handles key derivation, message encryption/decryption, and cryptographic verification.

### Sync
Hash-based delta synchronization protocol. Computes content hashes, builds manifests, and calculates minimal diffs for efficient peer-to-peer sync of messages, members, and reactions.

### Transport
HTTP and WebSocket client abstractions for both browser and React Native environments.

### Storage
Platform-agnostic storage adapter interface. Consuming apps provide their own implementation (IndexedDB for web, AsyncStorage for native).

### API
REST API client with typed endpoints for spaces, channels, messages, user settings, and config management.

### Hooks *(planned migration)*
React Query hooks for data fetching and mutations. Currently in quorum-desktop, will be migrated here.

### Utils *(planned migration)*
Shared utilities (formatting, parsing, validation). Currently in quorum-desktop, will be migrated here.

## UI Primitives

Cross-platform components with `.web.tsx` and `.native.tsx` implementations:

**Layout:** Flex, Spacer, ScrollContainer, OverlayBackdrop, Portal (web-only)
**Form:** Button, Input, TextArea, Select, Switch, RadioGroup, ColorSwatch, FileUpload
**Feedback:** Modal, Tooltip, Callout
**Content:** Icon, Text (+ Paragraph, Label, Caption, Title, InlineText)
**Theme:** ThemeProvider, useTheme, getColors

### Platform Resolution

The package ships both pre-built bundles and source files:

- **Web (Vite/webpack):** Resolves `dist/index.mjs` via the `import` export condition
- **React Native (Metro):** Resolves `dist/index.native.js` via the `react-native` export condition
- **Development (link:/file:):** Can resolve source directly with `optimizeDeps.exclude`

### Web Consumer Setup

Web primitives are **unstyled by default**. The consuming app must provide CSS for the component class names (e.g., `quorum-modal`, `quorum-input`). The Quorum desktop app ships SCSS files alongside the barrel import.

**Required Vite config:**

```ts
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      // Force single React instance (required for createPortal/hooks)
      react: resolve(__dirname, './node_modules/react'),
      'react-dom': resolve(__dirname, './node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, './node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': resolve(__dirname, './node_modules/react/jsx-dev-runtime'),
    },
    dedupe: ['react', 'react-dom'],
  },
});
```

**Tailwind CSS:** If using Tailwind, add the package to your `content` config so arbitrary classes (e.g., `z-[10100]`) are generated:

```js
// tailwind.config.js
content: [
  './src/**/*.{ts,tsx}',
  './node_modules/@quilibrium/quorum-shared/dist/**/*.{js,mjs}',
],
```

### React Native Consumer Setup

No special configuration needed. Metro automatically uses the `react-native` export condition.

If using a monorepo with `link:`, add to your Metro config:

```js
config.watchFolders = [path.resolve(__dirname, '..', 'quorum-shared')];
config.resolver.extraNodeModules = {
  '@quilibrium/quorum-shared': path.resolve(__dirname, '..', 'quorum-shared'),
};
// Block quorum-shared's own node_modules to prevent duplicate react-native
config.resolver.blockList = exclusionList([
  /.*[/\\]quorum-shared[/\\]node_modules[/\\].*/,
]);
```

### Internationalization (i18n)

Primitives use plain English defaults for all user-facing strings. To translate, pass your i18n-wrapped strings via props:

```tsx
import { Select } from '@quilibrium/quorum-shared';
import { t } from '@lingui/core/macro';

<Select
  placeholder={t`Select an option`}
  selectAllLabel={t`All`}
  clearAllLabel={t`Clear`}
/>
```

Components with translatable defaults: **Select** (placeholder, selectAllLabel, clearAllLabel) and **FileUpload** (error messages).

## Peer Dependencies

The package uses optional peer dependencies — install only what your platform needs:

| Dependency | Web | Native |
|-----------|-----|--------|
| react | Required | Required |
| react-dom | Required | - |
| react-native | - | Required |
| @tabler/icons-react | Required | - |
| @tabler/icons-react-native | - | Required |
| clsx | Required | - |
| react-tooltip | Required | - |
| react-dropzone | Required | - |
| expo-haptics | - | Required |
| expo-document-picker | - | Required |
| expo-image-picker | - | Required |
| @react-native-async-storage/async-storage | - | Required |

## Building

```bash
npm run build    # tsup (JS bundles) + tsc (type declarations)
npm run dev      # Watch mode
npm run typecheck
```

The build produces:
- `dist/index.mjs` — Web ESM (resolves `.web.tsx` files)
- `dist/index.js` — Web CJS
- `dist/index.native.js` — Native CJS (resolves `.native.tsx` files)
- `dist/index.d.ts` — Type declarations

## Related Repositories

- [quorum-desktop](https://github.com/QuilibriumNetwork/quorum-desktop) — Web/desktop app
- [quorum-mobile](https://github.com/QuilibriumNetwork/quorum-mobile) — React Native mobile app

---

_Updated: 2026-03-16_
