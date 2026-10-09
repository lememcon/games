/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

interface ImportMetaEnv {
  // Origin of the API (e.g. https://api.lememcon.com). Unset means same-origin.
  readonly VITE_API_URL?: string;
}
