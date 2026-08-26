/* ============================================================
   Free Invoice Generator — app logic
   Phase 0 + 1: form, live preview, totals, localStorage.
   Phase 2: multiple saved invoices (save/open/duplicate/delete)
            + auto-incrementing invoice numbers.
   Vanilla JS, no dependencies. Works on Chrome, Firefox,
   Safari (Mac/iOS) and Edge.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "invoiceGenerator.v1";       // current working draft
  var SAVED_KEY = "invoiceGenerator.saved.v1";   // list of saved invoices
  var LICENSE_KEY = "invoiceGenerator.license.v1"; // Pro license (key + metadata)

  /* ----------------------------------------------------------
     Gumroad configuration.
     Sell the product on Gumroad with "Generate a unique license
     key per sale" enabled, then fill these two values in.
     - GUMROAD_BUY_URL: the product URL buyers open to purchase.
     - GUMROAD_PRODUCT_ID: the product's permalink/ID, used LATER
       by Option B to verify keys online. Leaving it blank keeps
       us on Option A (local validation) — the SAME keys will
       verify online once Option B is switched on, so no paying
       customer ever loses access.
     ---------------------------------------------------------- */
  var GUMROAD_BUY_URL = "https://llorera3.gumroad.com/l/invgnrtrpro";
  var GUMROAD_PRODUCT_ID = "invgnrtrpro";  // enables Option B (online verify) later

  // Displayed price for the Pro upgrade (change any time — purely cosmetic).
  var PRO_PRICE = "$9";

  // Fields that make up a single invoice (used for snapshot / open / duplicate).
  var INVOICE_FIELDS = [
    "bizName", "bizEmail", "bizAddress",
    "clientName", "clientEmail", "clientAddress",
    "invoiceNumber", "currency", "issueDate", "dueDate",
    "taxRate", "discount", "notes", "logo", "items"
  ];

  /* ---- Application state ---- */
  var state = {
    bizName: "",
    bizEmail: "",
    bizAddress: "",
    clientName: "",
    clientEmail: "",
    clientAddress: "",
    invoiceNumber: "INV-0001",
    currency: "$",
    issueDate: "",
    dueDate: "",
    taxRate: 0,
    discount: 0,
    notes: "",
    logo: "", // data URL
    items: [],
    currentSavedId: "" // which saved invoice the draft maps to ("" = unsaved)
  };

  // The collection of saved invoices: [{ id, savedAt, data:{...INVOICE_FIELDS} }]
  var savedInvoices = [];

  // Pro license: { key, activatedAt, verified }. verified stays false under
  // Option A (local only); Option B will set it after an online Gumroad check.
  var license = { key: "", activatedAt: 0, verified: false };

  var savedDocTitle = null; // page title saved while printing, restored after

  /* ---- Small helpers ---- */
  function $(id) {
    return document.getElementById(id);
  }

  function uid() {
    return "it_" + Math.random().toString(36).slice(2, 9);
  }

  function todayISO() {
    var d = new Date();
    var off = d.getTimezoneOffset();
    var local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
  }

  function toNumber(v) {
    var n = parseFloat(v);
    return isNaN(n) || !isFinite(n) ? 0 : n;
  }

  function formatMoney(amount) {
    return toNumber(amount).toFixed(2);
  }

  // An item counts only when it has a description (price of 0 is allowed for freebies).
  function hasDescription(item) {
    return !!(item && String(item.description).trim());
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return iso;
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  /* ---- Persistence ---- */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* storage may be unavailable (private mode) — ignore silently */
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (var key in state) {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) {
            state[key] = parsed[key];
          }
        }
        if (!Array.isArray(state.items)) state.items = [];
        return true;
      }
    } catch (e) {
      /* corrupt data — start fresh */
    }
    return false;
  }

  /* ---- Saved invoices (Phase 2) ---- */
  function loadSaved() {
    try {
      var raw = localStorage.getItem(SAVED_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) savedInvoices = parsed;
    } catch (e) {
      savedInvoices = [];
    }
  }

  function persistSaved() {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(savedInvoices));
    } catch (e) {
      alert("Could not save — your browser storage may be full or blocked.");
    }
  }

  function newSavedId() {
    return "inv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function findSaved(id) {
    for (var i = 0; i < savedInvoices.length; i++) {
      if (savedInvoices[i].id === id) return savedInvoices[i];
    }
    return null;
  }

  // A deep-cloned snapshot of the current invoice fields (no draft-only keys).
  function snapshot() {
    var o = {};
    for (var i = 0; i < INVOICE_FIELDS.length; i++) {
      o[INVOICE_FIELDS[i]] = state[INVOICE_FIELDS[i]];
    }
    return JSON.parse(JSON.stringify(o));
  }

  // Next invoice number based on the highest number seen (keeps prefix + padding).
  function nextInvoiceNumber() {
    var maxN = 0;
    var width = 4;
    var numbers = [];
    for (var i = 0; i < savedInvoices.length; i++) {
      numbers.push(savedInvoices[i].data && savedInvoices[i].data.invoiceNumber);
    }
    numbers.push(state.invoiceNumber);
    numbers.forEach(function (num) {
      if (!num) return;
      var m = String(num).match(/(\d+)(?!.*\d)/); // last run of digits
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
        if (m[1].length > width) width = m[1].length;
      }
    });
    var s = String(maxN + 1);
    while (s.length < width) s = "0" + s;
    return "INV-" + s;
  }

  // Save the current draft into the list (creates once, then updates in place).
  function saveCurrent() {
    var now = Date.now();
    var entry = state.currentSavedId ? findSaved(state.currentSavedId) : null;
    if (entry) {
      entry.data = snapshot();
      entry.savedAt = now;
    } else {
      var id = newSavedId();
      state.currentSavedId = id;
      savedInvoices.unshift({ id: id, savedAt: now, data: snapshot() });
      save();
    }
    persistSaved();
    renderSavedList();
  }

  // Keep the active saved copy in sync as the user edits (no-op if unsaved).
  function syncActiveSaved() {
    if (!state.currentSavedId) return;
    var entry = findSaved(state.currentSavedId);
    if (!entry) return;
    entry.data = snapshot();
    entry.savedAt = Date.now();
    persistSaved();
    renderSavedList();
  }

  function openInvoice(id) {
    var entry = findSaved(id);
    if (!entry) return;
    var d = JSON.parse(JSON.stringify(entry.data));
    for (var i = 0; i < INVOICE_FIELDS.length; i++) {
      var k = INVOICE_FIELDS[i];
      if (k in d) state[k] = d[k];
    }
    if (!Array.isArray(state.items)) state.items = [];
    state.currentSavedId = id;
    save();
    fillForm();
    renderAll();
    renderSavedList();
  }

  function duplicateInvoice(id) {
    var entry = findSaved(id);
    if (!entry) return;
    var copy = JSON.parse(JSON.stringify(entry.data));
    copy.invoiceNumber = nextInvoiceNumber();
    var newId = newSavedId();
    savedInvoices.unshift({ id: newId, savedAt: Date.now(), data: copy });
    persistSaved();
    openInvoice(newId);
  }

  function deleteInvoice(id) {
    var entry = findSaved(id);
    if (!entry) return;
    if (!window.confirm("Delete invoice " + (entry.data.invoiceNumber || "") + "? This cannot be undone.")) {
      return;
    }
    savedInvoices = savedInvoices.filter(function (e) {
      return e.id !== id;
    });
    persistSaved();
    if (state.currentSavedId === id) {
      state.currentSavedId = "";
      save();
    }
    renderSavedList();
  }

  // Start a fresh invoice, keeping business details but clearing the client/items.
  function newInvoice() {
    state.currentSavedId = "";
    state.clientName = "";
    state.clientEmail = "";
    state.clientAddress = "";
    state.invoiceNumber = nextInvoiceNumber();
    state.issueDate = todayISO();
    state.dueDate = "";
    state.taxRate = 0;
    state.discount = 0;
    state.notes = "";
    state.items = [{ id: uid(), description: "", qty: 1, price: 0 }];
    save();
    fillForm();
    renderAll();
    renderSavedList();
  }

  function renderSavedList() {
    var el = $("savedList");
    if (!el) return;
    el.innerHTML = "";

    if (savedInvoices.length === 0) {
      var empty = document.createElement("p");
      empty.className = "saved-empty";
      empty.textContent = "No saved invoices yet. Fill one in and press \u201cSave current\u201d.";
      el.appendChild(empty);
      return;
    }

    savedInvoices.forEach(function (entry) {
      var d = entry.data || {};
      var totals = totalsFor(d);
      var isActive = entry.id === state.currentSavedId;
      var savedOn = formatDate(new Date(entry.savedAt || Date.now()).toISOString().slice(0, 10));

      var row = document.createElement("div");
      row.className = "saved-item" + (isActive ? " saved-item--active" : "");
      row.setAttribute("data-id", entry.id);
      row.innerHTML =
        '<label class="saved-item__check"><input type="checkbox" data-check="1" aria-label="Select invoice" /></label>' +
        '<button type="button" class="saved-item__open" data-act="open">' +
          '<span class="saved-item__num">' + escapeHtml(d.invoiceNumber || "(no number)") + "</span>" +
          '<span class="saved-item__client">' + escapeHtml(d.clientName || "No client") + "</span>" +
          '<span class="saved-item__meta">' + escapeHtml(d.currency || "") + formatMoney(totals.total) + " \u00b7 " + escapeHtml(savedOn) + "</span>" +
        "</button>" +
        '<div class="saved-item__actions">' +
          '<button type="button" class="btn btn--tiny" data-act="duplicate">Duplicate</button>' +
          '<button type="button" class="btn btn--tiny btn--danger-ghost" data-act="delete">Delete</button>' +
        "</div>";
      el.appendChild(row);
    });
  }

  /* ---- Licensing / Pro (Phase 3, Option A) ----
     All Pro checks go through isPro(). activateLicense() returns a Promise so
     Option B (async Gumroad verification) can be added WITHOUT changing any
     caller. Keys are real Gumroad keys from day one, so upgrading to online
     verification later never invalidates an existing customer's license. */
  function loadLicense() {
    try {
      var raw = localStorage.getItem(LICENSE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.key) {
        license.key = String(parsed.key);
        license.activatedAt = parsed.activatedAt || 0;
        license.verified = !!parsed.verified;
      }
    } catch (e) {
      /* ignore corrupt license data */
    }
  }

  function persistLicense() {
    try {
      localStorage.setItem(LICENSE_KEY, JSON.stringify(license));
    } catch (e) {
      /* storage blocked — Pro simply won't persist */
    }
  }

  // Permissive offline format check. Kept loose on purpose so we NEVER reject a
  // genuine Gumroad key (Option B does the authoritative online check later).
  function isValidKeyFormat(key) {
    var k = String(key || "").trim().toUpperCase();
    return /^[A-Z0-9]{4,}(-[A-Z0-9]{2,}){1,}$/.test(k);
  }

  function isPro() {
    return !!(license && license.key);
  }

  // Returns a Promise<{ ok, message }>. Option A resolves locally; Option B will
  // do `fetch` to Gumroad's verify endpoint here before resolving ok:true.
  function activateLicense(key) {
    key = String(key || "").trim();
    if (!isValidKeyFormat(key)) {
      return Promise.resolve({
        ok: false,
        message: "That doesn't look like a valid license key. Copy it exactly from your Gumroad receipt."
      });
    }
    // --- Option B hook (later): when GUMROAD_PRODUCT_ID is set, verify online here. ---
    license = { key: key.toUpperCase(), activatedAt: Date.now(), verified: false };
    persistLicense();
    return Promise.resolve({ ok: true });
  }

  function removeLicense() {
    license = { key: "", activatedAt: 0, verified: false };
    try {
      localStorage.removeItem(LICENSE_KEY);
    } catch (e) {}
  }

  // Reflect Pro state across the whole UI.
  function applyProState() {
    var pro = isPro();

    var btn = $("btnPro");
    if (btn) {
      btn.textContent = pro ? "\u2605 Pro" : "Upgrade to Pro";
      btn.classList.toggle("is-pro", pro);
    }

    var buy = $("proBuyLink");
    if (buy) {
      buy.setAttribute("href", GUMROAD_BUY_URL || "#");
      buy.textContent = "Get Pro \u2014 " + PRO_PRICE;
    }
    var priceEl = $("proPrice");
    if (priceEl) priceEl.textContent = PRO_PRICE;

    var activeBlock = $("proActiveBlock");
    if (activeBlock) activeBlock.classList.toggle("is-hidden", !pro);

    renderPreview(); // watermark visibility depends on Pro
  }

  function openProModal() {
    var msg = $("licenseMsg");
    if (msg) msg.textContent = "";
    var input = $("licenseInput");
    if (input) input.value = license.key || "";
    applyProState();
    $("proModal").classList.remove("is-hidden");
  }

  function closeProModal() {
    $("proModal").classList.add("is-hidden");
  }

  /* ---- PDF / print (current, selected, or all) ---- */
  // Build a full invoice document as an HTML string for any invoice data object.
  function invoiceDocHtml(d) {
    d = d || {};
    var cur = d.currency || "";
    var totals = totalsFor(d);

    var logo = d.logo
      ? '<img class="invoice-doc__logo" src="' + escapeHtml(d.logo) + '" alt="" />'
      : "";

    var rows = (d.items || [])
      .filter(hasDescription)
      .map(function (it) {
        var amt = toNumber(it.qty) * toNumber(it.price);
        return (
          "<tr>" +
          '<td class="col-desc">' + escapeHtml(it.description) + "</td>" +
          '<td class="col-qty">' + escapeHtml(String(toNumber(it.qty))) + "</td>" +
          '<td class="col-price">' + escapeHtml(cur) + formatMoney(it.price) + "</td>" +
          '<td class="col-amount">' + escapeHtml(cur) + formatMoney(amt) + "</td>" +
          "</tr>"
        );
      })
      .join("");
    if (!rows) {
      rows = '<tr><td colspan="4" class="invoice-doc__muted">No items.</td></tr>';
    }

    var discountRow =
      totals.discount > 0
        ? '<div class="invoice-doc__total-row"><span>Discount</span><span>-' +
          escapeHtml(cur) + formatMoney(totals.discount) + "</span></div>"
        : "";

    var taxRow =
      toNumber(d.taxRate) > 0
        ? '<div class="invoice-doc__total-row"><span>Tax (' +
          escapeHtml(String(toNumber(d.taxRate))) + '%)</span><span>' +
          escapeHtml(cur) + formatMoney(totals.tax) + "</span></div>"
        : "";

    var notes =
      d.notes && String(d.notes).trim()
        ? '<div class="invoice-doc__notes">' + escapeHtml(d.notes) + "</div>"
        : "";

    // Watermark only for free users.
    var watermark = isPro()
      ? ""
      : '<div class="invoice-doc__stamp" aria-hidden="true"><span>Free version</span><span>Free version</span><span>Free version</span></div>' +
        '<div class="invoice-doc__watermark">Made with Free Invoice Generator \u2014 upgrade to Pro to remove this</div>';

    return (
      '<div class="invoice-doc__header">' +
        '<div class="invoice-doc__brand">' + logo +
          "<div>" +
            '<div class="invoice-doc__biz-name">' + escapeHtml(d.bizName || "Your business") + "</div>" +
            '<div class="invoice-doc__muted">' + escapeHtml(d.bizEmail || "") + "</div>" +
            '<div class="invoice-doc__muted invoice-doc__pre">' + escapeHtml(d.bizAddress || "") + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="invoice-doc__meta">' +
          '<div class="invoice-doc__invoice-title">INVOICE</div>' +
          '<div class="invoice-doc__muted">' + (d.invoiceNumber ? "#" + escapeHtml(d.invoiceNumber) : "") + "</div>" +
          '<div class="invoice-doc__muted">' + (d.issueDate ? "Issued: " + escapeHtml(formatDate(d.issueDate)) : "") + "</div>" +
          '<div class="invoice-doc__muted">' + (d.dueDate ? "Due: " + escapeHtml(formatDate(d.dueDate)) : "") + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="invoice-doc__billto">' +
        '<div class="invoice-doc__section-label">Bill to</div>' +
        '<div class="invoice-doc__strong">' + escapeHtml(d.clientName || "") + "</div>" +
        '<div class="invoice-doc__muted">' + escapeHtml(d.clientEmail || "") + "</div>" +
        '<div class="invoice-doc__muted invoice-doc__pre">' + escapeHtml(d.clientAddress || "") + "</div>" +
      "</div>" +
      '<table class="invoice-doc__table">' +
        "<thead><tr>" +
          '<th class="col-desc">Description</th>' +
          '<th class="col-qty">Qty</th>' +
          '<th class="col-price">Price</th>' +
          '<th class="col-amount">Amount</th>' +
        "</tr></thead>" +
        "<tbody>" + rows + "</tbody>" +
      "</table>" +
      '<div class="invoice-doc__totals">' +
        '<div class="invoice-doc__total-row"><span>Subtotal</span><span>' + escapeHtml(cur) + formatMoney(totals.subtotal) + "</span></div>" +
        discountRow +
        taxRow +
        '<div class="invoice-doc__total-row invoice-doc__total-row--grand"><span>Total</span><span>' + escapeHtml(cur) + formatMoney(totals.total) + "</span></div>" +
      "</div>" +
      notes +
      watermark
    );
  }

  // Render the given invoices into the print area and open the print dialog.
  function printInvoices(list) {
    if (!list || list.length === 0) {
      alert("No invoices to download. Select at least one, or save one first.");
      return;
    }
    var area = $("printArea");
    area.innerHTML = list
      .map(function (d) {
        return '<div class="print-page"><div class="invoice-doc">' + invoiceDocHtml(d) + "</div></div>";
      })
      .join("");

    // The browser's print header/footer prints document.title. Swap it to the
    // invoice number so it never shows the app name (restored after printing).
    savedDocTitle = document.title;
    if (list.length === 1) {
      document.title = list[0].invoiceNumber ? "Invoice " + list[0].invoiceNumber : "Invoice";
    } else {
      document.title = "Invoices";
    }
    window.print();
  }

  function getSelectedSavedData() {
    var checks = $("savedList").querySelectorAll('input[data-check]:checked');
    var out = [];
    for (var i = 0; i < checks.length; i++) {
      var row = checks[i].closest(".saved-item");
      if (!row) continue;
      var entry = findSaved(row.getAttribute("data-id"));
      if (entry) out.push(entry.data);
    }
    return out;
  }

  function setSelectAll(checked) {
    var checks = $("savedList").querySelectorAll('input[data-check]');
    for (var i = 0; i < checks.length; i++) {
      checks[i].checked = checked;
    }
  }

  /* ---- Totals ---- */
  // Works on any invoice-shaped object (draft state or a saved snapshot).
  function totalsFor(d) {
    var subtotal = 0;
    var items = (d && d.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (!hasDescription(items[i])) continue;
      subtotal += toNumber(items[i].qty) * toNumber(items[i].price);
    }
    var discount = toNumber(d.discount);
    var taxable = Math.max(0, subtotal - discount);
    var tax = taxable * (toNumber(d.taxRate) / 100);
    var total = taxable + tax;
    return { subtotal: subtotal, discount: discount, tax: tax, total: total };
  }

  function computeTotals() {
    return totalsFor(state);
  }

  /* ---- Render: item editor rows ---- */
  function renderItems() {
    var list = $("itemsList");
    list.innerHTML = "";

    state.items.forEach(function (item) {
      var lineTotal = toNumber(item.qty) * toNumber(item.price);

      var row = document.createElement("div");
      row.className = "item-row";
      if (!hasDescription(item)) row.className += " item-row--incomplete";
      row.setAttribute("data-id", item.id);

      row.innerHTML =
        '<div class="item-row__grid">' +
          '<div class="field item-row__desc">' +
            '<label class="field__label">Description</label>' +
            '<input type="text" data-item="description" value="' + escapeHtml(item.description) + '" placeholder="Service or product" />' +
            '<span class="field__hint">Required — empty items are skipped on the invoice.</span>' +
          "</div>" +
          '<div class="field">' +
            '<label class="field__label">Qty</label>' +
            '<input type="number" data-item="qty" min="0" step="any" inputmode="decimal" value="' + escapeHtml(item.qty) + '" />' +
          "</div>" +
          '<div class="field">' +
            '<label class="field__label">Price</label>' +
            '<input type="number" data-item="price" min="0" step="any" inputmode="decimal" value="' + escapeHtml(item.price) + '" />' +
          "</div>" +
          '<div class="item-row__amount">' + escapeHtml(state.currency) + formatMoney(lineTotal) + "</div>" +
        "</div>" +
        '<button type="button" class="btn btn--icon item-row__remove" aria-label="Remove item">Remove</button>';

      list.appendChild(row);
    });
  }

  /* ---- Render: live preview ---- */
  function renderPreview() {
    var totals = computeTotals();
    var cur = state.currency || "";

    // Business
    setText("pvBizName", state.bizName || "Your business");
    setText("pvBizEmail", state.bizEmail);
    setText("pvBizAddress", state.bizAddress);

    // Logo
    var pvLogo = $("pvLogo");
    if (state.logo) {
      pvLogo.src = state.logo;
      pvLogo.classList.remove("is-hidden");
    } else {
      pvLogo.classList.add("is-hidden");
      pvLogo.removeAttribute("src");
    }

    // Meta
    setText("pvInvoiceNumber", state.invoiceNumber ? "#" + state.invoiceNumber : "");
    setText("pvIssueDate", state.issueDate ? "Issued: " + formatDate(state.issueDate) : "");
    setText("pvDueDate", state.dueDate ? "Due: " + formatDate(state.dueDate) : "");

    // Client
    setText("pvClientName", state.clientName || "Client name");
    setText("pvClientEmail", state.clientEmail);
    setText("pvClientAddress", state.clientAddress);

    // Items table (only items with a description appear on the invoice)
    var tbody = $("pvItems");
    tbody.innerHTML = "";
    var visibleItems = state.items.filter(hasDescription);
    if (visibleItems.length === 0) {
      var empty = document.createElement("tr");
      empty.innerHTML = '<td colspan="4" class="invoice-doc__muted">No items yet — add a description on the left.</td>';
      tbody.appendChild(empty);
    } else {
      visibleItems.forEach(function (item) {
        var amount = toNumber(item.qty) * toNumber(item.price);
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td class="col-desc">' + escapeHtml(item.description) + "</td>" +
          '<td class="col-qty">' + escapeHtml(String(toNumber(item.qty))) + "</td>" +
          '<td class="col-price">' + escapeHtml(cur) + formatMoney(item.price) + "</td>" +
          '<td class="col-amount">' + escapeHtml(cur) + formatMoney(amount) + "</td>";
        tbody.appendChild(tr);
      });
    }

    // Totals
    setText("pvSubtotal", cur + formatMoney(totals.subtotal));

    var discountRow = $("pvDiscountRow");
    if (totals.discount > 0) {
      discountRow.classList.remove("is-hidden");
      setText("pvDiscount", "-" + cur + formatMoney(totals.discount));
    } else {
      discountRow.classList.add("is-hidden");
    }

    var taxRow = $("pvTaxRow");
    if (toNumber(state.taxRate) > 0) {
      taxRow.classList.remove("is-hidden");
      setText("pvTaxLabel", "Tax (" + toNumber(state.taxRate) + "%)");
      setText("pvTax", cur + formatMoney(totals.tax));
    } else {
      taxRow.classList.add("is-hidden");
    }

    setText("pvTotal", cur + formatMoney(totals.total));

    // Notes
    var notesEl = $("pvNotes");
    if (state.notes && state.notes.trim()) {
      notesEl.textContent = state.notes;
      notesEl.classList.remove("is-hidden");
    } else {
      notesEl.classList.add("is-hidden");
    }

    // Watermark: shown for free users, hidden for Pro
    var wm = $("pvWatermark");
    if (wm) wm.classList.toggle("is-hidden", isPro());
    var stamp = $("pvStamp");
    if (stamp) stamp.classList.toggle("is-hidden", isPro());
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value || "";
  }

  /* ---- Sync form fields <- state ---- */
  function fillForm() {
    var models = document.querySelectorAll("[data-model]");
    for (var i = 0; i < models.length; i++) {
      var el = models[i];
      var key = el.getAttribute("data-model");
      if (key in state) el.value = state[key];
    }

    var logoPreview = $("logoPreview");
    var btnRemoveLogo = $("btnRemoveLogo");
    if (state.logo) {
      logoPreview.src = state.logo;
      logoPreview.classList.remove("is-hidden");
      btnRemoveLogo.classList.remove("is-hidden");
    } else {
      logoPreview.classList.add("is-hidden");
      btnRemoveLogo.classList.add("is-hidden");
    }
  }

  function renderAll() {
    renderItems();
    renderPreview();
  }

  /* ---- Item operations ---- */
  function addItem() {
    state.items.push({ id: uid(), description: "", qty: 1, price: 0 });
    save();
    syncActiveSaved();
    renderAll();
  }

  function removeItem(id) {
    state.items = state.items.filter(function (it) {
      return it.id !== id;
    });
    save();
    syncActiveSaved();
    renderAll();
  }

  /* ---- Event wiring ---- */
  function bindEvents() {
    // Top-level form fields
    document.getElementById("invoiceForm").addEventListener("input", function (e) {
      var el = e.target;
      var key = el.getAttribute && el.getAttribute("data-model");
      if (key && key in state) {
        state[key] = el.value;
        save();
        syncActiveSaved();
        renderPreview();
        if (key === "currency") renderItems();
      }
    });

    // Item field edits (event delegation)
    $("itemsList").addEventListener("input", function (e) {
      var el = e.target;
      var field = el.getAttribute && el.getAttribute("data-item");
      if (!field) return;
      var rowEl = el.closest(".item-row");
      if (!rowEl) return;
      var id = rowEl.getAttribute("data-id");
      var item = findItem(id);
      if (!item) return;
      item[field] = el.value;
      save();
      // Update just this row's amount + preview (avoid re-render to keep focus)
      var amountEl = rowEl.querySelector(".item-row__amount");
      if (amountEl) {
        var amt = toNumber(item.qty) * toNumber(item.price);
        amountEl.textContent = (state.currency || "") + formatMoney(amt);
      }
      if (field === "description") {
        rowEl.classList.toggle("item-row--incomplete", !hasDescription(item));
      }
      syncActiveSaved();
      renderPreview();
    });

    // Remove item
    $("itemsList").addEventListener("click", function (e) {
      var btn = e.target.closest(".item-row__remove");
      if (!btn) return;
      var rowEl = btn.closest(".item-row");
      if (rowEl) removeItem(rowEl.getAttribute("data-id"));
    });

    $("btnAddItem").addEventListener("click", addItem);

    // Saved invoices
    $("btnNewInvoice").addEventListener("click", newInvoice);
    $("btnSaveInvoice").addEventListener("click", function () {
      saveCurrent();
      flash($("btnSaveInvoice"), "Saved!");
    });
    $("btnDownloadAll").addEventListener("click", function () {
      printInvoices(savedInvoices.map(function (e) { return e.data; }));
    });
    $("btnDownloadSelected").addEventListener("click", function () {
      printInvoices(getSelectedSavedData());
    });
    $("chkSelectAll").addEventListener("change", function (e) {
      setSelectAll(e.target.checked);
    });
    $("savedList").addEventListener("click", function (e) {
      var actEl = e.target.closest("[data-act]");
      if (!actEl) return;
      var rowEl = actEl.closest(".saved-item");
      if (!rowEl) return;
      var id = rowEl.getAttribute("data-id");
      var act = actEl.getAttribute("data-act");
      if (act === "open") openInvoice(id);
      else if (act === "duplicate") duplicateInvoice(id);
      else if (act === "delete") deleteInvoice(id);
    });

    // Logo upload
    $("logoInput").addEventListener("change", handleLogo);
    $("btnRemoveLogo").addEventListener("click", function () {
      state.logo = "";
      $("logoInput").value = "";
      save();
      syncActiveSaved();
      fillForm();
      renderPreview();
    });

    // Header actions
    $("btnPrint").addEventListener("click", function () {
      printInvoices([snapshot()]);
    });
    $("btnSave").addEventListener("click", function () {
      saveCurrent();
      flash($("btnSave"), "Saved!");
    });
    $("btnReset").addEventListener("click", resetAll);

    // Clear the print area after printing so it never lingers.
    window.addEventListener("afterprint", function () {
      var area = $("printArea");
      if (area) area.innerHTML = "";
      if (savedDocTitle !== null) {
        document.title = savedDocTitle;
        savedDocTitle = null;
      }
    });

    // Pro / licensing
    $("btnPro").addEventListener("click", openProModal);
    $("proModal").addEventListener("click", function (e) {
      if (e.target.getAttribute && e.target.getAttribute("data-close")) closeProModal();
    });
    $("proBuyLink").addEventListener("click", function (e) {
      if (!GUMROAD_BUY_URL) {
        e.preventDefault();
        var m = $("licenseMsg");
        m.className = "modal__msg";
        m.textContent = "Purchase link isn't set up yet. (Owner: set GUMROAD_BUY_URL in app.js.)";
      }
    });
    $("btnActivate").addEventListener("click", function () {
      var input = $("licenseInput");
      var msg = $("licenseMsg");
      msg.className = "modal__msg";
      msg.textContent = "Checking\u2026";
      activateLicense(input.value).then(function (res) {
        if (res.ok) {
          msg.className = "modal__msg modal__msg--ok";
          msg.textContent = "\u2713 Activated. The watermark is now removed.";
          applyProState();
        } else {
          msg.className = "modal__msg";
          msg.textContent = res.message || "Could not activate that key.";
        }
      });
    });
    $("btnRemoveLicense").addEventListener("click", function () {
      if (!window.confirm("Remove Pro from this browser? The watermark will return here.")) return;
      removeLicense();
      var input = $("licenseInput");
      if (input) input.value = "";
      var msg = $("licenseMsg");
      msg.className = "modal__msg";
      msg.textContent = "License removed from this browser.";
      applyProState();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeProModal();
    });
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) return state.items[i];
    }
    return null;
  }

  function handleLogo(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Please choose an image smaller than 2 MB.");
      e.target.value = "";
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      state.logo = String(reader.result);
      save();
      fillForm();
      renderPreview();
    };
    reader.readAsDataURL(file);
  }

  function flash(btn, msg) {
    var original = btn.textContent;
    btn.textContent = msg;
    btn.disabled = true;
    setTimeout(function () {
      btn.textContent = original;
      btn.disabled = false;
    }, 1200);
  }

  function resetAll() {
    if (!window.confirm("Clear this invoice and start over? This cannot be undone.")) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    state.bizName = "";
    state.bizEmail = "";
    state.bizAddress = "";
    state.clientName = "";
    state.clientEmail = "";
    state.clientAddress = "";
    state.invoiceNumber = "INV-0001";
    state.currency = "$";
    state.issueDate = todayISO();
    state.dueDate = "";
    state.taxRate = 0;
    state.discount = 0;
    state.notes = "";
    state.logo = "";
    state.items = [{ id: uid(), description: "", qty: 1, price: 0 }];
    state.currentSavedId = "";
    save();
    fillForm();
    renderAll();
    renderSavedList();
  }

  /* ---- Init ---- */
  function init() {
    loadSaved();
    loadLicense();
    var hadData = load();
    if (!hadData) {
      state.issueDate = todayISO();
      state.items = [{ id: uid(), description: "", qty: 1, price: 0 }];
      save();
    }
    if (!state.issueDate) state.issueDate = todayISO();
    if (state.items.length === 0) {
      state.items = [{ id: uid(), description: "", qty: 1, price: 0 }];
    }
    fillForm();
    renderAll();
    renderSavedList();
    bindEvents();
    applyProState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
