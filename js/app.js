(function () {
  const ROUTES = { home: 1, bill: 1, bills: 1, products: 1, stock: 1, udhaar: 1, expenses: 1, reports: 1, settings: 1 };
  const TITLES = {
    home: "home", bill: "newBill", bills: "bills", products: "products",
    stock: "stockIn", udhaar: "udhaar", expenses: "expenses", reports: "reports", settings: "settings"
  };
  const NAV = [
    ["home", "home", "home"],
    ["bills", "bill", "bills"],
    ["products", "box", "products"],
    ["stock", "truck", "stockIn"],
    ["udhaar", "book", "udhaar"],
    ["expenses", "coin", "expenses"],
    ["reports", "chart", "reports"],
    ["settings", "gear", "settings"]
  ];
  const MORE = { bills: 1, stock: 1, expenses: 1, reports: 1, settings: 1 };
  const UNITS = ["pcs", "sheet", "sq ft", "kg", "litre", "roll", "bundle", "box", "set", "ft"];

  const Shop = {
    state: null,
    mode: "local",
    urls: [],
    route: "home",
    draft: null,
    purchase: null,
    saving: false,
    saveError: false,
    ui: { q: "", cat: "all", productQ: "", billQ: "", range: "today", from: "", to: "", customerId: "" }
  };
  let shellKey = "";
  window.Shop = Shop;

  function currentLang() {
    if (Shop.state && Shop.state.settings && Shop.state.settings.lang) return Shop.state.settings.lang;
    return window.__lang || "hi";
  }
  window.currentLang = currentLang;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  window.esc = esc;

  function inr(n) {
    const v = Number(n) || 0;
    const has = Math.round(Math.abs(v) * 100) % 100 !== 0;
    return new Intl.NumberFormat("en-IN", {
      style: "currency", currency: "INR",
      minimumFractionDigits: has ? 2 : 0,
      maximumFractionDigits: 2
    }).format(v);
  }
  window.inr = inr;

  function qtyStr(n) { return String(Model.num(n)); }
  window.qtyStr = qtyStr;

  function fmtWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(currentLang() === "hi" ? "hi-IN" : "en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(d);
  }
  window.fmtWhen = fmtWhen;

  function fmtDay(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(currentLang() === "hi" ? "hi-IN" : "en-IN", {
      day: "2-digit", month: "short", year: "numeric"
    }).format(d);
  }

  function payLabel(mode) {
    return t({ cash: "cash", upi: "upi", card: "card", cheque: "cheque", credit: "credit" }[mode] || "cash");
  }
  window.payLabel = payLabel;

  function catLabel(id) {
    const list = (Shop.state.settings.categories || []);
    const cat = list.find(function (c) { return c.id === id; });
    if (!cat) return id || "";
    return currentLang() === "hi" && cat.hi ? cat.hi : (cat.en || id);
  }

  function prodName(p) {
    if (!p) return "";
    return currentLang() === "hi" && p.nameHi ? p.nameHi : p.name;
  }

  function icon(name) {
    const paths = {
      home: '<path d="M4 11 12 4l8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
      bill: '<path d="M7 3h10v18l-2-1.2-2.5 1.2-2.5-1.2L8 21l-1-1z"/><path d="M9.5 8h5M9.5 12h5M9.5 16h3"/>',
      box: '<path d="M3 8l9-4 9 4-9 4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/>',
      truck: '<path d="M3 7h11v10H3z"/><path d="M14 11h4l3 3v3h-7z"/><circle cx="7.5" cy="18" r="1.4"/><circle cx="17" cy="18" r="1.4"/>',
      book: '<path d="M6 4h12v16H8a2 2 0 0 0-2 2z"/><path d="M6 4v16"/>',
      coin: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
      chart: '<path d="M4 19V5M4 19h16"/><path d="M8 15v-3M12 15V8M16 15v-5"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4"/>',
      more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>'
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || "") + "</svg>";
  }

  function navBtn(route) {
    const item = NAV.find(function (row) { return row[0] === route; });
    return '<button type="button" data-go="' + route + '">' + icon(item[1]) + "<span>" + esc(t(item[2])) + "</span></button>";
  }

  function tab(route) {
    if (route === "bill") {
      return '<button type="button" data-go="bill">' + icon("bill") + "<span>" + esc(t("newBill")) + "</span></button>";
    }
    return navBtn(route);
  }

  function langSwitch(big) {
    const lang = currentLang();
    return '<div class="lang' + (big ? "" : "") + '">' +
      '<button type="button" data-act="lang" data-lang="en" class="' + (lang === "en" ? "on" : "") + '">' + (big ? "English" : "EN") + "</button>" +
      '<button type="button" data-act="lang" data-lang="hi" class="' + (lang === "hi" ? "on" : "") + '">' + (big ? "हिन्दी" : "हिं") + "</button></div>";
  }

  function newDraft() {
    return {
      items: [], customerId: "", customerName: "", customerPhone: "",
      discount: "", paid: "", paidEdited: false, payMode: "cash", note: "", opId: Model.uid()
    };
  }

  function blankPurchase() {
    return {
      supplier: "",
      date: Model.dayKey(new Date().toISOString()),
      note: "",
      opId: Model.uid(),
      items: [{ productId: "", qty: 1, cost: "" }]
    };
  }

  function toast(message) {
    const root = document.getElementById("toasts");
    if (!root) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    root.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  function setPill() {
    const el = document.getElementById("save-pill");
    if (!el) return;
    if (Shop.saveError) {
      el.textContent = t("saveFailedShort");
      el.className = "pill bad";
      return;
    }
    el.textContent = Shop.mode === "server" ? t("connected") : t("thisDevice");
    el.className = "pill";
  }

  function fail(result) {
    if (!result || result.ok) return false;
    toast(t(result.error || "saveFailed"));
    if (result.error === "saveFailed" || result.error === "conflict") setPill();
    return true;
  }

  async function commit(mutator) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const base = Shop.state.updatedAt;
      const copy = JSON.parse(JSON.stringify(Shop.state));
      const result = mutator(copy);
      if (!result || result.ok === false) return result;
      copy.updatedAt = new Date().toISOString();
      try {
        const saved = await Store.save(copy, base, false);
        if (saved.conflict) {
          Shop.state = saved.current;
          if (attempt === 2) return { ok: false, error: "conflict" };
          continue;
        }
        Shop.state = copy;
        Shop.saveError = false;
        setPill();
        if (attempt > 0) toast(t("conflict"));
        return result;
      } catch (e) {
        Shop.saveError = true;
        setPill();
        return { ok: false, error: "saveFailed" };
      }
    }
    return { ok: false, error: "conflict" };
  }

  function lanUrl() {
    return (Shop.urls || []).find(function (u) { return !/localhost|127\.0\.0\.1/.test(u); }) || "";
  }

  function openModal(html) {
    const root = document.getElementById("modal");
    if (!root) return;
    root.hidden = false;
    root.innerHTML = '<div class="backdrop" data-act="backdrop">' + html + "</div>";
  }

  function closeModal(yes) {
    const root = document.getElementById("modal");
    if (root) {
      root.innerHTML = "";
      root.hidden = true;
    }
    if (Shop._ask) {
      const fn = Shop._ask;
      Shop._ask = null;
      fn(yes === true);
    }
  }

  function ask(message, okLabel, danger) {
    return new Promise(function (resolve) {
      Shop._ask = resolve;
      openModal(
        '<div class="dialog" role="dialog" aria-modal="true"><p>' + esc(message) + "</p>" +
        '<div class="actions"><button type="button" class="btn ghost" data-act="ask-no">' + esc(t("cancel")) + "</button>" +
        '<button type="button" class="btn ' + (danger ? "danger" : "") + '" data-act="ask-yes">' + esc(okLabel || t("confirm")) + "</button></div></div>"
      );
    });
  }

  function statusTag(bill) {
    const key = { paid: "statusPaid", partial: "statusPartial", credit: "statusCredit", void: "statusVoid" }[bill.status] || "statusCredit";
    return '<span class="tag ' + esc(bill.status) + '">' + esc(t(key)) + "</span>";
  }

  function banner() {
    if (Shop.mode === "server") {
      const url = lanUrl();
      if (!url) return '<div class="banner warn"><p>' + esc(t("firewallNote")) + "</p></div>";
      return '<div class="banner"><p>' + esc(t("serverBanner")) + " <strong>" + esc(url) + "</strong></p>" +
        '<button type="button" class="btn ghost tiny" data-act="copy-link">' + esc(t("copyLink")) + "</button></div>";
    }
    return '<div class="banner warn"><p>' + esc(t("localBanner")) + "</p></div>";
  }

  function billRow(bill) {
    return '<button type="button" class="brow" data-act="open-bill" data-id="' + esc(bill.id) + '"><div><strong>' +
      esc(bill.number) + "</strong><span class='quiet'>" + esc(bill.customerName || "—") + " · " + esc(fmtWhen(bill.createdAt)) +
      "</span></div><div><b>" + inr(bill.total) + "</b><div>" + statusTag(bill) +
      (bill.due > 0 && bill.status !== "void" ? " <span class='quiet'>" + inr(bill.due) + "</span>" : "") + "</div></div></button>";
  }

  function homeView() {
    const today = Model.report(Shop.state, "today");
    const month = Model.report(Shop.state, "month");
    const low = Shop.state.products.filter(function (p) { return p.active !== false && Model.num(p.stock) <= Model.num(p.lowStock); });
    const recent = Shop.state.bills.slice(0, 6);
    const samples = Shop.state.products.some(function (p) { return p.sample; });
    return banner() +
      '<div class="stats">' +
      stat(t("todaySale"), inr(today.revenue), today.bills + " " + t("billCount")) +
      stat(t("collected"), inr(today.collected)) +
      stat(t("monthSale"), inr(month.revenue)) +
      stat(t("outstanding"), inr(today.outstanding)) +
      "</div>" +
      (samples ? '<p class="hint" style="margin-bottom:12px">' + esc(t("changeRates")) + "</p>" : "") +
      '<div class="grid-2"><section class="card"><div class="card-head"><h2>' + esc(t("lowStock")) + "</h2></div>" +
      (low.length ? low.map(function (p) {
        return '<button type="button" class="brow" data-act="edit-product" data-id="' + esc(p.id) + '"><div><strong>' +
          esc(prodName(p)) + "</strong><span class='quiet'>" + esc(catLabel(p.category)) + "</span></div><div>" +
          '<span class="tag ' + (Model.num(p.stock) <= 0 ? "out" : "low") + '">' +
          (Model.num(p.stock) <= 0 ? esc(t("out")) : esc(t("low"))) + " " + qtyStr(p.stock) + "</span></div></button>";
      }).join("") : '<p class="quiet">' + esc(t("noLowStock")) + "</p>") +
      "</section><section class='card'><div class='card-head'><h2>" + esc(t("recentBills")) + "</h2>" +
      '<button type="button" class="btn ghost tiny" data-go="bills">' + esc(t("viewAll")) + "</button></div>" +
      (recent.length ? recent.map(billRow).join("") : '<p class="quiet">' + esc(t("noBills")) + "</p>") +
      "</section></div>";
  }

  function stat(label, value, sub) {
    return '<article class="stat"><span>' + esc(label) + "</span><strong>" + value + "</strong>" +
      (sub ? "<em>" + esc(sub) + "</em>" : "") + "</article>";
  }

  function pickerCards() {
    const q = Shop.ui.q.trim().toLowerCase();
    const items = Shop.state.products.filter(function (p) {
      if (p.active === false) return false;
      if (Shop.ui.cat !== "all" && p.category !== Shop.ui.cat) return false;
      if (!q) return true;
      return (p.name + " " + (p.nameHi || "") + " " + (p.sku || "") + " " + catLabel(p.category)).toLowerCase().indexOf(q) >= 0;
    });
    if (!items.length) {
      return '<p class="quiet">' + esc(t("emptyProducts")) + '</p><button type="button" class="btn" data-act="new-product">' + esc(t("addFirst")) + "</button>";
    }
    return items.map(function (p) {
      const inBill = (Shop.draft.items || []).filter(function (it) { return it.productId === p.id; })
        .reduce(function (s, it) { return s + Model.num(it.qty); }, 0);
      const low = Model.num(p.stock) <= Model.num(p.lowStock);
      return '<button type="button" class="pcard' + (low ? " low" : "") + '" data-act="add-item" data-id="' + esc(p.id) + '">' +
        '<span class="eyebrow">' + esc(catLabel(p.category)) + "</span><strong>" + esc(prodName(p)) + "</strong>" +
        '<span class="price">' + inr(p.salePrice) + " <em>/ " + esc(p.unit || "") + "</em></span>" +
        '<span class="quiet">' + esc(t("stock")) + " " + qtyStr(p.stock) +
        (inBill ? " · " + esc(t("inBill")) + " " + qtyStr(inBill) : "") + "</span></button>";
    }).join("");
  }

  function linesHtml() {
    if (!Shop.draft.items.length) return '<p class="quiet">' + esc(t("linesEmpty")) + "</p>";
    return Shop.draft.items.map(function (it, i) {
      return '<div class="line" data-line="' + i + '"><div class="who"><strong>' + esc(currentLang() === "hi" && it.nameHi ? it.nameHi : it.name) +
        "</strong><span class='quiet'>" + esc(it.unit || "") + "</span></div>" +
        '<div class="stepper"><button type="button" data-act="qty-dec" data-i="' + i + '">−</button>' +
        '<input data-field="qty" inputmode="decimal" value="' + esc(it.qty) + '" aria-label="' + esc(t("qty")) + '">' +
        '<button type="button" data-act="qty-inc" data-i="' + i + '">+</button></div>' +
        '<input class="ratebox" data-field="rate" inputmode="decimal" value="' + esc(it.rate) + '" aria-label="' + esc(t("rate")) + '">' +
        '<b data-amount>' + inr(Model.lineAmount(it)) + "</b>" +
        '<button type="button" class="btn ghost tiny" data-act="del-line" data-i="' + i + '">' + esc(t("remove")) + "</button></div>";
    }).join("");
  }

  function totalsHtml() {
    const calc = Model.calcDraft(Shop.draft);
    return '<div class="sums"><p><span>' + esc(t("subtotal")) + "</span><b>" + inr(calc.subtotal) + "</b></p>" +
      (calc.discount ? "<p><span>" + esc(t("discount")) + "</span><b>− " + inr(calc.discount) + "</b></p>" : "") +
      '<p class="grand"><span>' + esc(t("total")) + "</span><b>" + inr(calc.total) + "</b></p>" +
      '<p><span>' + esc(t("due")) + "</span><b>" + inr(calc.due) + "</b></p>" +
      (calc.due > 0 ? "<p class='hint'>" + esc(t("roundNote")) + "</p>" : "") + "</div>";
  }

  function billView() {
    if (!Shop.draft) Shop.draft = newDraft();
    const calc = Model.calcDraft(Shop.draft);
    const cats = [{ id: "all", label: t("all") }].concat(Shop.state.settings.categories.map(function (c) {
      return { id: c.id, label: currentLang() === "hi" && c.hi ? c.hi : c.en };
    }));
    const modes = ["cash", "upi", "card", "cheque", "credit"];
    return '<div class="split bill-page"><section><input id="item-search" class="search" placeholder="' + esc(t("searchItems")) + '" value="' + esc(Shop.ui.q) + '">' +
      '<div class="chips">' + cats.map(function (c) {
        return '<button type="button" data-act="cat" data-cat="' + esc(c.id) + '" class="' + (Shop.ui.cat === c.id ? "on" : "") + '">' + esc(c.label) + "</button>";
      }).join("") + '</div><div id="plist" class="picker">' + pickerCards() + "</div></section>" +
      '<section class="billpad" id="billpad"><div class="pair"><label class="field"><span>' + esc(t("customer")) + "</span>" +
      '<input id="cust-name" list="cust-list" value="' + esc(Shop.draft.customerName) + '" placeholder="' + esc(t("customerPh")) + '"></label>' +
      '<label class="field"><span>' + esc(t("phone")) + "</span>" +
      '<input id="cust-phone" inputmode="tel" value="' + esc(Shop.draft.customerPhone) + '" placeholder="' + esc(t("phonePh")) + '"></label></div>' +
      "<datalist id='cust-list'>" + Shop.state.customers.map(function (c) {
        return '<option value="' + esc(c.name) + '"></option>';
      }).join("") + "</datalist>" +
      '<div id="lines">' + linesHtml() + "</div>" +
      '<label class="field"><span>' + esc(t("discount")) + '</span><input id="discount" inputmode="decimal" value="' + esc(Shop.draft.discount) + '"></label>' +
      '<div class="seg">' + modes.map(function (m) {
        return '<button type="button" data-act="mode" data-mode="' + m + '" class="' + (Shop.draft.payMode === m ? "on" : "") + '">' + esc(t(m === "credit" ? "credit" : m)) + "</button>";
      }).join("") + "</div>" +
      '<label class="field"><span>' + esc(t("paid")) + '</span><input id="paid" inputmode="decimal" value="' + esc(Shop.draft.paidEdited ? Shop.draft.paid : calc.paid) + '"></label>' +
      '<div class="seg"><button type="button" data-act="paid-quick" data-paid="full">' + esc(t("full")) + "</button>" +
      '<button type="button" data-act="paid-quick" data-paid="half">' + esc(t("half")) + "</button>" +
      '<button type="button" data-act="paid-quick" data-paid="zero">' + esc(t("onCredit")) + "</button></div>" +
      '<label class="field"><span>' + esc(t("note")) + '</span><input id="bill-note" value="' + esc(Shop.draft.note) + '" placeholder="' + esc(t("notePh")) + '"></label>' +
      '<div id="bill-totals">' + totalsHtml() + "</div>" +
      '<div class="actions" style="margin-top:10px"><button type="button" class="btn ghost" data-act="clear-bill">' + esc(t("clearBill")) + "</button>" +
      '<button type="button" class="btn" data-act="save-bill">' + esc(t("saveBill")) + "</button></div></section></div>" +
      '<div class="dock no-print"><div><span>' + esc(t("total")) + '</span><strong id="dock-total">' + inr(calc.total) + "</strong></div>" +
      '<button type="button" class="btn" data-act="save-bill">' + esc(t("saveBill")) + "</button></div>";
  }

  function billsView() {
    const q = Shop.ui.billQ.trim().toLowerCase();
    const rows = Shop.state.bills.filter(function (b) {
      if (!q) return true;
      return (b.number + " " + b.customerName + " " + b.customerPhone).toLowerCase().indexOf(q) >= 0;
    });
    return '<input id="bill-search" class="search" placeholder="' + esc(t("searchBills")) + '" value="' + esc(Shop.ui.billQ) + '">' +
      (rows.length ? rows.map(billRow).join("") : '<p class="quiet">' + esc(t(q ? "noMatch" : "noBills")) + "</p>");
  }

  function productListHtml() {
    const q = Shop.ui.productQ.trim().toLowerCase();
    const rows = Shop.state.products.filter(function (p) {
      if (!q) return true;
      return (p.name + " " + (p.nameHi || "") + " " + catLabel(p.category)).toLowerCase().indexOf(q) >= 0;
    });
    if (!rows.length) return '<p class="quiet">' + esc(t(q ? "noMatch" : "emptyProducts")) + "</p>";
    return rows.map(function (p) {
      return '<article class="prow"><div><strong>' + esc(prodName(p)) + "</strong><span class='quiet'>" + esc(catLabel(p.category)) +
        (p.sample ? " · " + esc(t("sampleTag")) : "") + (p.active === false ? " · " + esc(t("hidden")) : "") +
        "</span></div><div><b>" + inr(p.salePrice) + "</b><span class='quiet'>" + esc(t("onHand")) + " " + qtyStr(p.stock) + " " + esc(p.unit || "") +
        "</span></div><div class='actions'><button type='button' class='btn ghost tiny' data-act='edit-product' data-id='" + esc(p.id) + "'>" + esc(t("edit")) +
        "</button><button type='button' class='btn ghost tiny' data-act='goto-stock' data-id='" + esc(p.id) + "'>" + esc(t("bringIn")) + "</button></div></article>";
    }).join("");
  }

  function productsView() {
    return '<div class="card-head"><h2>' + esc(t("products")) + '</h2><button type="button" class="btn" data-act="new-product">' + esc(t("addProduct")) + "</button></div>" +
      '<input id="prod-search" class="search" placeholder="' + esc(t("searchItems")) + '" value="' + esc(Shop.ui.productQ) + '">' +
      '<div id="prod-list">' + productListHtml() + "</div>";
  }

  function stockView() {
    if (!Shop.purchase) Shop.purchase = blankPurchase();
    const options = Shop.state.products.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(prodName(p)) + "</option>";
    }).join("");
    const rows = Shop.purchase.items.map(function (it, i) {
      return '<div class="pair" data-prow="' + i + '" style="margin-bottom:8px"><select name="productId"><option value="">' + esc(t("selectProduct")) + "</option>" +
        options.replace('value="' + esc(it.productId) + '"', 'value="' + esc(it.productId) + '" selected') + "</select>" +
        '<div class="pair"><input name="qty" inputmode="decimal" value="' + esc(it.qty) + '" aria-label="' + esc(t("qty")) + '">' +
        '<input name="cost" inputmode="decimal" value="' + esc(it.cost) + '" placeholder="' + esc(t("costPrice")) + '"></div></div>';
    }).join("");
    const history = Shop.state.purchases.slice(0, 12).map(function (p) {
      return '<article class="prow"><div><strong>' + esc(p.supplier || "—") + "</strong><span class='quiet'>" + esc(fmtDay(p.date)) +
        (p.voided ? " · " + esc(t("statusVoid")) : "") + "</span></div><div><b>" + inr(p.total) + "</b>" +
        (p.voided ? "" : '<button type="button" class="btn ghost tiny" data-act="void-purchase" data-id="' + esc(p.id) + '">' + esc(t("undo")) + "</button>") +
        "</div></article>";
    }).join("");
    return '<form id="purchase-form" class="card" data-act="save-purchase"><h2>' + esc(t("stockIn")) + "</h2>" +
      '<div class="pair"><label class="field"><span>' + esc(t("supplier")) + '</span><input name="supplier" value="' + esc(Shop.purchase.supplier) + '" placeholder="' + esc(t("supplierPh")) + '"></label>' +
      '<label class="field"><span>' + esc(t("purchaseDate")) + '</span><input type="date" name="date" value="' + esc(Shop.purchase.date) + '"></label></div>' +
      rows +
      '<div class="actions"><button type="button" class="btn ghost" data-act="add-prow">' + esc(t("addRow")) + "</button>" +
      '<button type="submit" class="btn">' + esc(t("savePurchase")) + "</button></div></form>" +
      '<section class="card" style="margin-top:12px"><h2>' + esc(t("recentIn")) + "</h2>" +
      (history || '<p class="quiet">' + esc(t("noPurchases")) + "</p>") + "</section>";
  }

  function udhaarView() {
    const people = Shop.state.customers.slice().sort(function (a, b) { return b.balance - a.balance; });
    const owe = people.reduce(function (s, c) { return s + Math.max(0, c.balance); }, 0);
    const selected = people.find(function (c) { return c.id === Shop.ui.customerId; });
    const list = '<div class="cust-list"><p class="quiet">' + esc(t("peopleOwe")) + " <b>" + inr(owe) + "</b></p>" +
      (people.length ? people.map(function (c) {
        const label = c.balance < 0 ? t("advance") : t("balance");
        return '<button type="button" class="brow" data-act="pick-customer" data-id="' + esc(c.id) + '"><div><strong>' + esc(c.name) +
          "</strong><span class='quiet'>" + esc(c.phone || "") + "</span></div><div><b>" + inr(Math.abs(c.balance)) +
          "</b><span class='quiet'>" + esc(label) + "</span></div></button>";
      }).join("") : '<p class="quiet">' + esc(t("noCustomers")) + "</p>") + "</div>";
    let detail = '<div class="cust-detail card"><p class="quiet">' + esc(t("noCustomers")) + "</p></div>";
    if (selected) {
      const bills = Shop.state.bills.filter(function (b) { return b.customerId === selected.id; }).slice(0, 8);
      const pays = Shop.state.payments.filter(function (p) { return p.customerId === selected.id; }).slice(0, 8);
      detail = '<div class="cust-detail card"><button type="button" class="btn ghost tiny" data-act="clear-customer">' + esc(t("cancel")) + "</button>" +
        "<h2>" + esc(selected.name) + "</h2><p class='quiet'>" + esc(t("balanceWord")) + " " + inr(selected.balance) + "</p>" +
        '<div class="pair"><label class="field"><span>' + esc(t("customer")) + '</span><input id="edit-cname" value="' + esc(selected.name) + '"></label>' +
        '<label class="field"><span>' + esc(t("phone")) + '</span><input id="edit-cphone" value="' + esc(selected.phone || "") + '"></label></div>' +
        '<button type="button" class="btn ghost" data-act="save-customer" data-id="' + esc(selected.id) + '">' + esc(t("save")) + "</button>" +
        '<form data-act="save-payment" style="margin-top:12px"><h3>' + esc(t("receivePayment")) + "</h3>" +
        '<input type="hidden" name="customerId" value="' + esc(selected.id) + '">' +
        '<div class="pair"><label class="field"><span>' + esc(t("amountWord")) + '</span><input name="amount" inputmode="decimal"></label>' +
        '<label class="field"><span>' + esc(t("mode")) + '</span><select name="mode"><option value="cash">' + esc(t("cash")) + '</option><option value="upi">' + esc(t("upi")) +
        '</option><option value="card">' + esc(t("card")) + '</option><option value="cheque">' + esc(t("cheque")) + "</option></select></label></div>" +
        '<button class="btn good" type="submit">' + esc(t("receive")) + "</button></form>" +
        "<h3 style='margin-top:16px'>" + esc(t("bills")) + "</h3>" + (bills.map(billRow).join("") || "") +
        "<h3 style='margin-top:16px'>" + esc(t("got")) + "</h3>" +
        (pays.map(function (p) {
          return '<article class="prow"><div><strong>' + inr(p.amount) + "</strong><span class='quiet'>" + esc(fmtDay(p.date)) + " · " + esc(payLabel(p.mode)) +
            "</span></div><button type='button' class='btn ghost tiny' data-act='delete-payment' data-id='" + esc(p.id) + "'>" + esc(t("delete")) + "</button></article>";
        }).join("") || '<p class="quiet">—</p>') + "</div>";
    }
    return '<div class="master' + (selected ? " has-sel" : "") + '">' + list + detail + "</div>";
  }

  function expensesView() {
    const cats = Model.EXPENSE_CATS.map(function (c) {
      return '<option value="' + c + '">' + esc(t(c === "power" ? "power" : c)) + "</option>";
    }).join("");
    const rows = Shop.state.expenses.map(function (e) {
      return '<article class="prow"><div><strong>' + esc(t(e.category === "power" ? "power" : e.category)) + "</strong><span class='quiet'>" +
        esc(fmtDay(e.date)) + (e.note ? " · " + esc(e.note) : "") + "</span></div><div><b>" + inr(e.amount) +
        '</b><button type="button" class="btn ghost tiny" data-act="delete-expense" data-id="' + esc(e.id) + '">' + esc(t("delete")) + "</button></div></article>";
    }).join("");
    return '<form class="card" data-act="save-expense"><h2>' + esc(t("expense")) + "</h2><div class='pair'>" +
      '<label class="field"><span>' + esc(t("expenseCat")) + "</span><select name='category'>" + cats + "</select></label>" +
      '<label class="field"><span>' + esc(t("amountWord")) + "</span><input name='amount' inputmode='decimal'></label></div>" +
      '<div class="pair"><label class="field"><span>' + esc(t("date")) + "</span><input type='date' name='date' value='" + Model.dayKey(new Date().toISOString()) + "'></label>" +
      '<label class="field"><span>' + esc(t("note")) + "</span><input name='note'></label></div>" +
      '<button class="btn" type="submit">' + esc(t("saveExpense")) + "</button></form>" +
      '<section class="card" style="margin-top:12px">' + (rows || '<p class="quiet">' + esc(t("noExpenses")) + "</p>") + "</section>";
  }

  function currentReport() {
    return Model.report(Shop.state, Shop.ui.range, Shop.ui.from, Shop.ui.to);
  }

  function reportsView() {
    const rep = currentReport();
    const ranges = ["today", "week", "month", "custom"];
    const modes = Object.keys(rep.modes).map(function (key) {
      return "<p><span>" + esc(payLabel(key)) + "</span><b>" + inr(rep.modes[key]) + "</b></p>";
    }).join("");
    const top = rep.top.map(function (it) {
      const name = currentLang() === "hi" && it.nameHi ? it.nameHi : it.name;
      return '<article class="prow"><div><strong>' + esc(name) + "</strong><span class='quiet'>" + qtyStr(it.qty) +
        "</span></div><b>" + inr(it.amount) + "</b></article>";
    }).join("");
    return '<div class="seg">' + ranges.map(function (r) {
      return '<button type="button" data-act="range" data-range="' + r + '" class="' + (Shop.ui.range === r ? "on" : "") + '">' + esc(t(r)) + "</button>";
    }).join("") + "</div>" +
      (Shop.ui.range === "custom" ? '<div class="pair"><label class="field"><span>' + esc(t("from")) + '</span><input type="date" id="from" value="' + esc(Shop.ui.from) + '"></label>' +
        '<label class="field"><span>' + esc(t("to")) + '</span><input type="date" id="to" value="' + esc(Shop.ui.to) + '"></label></div>' : "") +
      '<p class="quiet">' + esc(fmtDay(rep.from + "T12:00:00")) + " – " + esc(fmtDay(rep.to + "T12:00:00")) + "</p>" +
      '<div class="report-grid" style="margin-top:12px">' +
      stat(t("revenue"), inr(rep.revenue), rep.bills + " " + t("billCount")) +
      stat(t("moneyIn"), inr(rep.collected)) +
      stat(t("newUdhaar"), inr(rep.udhaarNew)) +
      stat(t("grossProfit"), inr(rep.gross)) +
      stat(t("expenseTotal"), inr(rep.expenseTotal)) +
      stat(t("net"), inr(rep.net)) +
      "</div>" +
      (rep.missingCost ? '<p class="hint" style="margin:10px 0">' + esc(t("profitHint")) + "</p>" : "") +
      '<div class="grid-2" style="margin-top:12px"><section class="card"><h2>' + esc(t("byMode")) + "</h2>" + (modes || '<p class="quiet">' + esc(t("noSales")) + "</p>") +
      "</section><section class='card'><h2>" + esc(t("topItems")) + "</h2>" + (top || '<p class="quiet">' + esc(t("noSales")) + "</p>") + "</section></div>" +
      '<button type="button" class="btn ghost" style="margin-top:12px" data-act="csv">' + esc(t("downloadCsv")) + "</button>";
  }

  function settingsView() {
    const s = Shop.state.settings;
    const url = lanUrl();
    return '<form class="card" data-act="save-settings"><h2>' + esc(t("shopDetails")) + "</h2>" +
      '<label class="field"><span>' + esc(t("shopName")) + '</span><input name="shopName" value="' + esc(s.shopName) + '"></label>' +
      '<div class="pair"><label class="field"><span>' + esc(t("phone")) + '</span><input name="phone" value="' + esc(s.phone || "") + '"></label>' +
      '<label class="field"><span>' + esc(t("gstin")) + ' <em class="opt">' + esc(t("optional")) + '</em></span><input name="gstin" value="' + esc(s.gstin || "") + '"></label></div>' +
      '<label class="field"><span>' + esc(t("address")) + '</span><textarea name="address">' + esc(s.address || "") + "</textarea></label>" +
      '<label class="field"><span>' + esc(t("upi")) + ' <em class="opt">' + esc(t("optional")) + '</em></span><input name="upi" value="' + esc(s.upi || "") + '"></label>' +
      '<p class="hint">' + esc(t("gstNote")) + "</p>" +
      "<h2 style='margin-top:18px'>" + esc(t("receiptBlock")) + "</h2>" +
      '<label class="field"><span>' + esc(t("footer")) + '</span><input name="footer" value="' + esc(s.footer || "") + '" placeholder="' + esc(t("footerPh")) + '"></label>' +
      '<div class="pair"><label class="field"><span>' + esc(t("billPrefix")) + '</span><input name="billPrefix" value="' + esc(s.billPrefix || "SB") + '"></label>' +
      '<label class="field"><span>' + esc(t("nextNumber")) + '</span><input name="nextBill" inputmode="numeric" value="' + esc(s.nextBill || 1) + '"></label></div>' +
      '<button class="btn" type="submit">' + esc(t("saveSettings")) + "</button></form>" +
      '<section class="card" style="margin-top:12px"><h2>' + esc(t("data")) + "</h2><p class='quiet'>" + esc(t("backupHelp")) + "</p>" +
      (url ? "<p style='margin:8px 0'><strong>" + esc(url) + "</strong></p><p class='hint'>" + esc(t("leaveWindow")) + " " + esc(t("firewallNote")) + "</p>" : "<p class='hint'>" + esc(t("linkMissing")) + "</p>") +
      '<div class="actions" style="margin-top:10px"><button type="button" class="btn" data-act="backup">' + esc(t("downloadBackup")) + "</button>" +
      '<label class="btn ghost">' + esc(t("restore")) + '<input id="restore-file" type="file" accept="application/json,.json" hidden></label></div></section>' +
      '<section class="card" style="margin-top:12px"><h2>' + esc(t("sampleTag")) + "</h2><p class='hint'>" + esc(t("starterNote")) + "</p>" +
      '<div class="actions" style="margin-top:10px"><button type="button" class="btn ghost" data-act="load-samples">' + esc(t("loadStarter")) + "</button>" +
      '<button type="button" class="btn ghost" data-act="remove-samples">' + esc(t("removeStarter")) + "</button></div></section>" +
      '<section class="card" style="margin-top:12px"><h2>' + esc(t("later")) + "</h2><p>" + esc(t("staffLater")) + "</p><p class='hint' style='margin-top:6px'>" + esc(t("barcodeLater")) + "</p>" +
      '<p class="hint" style="margin-top:8px">' + esc(t("aboutBody")) + " " + esc(t("freeNote")) + "</p></section>" +
      '<section class="card" style="margin-top:12px"><h2>' + esc(t("danger")) + "</h2>" +
      '<button type="button" class="btn danger" data-act="erase">' + esc(t("eraseYes")) + "</button></section>";
  }

  function viewHtml() {
    if (Shop.route === "bill") return billView();
    if (Shop.route === "bills") return billsView();
    if (Shop.route === "products") return productsView();
    if (Shop.route === "stock") return stockView();
    if (Shop.route === "udhaar") return udhaarView();
    if (Shop.route === "expenses") return expensesView();
    if (Shop.route === "reports") return reportsView();
    if (Shop.route === "settings") return settingsView();
    return homeView();
  }

  function wizard() {
    const s = Shop.state.settings;
    return '<div class="wizard-wrap"><form class="wizard" id="setup-form" data-act="finish-setup">' +
      '<div class="mark">' + esc(t("plaque")) + "</div>" + langSwitch(true) +
      "<h1>" + esc(t("wizardTitle")) + "</h1><p class='lede'>" + esc(t("wizardSub")) + "</p>" +
      '<label class="field"><span>' + esc(t("shopName")) + '</span><input name="shopName" required value="' + esc(s.shopName || "") + '"></label>' +
      '<label class="field"><span>' + esc(t("phone")) + '</span><input name="phone" value="' + esc(s.phone || "") + '"></label>' +
      '<label class="field"><span>' + esc(t("address")) + '</span><textarea name="address">' + esc(s.address || "") + "</textarea></label>" +
      '<div class="pair"><label class="field"><span>' + esc(t("gstin")) + ' <em class="opt">' + esc(t("optional")) + '</em></span><input name="gstin" value="' + esc(s.gstin || "") + '"></label>' +
      '<label class="field"><span>' + esc(t("upi")) + ' <em class="opt">' + esc(t("optional")) + '</em></span><input name="upi" value="' + esc(s.upi || "") + '"></label></div>' +
      '<label class="check"><input type="checkbox" name="starter" checked> <span>' + esc(t("includeStarter")) + "<br><em class='quiet'>" + esc(t("starterNote")) + "</em></span></label>" +
      '<button class="btn wide" type="submit">' + esc(t("startShop")) + "</button>" +
      '<p class="hint" style="margin-top:10px">' + esc(t("freeNote")) + "</p></form></div>" +
      '<div id="modal" hidden></div><div id="toasts"></div>';
  }

  function frame() {
    return '<div class="app"><aside class="side"><div class="brand"><div class="mark">' + esc(t("plaque")) + '</div><div><strong id="brand-name"></strong><span>Shopbook</span></div></div>' +
      '<button type="button" class="side-cta" data-go="bill">' + icon("bill") + "<span>" + esc(t("newBill")) + "</span></button><nav class='nav'>" +
      NAV.map(function (row) { return navBtn(row[0]); }).join("") + "</nav></aside><section class='main'><header class='top'><h1 id='page-title'></h1><div class='top-actions'>" +
      '<button type="button" id="save-pill" class="pill" data-act="retry-save"></button>' + langSwitch(false) +
      '</div></header><div id="view" class="view"></div></section></div>' +
      '<nav class="tabbar">' + tab("home") + tab("bill") + tab("products") + tab("udhaar") +
      '<button type="button" data-act="toggle-more">' + icon("more") + "<span>" + esc(t("more")) + "</span></button></nav>" +
      '<div id="more-menu" class="more" hidden>' + ["bills", "stock", "expenses", "reports", "settings"].map(navBtn).join("") + "</div>" +
      '<div id="modal" hidden></div><div id="toasts"></div>';
  }

  function markNav() {
    document.querySelectorAll("[data-go]").forEach(function (el) {
      el.classList.toggle("active", el.dataset.go === Shop.route);
    });
    const more = document.querySelector("[data-act='toggle-more']");
    if (more) more.classList.toggle("active", !!MORE[Shop.route]);
    document.querySelectorAll(".lang button").forEach(function (el) {
      el.classList.toggle("on", el.dataset.lang === currentLang());
    });
  }

  function render() {
    const setup = !(Shop.state.settings && Shop.state.settings.setupDone);
    const key = (setup ? "s:" : "a:") + currentLang();
    const app = document.getElementById("app");
    document.documentElement.lang = currentLang() === "hi" ? "hi" : "en";
    if (setup) {
      shellKey = key;
      app.innerHTML = wizard();
      document.title = t("appName");
      return;
    }
    if (shellKey !== key || !document.getElementById("view")) {
      shellKey = key;
      app.innerHTML = frame();
    }
    document.getElementById("view").innerHTML = viewHtml();
    const title = document.getElementById("page-title");
    if (title) title.textContent = t(TITLES[Shop.route] || "home");
    const brand = document.getElementById("brand-name");
    if (brand) brand.textContent = Shop.state.settings.shopName || t("appName");
    markNav();
    setPill();
    document.title = (Shop.state.settings.shopName || t("appName")) + " · Shopbook";
  }

  function go(route) {
    if (!Shop.state.settings.setupDone || !ROUTES[route]) return;
    if (Shop.route === "bill") syncBillForm();
    if (Shop.route === "stock") syncPurchase();
    Shop.route = route;
    const menu = document.getElementById("more-menu");
    if (menu) menu.hidden = true;
    if (location.hash !== "#" + route) location.hash = route;
    render();
  }

  function syncBillForm() {
    if (!Shop.draft || !document.getElementById("cust-name")) return;
    Shop.draft.customerName = document.getElementById("cust-name").value;
    Shop.draft.customerPhone = document.getElementById("cust-phone").value;
    Shop.draft.discount = document.getElementById("discount").value;
    Shop.draft.note = document.getElementById("bill-note").value;
    const paid = document.getElementById("paid");
    if (paid) Shop.draft.paid = paid.value;
    document.querySelectorAll("[data-line]").forEach(function (row) {
      const line = Shop.draft.items[Number(row.dataset.line)];
      if (!line) return;
      const q = row.querySelector("[data-field='qty']");
      const r = row.querySelector("[data-field='rate']");
      if (q) line.qty = q.value;
      if (r) line.rate = r.value;
    });
  }

  function syncPurchase() {
    const form = document.getElementById("purchase-form");
    if (!form || !Shop.purchase) return;
    Shop.purchase.supplier = form.supplier.value;
    Shop.purchase.date = form.date.value;
    Shop.purchase.items = Array.prototype.map.call(form.querySelectorAll("[data-prow]"), function (row) {
      return {
        productId: row.querySelector("[name=productId]").value,
        qty: row.querySelector("[name=qty]").value,
        cost: row.querySelector("[name=cost]").value
      };
    });
  }

  function syncWizard() {
    const form = document.getElementById("setup-form");
    if (!form) return;
    const s = Shop.state.settings;
    s.shopName = form.shopName.value;
    s.phone = form.phone.value;
    s.address = form.address.value;
    s.gstin = form.gstin.value;
    s.upi = form.upi.value;
  }

  function patchPicker() {
    document.querySelectorAll("[data-cat]").forEach(function (el) {
      el.classList.toggle("on", el.dataset.cat === Shop.ui.cat);
    });
    const box = document.getElementById("plist");
    if (box) box.innerHTML = pickerCards();
  }

  function patchLines() {
    const lines = document.getElementById("lines");
    if (!lines) { render(); return; }
    lines.innerHTML = linesHtml();
    patchPay();
  }

  function patchPay() {
    if (!Shop.draft) return;
    document.querySelectorAll("[data-mode]").forEach(function (el) {
      el.classList.toggle("on", el.dataset.mode === Shop.draft.payMode);
    });
    const calc = Model.calcDraft(Shop.draft);
    const paid = document.getElementById("paid");
    if (paid && document.activeElement !== paid) paid.value = Shop.draft.paidEdited ? Shop.draft.paid : calc.paid;
    const box = document.getElementById("bill-totals");
    if (box) box.innerHTML = totalsHtml();
    const dock = document.getElementById("dock-total");
    if (dock) dock.textContent = inr(calc.total);
  }

  function productForm(product) {
    const cats = Shop.state.settings.categories.map(function (c) {
      const label = currentLang() === "hi" && c.hi ? c.hi : c.en;
      return '<option value="' + esc(c.id) + '"' + (product && product.category === c.id ? " selected" : "") + ">" + esc(label) + "</option>";
    }).join("");
    const units = UNITS.map(function (u) { return '<option value="' + u + '"></option>'; }).join("");
    openModal(
      '<form class="dialog" data-act="save-product" style="width:min(560px,100%)"><h2>' + esc(product ? t("editProduct") : t("addProduct")) + "</h2>" +
      (product ? '<input type="hidden" name="id" value="' + esc(product.id) + '">' : "") +
      '<label class="field"><span>' + esc(t("nameEn")) + '</span><input name="name" required value="' + esc(product ? product.name : "") + '"></label>' +
      '<label class="field"><span>' + esc(t("nameHi")) + ' <em class="opt">' + esc(t("optional")) + '</em></span><input name="nameHi" value="' + esc(product ? product.nameHi : "") + '"></label>' +
      '<label class="field"><span>' + esc(t("category")) + '</span><select name="category" id="cat-select">' + cats +
      '<option value="__new__">' + esc(t("newCategory")) + "</option></select></label>" +
      '<div id="new-cat" hidden class="pair"><label class="field"><span>' + esc(t("catEn")) + '</span><input name="catEn"></label>' +
      '<label class="field"><span>' + esc(t("catHi")) + '</span><input name="catHi"></label></div>' +
      '<label class="field"><span>' + esc(t("unit")) + '</span><input name="unit" list="unit-list" value="' + esc(product ? product.unit : "pcs") + '" placeholder="' + esc(t("unitsHint")) + '"></label>' +
      '<datalist id="unit-list">' + units + "</datalist>" +
      '<div class="pair"><label class="field"><span>' + esc(t("salePrice")) + '</span><input name="salePrice" inputmode="decimal" value="' + esc(product ? product.salePrice : "") + '"></label>' +
      '<label class="field"><span>' + esc(t("costPrice")) + '</span><input name="costPrice" inputmode="decimal" value="' + esc(product ? product.costPrice : "") + '"></label></div>' +
      '<div class="pair"><label class="field"><span>' + esc(t("openingStock")) + '</span><input name="stock" inputmode="decimal" value="' + (product ? esc(product.stock) : "0") + '"></label>' +
      '<label class="field"><span>' + esc(t("lowAt")) + '</span><input name="lowStock" inputmode="decimal" value="' + (product ? esc(product.lowStock) : "2") + '"></label></div>' +
      '<label class="field"><span>' + esc(t("itemCode")) + '</span><input name="sku" value="' + esc(product ? product.sku : "") + '"><em class="hint">' + esc(t("skuHelp")) + "</em></label>" +
      '<label class="check"><input type="checkbox" name="active"' + (!product || product.active !== false ? " checked" : "") + "> <span>" + esc(t("active")) + "</span></label>" +
      '<div class="actions"><button type="button" class="btn ghost" data-act="close-modal">' + esc(t("cancel")) + "</button>" +
      (product ? '<button type="button" class="btn danger" data-act="delete-product" data-id="' + esc(product.id) + '">' + esc(t("delete")) + "</button>" : "") +
      '<button class="btn" type="submit">' + esc(t("save")) + "</button></div></form>"
    );
  }

  function openReceipt(bill) {
    Shop.ui.receiptId = bill.id;
    openModal(
      '<div class="receipt-modal"><div class="actions receipt-actions no-print">' +
      '<button type="button" class="btn" data-act="print-receipt">' + esc(t("printPdf")) + "</button>" +
      '<button type="button" class="btn ghost" data-act="wa-receipt">' + esc(t("whatsapp")) + "</button>" +
      '<button type="button" class="btn ghost" data-act="email-receipt">' + esc(t("email")) + "</button>" +
      '<button type="button" class="btn ghost" data-act="copy-receipt">' + esc(t("copyText")) + "</button>" +
      (bill.status !== "void" ? '<button type="button" class="btn danger" data-act="void-bill">' + esc(t("void")) + "</button>" : "") +
      '<button type="button" class="btn ghost" data-act="close-modal">' + esc(t("close")) + "</button></div>" +
      '<p class="hint no-print">' + esc(t("printHint")) + "</p>" + Receipt.html(bill) + "</div>"
    );
  }

  function currentBill() {
    return Shop.state.bills.find(function (b) { return b.id === Shop.ui.receiptId; });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }

  function formData(form) {
    const data = {};
    new FormData(form).forEach(function (value, key) { data[key] = value; });
    const active = form.querySelector("[name=active]");
    if (active) data.active = active.checked;
    return data;
  }

  async function saveBill() {
    if (Shop.saving) return;
    Shop.saving = true;
    syncBillForm();
    const short = Shop.draft.items.some(function (it) {
      const product = Shop.state.products.find(function (p) { return p.id === it.productId; });
      return product && Model.num(it.qty) > Model.num(product.stock);
    });
    if (short) {
      const ok = await ask(t("oversell"), t("oversellYes"), false);
      if (!ok) { Shop.saving = false; return; }
    }
    const draft = JSON.parse(JSON.stringify(Shop.draft));
    Shop.saving = true;
    const result = await commit(function (state) { return Model.saveBill(state, draft); });
    Shop.saving = false;
    if (fail(result)) return;
    toast(tf("billSaved", { no: result.bill.number }));
    Shop.draft = newDraft();
    render();
    openReceipt(result.bill);
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type: type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  const acts = {
    lang: function (el) {
      syncWizard();
      const code = el.dataset.lang === "en" ? "en" : "hi";
      window.__lang = code;
      if (Shop.state) Shop.state.settings.lang = code;
      shellKey = "";
      render();
      if (Shop.state && Shop.state.settings.setupDone) {
        commit(function (state) {
          state.settings.lang = code;
          return { ok: true };
        });
      }
    },
    "toggle-more": function () {
      const menu = document.getElementById("more-menu");
      if (menu) menu.hidden = !menu.hidden;
    },
    "ask-yes": function () { closeModal(true); },
    "ask-no": function () { closeModal(false); },
    backdrop: function () { closeModal(false); },
    "close-modal": function () { closeModal(false); },
    "retry-save": async function () {
      if (!Shop.saveError) return;
      try {
        await Store.save(Shop.state, Shop.state.updatedAt, true);
        Shop.saveError = false;
        setPill();
        toast(t("savedOk"));
      } catch (e) {
        toast(t("saveFailed"));
      }
    },
    "copy-link": async function () {
      const url = lanUrl();
      if (!url) return;
      await copyText(url);
      toast(t("linkCopied"));
    },
    cat: function (el) {
      Shop.ui.cat = el.dataset.cat;
      patchPicker();
    },
    "add-item": function (el) {
      syncBillForm();
      const product = Shop.state.products.find(function (p) { return p.id === el.dataset.id; });
      if (!product || !Shop.draft) return;
      const found = Shop.draft.items.find(function (it) {
        return it.productId === product.id && Model.money(it.rate) === Model.money(product.salePrice);
      });
      if (found) found.qty = Model.num(found.qty) + 1;
      else Shop.draft.items.push({
        productId: product.id, name: product.name, nameHi: product.nameHi || "", unit: product.unit,
        qty: 1, rate: product.salePrice, cost: product.costPrice
      });
      patchLines();
      patchPicker();
    },
    "qty-inc": function (el) {
      syncBillForm();
      const line = Shop.draft.items[Number(el.dataset.i)];
      if (!line) return;
      line.qty = Model.num(line.qty) + 1;
      patchLines();
      patchPicker();
    },
    "qty-dec": function (el) {
      syncBillForm();
      const i = Number(el.dataset.i);
      const line = Shop.draft.items[i];
      if (!line) return;
      const next = Model.num(line.qty) - 1;
      if (next <= 0) Shop.draft.items.splice(i, 1);
      else line.qty = next;
      patchLines();
      patchPicker();
    },
    "del-line": function (el) {
      syncBillForm();
      Shop.draft.items.splice(Number(el.dataset.i), 1);
      patchLines();
      patchPicker();
    },
    mode: function (el) {
      syncBillForm();
      Shop.draft.payMode = el.dataset.mode;
      Shop.draft.paidEdited = false;
      patchPay();
    },
    "paid-quick": function (el) {
      syncBillForm();
      const calc = Model.calcDraft(Shop.draft);
      if (el.dataset.paid === "zero") {
        Shop.draft.payMode = "credit";
        Shop.draft.paidEdited = false;
      } else if (el.dataset.paid === "half") {
        if (Shop.draft.payMode === "credit") Shop.draft.payMode = "cash";
        Shop.draft.paidEdited = true;
        Shop.draft.paid = Model.money(calc.total / 2);
      } else {
        if (Shop.draft.payMode === "credit") Shop.draft.payMode = "cash";
        Shop.draft.paidEdited = false;
      }
      patchPay();
    },
    "clear-bill": async function () {
      if (Shop.draft && Shop.draft.items.length) {
        const ok = await ask(t("clearAsk"), t("clearBill"), true);
        if (!ok) return;
      }
      Shop.draft = newDraft();
      render();
    },
    "save-bill": saveBill,
    "open-bill": function (el) {
      const bill = Shop.state.bills.find(function (b) { return b.id === el.dataset.id; });
      if (bill) openReceipt(bill);
    },
    "print-receipt": function () {
      document.body.classList.add("printing");
      window.print();
    },
    "wa-receipt": function () {
      const bill = currentBill();
      if (!bill) return;
      const win = window.open(Receipt.whatsappUrl(bill), "_blank", "noopener");
      if (!win) {
        copyText(Receipt.text(bill));
        toast(t("popupBlocked"));
      }
    },
    "email-receipt": function () {
      const bill = currentBill();
      if (bill) location.href = Receipt.mailUrl(bill);
    },
    "copy-receipt": async function () {
      const bill = currentBill();
      if (!bill) return;
      await copyText(Receipt.text(bill));
      toast(t("copied"));
    },
    "void-bill": async function () {
      const id = Shop.ui.receiptId;
      const ok = await ask(t("voidAsk"), t("void"), true);
      if (!ok) {
        const bill = Shop.state.bills.find(function (b) { return b.id === id; });
        if (bill) openReceipt(bill);
        return;
      }
      const result = await commit(function (state) { return Model.voidBill(state, id); });
      if (fail(result)) return;
      render();
      openReceipt(result.bill);
    },
    "new-product": function () { productForm(null); },
    "edit-product": function (el) {
      const product = Shop.state.products.find(function (p) { return p.id === el.dataset.id; });
      if (product) productForm(product);
    },
    "delete-product": async function (el) {
      const id = el.dataset.id;
      const ok = await ask(t("deleteAsk"), t("delete"), true);
      if (!ok) return;
      const result = await commit(function (state) { return Model.deleteProduct(state, id); });
      if (fail(result)) return;
      toast(t("productDeleted"));
      render();
    },
    "goto-stock": function (el) {
      const product = Shop.state.products.find(function (p) { return p.id === el.dataset.id; });
      Shop.purchase = blankPurchase();
      if (product) Shop.purchase.items = [{ productId: product.id, qty: 1, cost: product.costPrice }];
      go("stock");
    },
    "add-prow": function () {
      syncPurchase();
      Shop.purchase.items.push({ productId: "", qty: 1, cost: "" });
      render();
    },
    "void-purchase": async function (el) {
      const ok = await ask(t("voidPurchaseAsk"), t("undo"), true);
      if (!ok) return;
      const id = el.dataset.id;
      const result = await commit(function (state) { return Model.voidPurchase(state, id); });
      if (fail(result)) return;
      render();
    },
    "pick-customer": function (el) {
      Shop.ui.customerId = el.dataset.id;
      render();
    },
    "clear-customer": function () {
      Shop.ui.customerId = "";
      render();
    },
    "save-customer": async function (el) {
      const id = el.dataset.id;
      const name = document.getElementById("edit-cname").value;
      const phone = document.getElementById("edit-cphone").value;
      const result = await commit(function (state) { return Model.saveCustomer(state, { id: id, name: name, phone: phone }); });
      if (fail(result)) return;
      toast(t("accountSaved"));
      render();
    },
    "delete-payment": async function (el) {
      const ok = await ask(t("deletePaymentAsk"), t("delete"), true);
      if (!ok) return;
      const id = el.dataset.id;
      const result = await commit(function (state) { return Model.deletePayment(state, id); });
      if (fail(result)) return;
      render();
    },
    "delete-expense": async function (el) {
      const ok = await ask(t("deleteExpenseAsk"), t("delete"), true);
      if (!ok) return;
      const id = el.dataset.id;
      const result = await commit(function (state) { return Model.deleteExpense(state, id); });
      if (fail(result)) return;
      render();
    },
    range: function (el) {
      Shop.ui.range = el.dataset.range;
      if (Shop.ui.range === "custom") {
        const today = Model.dayKey(new Date().toISOString());
        if (!Shop.ui.from) Shop.ui.from = today;
        if (!Shop.ui.to) Shop.ui.to = today;
      }
      render();
    },
    csv: function () {
      const rep = currentReport();
      const bills = Shop.state.bills.filter(function (b) {
        return b.status !== "void" && Model.dayKey(b.createdAt) >= rep.from && Model.dayKey(b.createdAt) <= rep.to;
      });
      const header = ["Date", "Bill", "Customer", "Phone", "Items", "Total", "Paid", "Due", "Mode"];
      const lines = [header.join(",")];
      bills.forEach(function (b) {
        const items = b.items.map(function (it) { return it.name + " x " + it.qty; }).join("; ");
        const cols = [Model.dayKey(b.createdAt), b.number, b.customerName, b.customerPhone, items, b.total, b.paid, b.due, b.payMode];
        lines.push(cols.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","));
      });
      download("sales-" + rep.from + ".csv", "\uFEFF" + lines.join("\n"), "text/csv;charset=utf-8");
      toast(t("csvReady"));
    },
    backup: function () {
      download("shopbook-" + Model.dayKey(new Date().toISOString()) + ".json", JSON.stringify(Shop.state, null, 2), "application/json");
    },
    "load-samples": async function () {
      const result = await commit(function (state) { return Model.addSamples(state); });
      if (fail(result)) return;
      toast(t("starterLoaded"));
      render();
    },
    "remove-samples": async function () {
      const result = await commit(function (state) { return Model.removeSamples(state); });
      if (fail(result)) return;
      toast(t("starterRemoved"));
      render();
    },
    erase: async function () {
      const ok = await ask(t("eraseAsk"), t("eraseYes"), true);
      if (!ok) return;
      const lang = currentLang();
      Shop.state = Model.blankState();
      Shop.state.settings.lang = lang;
      Shop.state.updatedAt = new Date().toISOString();
      try {
        await Store.save(Shop.state, "", true);
      } catch (e) {
        Store.writeLocal(Shop.state);
      }
      Shop.draft = newDraft();
      Shop.purchase = blankPurchase();
      shellKey = "";
      render();
      toast(t("erased"));
    }
  };

  document.addEventListener("click", function (e) {
    const goEl = e.target.closest("[data-go]");
    if (goEl && !e.target.closest("[data-act]")) {
      go(goEl.dataset.go);
      return;
    }
    const el = e.target.closest("[data-act]");
    if (!el || !acts[el.dataset.act]) return;
    if (el.dataset.act === "backdrop" && e.target !== el) return;
    acts[el.dataset.act](el, e);
  });

  document.addEventListener("input", function (e) {
    const target = e.target;
    if (target.id === "item-search") {
      Shop.ui.q = target.value;
      const box = document.getElementById("plist");
      if (box) box.innerHTML = pickerCards();
      return;
    }
    if (target.id === "prod-search") {
      Shop.ui.productQ = target.value;
      const list = document.getElementById("prod-list");
      if (list) list.innerHTML = productListHtml();
      return;
    }
    if (target.id === "bill-search") {
      Shop.ui.billQ = target.value;
      render();
      const box = document.getElementById("bill-search");
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      return;
    }
    if (!Shop.draft) return;
    if (target.id === "cust-name") {
      Shop.draft.customerName = target.value;
      const match = Shop.state.customers.find(function (c) { return c.name.toLowerCase() === target.value.trim().toLowerCase(); });
      if (match) {
        Shop.draft.customerId = match.id;
        Shop.draft.customerPhone = match.phone || "";
        const phone = document.getElementById("cust-phone");
        if (phone) phone.value = Shop.draft.customerPhone;
      } else Shop.draft.customerId = "";
    }
    if (target.id === "cust-phone") Shop.draft.customerPhone = target.value;
    if (target.id === "discount") {
      Shop.draft.discount = target.value;
      patchPay();
    }
    if (target.id === "paid") {
      Shop.draft.paid = target.value;
      Shop.draft.paidEdited = true;
      patchPay();
    }
    if (target.id === "bill-note") Shop.draft.note = target.value;
    const row = target.closest("[data-line]");
    if (row && target.dataset.field) {
      const line = Shop.draft.items[Number(row.dataset.line)];
      if (!line) return;
      line[target.dataset.field] = target.value;
      const amount = row.querySelector("[data-amount]");
      if (amount) amount.textContent = inr(Model.lineAmount(line));
      patchPay();
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target.id === "cat-select") {
      const box = document.getElementById("new-cat");
      if (box) box.hidden = e.target.value !== "__new__";
    }
    if (e.target.name === "productId") {
      const product = Shop.state.products.find(function (p) { return p.id === e.target.value; });
      const cost = e.target.closest("[data-prow]").querySelector("[name=cost]");
      if (product && cost && cost.value === "") cost.value = product.costPrice;
      syncPurchase();
    }
    if (e.target.id === "from" || e.target.id === "to") {
      Shop.ui.range = "custom";
      if (e.target.id === "from") Shop.ui.from = e.target.value;
      if (e.target.id === "to") Shop.ui.to = e.target.value;
      render();
    }
    if (e.target.id === "restore-file" && e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      e.target.value = "";
      const reader = new FileReader();
      reader.onload = async function () {
        try {
          const data = JSON.parse(reader.result);
          if (!data || !data.settings) throw new Error("bad");
          const ok = await ask(t("restoreAsk"), t("restore"), true);
          if (!ok) return;
          Shop.state = Store.migrate(data);
          Shop.state.updatedAt = new Date().toISOString();
          await Store.save(Shop.state, "", true);
          Shop.draft = newDraft();
          shellKey = "";
          render();
          toast(t("restored"));
        } catch (err) {
          toast(t("restoreBad"));
        }
      };
      reader.readAsText(file);
    }
  });

  document.addEventListener("submit", function (e) {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    e.preventDefault();
    const act = form.dataset.act;
    if (act === "finish-setup") {
      const s = Shop.state.settings;
      s.shopName = form.shopName.value.trim();
      if (!s.shopName) { toast(t("needName")); return; }
      s.phone = form.phone.value.trim();
      s.address = form.address.value.trim();
      s.gstin = form.gstin.value.trim().toUpperCase();
      s.upi = form.upi.value.trim();
      s.lang = currentLang();
      s.setupDone = true;
      if (form.starter.checked) Model.addSamples(Shop.state);
      Shop.state.updatedAt = new Date().toISOString();
      Store.save(Shop.state, "", true).catch(function () { Store.writeLocal(Shop.state); });
      if (s.gstin && s.gstin.length !== 15) toast(t("gstinLen"));
      Shop.route = "home";
      shellKey = "";
      render();
      return;
    }
    if (act === "save-product") {
      const data = formData(form);
      commit(function (state) { return Model.saveProduct(state, data); }).then(function (result) {
        if (fail(result)) return;
        toast(t("productSaved"));
        closeModal(false);
        render();
      });
      return;
    }
    if (act === "save-purchase") {
      syncPurchase();
      const purchase = JSON.parse(JSON.stringify(Shop.purchase));
      commit(function (state) { return Model.savePurchase(state, purchase); }).then(function (result) {
        if (fail(result)) return;
        toast(t("purchaseSaved"));
        Shop.purchase = blankPurchase();
        render();
      });
      return;
    }
    if (act === "save-expense") {
      const data = formData(form);
      data.opId = Model.uid();
      commit(function (state) { return Model.saveExpense(state, data); }).then(function (result) {
        if (fail(result)) return;
        toast(t("expenseSaved"));
        render();
      });
      return;
    }
    if (act === "save-payment") {
      const data = formData(form);
      data.opId = Model.uid();
      commit(function (state) { return Model.savePayment(state, data); }).then(function (result) {
        if (fail(result)) return;
        toast(t("paymentSaved"));
        render();
      });
      return;
    }
    if (act === "save-settings") {
      const data = formData(form);
      commit(function (state) { return Model.saveSettings(state, data); }).then(function (result) {
        if (fail(result)) return;
        if (data.gstin && String(data.gstin).trim().length && String(data.gstin).trim().length !== 15) toast(t("gstinLen"));
        toast(t("settingsSaved"));
        shellKey = "";
        render();
      });
    }
  });

  window.addEventListener("afterprint", function () {
    document.body.classList.remove("printing");
  });

  window.addEventListener("hashchange", function () {
    if (!Shop.state || !Shop.state.settings.setupDone) return;
    const route = (location.hash || "#home").slice(1);
    if (!ROUTES[route] || route === Shop.route) return;
    Shop.route = route;
    render();
  });

  async function boot() {
    const loaded = await Store.load();
    Shop.state = loaded.state;
    Shop.mode = loaded.mode;
    Shop.urls = loaded.urls || [];
    Shop.draft = newDraft();
    Shop.purchase = blankPurchase();
    window.__lang = Shop.state.settings.lang || "hi";
    const hash = (location.hash || "").slice(1);
    if (Shop.state.settings.setupDone && ROUTES[hash]) Shop.route = hash;
    render();
  }

  boot();
})();
