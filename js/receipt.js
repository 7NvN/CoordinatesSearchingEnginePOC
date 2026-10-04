(function () {
  function itemName(it) {
    const lang = window.currentLang ? window.currentLang() : "hi";
    if (lang === "hi" && it.nameHi) return it.nameHi;
    return it.name;
  }

  function title(bill) {
    if (bill.status === "void") return t("statusVoid");
    if (bill.due > 0 && bill.paid > 0) return t("partialBill");
    if (bill.due > 0) return t("creditBill");
    return t("cashBill");
  }

  function shopLines() {
    const s = Shop.state.settings;
    const bits = [];
    if (s.address) bits.push(s.address);
    const contact = [];
    if (s.phone) contact.push(t("phoneShort") + " " + s.phone);
    if (s.gstin) contact.push("GSTIN " + s.gstin);
    if (s.upi) contact.push("UPI " + s.upi);
    return { address: bits.join(" · "), contact: contact.join(" · ") };
  }

  function html(bill) {
    const s = Shop.state.settings;
    const lines = shopLines();
    const rows = bill.items.map(function (it, i) {
      return "<tr><td>" + (i + 1) + "</td><td>" + esc(itemName(it)) +
        (it.unit ? "<small> " + esc(it.unit) + "</small>" : "") +
        "</td><td class='num'>" + qtyStr(it.qty) + "</td><td class='num'>" + inr(it.rate) +
        "</td><td class='num'>" + inr(it.amount) + "</td></tr>";
    }).join("");
    const foot = s.footer || t("footerDefault");
    return "<article id='receipt-sheet' class='sheet'>" +
      (bill.status === "void" ? "<div class='stamp'>" + esc(t("voidStamp")) + "</div>" : "") +
      "<p class='kicker'>" + esc(title(bill)) + "</p>" +
      "<h2>" + esc(s.shopName || t("appName")) + "</h2>" +
      (lines.address ? "<p class='muted'>" + esc(lines.address) + "</p>" : "") +
      (lines.contact ? "<p class='muted'>" + esc(lines.contact) + "</p>" : "") +
      "<dl class='meta'>" +
      "<div><dt>" + esc(t("billNo")) + "</dt><dd>" + esc(bill.number) + "</dd></div>" +
      "<div><dt>" + esc(t("date")) + "</dt><dd>" + esc(fmtWhen(bill.createdAt)) + "</dd></div>" +
      "<div><dt>" + esc(t("customer")) + "</dt><dd>" + esc(bill.customerName || "—") +
      (bill.customerPhone ? "<br>" + esc(bill.customerPhone) : "") + "</dd></div>" +
      "<div><dt>" + esc(t("mode")) + "</dt><dd>" + esc(payLabel(bill.payMode)) + "</dd></div>" +
      "</dl>" +
      "<table><thead><tr><th>#</th><th>" + esc(t("itemsWord")) + "</th><th>" + esc(t("qty")) +
      "</th><th>" + esc(t("rate")) + "</th><th>" + esc(t("amount")) + "</th></tr></thead><tbody>" +
      rows + "</tbody></table>" +
      "<div class='sums'>" +
      "<p><span>" + esc(t("subtotal")) + "</span><b>" + inr(bill.subtotal) + "</b></p>" +
      (bill.discount ? "<p><span>" + esc(t("discount")) + "</span><b>− " + inr(bill.discount) + "</b></p>" : "") +
      "<p class='grand'><span>" + esc(t("total")) + "</span><b>" + inr(bill.total) + "</b></p>" +
      "<p><span>" + esc(t("got")) + "</span><b>" + inr(bill.paid) + "</b></p>" +
      "<p><span>" + esc(t("due")) + "</span><b>" + inr(bill.due) + "</b></p>" +
      "</div>" +
      (bill.note ? "<p class='note'>" + esc(bill.note) + "</p>" : "") +
      "<p class='thanks'>" + esc(foot) + "</p>" +
      "<div class='signs'><span>" + esc(t("customerSign")) + "</span><span>" + esc(t("forShop")) + "</span></div>" +
      "</article>";
  }

  function text(bill) {
    const s = Shop.state.settings;
    const lines = [s.shopName || t("appName"), title(bill), bill.number + "  " + fmtWhen(bill.createdAt)];
    if (bill.customerName) lines.push(t("customer") + ": " + bill.customerName + (bill.customerPhone ? " (" + bill.customerPhone + ")" : ""));
    lines.push("");
    bill.items.forEach(function (it) {
      lines.push(itemName(it) + " × " + qtyStr(it.qty) + " = " + inr(it.amount));
    });
    lines.push("");
    if (bill.discount) lines.push(t("discount") + ": " + inr(bill.discount));
    lines.push(t("total") + ": " + inr(bill.total));
    lines.push(t("got") + ": " + inr(bill.paid));
    lines.push(t("due") + ": " + inr(bill.due));
    if (s.upi) lines.push("UPI: " + s.upi);
    if (s.phone) lines.push(t("phone") + ": " + s.phone);
    lines.push("");
    lines.push(s.footer || t("footerDefault"));
    return lines.join("\n");
  }

  function whatsappUrl(bill) {
    const digits = String(bill.customerPhone || "").replace(/\D/g, "");
    let num = digits;
    if (num.length === 10) num = "91" + num;
    const body = encodeURIComponent(text(bill));
    if (num.length >= 12) return "https://wa.me/" + num + "?text=" + body;
    return "https://wa.me/?text=" + body;
  }

  function mailUrl(bill) {
    const s = Shop.state.settings;
    const subject = encodeURIComponent(bill.number + " — " + (s.shopName || "Shopbook"));
    const body = encodeURIComponent(text(bill));
    return "mailto:?subject=" + subject + "&body=" + body;
  }

  window.Receipt = { html: html, text: text, whatsappUrl: whatsappUrl, mailUrl: mailUrl };
})();
