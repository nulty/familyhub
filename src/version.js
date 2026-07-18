// Single source of truth for the app version and source URL.
// Reads package.json directly so nothing has to be kept in sync by hand —
// Vite (and vitest, which shares the transform pipeline) turns JSON into a module.
import pkg from '../package.json';

export const APP_VERSION = pkg.version;
export const REPO_URL = pkg.repository.url;
