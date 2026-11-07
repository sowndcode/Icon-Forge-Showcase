// The app's version comes from package.json only: Vite puts it here at build time, and the desktop
// shell reads the same file (app.getVersion()). Nothing else spells out a version number.
declare const __APP_VERSION__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
