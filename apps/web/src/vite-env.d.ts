/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVELOPMENT_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
