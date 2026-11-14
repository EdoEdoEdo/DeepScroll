# Pre-generated presets

`npm run presets` (with `npm run dev` running) writes one JSON file per preset here.
The landing page loads them instead of calling the APIs: instant, no quota,
and they keep working if an LLM provider goes down.

Files are versioned (`DOC_VERSION` in `app/utils/arc.ts`): when the data shape
changes, stale files are ignored and the live pipeline is used until you
regenerate them.
