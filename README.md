# Free Invoice Generator

A free, private, browser-based tool to create professional invoices. No accounts,
no server, no cost — everything runs in the browser and all data is stored on the
user's own device.

---

## Quick start

There is **no build step and no install**. It's plain HTML/CSS/JS.

1. Open the folder in VS Code.
2. Double-click `index.html` (or right-click → open with Chrome / Edge / Safari / Firefox).
   - Optional: use the VS Code "Live Server" extension for auto-reload while editing.
3. Start typing — the invoice preview updates live and auto-saves.

Works on mobile and desktop, and is tested to render correctly on Chrome, Edge,
Firefox, and Safari (Mac/iOS).

---

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | Page structure: editor form (left) + live invoice preview (right), plus the "My invoices" panel and header buttons. |
| `styles.css` | All styling. Mobile-first, responsive, cross-browser, plus a dedicated `@media print` block for clean PDF output. |
| `app.js` | All logic: state, live preview rendering, totals, `localStorage` persistence, and the saved-invoices system. No libraries/dependencies. |
| `favicon.svg` | App icon shown in the browser tab. |
| `.nojekyll` | Tells GitHub Pages to serve files as-is (no Jekyll processing). |

---

## Features (current)

**Invoice editor**
- Business details (name, email, address) + optional logo upload (stored on device).
- Client / "bill to" details.
- Invoice number (max 40 chars), currency (8 options: $, €, £, ₹, ₱, ¥, A$, C$), issue & due dates.
- Line items (description, qty, price) with add/remove and per-line amount.
- Tax rate (%) and a flat discount amount.
- Notes / payment terms.

**Live preview**
- A clean invoice preview that mirrors the form in real time.
- Subtotal, discount, tax, and grand total calculated live.
- Rows without a description are **skipped** on the invoice (a `0.00` price is allowed — good for freebies). Incomplete rows are highlighted amber in the editor.

**My invoices (save multiple)**
- **Save current** — stores the invoice in a list.
- **Open** — click a saved invoice to load it back into the editor.
- **Duplicate** — copies a saved invoice and gives it the next invoice number (great for repeat clients).
- **Delete** — removes a saved invoice (with confirmation).
- **+ New** — starts a fresh invoice, keeping your business details but clearing the client/items, and auto-assigns the next number.
- The currently-open invoice is highlighted, and edits auto-sync to its saved copy.
- **Auto-incrementing numbers** — new/duplicated invoices get the next number (e.g. `INV-0001 → INV-0002`), preserving the prefix and zero-padding.

**Export**
- **Print / PDF** button (header) → exports the **current** invoice via the browser print dialog → "Save as PDF".
- **Download selected** → tick the checkboxes on saved invoices and export just those.
- **Download all** → export every saved invoice at once.
- Batch exports place **one invoice per page**, producing a clean, editor-free multi-page PDF (styled via the print stylesheet). No libraries — uses the browser's built-in print-to-PDF.

**Pro / licensing (freemium)**
- Free users see a bold diagonal **"Free version" stamp** across the invoice plus a footer line (in both preview and PDF) — prominent enough to motivate upgrading.
- **Upgrade to Pro** (header button) opens a modal showing the price and a license-key field.
- Activating a valid key removes the stamp/watermark and shows a "★ Pro" badge.
- Pro state is stored on the device; users re-enter their key on other browsers/devices.
- Price is set by `PRO_PRICE` in `app.js` (default `$9`, one-time/lifetime).

### Going live with payments (what the owner must do)

The product is sold through **Gumroad** (free to set up; it only takes a cut per sale):

1. Create the product on Gumroad and enable **"Generate a unique license key per sale."**
2. In `app.js`, set `GUMROAD_BUY_URL` to the product URL (the "Get Pro" button uses it).
3. That's it for **Option A** — buyers get a key and paste it into the app to unlock Pro.

**Why this is upgrade-safe (important):** the keys are **real Gumroad keys from day one**.
Today they are validated **locally/offline** (Option A). Later you can switch on
**Option B** (online verification) by setting `GUMROAD_PRODUCT_ID` — the *same keys keep
working*, so no paying customer is ever locked out.

---

## How it works (for developers)

`app.js` is a single IIFE (no globals leak). Key pieces:

- **`state`** — the current working invoice (an object of the fields in `INVOICE_FIELDS`, plus `currentSavedId` linking the draft to a saved entry).
- **`savedInvoices`** — an array of saved invoices, each `{ id, savedAt, data }` where `data` is a snapshot of the invoice fields.

**Persistence (three `localStorage` keys):**
- `invoiceGenerator.v1` — the current working draft (auto-saved on every edit).
- `invoiceGenerator.saved.v1` — the list of saved invoices.
- `invoiceGenerator.license.v1` — the Pro license `{ key, activatedAt, verified }`.

**Rendering:**
- `renderItems()` — builds the editable line-item rows.
- `renderPreview()` — builds the live invoice preview (only items with a description are shown).
- `renderSavedList()` — builds the "My invoices" list.
- Edits update `state`, call `save()` (draft) and `syncActiveSaved()` (keeps the open saved copy current), then re-render the preview.

**Totals:**
- `totalsFor(data)` computes subtotal/discount/tax/total for any invoice object; `computeTotals()` runs it on the current `state`.

**Licensing (forward-compatible):**
- All Pro checks go through **`isPro()`** — the watermark/PDF code never changes when the licensing tier is upgraded.
- **`activateLicense(key)` returns a Promise**, so the async Gumroad `fetch` slots in without touching any caller.
- **Option B is active:** keys are verified online against Gumroad's license API (`https://api.gumroad.com/v2/licenses/verify`) using the product permalink. Refunded/disputed keys are rejected. Gumroad sends `access-control-allow-origin: *`, so this runs client-side with no backend.
- Local format pre-check (`isValidKeyFormat()`) runs first to avoid needless API calls.
- Config at the top of `app.js`: `GUMROAD_BUY_URL`, `GUMROAD_PRODUCT_ID` (permalink used for verification), optional `GUMROAD_API_PRODUCT_ID` (token form), and `PRO_PRICE`.

**Data safety:**
- All user text is escaped via `escapeHtml()` before being inserted into the DOM (prevents HTML/script injection from typed input).
- Logo uploads are capped at 2 MB and stored as data URLs.

---

## Roadmap status

- ✅ **Phase 0 — Foundation** (files, responsive layout, localStorage)
- ✅ **Phase 1 — Core invoice builder** (form, live preview, totals, logo, currency, dates)
- ✅ **Phase 2 — Export** (print/PDF for current, selected, or all invoices; multiple saved invoices; auto-numbering)
- ✅ **Phase 3 — Freemium / payments** (Pro watermark-removal; license keys with **online Gumroad verification**; live $9 checkout)
- ⬜ **Phase 4 — Traffic & ads**
- ⬜ **Phase 5 — Polish & launch (PWA, deploy)**
- ⬜ **Phase 6 — Optional accounts / cloud sync**

---

## Notes & limitations

- Data lives in the browser's `localStorage`, so it is **per-browser, per-device**.
  Clearing browser data will erase saved invoices. (A future update adds
  export/import backup and optional cloud sync.)
- Private/incognito windows may block storage; the app degrades gracefully
  (it still works, but won't remember data after closing).
