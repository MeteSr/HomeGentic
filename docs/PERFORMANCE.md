# Performance Baseline

Measured against the pre-rendered landing page (`npm run build:ssg`).

## Targets (SEO.8)

| Metric | Target | Status |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5 s | ⬜ Pending measurement |
| CLS (Cumulative Layout Shift)  | < 0.1   | ⬜ Pending measurement |
| INP (Interaction to Next Paint)| < 200 ms| ⬜ Pending measurement |

## Optimisations in place

- **Google Fonts `preconnect`** — `<link rel="preconnect">` to `fonts.googleapis.com` and `fonts.gstatic.com` in `index.html` reduces DNS+TCP round-trip for web fonts.
- **`font-display: swap`** — appended to all Google Fonts URLs so text renders immediately in fallback font while web fonts load.
- **Code splitting** — Vite `manualChunks` separates `vendor-dfinity`, `vendor-react`, and `vendor-ui` bundles so the critical path (LandingPage) downloads minimal JS.
- **No sourcemaps in production** — `sourcemap: false` in `vite.config.ts` keeps bundle sizes small.
- **SSG pre-rendered shells** — static routes ship pre-built HTML so Googlebot sees content without executing JS.

## Lighthouse

Run locally after `npm run build:ssg && npm run preview`:

```bash
npx lighthouse http://localhost:4173 --output=json --output-path=./lighthouse-report.json
```

## Core Web Vitals — field data

Once deployed, monitor real-user metrics via Google Search Console → Core Web Vitals report.
