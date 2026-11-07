import './ui/App';

// Desktop app: unexpected errors are written to data/logs/main.log so problems can be traced later.
const log = window.showcaseNative?.log;
if (log) {
  window.addEventListener('error', (e) => void log('error', `${e.message} @ ${e.filename?.replace(/^app:\/\/showcase\//, '')}:${e.lineno}:${e.colno}${e.error?.stack ? '\n' + e.error.stack : ''}`));
  window.addEventListener('unhandledrejection', (e) => void log('error', `unhandled: ${e.reason instanceof Error ? e.reason.stack || e.reason.message : String(e.reason)}`));
}

// Development-only test hooks (stripped from production builds).
if (import.meta.env.DEV) {
  void Promise.all([import('./state/assets'), import('./state/doc'), import('./state/ui'), import('./state/layoutActions'), import('./state/placement'), import('./state/objects'), import('./state/pages'), import('./render/images'), import('./services/exporter')]).then(
    ([assets, doc, ui, layout, placement, objects, pages, images, exporter]) => {
      (window as unknown as Record<string, unknown>).__showcase = { assets, doc, ui, layout, placement, objects, pages, images, exporter };
    },
  );
}
