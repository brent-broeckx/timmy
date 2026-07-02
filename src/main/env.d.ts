// Augment electron-vite's ImportMetaEnv for the main process.
// Add any VITE_* env vars used in main/preload here.

interface ImportMetaEnv {
  readonly VITE_GRAPH_CLIENT_ID?: string
  readonly VITE_GRAPH_TENANT_ID?: string
}
