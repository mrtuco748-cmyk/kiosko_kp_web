/* Kiosko KP Web — helpers numéricos/formato (port fiel de lib/utils/helpers.dart).
 * Formato visible es_AR: $12.500,06 (punto miles, coma decimal).
 */
(function () {
  "use strict";

  function money(v) { return Math.round(v * 100) / 100; }
  function stockRound(v) { return Math.round(v * 1000) / 1000; }

  function fmt(value) {
    var v = Number(value) || 0;
    var neg = v < 0;
    v = Math.abs(money(v));
    var parts = v.toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + parts[0] + "," + parts[1];
  }
  function fmtCurrency(value) { return "$" + fmt(value); }

  // Parsea montos es_AR: "$12.500,06" -> 12500.06 ; "12.500" -> 12500.
  // Sin coma: un punto seguido de exactamente 3 dígitos = miles.
  function parseAmount(input) {
    var cleaned = String(input == null ? "" : input)
      .replace(/\$/g, "").replace(/u\./g, "").replace(/\s/g, "").trim();
    if (!cleaned) return 0;
    if (cleaned.indexOf(",") >= 0) {
      var ci = cleaned.lastIndexOf(",");
      var before = cleaned.substring(0, ci).replace(/\./g, "");
      var after = cleaned.substring(ci + 1);
      var n = parseFloat(before + "." + after);
      return isNaN(n) ? 0 : n;
    }
    var di = cleaned.lastIndexOf(".");
    if (di >= 0 && cleaned.length - di - 1 === 3) cleaned = cleaned.replace(/\./g, "");
    var n2 = parseFloat(cleaned);
    return isNaN(n2) ? 0 : n2;
  }

  // Punto SIEMPRE decimal (tasa de recargo, cantidades): "10.000" -> 10.
  function parseDecimal(input) {
    var cleaned = String(input == null ? "" : input).replace(/\$/g, "").replace(/\s/g, "").trim();
    if (!cleaned) return 0;
    var ci = cleaned.lastIndexOf(","), di = cleaned.lastIndexOf(".");
    var norm;
    if (ci >= 0 && di >= 0) {
      norm = ci > di
        ? cleaned.substring(0, ci).replace(/\./g, "") + "." + cleaned.substring(ci + 1)
        : cleaned.substring(0, di).replace(/,/g, "") + "." + cleaned.substring(di + 1);
    } else if (ci >= 0) {
      norm = cleaned.substring(0, ci).replace(/\./g, "") + "." + cleaned.substring(ci + 1);
    } else {
      norm = cleaned.replace(/,/g, "");
    }
    var n = parseFloat(norm);
    return isNaN(n) ? 0 : n;
  }

  // Ambigüedad del punto: "1500.000" puede ser $1.500.000 o $1500.
  // Solo patrón no-estándar 4+ dígitos + punto + 3 dígitos. Null = sin duda.
  function dotAmbiguity(input) {
    var cleaned = String(input == null ? "" : input).replace(/\$/g, "").replace(/\s/g, "").trim();
    var m = /^(\d{4,})\.(\d{3})$/.exec(cleaned);
    if (!m) return null;
    var n = parseFloat(m[1] + "." + m[2]);
    return isNaN(n) ? null : n;
  }

  // Peso en kg: "0,5" / "0.5" / "1.400" (=1.4) / "700g" (=0.7).
  // NUNCA usar parseAmount para un peso.
  function parseWeight(input) {
    var cleaned = String(input == null ? "" : input).toLowerCase().replace(/\s/g, "").replace(/\$/g, "").trim();
    if (!cleaned) return 0;
    var grams = false;
    if (cleaned.slice(-2) === "kg") cleaned = cleaned.slice(0, -2);
    else if (cleaned.slice(-1) === "g") { grams = true; cleaned = cleaned.slice(0, -1); }
    if (!cleaned) return 0;
    var ci = cleaned.lastIndexOf(","), di = cleaned.lastIndexOf(".");
    var v = 0;
    if (ci >= 0 && di >= 0) {
      v = ci > di
        ? parseFloat(cleaned.substring(0, ci).replace(/\./g, "") + "." + cleaned.substring(ci + 1))
        : parseFloat(cleaned.substring(0, di).replace(/,/g, "") + "." + cleaned.substring(di + 1));
    } else if (ci >= 0) {
      v = parseFloat(cleaned.substring(0, ci).replace(/\./g, "") + "." + cleaned.substring(ci + 1));
    } else {
      v = parseFloat(cleaned);
    }
    if (isNaN(v) || v <= 0) return 0;
    if (grams) v = v / 1000;
    return stockRound(v);
  }

  function isOutflow(type) { return type === "payment" || type === "settle" || type === "credit"; }
  function isDebtMove(type) { return !isOutflow(type); }

  function trimNumber(value) {
    var v = Number(value) || 0;
    if (v === Math.trunc(v)) return String(Math.trunc(v));
    return String(v).replace(".", ",");
  }
  function editDecimal(value) { return trimNumber(money(Number(value) || 0)); }
  function fmtQtyShort(q) { return trimNumber(stockRound(Number(q) || 0)).replace(".", ","); }
  function fmtQty(q, unit) {
    if (unit === "kg") return fmtQtyShort(q) + " kg";
    return Math.round(stockRound(Number(q) || 0)) + " u.";
  }
  function itemQtyPrefix(q, unit) {
    if (unit === "kg") return fmtQtyShort(q) + " kg x";
    return Math.round(stockRound(Number(q) || 0)) + "x";
  }
  function stockEditText(p) {
    if (p && p.unit === "kg") return fmtQtyShort(p.stock);
    return String(Math.round(stockRound((p ? p.stock : 0) || 0)));
  }

  var MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  function monthLabel(d) { d = new Date(d); return MESES[d.getMonth()] + " " + d.getFullYear(); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dateDisplay(d) {
    d = new Date(d);
    var now = new Date();
    var diffDays = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    var hm = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    if (diffDays <= 0) return "Hoy " + hm;
    if (diffDays === 1) return "Ayer " + hm;
    if (diffDays < 7) return diffDays + "d " + hm;
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + String(d.getFullYear()).slice(2);
  }
  function formatDateShort(d) {
    d = new Date(d);
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + String(d.getFullYear()).slice(2);
  }
  function exportDate(d) {
    d = new Date(d);
    return d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear() + " " + d.getHours() + ":" + pad2(d.getMinutes());
  }
  function ticketDate(d) {
    d = new Date(d);
    return d.getDate() + "/" + (d.getMonth() + 1) + " " + d.getHours() + ":" + pad2(d.getMinutes());
  }

  function generateId() {
    var bytes = new Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      var rnd = new Uint8Array(16);
      window.crypto.getRandomValues(rnd);
      for (var i = 0; i < 16; i++) bytes[i] = rnd[i];
    } else {
      for (var j = 0; j < 16; j++) bytes[j] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    function hx(b) { var s = b.toString(16); return s.length === 1 ? "0" + s : s; }
    var hex = bytes.map(hx).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  function avatarName(name) {
    name = String(name || "").trim();
    if (!name) return "?";
    var parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name[0].toUpperCase();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  window.KP_FMT = {
    money: money, stockRound: stockRound, fmt: fmt, fmtCurrency: fmtCurrency,
    parseAmount: parseAmount, parseDecimal: parseDecimal, dotAmbiguity: dotAmbiguity,
    parseWeight: parseWeight, isOutflow: isOutflow, isDebtMove: isDebtMove,
    trimNumber: trimNumber, editDecimal: editDecimal, fmtQtyShort: fmtQtyShort,
    fmtQty: fmtQty, itemQtyPrefix: itemQtyPrefix, stockEditText: stockEditText,
    monthLabel: monthLabel, dateDisplay: dateDisplay, formatDateShort: formatDateShort,
    exportDate: exportDate, ticketDate: ticketDate, pad2: pad2,
    generateId: generateId, avatarName: avatarName, esc: esc
  };
})();
