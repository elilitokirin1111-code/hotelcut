/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVELOPMENT_SEED_EMAIL?: string;
  readonly VITE_DEVELOPMENT_SEED_PASSWORD?: string;
  readonly VITE_GUEST_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
