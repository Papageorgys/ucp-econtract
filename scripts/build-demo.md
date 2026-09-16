# Standalone demo build

The published demo (`econtract-whitelabel.html`) is `app/index.html` plus the real `_shared/` logic bundled for the
browser and an in-page API adapter (`demo/adapter.js`). Nothing leaves the page; OCR is simulated from entered data.

```
deno bundle --platform browser demo/core.ts -o demo/core.js
python3 demo/build.py     # inlines core.js + adapter.js into index.html → dist/econtract-demo.html
```
