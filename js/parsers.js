/* Kiosko KP Web — parsers de export/ticket (port de lib/services/backup_parser.dart).
 * Formatos 100% compatibles con la app Flutter (exportar acá / importar allá).
 */
(function () {
  "use strict";
  var F = null;
  function fmt() { if (!F) F = window.KP_FMT; return F; }

  var DATE_RE = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))? (\d{1,2}):(\d{2})/;

  function parseLoadDate(m) {
    if (!m) return new Date();
    var now = new Date();
    var year = m[3] ? (parseInt(m[3], 10) || now.getFullYear()) : now.getFullYear();
    var day = parseInt(m[1], 10) || 1;
    var month = parseInt(m[2], 10) || 1;
    return new Date(year, month - 1, day, parseInt(m[4], 10) || 0, parseInt(m[5], 10) || 0);
  }

  // "2x Coca | $3.000,00" o "0,5 kg x Pan | $750,00" -> {qty, unit, name, lineTotal}
  function parseSaleItemLine(l) {
    var m = /^([\d.,]+)\s*(kg\s+)?x\s+(.*?)\s*\|\s*\$?([\d.,]+)/.exec(l);
    if (!m) return null;
    var qty = fmt().parseAmount(m[1]);
    if (!(qty > 0)) return null;
    return { qty: qty, unit: m[2] ? "kg" : "u", name: m[3].trim().replace(/\|/g, " "), lineTotal: fmt().parseAmount(m[4]) };
  }

  function tagType(l) {
    if (l.indexOf("[Abono]") === 0) return "payment";
    if (l.indexOf("[Recargo]") === 0) return "interest";
    if (l.indexOf("[Favor]") === 0) return "credit";
    return "product";
  }

  function parseBackupText(raw) {
    raw = String(raw || "");
    if (raw.indexOf("CLIENTES") < 0 && raw.indexOf("INVENTARIO") < 0) return null;
    var lines = raw.split("\n");
    var section = "";
    var customers = [], products = [], sales = [], expenses = [];
    var currentCustomer = null, currentCycle = null;

    function flushCustomer() { if (currentCustomer) { customers.push(currentCustomer); currentCustomer = null; } currentCycle = null; }

    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (l.indexOf("CLIENTES") >= 0) { section = "customers"; continue; }
      if (l.indexOf("HISTORIAL") >= 0) { flushCustomer(); section = "history"; continue; }
      if (l.indexOf("INVENTARIO") >= 0) { section = "inventory"; continue; }
      if (l.indexOf("VENTAS") >= 0) { section = "sales"; continue; }
      if (l.indexOf("GASTOS") >= 0) { section = "expenses"; continue; }
      if (l.indexOf("FIN DE DATOS") >= 0 || l.indexOf("RESUMEN") >= 0) { section = ""; continue; }
      if (!l || l.charAt(0) === "=") continue;

      if (section === "customers" && l.indexOf("Nombre:") === 0) {
        flushCustomer();
        currentCustomer = { id: fmt().generateId(), name: l.replace("Nombre:", "").trim().replace(/\|/g, " "), limit: 0, interestDays: 30, interestRate: 10, movements: [], history: [], updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
      } else if (section === "customers" && currentCustomer) {
        if (l.indexOf("Deuda:") === 0) {
          var parts = l.split("|");
          for (var a = 0; a < parts.length; a++) {
            var p = parts[a].trim();
            if (p.indexOf("Limite:") === 0) {
              var lm = /\$?([\d.,]+)/.exec(p);
              if (lm) currentCustomer.limit = fmt().parseAmount(lm[1]);
            } else if (p.indexOf("Recargo:") === 0) {
              var rm = /([\d.,]+)\s*%/.exec(p);
              if (rm) currentCustomer.interestRate = fmt().parseAmount(rm[1]);
              var dm = /despues de (\d+)/.exec(p);
              if (dm) currentCustomer.interestDays = parseInt(dm[1], 10) || 30;
            }
          }
        } else if (l.charAt(0) === "[") {
          var mp = l.split("|");
          if (mp.length >= 3) {
            var dateMatch = DATE_RE.exec(mp[0]);
            var amtM = /\$?([\d.,]+)/.exec(mp[mp.length - 1]);
            currentCustomer.movements.push({
              id: fmt().generateId(), type: tagType(l),
              description: mp.slice(1, mp.length - 1).join("|").trim().replace(/\|/g, " "),
              amount: amtM ? fmt().parseAmount(amtM[1]) : 0,
              date: parseLoadDate(dateMatch).toISOString()
            });
          }
        }
      } else if (section === "history" && l.indexOf("Cliente:") === 0) {
        currentCycle = null;
        var hp = l.split("|");
        var hname = hp[0].replace("Cliente:", "").trim().replace(/\|/g, " ");
        var owner = null;
        for (var c = 0; c < customers.length; c++) { if (customers[c].name === hname) { owner = customers[c]; break; } }
        if (owner) {
          var cyc = { id: fmt().generateId(), customerId: owner.id, closedAt: (parseLoadDate(DATE_RE.exec(l)) || new Date()).toISOString(), totalDebt: 0, totalPaid: 0, movements: [] };
          owner.history.push(cyc);
          currentCycle = cyc;
        }
      } else if (section === "history" && currentCycle && l.charAt(0) === "[") {
        var cp = l.split("|");
        if (cp.length >= 3) {
          var cdm = DATE_RE.exec(cp[0]);
          var cam = /\$?([\d.,]+)/.exec(cp[cp.length - 1]);
          currentCycle.movements.push({
            id: fmt().generateId(), type: tagType(l),
            description: cp.slice(1, cp.length - 1).join("|").trim().replace(/\|/g, " "),
            amount: cam ? fmt().parseAmount(cam[1]) : 0,
            date: parseLoadDate(cdm).toISOString()
          });
        }
      } else if (section === "inventory" && l.indexOf("Nombre:") === 0) {
        var ip = l.split("|");
        var p = { id: fmt().generateId(), name: ip[0].replace("Nombre:", "").trim().replace(/\|/g, " "), brand: "", category: "", price: 0, buyPrice: 0, unit: "u", stock: 0, updatedAt: new Date().toISOString() };
        for (var j = 1; j < ip.length; j++) {
          var pt = ip[j].trim();
          if (pt.indexOf("Marca:") === 0) p.brand = pt.substring(6).trim();
          else if (pt.indexOf("Cat:") === 0) p.category = pt.substring(4).trim();
        }
        products.push(p);
      } else if (section === "inventory" && l.indexOf("Precio:") === 0 && products.length) {
        var last = products[products.length - 1];
        var iparts = l.split("|");
        for (var k = 0; k < iparts.length; k++) {
          var q = iparts[k].trim();
          if (q.indexOf("Precio:") === 0) last.price = fmt().parseAmount(q.substring(7).trim());
          else if (q.indexOf("Costo:") === 0) last.buyPrice = fmt().parseAmount(q.substring(6).trim());
          else if (q.indexOf("Unidad:") === 0) last.unit = q.substring(7).trim().toLowerCase() === "kg" ? "kg" : "u";
          else if (q.indexOf("Stock:") === 0) {
            var rest = q.substring(6).trim();
            var sm = /[\d.,]+/.exec(rest);
            if (sm) last.stock = fmt().stockRound(fmt().parseAmount(sm[0]));
            if (rest.toLowerCase().indexOf("kg") >= 0) last.unit = "kg";
          }
        }
      } else if (section === "sales" && l.indexOf("| Pago:") >= 0) {
        var sp = l.split("|");
        sales.push({
          id: fmt().generateId(), total: 0,
          method: sp.length > 2 ? sp[2].replace("Pago:", "").trim() : "efectivo",
          clientName: sp.length > 1 ? sp[1].trim().replace(/\|/g, " ") : "Publico General",
          date: (parseLoadDate(DATE_RE.exec(l)) || new Date()).toISOString(), items: [],
          updatedAt: new Date().toISOString()
        });
      } else if (section === "sales" && sales.length && l.indexOf("TOTAL:") === 0) {
        var tm = /\$?([\d.,]+)/.exec(l.replace("TOTAL:", "").trim());
        if (tm) sales[sales.length - 1].total = fmt().parseAmount(tm[1]);
      } else if (section === "sales" && sales.length && /^[\d.,]+\s*(kg\s+)?x\s/.test(l)) {
        var it = parseSaleItemLine(l);
        if (it) sales[sales.length - 1].items.push({ name: it.name, productId: null, price: fmt().money(it.lineTotal / it.qty), quantity: it.qty, unit: it.unit });
      } else if (section === "expenses" && l.indexOf("|") >= 0) {
        var ep = l.split("|");
        if (ep.length >= 3) {
          var em = /\$?([\d.,]+)/.exec(ep[ep.length - 1]);
          expenses.push({
            id: fmt().generateId(),
            description: ep.slice(1, ep.length - 1).join("|").trim().replace(/\|/g, " "),
            amount: em ? fmt().parseAmount(em[1]) : 0,
            date: (parseLoadDate(DATE_RE.exec(l)) || new Date()).toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }
    }
    flushCustomer();
    for (var h = 0; h < customers.length; h++) {
      for (var x = 0; x < customers[h].history.length; x++) {
        var debt = 0, paid = 0;
        var mv = customers[h].history[x].movements;
        for (var z = 0; z < mv.length; z++) {
          if (fmt().isOutflow(mv[z].type)) paid += mv[z].amount; else debt += mv[z].amount;
        }
        customers[h].history[x].totalDebt = fmt().money(debt);
        customers[h].history[x].totalPaid = fmt().money(paid);
      }
    }
    return { customers: customers, products: products, sales: sales, expenses: expenses };
  }

  // Ticket "==== MAXIKIOSKO KP ====": items con price = lineTotal / qty.
  function parseTicketText(raw) {
    var lines = String(raw || "").split("\n");
    var total = 0, customer = "Publico General", items = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (l.indexOf("Cliente:") === 0) customer = l.replace("Cliente:", "").trim();
      else if (l.indexOf("TOTAL:") === 0) {
        var tm = /\$?([\d.,]+)/.exec(l);
        if (tm) total = fmt().parseAmount(tm[1]);
      } else if (/^[\d.,]+\s*(kg\s+)?x\s/.test(l)) {
        var m = /^([\d.,]+)\s*(kg\s+)?x\s+(.+?)\s+\$?([\d.,]+)$/.exec(l);
        if (m) {
          var q = fmt().parseAmount(m[1]);
          if (!(q > 0)) continue;
          var p = fmt().parseAmount(m[4]);
          items.push({ name: m[3].trim().replace(/\|/g, " "), productId: null, price: fmt().money(p / q), quantity: q, unit: m[2] ? "kg" : "u" });
        }
      }
    }
    return { total: total, customer: customer, items: items };
  }

  window.KP_PARSERS = { parseBackupText: parseBackupText, parseTicketText: parseTicketText, parseSaleItemLine: parseSaleItemLine, parseLoadDate: parseLoadDate };
})();
