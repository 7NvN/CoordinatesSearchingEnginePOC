(function () {
  const CATEGORIES = [
    { id: "mattress", en: "Mattresses", hi: "गद्दे" },
    { id: "pillow", en: "Pillows", hi: "तकिए" },
    { id: "ply", en: "Ply", hi: "प्लाय" },
    { id: "foamfix", en: "Foamfix", hi: "फोमफिक्स" },
    { id: "nails", en: "Nails", hi: "कीलें" },
    { id: "board", en: "Wooden boards", hi: "लकड़ी के बोर्ड" },
    { id: "sunmica", en: "Sunmica", hi: "सनमाइका" },
    { id: "fevicol", en: "Fevicol", hi: "फेविकोल" },
    { id: "blanket", en: "Blankets", hi: "कंबल" },
    { id: "other", en: "Other", hi: "अन्य" }
  ];

  const EXPENSE_CATS = ["rent", "power", "transport", "wages", "tea", "other"];
  const PAY_MODES = ["cash", "upi", "card", "cheque", "credit"];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function money(n) {
    const x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.round(x * 100) / 100;
  }

  function num(n) {
    const x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.round(x * 1000) / 1000;
  }

  function blankState() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      settings: {
        setupDone: false,
        lang: "hi",
        shopName: "",
        phone: "",
        address: "",
        gstin: "",
        upi: "",
        billPrefix: "SB",
        nextBill: 1,
        footer: "",
        categories: CATEGORIES.map(function (c) { return { id: c.id, en: c.en, hi: c.hi }; })
      },
      products: [],
      customers: [],
      bills: [],
      purchases: [],
      expenses: [],
      payments: [],
      stockMoves: []
    };
  }

  function sampleList() {
    return [
      ["Mattress 6×3", "गद्दा 6×3", "mattress", "pcs", 6500, 5200, 4, 1],
      ["Mattress 6×4", "गद्दा 6×4", "mattress", "pcs", 8500, 6800, 3, 1],
      ["Mattress 6×6", "गद्दा 6×6", "mattress", "pcs", 12000, 9600, 2, 1],
      ["Fibre pillow", "फाइबर तकिया", "pillow", "pcs", 350, 220, 20, 5],
      ["Ply 18mm 8×4", "प्लाय 18mm 8×4", "ply", "sheet", 2450, 2100, 15, 4],
      ["Ply 12mm 8×4", "प्लाय 12mm 8×4", "ply", "sheet", 1850, 1550, 12, 4],
      ["Foamfix", "फोमफिक्स", "foamfix", "pcs", 450, 320, 10, 3],
      ["Nails", "कीलें", "nails", "kg", 90, 70, 25, 5],
      ["Wooden board", "लकड़ी का बोर्ड", "board", "sheet", 1800, 1500, 8, 2],
      ["Sunmica", "सनमाइका", "sunmica", "sheet", 950, 780, 20, 4],
      ["Fevicol 1kg", "फेविकोल 1kg", "fevicol", "pcs", 280, 230, 15, 4],
      ["Fevicol 5kg", "फेविकोल 5kg", "fevicol", "pcs", 1250, 1050, 6, 2],
      ["Blanket single", "सिंगल कंबल", "blanket", "pcs", 700, 480, 10, 2],
      ["Blanket double", "डबल कंबल", "blanket", "pcs", 1100, 760, 8, 2]
    ];
  }

  function addSamples(state) {
    const have = {};
    state.products.forEach(function (p) { have[p.name] = true; });
    const now = new Date().toISOString();
    sampleList().forEach(function (row) {
      if (have[row[0]]) return;
      const item = {
        id: uid(),
        name: row[0],
        nameHi: row[1],
        category: row[2],
        unit: row[3],
        salePrice: row[4],
        costPrice: row[5],
        stock: row[6],
        lowStock: row[7],
        sku: "",
        active: true,
        sample: true,
        createdAt: now
      };
      state.products.push(item);
      state.stockMoves.push({
        id: uid(),
        date: now,
        productId: item.id,
        name: item.name,
        qty: item.stock,
        reason: "opening",
        note: "sample"
      });
    });
    return { ok: true };
  }

  function removeSamples(state) {
    const used = {};
    state.bills.forEach(function (b) {
      b.items.forEach(function (it) { used[it.productId] = true; });
    });
    state.products = state.products.filter(function (p) {
      return !p.sample || used[p.id];
    });
    return { ok: true };
  }

  function lineAmount(it) {
    return money(num(it.qty) * money(it.rate));
  }

  function calcDraft(draft) {
    const items = draft.items || [];
    const subtotal = money(items.reduce(function (s, it) { return s + lineAmount(it); }, 0));
    let discount = money(draft.discount);
    if (discount < 0) discount = 0;
    if (discount > subtotal) discount = subtotal;
    const total = money(subtotal - discount);
    let paid;
    if (draft.paidEdited) {
      paid = money(draft.paid);
      if (paid < 0) paid = 0;
      if (paid > total) paid = total;
    } else if (draft.payMode === "credit") {
      paid = 0;
    } else {
      paid = total;
    }
    return { subtotal: subtotal, discount: discount, total: total, paid: paid, due: money(total - paid) };
  }

  function findOrCreateCustomer(state, draft) {
    const name = String(draft.customerName || "").trim();
    const phone = String(draft.customerPhone || "").replace(/\s/g, "");
    let customer = null;
    if (draft.customerId) {
      customer = state.customers.find(function (c) { return c.id === draft.customerId; }) || null;
    }
    if (!customer && phone) {
      customer = state.customers.find(function (c) { return c.phone === phone; }) || null;
    }
    if (!customer && name) {
      customer = state.customers.find(function (c) {
        return c.name.toLowerCase() === name.toLowerCase();
      }) || null;
    }
    if (!customer) {
      if (!name) return null;
      customer = {
        id: uid(),
        name: name,
        phone: phone,
        balance: 0,
        createdAt: new Date().toISOString()
      };
      state.customers.push(customer);
    } else {
      if (name) customer.name = name;
      if (phone) customer.phone = phone;
    }
    return customer;
  }

  function saveBill(state, draft) {
    const totals = calcDraft(draft);
    if (!draft.items.length) return { ok: false, error: "needItems" };
    if (draft.items.some(function (it) { return !(num(it.qty) > 0); })) return { ok: false, error: "badQty" };
    if (totals.due > 0 && !String(draft.customerName || "").trim()) return { ok: false, error: "needCustomer" };
    const opId = draft.opId;
    if (opId) {
      const existing = state.bills.find(function (b) { return b.opId === opId; });
      if (existing) return { ok: true, bill: existing, duplicate: true };
    }
    const customer = (totals.due > 0 || String(draft.customerName || "").trim())
      ? findOrCreateCustomer(state, draft)
      : null;
    const now = new Date().toISOString();
    const n = state.settings.nextBill || 1;
    const bill = {
      id: uid(),
      opId: opId || uid(),
      number: (state.settings.billPrefix || "SB") + "-" + String(n).padStart(4, "0"),
      createdAt: now,
      customerId: customer ? customer.id : "",
      customerName: customer ? customer.name : String(draft.customerName || "").trim(),
      customerPhone: customer ? customer.phone : String(draft.customerPhone || "").trim(),
      items: draft.items.map(function (it) {
        return {
          productId: it.productId,
          name: it.name,
          nameHi: it.nameHi || "",
          unit: it.unit || "",
          qty: num(it.qty),
          rate: money(it.rate),
          cost: money(it.cost),
          amount: lineAmount(it)
        };
      }),
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      paid: totals.paid,
      due: totals.due,
      payMode: draft.payMode || "cash",
      note: String(draft.note || "").trim(),
      status: totals.due === 0 ? "paid" : (totals.paid > 0 ? "partial" : "credit")
    };
    state.settings.nextBill = n + 1;
    bill.items.forEach(function (it) {
      const product = state.products.find(function (p) { return p.id === it.productId; });
      if (!product) return;
      product.stock = num(product.stock - it.qty);
      state.stockMoves.push({
        id: uid(),
        date: now,
        productId: product.id,
        name: product.name,
        qty: -it.qty,
        reason: "sale",
        note: bill.number
      });
    });
    if (customer && bill.due > 0) customer.balance = money(customer.balance + bill.due);
    state.bills.unshift(bill);
    return { ok: true, bill: bill };
  }

  function voidBill(state, billId) {
    const bill = state.bills.find(function (b) { return b.id === billId; });
    if (!bill) return { ok: false, error: "missing" };
    if (bill.status === "void") return { ok: true, bill: bill, duplicate: true };
    const now = new Date().toISOString();
    bill.status = "void";
    bill.voidedAt = now;
    bill.items.forEach(function (it) {
      const product = state.products.find(function (p) { return p.id === it.productId; });
      if (!product) return;
      product.stock = num(product.stock + it.qty);
      state.stockMoves.push({
        id: uid(),
        date: now,
        productId: product.id,
        name: product.name,
        qty: it.qty,
        reason: "void",
        note: bill.number
      });
    });
    if (bill.customerId && bill.due > 0) {
      const customer = state.customers.find(function (c) { return c.id === bill.customerId; });
      if (customer) customer.balance = money(customer.balance - bill.due);
    }
    return { ok: true, bill: bill };
  }

  function saveProduct(state, form) {
    const name = String(form.name || "").trim();
    if (!name) return { ok: false, error: "needName" };
    let category = form.category || "other";
    if (category === "__new__") {
      const en = String(form.catEn || "").trim();
      const hi = String(form.catHi || "").trim() || en;
      if (!en) return { ok: false, error: "needCategory" };
      category = en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid();
      if (!state.settings.categories.some(function (c) { return c.id === category; })) {
        state.settings.categories.push({ id: category, en: en, hi: hi });
      }
    }
    const now = new Date().toISOString();
    if (form.id) {
      const product = state.products.find(function (p) { return p.id === form.id; });
      if (!product) return { ok: false, error: "missing" };
      const prev = num(product.stock);
      product.name = name;
      product.nameHi = String(form.nameHi || "").trim();
      product.category = category;
      product.unit = String(form.unit || "pcs").trim() || "pcs";
      product.sku = String(form.sku || "").trim();
      product.salePrice = money(form.salePrice);
      product.costPrice = money(form.costPrice);
      product.lowStock = money(form.lowStock);
      product.active = form.active !== false && form.active !== "false" && form.active !== "off";
      if (form.stock !== undefined && form.stock !== null && String(form.stock) !== "") {
        const next = num(form.stock);
        const diff = num(next - prev);
        if (diff !== 0) {
          product.stock = next;
          state.stockMoves.push({
            id: uid(), date: now, productId: product.id, name: product.name,
            qty: diff, reason: "adjust", note: ""
          });
        }
      }
      return { ok: true, product: product };
    }
    const stock = num(form.stock);
    const product = {
      id: uid(),
      name: name,
      nameHi: String(form.nameHi || "").trim(),
      category: category,
      unit: String(form.unit || "pcs").trim() || "pcs",
      sku: String(form.sku || "").trim(),
      salePrice: money(form.salePrice),
      costPrice: money(form.costPrice),
      stock: stock,
      lowStock: form.lowStock === "" || form.lowStock === undefined ? 2 : num(form.lowStock),
      active: form.active !== false && form.active !== "false" && form.active !== "off",
      sample: false,
      createdAt: now
    };
    state.products.push(product);
    if (stock) {
      state.stockMoves.push({
        id: uid(), date: now, productId: product.id, name: product.name,
        qty: stock, reason: "opening", note: ""
      });
    }
    return { ok: true, product: product };
  }

  function deleteProduct(state, id) {
    if (!state.products.some(function (p) { return p.id === id; })) return { ok: false, error: "missing" };
    state.products = state.products.filter(function (p) { return p.id !== id; });
    return { ok: true };
  }

  function savePurchase(state, purchase) {
    const opId = purchase.opId;
    if (opId && state.purchases.some(function (p) { return p.opId === opId; })) {
      return { ok: true, duplicate: true };
    }
    const rows = (purchase.items || []).filter(function (it) { return it.productId; });
    if (!rows.length) return { ok: false, error: "needItems" };
    if (rows.some(function (it) { return !(num(it.qty) > 0); })) return { ok: false, error: "badQty" };
    const now = purchase.date ? new Date(purchase.date + "T12:00:00").toISOString() : new Date().toISOString();
    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const it = rows[i];
      const product = state.products.find(function (p) { return p.id === it.productId; });
      if (!product) return { ok: false, error: "missing" };
      const qty = num(it.qty);
      const cost = money(it.cost);
      product.stock = num(product.stock + qty);
      if (cost > 0) product.costPrice = cost;
      state.stockMoves.push({
        id: uid(), date: now, productId: product.id, name: product.name,
        qty: qty, reason: "purchase", note: purchase.supplier || ""
      });
      items.push({
        productId: product.id,
        name: product.name,
        nameHi: product.nameHi || "",
        unit: product.unit,
        qty: qty,
        cost: cost,
        amount: money(qty * cost)
      });
    }
    state.purchases.unshift({
      id: uid(),
      opId: opId || uid(),
      date: now,
      supplier: String(purchase.supplier || "").trim(),
      note: String(purchase.note || "").trim(),
      items: items,
      total: money(items.reduce(function (s, it) { return s + it.amount; }, 0)),
      voided: false
    });
    return { ok: true };
  }

  function voidPurchase(state, id) {
    const rec = state.purchases.find(function (p) { return p.id === id; });
    if (!rec) return { ok: false, error: "missing" };
    if (rec.voided) return { ok: true, duplicate: true };
    const now = new Date().toISOString();
    rec.voided = true;
    rec.items.forEach(function (it) {
      const product = state.products.find(function (p) { return p.id === it.productId; });
      if (!product) return;
      product.stock = num(product.stock - it.qty);
      state.stockMoves.push({
        id: uid(), date: now, productId: product.id, name: product.name,
        qty: -it.qty, reason: "purchaseVoid", note: rec.supplier || ""
      });
    });
    return { ok: true };
  }

  function saveExpense(state, form) {
    const amount = money(form.amount);
    if (!(amount > 0)) return { ok: false, error: "badAmount" };
    const opId = form.opId;
    if (opId && state.expenses.some(function (e) { return e.opId === opId; })) return { ok: true, duplicate: true };
    const now = form.date ? new Date(form.date + "T12:00:00").toISOString() : new Date().toISOString();
    state.expenses.unshift({
      id: uid(),
      opId: opId || uid(),
      date: now,
      category: form.category || "other",
      amount: amount,
      note: String(form.note || "").trim()
    });
    return { ok: true };
  }

  function deleteExpense(state, id) {
    state.expenses = state.expenses.filter(function (e) { return e.id !== id; });
    return { ok: true };
  }

  function savePayment(state, form) {
    const amount = money(form.amount);
    if (!(amount > 0)) return { ok: false, error: "badAmount" };
    const opId = form.opId;
    if (opId && state.payments.some(function (p) { return p.opId === opId; })) return { ok: true, duplicate: true };
    const customer = state.customers.find(function (c) { return c.id === form.customerId; });
    if (!customer) return { ok: false, error: "missing" };
    const now = form.date ? new Date(form.date + "T12:00:00").toISOString() : new Date().toISOString();
    customer.balance = money(customer.balance - amount);
    state.payments.unshift({
      id: uid(),
      opId: opId || uid(),
      date: now,
      customerId: customer.id,
      customerName: customer.name,
      amount: amount,
      mode: form.mode || "cash",
      note: String(form.note || "").trim()
    });
    return { ok: true };
  }

  function deletePayment(state, id) {
    const pay = state.payments.find(function (p) { return p.id === id; });
    if (!pay) return { ok: false, error: "missing" };
    const customer = state.customers.find(function (c) { return c.id === pay.customerId; });
    if (customer) customer.balance = money(customer.balance + pay.amount);
    state.payments = state.payments.filter(function (p) { return p.id !== id; });
    return { ok: true };
  }

  function saveCustomer(state, form) {
    const customer = state.customers.find(function (c) { return c.id === form.id; });
    if (!customer) return { ok: false, error: "missing" };
    const name = String(form.name || "").trim();
    if (!name) return { ok: false, error: "needName" };
    customer.name = name;
    customer.phone = String(form.phone || "").replace(/\s/g, "");
    return { ok: true, customer: customer };
  }

  function saveSettings(state, form) {
    const name = String(form.shopName || "").trim();
    if (!name) return { ok: false, error: "needName" };
    const s = state.settings;
    s.shopName = name;
    s.phone = String(form.phone || "").trim();
    s.address = String(form.address || "").trim();
    s.gstin = String(form.gstin || "").trim().toUpperCase();
    s.upi = String(form.upi || "").trim();
    s.footer = String(form.footer || "").trim();
    s.billPrefix = String(form.billPrefix || "SB").trim() || "SB";
    const next = parseInt(form.nextBill, 10);
    if (next > 0) s.nextBill = next;
    return { ok: true };
  }

  function dayKey(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function rangeKeys(preset, customFrom, customTo) {
    const now = new Date();
    const to = dayKey(now.toISOString());
    if (preset === "today") return { from: to, to: to };
    if (preset === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { from: dayKey(d.toISOString()), to: to };
    }
    if (preset === "custom") return { from: customFrom || to, to: customTo || to };
    const from = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01";
    return { from: from, to: to };
  }

  function inRange(iso, from, to) {
    const key = dayKey(iso);
    return key >= from && key <= to;
  }

  function report(state, preset, customFrom, customTo) {
    const range = rangeKeys(preset, customFrom, customTo);
    const bills = state.bills.filter(function (b) {
      return b.status !== "void" && inRange(b.createdAt, range.from, range.to);
    });
    const expenses = state.expenses.filter(function (e) { return inRange(e.date, range.from, range.to); });
    const payments = state.payments.filter(function (p) { return inRange(p.date, range.from, range.to); });
    const revenue = money(bills.reduce(function (s, b) { return s + b.total; }, 0));
    const discount = money(bills.reduce(function (s, b) { return s + b.discount; }, 0));
    const collectedOnBills = money(bills.reduce(function (s, b) { return s + b.paid; }, 0));
    const udhaarNew = money(bills.reduce(function (s, b) { return s + b.due; }, 0));
    const udhaarReceived = money(payments.reduce(function (s, p) { return s + p.amount; }, 0));
    const cost = money(bills.reduce(function (s, b) {
      return s + b.items.reduce(function (a, it) { return a + money(it.cost) * num(it.qty); }, 0);
    }, 0));
    const expenseTotal = money(expenses.reduce(function (s, e) { return s + e.amount; }, 0));
    const modes = {};
    bills.forEach(function (b) {
      if (b.paid > 0) modes[b.payMode] = money((modes[b.payMode] || 0) + b.paid);
    });
    payments.forEach(function (p) {
      modes[p.mode] = money((modes[p.mode] || 0) + p.amount);
    });
    const itemMap = {};
    bills.forEach(function (b) {
      b.items.forEach(function (it) {
        const key = it.productId || it.name;
        if (!itemMap[key]) itemMap[key] = { name: it.name, nameHi: it.nameHi || "", qty: 0, amount: 0 };
        itemMap[key].qty = num(itemMap[key].qty + it.qty);
        itemMap[key].amount = money(itemMap[key].amount + it.amount);
      });
    });
    const top = Object.keys(itemMap).map(function (k) { return itemMap[k]; })
      .sort(function (a, b) { return b.amount - a.amount; })
      .slice(0, 8);
    const missingCost = bills.some(function (b) {
      return b.items.some(function (it) { return !it.cost; });
    });
    return {
      from: range.from,
      to: range.to,
      bills: bills.length,
      revenue: revenue,
      discount: discount,
      collected: money(collectedOnBills + udhaarReceived),
      udhaarNew: udhaarNew,
      udhaarReceived: udhaarReceived,
      cost: cost,
      expenseTotal: expenseTotal,
      gross: money(revenue - cost),
      net: money(revenue - cost - expenseTotal),
      outstanding: money(state.customers.reduce(function (s, c) { return s + Math.max(0, c.balance); }, 0)),
      modes: modes,
      top: top,
      missingCost: missingCost
    };
  }

  window.Model = {
    CATEGORIES: CATEGORIES,
    EXPENSE_CATS: EXPENSE_CATS,
    PAY_MODES: PAY_MODES,
    uid: uid,
    money: money,
    num: num,
    blankState: blankState,
    addSamples: addSamples,
    removeSamples: removeSamples,
    lineAmount: lineAmount,
    calcDraft: calcDraft,
    saveBill: saveBill,
    voidBill: voidBill,
    saveProduct: saveProduct,
    deleteProduct: deleteProduct,
    savePurchase: savePurchase,
    voidPurchase: voidPurchase,
    saveExpense: saveExpense,
    deleteExpense: deleteExpense,
    savePayment: savePayment,
    deletePayment: deletePayment,
    saveCustomer: saveCustomer,
    saveSettings: saveSettings,
    dayKey: dayKey,
    report: report
  };
})();
