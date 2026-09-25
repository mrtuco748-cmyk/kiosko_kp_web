/* Kiosko KP Web — UI (6 vistas, port de lib/screens/*.dart). */
(function () {
  "use strict";
  var F = window.KP_FMT, ST = null;
  function s() { if (!ST) ST = window.KP_STORE; return ST; }
  function D() { return s().S; }

  function $(id) { return document.getElementById(id); }
  function toast(msg, type) {
    var ct = $("toasts");
    var t = document.createElement("div");
    t.className = "toast" + (type ? " " + type : "");
    var ic = document.createElement("span");
    ic.className = "ic sm";
    ic.textContent = type === "danger" ? "error" : type === "warn" ? "warning" : "check_circle";
    var sp = document.createElement("span");
    sp.textContent = msg;
    var b = document.createElement("button");
    b.className = "t-close";
    var bic = document.createElement("span");
    bic.className = "ic sm";
    bic.textContent = "close";
    b.appendChild(bic);
    b.onclick = function () { if (t.parentNode) t.parentNode.removeChild(t); };
    t.appendChild(ic); t.appendChild(sp); t.appendChild(b);
    ct.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4500);
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function copyText(text, okMsg) {
    function done() { toast(okMsg || "Copiado al portapapeles"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("No se pudo copiar", "danger"); }
      ta.remove();
    }
  }

  // ---------- navegación ----------
  function switchView(v) {
    D().currentView = v;
    s().persist();
    var btns = document.querySelectorAll(".sb-btn");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i].getAttribute("data-view") === v);
    var views = document.querySelectorAll(".view");
    for (var j = 0; j < views.length; j++) views[j].classList.toggle("active", views[j].id === "view-" + v);
    if (window.innerWidth <= 900) $("sidebar").classList.remove("open");
    render();
    window.scrollTo(0, 0);
  }
  function toggleSidebar() { $("sidebar").classList.toggle("open"); }

  function render() {
    renderBadge(); renderNet();
    var v = D().currentView;
    if (v === "inicio") renderHome();
    else if (v === "fiados") renderFiados();
    else if (v === "inventario") renderInventario();
    else if (v === "cobrar") renderCobrar();
    else if (v === "gastos") renderGastos();
    else if (v === "historial") renderHistorial();
  }
  function renderBadge() {
    var n = 0;
    for (var i = 0; i < D().customers.length; i++) if (s().customerTotal(D().customers[i]) > 0) n++;
    var b = $("fiadosBadge");
    b.style.display = n ? "" : "none";
    b.textContent = n;
  }
  function renderNet() {
    var dot = $("netDot");
    dot.className = "netdot " + (D().online ? "on" : "off");
    dot.title = D().online ? "Online" : "Sin conexión (local)";
    $("syncState").textContent = D().syncing ? "Sincronizando…" : (D().online ? "Online" : "Local");
  }

  // ---------- INICIO ----------
  var homePanel = null;
  function renderHome() {
    var d = D(), now = new Date();
    var totalFiado = 0, topName = "Ninguno", topVal = -Infinity;
    d.customers.forEach(function (c) {
      var t = s().customerTotal(c);
      totalFiado += t;
      if (t > topVal) { topVal = t; topName = c.name; }
    });
    var invValue = 0;
    d.inventory.forEach(function (p) { invValue += ((p.buyPrice > 0 ? p.buyPrice : p.price) || 0) * (p.stock || 0); });
    var ms = 0, ts = 0, me = 0, totS = 0, totE = 0;
    d.sales.forEach(function (sl) {
      var x = new Date(sl.date);
      totS += sl.total;
      if (x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth()) ms += sl.total;
      if (x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth() && x.getDate() === now.getDate()) ts += sl.total;
    });
    d.expenses.forEach(function (e) {
      var x = new Date(e.date);
      totE += e.amount;
      if (x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth()) me += e.amount;
    });
    $("stFiado").textContent = F.fmtCurrency(totalFiado);
    $("stClientes").textContent = d.customers.length;
    $("stDeudor").textContent = topName;
    $("stProd").textContent = d.inventory.length;
    $("stInvVal").textContent = F.fmtCurrency(invValue);
    $("stMes").textContent = F.fmtCurrency(ms);
    $("stHoy").textContent = F.fmtCurrency(ts);
    $("stGastoMes").textContent = F.fmtCurrency(me);
    $("stGanMes").textContent = F.fmtCurrency(ms - me);
    $("stGanTot").textContent = F.fmtCurrency(totS - totE);
    // valor en stock por producto (ordenado, para detectar culpables)
    var rows = d.inventory.map(function (p) {
      return { p: p, v: ((p.buyPrice > 0 ? p.buyPrice : p.price) || 0) * (p.stock || 0) };
    }).sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    var html = "";
    rows.forEach(function (r) {
      html += '<div class="rowline"><span>' + F.esc(r.p.name) + ' <small>' + F.esc(F.fmtQty(r.p.stock, r.p.unit)) + '</small></span><b>' + F.fmtCurrency(r.v) + "</b></div>";
    });
    $("homeStockTop").innerHTML = html || '<p class="muted">Sin productos.</p>';
    renderHomeExpenses();
  }
  function homeTogglePanel(t) { homePanel = (homePanel === t ? null : t); renderHomePanel(); }
  function renderHomePanel() {
    var box = $("homePanel");
    if (!homePanel) { box.style.display = "none"; box.innerHTML = ""; return; }
    box.style.display = "";
    var d = D(), html = '<div class="dh"><h3>' + F.esc(homePanelTitle()) + '</h3><button class="btn sm" onclick="KP_UI.homeTogglePanel(\'' + homePanel + "')\">Cerrar</button></div>";
    if (homePanel === "fiados" || homePanel === "clientes" || homePanel === "deudor") {
      var list = d.customers.slice();
      if (homePanel === "deudor") list.sort(function (a, b) { return s().customerTotal(b) - s().customerTotal(a); });
      else list.sort(function (a, b) { return a.name.localeCompare(b.name); });
      list.forEach(function (c) {
        var t = s().customerTotal(c);
        html += '<div class="rowline"><span>' + F.esc(c.name) + "</span><b class=\"" + (t > 0 ? "neg" : "pos") + "\">" + F.fmtCurrency(t) + "</b></div>";
      });
      if (!list.length) html += '<p class="muted">Sin clientes.</p>';
    } else if (homePanel === "inventario") {
      d.inventory.forEach(function (p) {
        html += '<div class="rowline"><span>' + F.esc(p.name) + ' <small>' + F.esc(F.fmtQty(p.stock, p.unit)) + "</small></span><b>" + F.fmtCurrency(p.price) + "</b></div>";
      });
      if (!d.inventory.length) html += '<p class="muted">Sin productos.</p>';
    } else if (homePanel === "ventas" || homePanel === "ventashoy") {
      var now = new Date();
      var sl = d.sales.filter(function (x) {
        var d2 = new Date(x.date);
        if (homePanel === "ventashoy") return d2.getFullYear() === now.getFullYear() && d2.getMonth() === now.getMonth() && d2.getDate() === now.getDate();
        return d2.getFullYear() === now.getFullYear() && d2.getMonth() === now.getMonth();
      }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 30);
      sl.forEach(function (x) {
        html += '<div class="rowline"><span>' + F.esc(x.clientName || "Público") + " <small>" + F.dateDisplay(x.date) + " · " + F.esc(x.method) + "</small></span><b class=\"pos\">" + F.fmtCurrency(x.total) + "</b></div>";
      });
      if (!sl.length) html += '<p class="muted">Sin ventas.</p>';
    } else if (homePanel === "gastos") {
      var now2 = new Date();
      var ex = d.expenses.filter(function (x) { var d2 = new Date(x.date); return d2.getFullYear() === now2.getFullYear() && d2.getMonth() === now2.getMonth(); })
        .sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 30);
      ex.forEach(function (x) {
        html += '<div class="rowline"><span>' + F.esc(x.description) + " <small>" + F.dateDisplay(x.date) + "</small></span><b class=\"neg\">" + F.fmtCurrency(x.amount) + "</b></div>";
      });
      if (!ex.length) html += '<p class="muted">Sin gastos este mes.</p>';
    }
    box.innerHTML = html;
  }
  function homePanelTitle() {
    return { fiados: "Fiados", clientes: "Clientes", deudor: "Mayor deudor", inventario: "Inventario", ventas: "Ventas del mes", ventashoy: "Ventas de hoy", gastos: "Gastos del mes" }[homePanel] || "";
  }
  function renderHomeExpenses() {
    var list = D().expenses.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 10);
    var html = "";
    list.forEach(function (e) {
      html += '<div class="rowline"><span>' + F.esc(e.description) + " <small>" + F.dateDisplay(e.date) + "</small></span><b class=\"neg\">" + F.fmtCurrency(e.amount) + "</b></div>";
    });
    $("homeExpList").innerHTML = html || '<p class="muted">Sin gastos.</p>';
  }
  function addExpenseFrom(prefix) {
    var dEl = $(prefix === "h" ? "edHome" : "edGasto");
    var aEl = $(prefix === "h" ? "eaHome" : "eaGasto");
    var desc = dEl.value.trim();
    var amt = F.parseAmount(aEl.value);
    var amb = F.dotAmbiguity(aEl.value.trim());
    if (!desc || !(amt > 0)) { toast("Concepto y monto válidos", "warn"); return; }
    function commit(v) {
      s().addExpense(desc, v);
      dEl.value = ""; aEl.value = "";
      render();
      toast("Gasto registrado: " + F.fmtCurrency(v));
    }
    if (amb != null && Math.abs(amb - amt) > 0.005) confirmPrice(aEl.value.trim(), amt, amb, commit);
    else commit(amt);
  }
  function exportData() {
    var t = s().buildExport();
    copyText(t, "Datos copiados (" + t.length + " caracteres)");
    download("DatosKioskoKp.txt", t);
  }

  // ---------- diálogo de precio ambiguo ----------
  var priceCb = null, priceA = 0, priceB = 0;
  function confirmPrice(raw, thousands, decimal, cb) {
    priceCb = cb; priceA = thousands; priceB = decimal;
    $("priceQ").textContent = '"' + raw + '" puede leerse de dos formas. ¿Cuál es la correcta?';
    $("priceA").textContent = "$" + F.fmt(thousands) + " (miles)";
    $("priceB").textContent = "$" + F.fmt(decimal) + " (decimal)";
    showOv("price-ov");
  }
  function pickPrice(which) {
    hideOv("price-ov");
    if (priceCb) priceCb(which === "a" ? priceA : priceB);
    priceCb = null;
  }
  function withPrice(raw, cb) {
    var amt = F.parseAmount(raw);
    var amb = F.dotAmbiguity(String(raw).trim());
    if (amb != null && Math.abs(amb - amt) > 0.005) confirmPrice(String(raw).trim(), amt, amb, cb);
    else cb(amt);
  }

  // ---------- FIADOS ----------
  function fiadoSearch() { return ($("cs").value || "").toLowerCase(); }
  function renderFiados() {
    var q = fiadoSearch();
    var list = D().customers.filter(function (c) { return c.name.toLowerCase().indexOf(q) >= 0; });
    list.sort(function (a, b) { return s().customerTotal(b) - s().customerTotal(a); });
    var html = "";
    list.forEach(function (c) {
      var t = s().customerTotal(c), st = s().customerStatus(c);
      var badge = t <= 0 ? '<span class="bdg ok">SIN DEUDA</span>' :
        st === "due" ? '<span class="bdg due">VIGENTE</span>' :
        st === "overdue" ? '<span class="bdg warn">VENCIDA</span>' : '<span class="bdg danger">VENCIDA +7</span>';
      var fav = "";
      if (t < 0) fav = ' <small class="pos">A favor ' + F.fmtCurrency(-t) + "</small>";
      html += '<div class="ci' + (D().selectedCustomerId === c.id ? " active" : "") + '" onclick="KP_UI.selectCustomer(\'' + c.id + "')\">" +
        '<div class="av ' + (st === "ok" ? "green" : st === "due" ? "blue" : st === "overdue" ? "amber" : "red") + '">' + F.esc(F.avatarName(c.name)) + "</div>" +
        '<div class="ci-body"><div class="ci-name">' + F.esc(c.name) + "</div><div class=\"ci-sub\">" + badge + fav + "</div></div>" +
        '<div class="ci-right"><div class="ci-debt ' + (t > 0 ? "neg" : "pos") + '">' + F.fmtCurrency(t) + "</div></div></div>";
    });
    $("cc").innerHTML = html || '<p class="muted">Sin clientes. Creá el primero con “+ Nuevo Cliente”.</p>';
    renderFiadoDetail();
  }
  function selectCustomer(id) {
    D().selectedCustomerId = id;
    s().persist();
    renderFiados();
    if (window.innerWidth <= 900) { var dp = $("dp"); if (dp && dp.scrollIntoView) dp.scrollIntoView({ behavior: "smooth" }); }
  }
  function deselectCustomer() { D().selectedCustomerId = null; s().persist(); renderFiados(); }
  function sortedMovs(c) { return (c.movements || []).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }); }

  function renderFiadoDetail() {
    var c = s().getCustomer(D().selectedCustomerId);
    var sp = $("fiadosSplit");
    if (sp) sp.classList.toggle("has-sel", !!c);
    if (!c) { $("detailEmpty").style.display = ""; $("dc").style.display = "none"; return; }
    $("detailEmpty").style.display = "none";
    $("dc").style.display = "flex";
    var t = s().customerTotal(c), base = s().baseTotal(c), intr = t - base;
    var st = s().customerStatus(c);
    $("cdhAv").textContent = F.avatarName(c.name);
    $("cdhAv").className = "av-lg " + (st === "ok" ? "green" : st === "due" ? "blue" : st === "overdue" ? "amber" : "red");
    $("acn").value = c.name;
    var due = s().daysToDue(c);
    var dueTxt = "";
    if (due == null) dueTxt = "Sin deuda";
    else if (due > 1) dueTxt = "Vence en " + due + " días";
    else if (due === 1) dueTxt = "Vence mañana";
    else if (due === 0) dueTxt = "¡Vence hoy!";
    else dueTxt = "Vencida hace " + (-due) + " días";
    var per = s().interestPeriods(c);
    $("acl").textContent = "Cuenta desde " + F.formatDateShort(s().accountStart(c)) + " · " + dueTxt + (per > 1 ? " · recargo x" + per : "");
    $("intDays").value = c.interestDays;
    $("intRate").value = F.trimNumber(c.interestRate);
    $("intInfo").textContent = intr > 0
      ? "Deuda neta " + F.fmtCurrency(base) + " + recargo " + F.fmtCurrency(intr) + (per > 1 ? " (x" + per + " períodos)" : "")
      : (t > 0 ? "Sin recargo por ahora." : (t < 0 ? "Saldo a favor " + F.fmtCurrency(-t) : "Sin deuda."));
    var lim = c.limit > 0 ? " · Límite " + F.fmtCurrency(c.limit) : "";
    $("ctd").textContent = F.fmtCurrency(t);
    $("ctd").className = "tb-num " + (t > 0 ? "neg" : "pos");
    $("ctdLabel").textContent = t < 0 ? "Saldo a favor:" : "Deuda total:" + lim;
    // movimientos
    var html = "";
    sortedMovs(c).forEach(function (m) {
      var out = F.isOutflow(m.type);
      var icon = m.type === "payment" || m.type === "settle" ? "payments" : m.type === "interest" ? "percent" : m.type === "credit" ? "savings" : m.type === "manual" ? "edit" : "shopping_bag";
      var delIc = '<span class="ic sm">delete</span>';
      html += '<div class="mi"><div class="mi-left"><span class="mi-icon"><span class="ic sm">'
        + icon + '</span></span><div class="mi-info"><div class="mi-name">' + F.esc(m.description) + '</div><div class="mi-date">' + F.dateDisplay(m.date) + '</div></div></div>' +
        '<div class="mi-right"><span class="mi-amt ' + (out ? "pos" : "neg") + '">' + (out ? "&#8722;" : "+") + F.fmtCurrency(m.amount) + '</span><button class="mi-del" title="Eliminar" onclick="KP_UI.deleteMovement(' + "'" + c.id + "','" + m.id + "'" + ')">' + delIc + '</button></div></div>';
    });
    $("ptb").innerHTML = html || '<p class="muted">Sin movimientos.</p>';
    // historial
    var hh = "";
    (c.history || []).forEach(function (h) {
      hh += '<div class="rowline"><span>Ciclo ' + F.formatDateShort(s().cycleStart(h.movements, h.closedAt)) + " → " + F.formatDateShort(h.closedAt) +
        " <small>Deuda " + F.fmtCurrency(h.totalDebt) + " · Pagado " + F.fmtCurrency(h.totalPaid) + " (" + h.movements.length + " movs)</small></span>" +
        '<button class="btn sm danger" onclick="KP_UI.deleteCycle(\'' + c.id + "','" + h.id + "')\">Borrar</button></div>";
    });
    $("histList").innerHTML = hh || '<p class="muted">Sin ciclos cerrados.</p>';
  }

  function showNewClientForm() { $("cn").value = ""; $("cl").value = ""; showOv("new-client-ov"); }
  function createCustomer(ev) {
    ev.preventDefault();
    var name = $("cn").value.trim();
    if (!name) return;
    var lim = F.parseAmount($("cl").value || "0");
    var c = s().addCustomer(name, lim);
    hideOv("new-client-ov");
    D().selectedCustomerId = c.id;
    render();
    toast("Cliente registrado: " + name);
  }
  function renameCustomer() {
    var c = s().getCustomer(D().selectedCustomerId);
    if (!c) return;
    var name = $("acn").value.trim();
    if (name && name !== c.name) { s().renameCustomer(c.id, name); render(); toast("Nombre actualizado"); }
  }
  function deleteCustomer() {
    var c = s().getCustomer(D().selectedCustomerId);
    if (!c) return;
    if (!confirm("¿Eliminar a " + c.name + " con todo su historial?")) return;
    s().deleteCustomer(c.id);
    render();
    toast("Cliente eliminado", "warn");
  }
  function updateInterestSettings() {
    var c = s().getCustomer(D().selectedCustomerId);
    if (!c) return;
    var days = parseInt($("intDays").value, 10);
    if (isNaN(days) || days < 0) days = 30;
    withPrice($("intRate").value || "0", function (rate) {
      if (!(rate >= 0)) rate = 0;
      s().setInterest(c.id, days, rate);
      render();
    });
  }
  function addPayment() {
    var c = s().getCustomer(D().selectedCustomerId);
    if (!c) return;
    var raw = $("qpa").value.trim();
    var amt = F.parseAmount(raw);
    if (!(amt > 0)) { toast("Monto inválido", "warn"); return; }
    var total = s().customerTotal(c);
    if (!(total > 0)) { toast("Sin deuda para abonar", "warn"); return; }
    function commit(v) {
      if (v > total) {
        // SEGUNDA REVISIÓN: supera la deuda → confirmar vuelto / saldo a favor
        $("payInfo").textContent = "Deuda " + F.fmtCurrency(total) + " · Se registra " + F.fmtCurrency(total) + " · Vuelto/saldo a favor " + F.fmtCurrency(v - total);
        $("payConfirm").onclick = function () {
          hideOv("pay-ov");
          var r = s().registerPayment(c.id, v, "payment", "Abono");
          $("qpa").value = "";
          render();
          toast(r.closed ? "Cuenta saldada. Saldo a favor " + F.fmtCurrency(r.favor || 0) : "Abono registrado" + ((r.favor || 0) > 0 ? " · a favor " + F.fmtCurrency(r.favor) : ""));
        };
        showOv("pay-ov");
      } else {
        var r2 = s().registerPayment(c.id, v, "payment", "Abono");
        $("qpa").value = "";
        render();
        toast(r2.closed ? "Cuenta saldada" : "Abono registrado: " + F.fmtCurrency(v));
      }
    }
    var amb = F.dotAmbiguity(raw);
    if (amb != null && Math.abs(amb - amt) > 0.005) confirmPrice(raw, amt, amb, commit);
    else commit(amt);
  }
  function settleAccount() {
    var c = s().getCustomer(D().selectedCustomerId);
    if (!c) return;
    var total = s().customerTotal(c);
    if (!(total > 0)) { toast("Sin deuda", "warn"); return; }
    $("payInfo").textContent = "Deuda " + F.fmtCurrency(total) + " · Se registra " + F.fmtCurrency(total) + " · La cuenta se cierra y pasa al historial.";
    $("payConfirm").onclick = function () {
      hideOv("pay-ov");
      s().registerPayment(c.id, total, "settle", "Saldo total");
      render();
      toast("Cuenta saldada");
    };
    showOv("pay-ov");
  }
  // ---------- AUTOCOMPLETADO productos (fiado + cobrar) ----------
  // Coincidencia por nombre O marca, con precio y stock (paridad con el
  // Autocomplete de fiados_screen.dart). Dropdown propio: visible y
  // táctil en móvil y desktop.
  function productMatches(q, limit) {
    q = String(q || "").trim().toLowerCase();
    var list = D().inventory.filter(function (p) {
      if (!q) return true;
      return p.name.toLowerCase().indexOf(q) >= 0 || (p.brand || "").toLowerCase().indexOf(q) >= 0;
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return list.slice(0, limit || 8);
  }
  function acRender(kind) {
    var box = $(kind === "fiado" ? "ac-fiado" : "ac-cobrar");
    if (!box) return [];
    var q = kind === "fiado" ? ($("pn2").value || "") : ($("sale-search").value || "");
    var ms = productMatches(q, 8);
    if (!ms.length) {
      box.innerHTML = '<div class="ac-empty">Sin coincidencias</div>';
      box.classList.add("open");
      return ms;
    }
    var html = "";
    ms.forEach(function (p) {
      var sub = F.esc(p.brand || p.category || "") + " · " + F.esc(F.fmtQty(p.stock, p.unit));
      html += '<div class="ac-item" onmousedown="KP_UI.acPick(\'' + kind + "','" + p.id + "');return false\">" +
        "<span>" + F.esc(p.name) + '<br><span class="ac-sub">' + sub + "</span></span>" +
        '<span class="ac-price">' + F.fmtCurrency(p.price) + (p.unit === "kg" ? "<small>/kg</small>" : "") + "</span></div>";
    });
    box.innerHTML = html;
    box.classList.add("open");
    return ms;
  }
  function acHide(kind) {
    var box = $(kind === "fiado" ? "ac-fiado" : "ac-cobrar");
    if (box) box.classList.remove("open");
  }
  function acFiadoInput() { autoFillPrice(); acRender("fiado"); }
  function acCobrarInput() { s().emit(); acRender("cobrar"); }
  function acKey(kind, ev) {
    if (ev.key === "Escape") { acHide(kind); return; }
    if (ev.key === "Enter") {
      var q = kind === "fiado" ? ($("pn2").value || "") : ($("sale-search").value || "");
      var ms = productMatches(q, 1);
      if (kind === "cobrar" && ms.length) {
        if (ev.preventDefault) ev.preventDefault();
        acPick("cobrar", ms[0].id);
      }
    }
  }
  function acPick(kind, id) {
    var p = s().getProduct(id);
    acHide(kind);
    if (!p) return;
    if (kind === "fiado") {
      $("pn2").value = p.name;
      $("pp").value = F.editDecimal(p.price);
      $("pqHint").textContent = p.unit === "kg" ? "Kg" : "u.";
      var pp = $("pp");
      if (pp && pp.focus) pp.focus();
    } else {
      $("sale-search").value = "";
      addToCart(p.id);
    }
  }
  function autoFillPrice() {
    var q = ($("pn2").value || "").toLowerCase();
    for (var i = 0; i < D().inventory.length; i++) {
      if (D().inventory[i].name.toLowerCase() === q) {
        $("pp").value = F.editDecimal(D().inventory[i].price);
        var isKg = D().inventory[i].unit === "kg";
        $("pq").placeholder = isKg ? "Kg (ej 0,5)" : "Cant";
        $("pqHint").textContent = isKg ? "Kg" : "u.";
        return;
      }
    }
  }
  function matchedProductByName(name) {
    var q = String(name || "").toLowerCase();
    for (var i = 0; i < D().inventory.length; i++) if (D().inventory[i].name.toLowerCase() === q) return D().inventory[i];
    return null;
  }
  function addProductFiado(ev) {
    ev.preventDefault();
    var c = s().getCustomer(D().selectedCustomerId);
    if (!c) return;
    var name = $("pn2").value.trim();
    if (!name) return;
    var prod = matchedProductByName(name);
    var unit = prod ? prod.unit : "u";
    var qtyRaw = $("pq").value.trim() || "1";
    var qty = unit === "kg" ? F.parseWeight(qtyRaw) : F.parseAmount(qtyRaw);
    if (unit !== "kg") qty = Math.round(qty);
    if (!(qty > 0)) { toast("Cantidad inválida", "warn"); return; }
    withPrice($("pp").value, function (price) {
      if (!(price > 0)) { toast("Precio inválido", "warn"); return; }
      if (prod && qty > prod.stock) { toast("Stock insuficiente (" + F.fmtQty(prod.stock, prod.unit) + ")", "danger"); return; }
      s().addFiado(c.id, name, price, qty, prod ? prod.id : null, unit);
      $("pn2").value = ""; $("pp").value = ""; $("pq").value = "1";
      render();
      toast("Fiado: " + name + " x" + (unit === "kg" ? F.fmtQtyShort(qty) + "kg" : Math.round(qty)));
    });
  }
  function addManualAmount(ev) {
    ev.preventDefault();
    var c = s().getCustomer(D().selectedCustomerId);
    if (!c) return;
    var reason = $("pmr").value.trim();
    var raw = $("pma").value.trim();
    var amt = F.parseAmount(raw);
    if (!reason || !(amt > 0)) { toast("Razón y monto válidos", "warn"); return; }
    function commit(v) {
      s().addMovement(c.id, { id: F.generateId(), type: "manual", description: reason, amount: F.money(v), date: new Date().toISOString() });
      $("pmr").value = ""; $("pma").value = "";
      render();
      toast("Deuda agregada: " + F.fmtCurrency(v));
    }
    var amb = F.dotAmbiguity(raw);
    if (amb != null && Math.abs(amb - amt) > 0.005) confirmPrice(raw, amt, amb, commit);
    else commit(amt);
  }
  function deleteMovement(cid, mid) {
    if (!confirm("¿Eliminar movimiento?")) return;
    s().deleteMovement(cid, mid);
    render();
    toast("Movimiento eliminado", "warn");
  }
  function archiveCycle() {
    var c = s().getCustomer(D().selectedCustomerId);
    if (!c || !c.movements.length) return;
    if (!confirm("¿Archivar ciclo actual? El saldo pendiente se condona y queda registrado.")) return;
    s().archiveCycleManual(c.id);
    render();
    toast("Ciclo archivado");
  }
  function deleteCycle(cid, hid) {
    if (!confirm("¿Borrar ciclo del historial?")) return;
    s().deleteCycle(cid, hid);
    render();
  }
  // ---------- COMPARTIR FIADO (fiel a _shareClient/_buildTicketWidget) ----------
  // Modal con vista previa del ticket marca + Opciones avanzadas (historial)
  // + Copiar texto / Compartir (Web Share API con imagen) / Descargar PNG.
  var shareState = { cid: null, includeHistory: false };

  // Datos ya calculados para el ticket (los usan el preview HTML y el canvas).
  function ticketData(c, includeHistory) {
    var total = s().customerTotal(c), base = s().baseTotal(c);
    var sorted = (c.movements || []).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var twoCols = sorted.length > 8;
    var half = Math.ceil(sorted.length / 2);
    return {
      total: total, base: base, intr: total - base,
      periods: s().interestPeriods(c),
      dateStr: F.exportDate(new Date()),
      sorted: sorted, twoCols: twoCols,
      left: twoCols ? sorted.slice(0, half) : sorted,
      right: twoCols ? sorted.slice(half) : [],
      includeHistory: !!includeHistory && (c.history || []).length > 0
    };
  }
  function moveChip(m) {
    if (m.type === "payment" || m.type === "settle") return { label: "Abono", cls: "abono" };
    if (m.type === "credit") return { label: "A favor", cls: "favor" };
    if (m.type === "manual") return { label: "Manual", cls: "manual" };
    if (m.type === "interest") return { label: "Interes", cls: "interes" };
    return { label: "Fiado", cls: "fiado" };
  }
  function ticketHTML(c, includeHistory) {
    var d = ticketData(c, includeHistory);
    var h = '<div class="tk-head"><div class="tk-logo"><span class="ic">storefront</span></div>' +
      '<div style="flex:1"><div class="tk-brand">MAXIKIOSKO KP</div><div class="tk-sub">Resumen de Cuenta</div></div>' +
      '<div style="text-align:right"><div class="tk-est">ESTADO DE CUENTA</div><div class="tk-date">' + d.dateStr + "</div></div></div>" +
      '<div class="tk-accent"></div><div class="tk-body">' +
      '<div class="tk-client"><div class="tk-avatar"><span class="ic">person</span></div>' +
      '<div style="flex:1"><div class="tk-lbl">CLIENTE</div><div class="tk-name">' + F.esc(c.name) + "</div></div>" +
      '<div class="tk-badge ' + (d.total > 0 ? "debe" : "saldado") + '">' + (d.total > 0 ? "Debe" : "Saldado") + "</div></div>" +
      '<div class="tk-pills">' +
      '<div class="tk-pill"><div class="tk-lbl">EMITIDO</div><div class="tk-val">' + d.dateStr + "</div></div>" +
      '<div class="tk-pill"><div class="tk-lbl">CUENTA DESDE</div><div class="tk-val">' + F.formatDateShort(s().accountStart(c)) + "</div></div>";
    if (c.movements.length) h += '<div class="tk-pill"><div class="tk-lbl">CICLO DESDE</div><div class="tk-val">' + F.formatDateShort(s().cycleStart(c.movements)) + "</div></div>";
    if (c.limit > 0) h += '<div class="tk-pill"><div class="tk-lbl">CREDITO MAX</div><div class="tk-val">$' + F.fmt(c.limit) + "</div></div>";
    h += '<div class="tk-pill"><div class="tk-lbl">RECARGO</div><div class="tk-val">' + F.trimNumber(c.interestRate) + "% / " + c.interestDays + "d</div></div></div>" +
      '<div class="tk-div"></div>' +
      '<div class="tk-sec"><span class="ic">receipt_long</span> MOVIMIENTOS (' + c.movements.length + ")</div>";
    function row(m) {
      var chip = moveChip(m), out = F.isOutflow(m.type);
      return '<div class="tk-mov"><span class="tk-chip ' + chip.cls + '">' + chip.label + "</span>" +
        '<span class="tk-desc">' + F.esc(m.description) + "<br><small>" + F.ticketDate(m.date) + "</small></span>" +
        '<span class="tk-amt' + (out ? " out" : "") + '">' + (out ? "−" : "+") + "$" + F.fmt(m.amount) + "</span></div>";
    }
    if (!c.movements.length) {
      h += '<div class="tk-foot"><i>Sin movimientos</i></div>';
    } else if (!d.twoCols) {
      for (var i = 0; i < d.sorted.length; i++) h += row(d.sorted[i]);
    } else {
      h += '<div style="display:flex;gap:14px"><div style="flex:1">';
      for (var a = 0; a < d.left.length; a++) h += row(d.left[a]);
      h += '</div><div style="flex:1">';
      for (var b = 0; b < d.right.length; b++) h += row(d.right[b]);
      h += "</div></div>";
    }
    if (d.includeHistory) {
      h += '<div class="tk-sec"><span class="ic">history</span> HISTORIAL (' + c.history.length + " ciclos)</div>";
      c.history.forEach(function (cy) {
        h += '<div class="tk-hist">Ciclo ' + F.formatDateShort(s().cycleStart(cy.movements, cy.closedAt)) + " → " + F.formatDateShort(cy.closedAt) +
          " · Deuda $" + F.fmt(cy.totalDebt) + " · Pagado $" + F.fmt(cy.totalPaid) + "</div>";
        cy.movements.slice().sort(function (x, y) { return new Date(y.date) - new Date(x.date); }).forEach(function (m) { h += row(m); });
      });
    }
    h += '<div class="tk-div"></div>' +
      '<div class="tk-sum"><span>Deuda neta</span><b>$' + F.fmt(d.base) + "</b></div>";
    if (d.intr > 0) h += '<div class="tk-sum"><span>Recargo por intereses' + (d.periods > 1 ? " (x" + d.periods + ")" : "") + "</span><b>+$" + F.fmt(d.intr) + "</b></div>";
    h += '<div class="tk-total"><span class="ic">account_balance_wallet</span><span>' + (d.total < 0 ? "SALDO A FAVOR" : "TOTAL A DEBER") + "</span><b>$" + F.fmt(Math.abs(d.total)) + "</b></div>" +
      '<div class="tk-foot">Gracias por su confianza<br><small>Generado por MaxiKiosko KP</small></div>' +
      "</div>";
    return h;
  }

  function shareClient(includeHist) {
    var c = s().getCustomer(D().selectedCustomerId);
    if (!c) return;
    shareState = { cid: c.id, includeHistory: !!includeHist && (c.history || []).length > 0 };
    renderShareModal();
    showOv("share-ov");
  }
  function renderShareModal() {
    var c = s().getCustomer(shareState.cid);
    if (!c) { hideOv("share-ov"); return; }
    $("shareTitle").textContent = "Resumen de " + c.name;
    var box = $("shareHist");
    if (box) {
      box.checked = shareState.includeHistory;
      box.disabled = !(c.history || []).length;
    }
    var lbl = $("shareHistLabel");
    if (lbl) lbl.textContent = "Incluir historial (" + (c.history || []).length + " ciclos)";
    $("sharePreview").innerHTML = ticketHTML(c, shareState.includeHistory);
  }
  function shareRetoggle() {
    var box = $("shareHist");
    shareState.includeHistory = !!(box && box.checked);
    renderShareModal();
  }
  function shareCopy() {
    var c = s().getCustomer(shareState.cid);
    if (!c) return;
    copyText(s().clientTicket(c, shareState.includeHistory), "Resumen copiado al portapapeles");
  }
  function safeName(name) { return String(name || "cliente").replace(/[^a-zA-Z0-9_]/g, "_"); }
  function stampName() {
    var n = new Date();
    return n.getFullYear() + F.pad2(n.getMonth() + 1) + F.pad2(n.getDate()) + "_" + F.pad2(n.getHours()) + F.pad2(n.getMinutes());
  }
  // PNG del ticket (fiel al widget de la app): encabezado marca, pills,
  // movimientos en 1-2 columnas, historial opcional, caja de total.
  function drawTicketCanvas(c, includeHistory) {
    var d = ticketData(c, includeHistory);
    var K = 2; // escala (~ pixelRatio de la app)
    var W = (d.twoCols ? 700 : 340) * K;
    var cv = document.createElement("canvas");
    var ctx = cv.getContext("2d");
    var y = 0;
    function rr(x, yy, w, h, r) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, yy, w, h, r);
      else ctx.rect(x, yy, w, h);
    }
    function txt(str, x, yy, font, color, align) {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(str, x, yy);
    }
    function ell(str, maxW, font) {
      ctx.font = font;
      if (ctx.measureText(str).width <= maxW) return str;
      while (str.length > 1 && ctx.measureText(str + "…").width > maxW) str = str.slice(0, -1);
      return str + "…";
    }
    // Altura: se calcula antes de crear el bitmap.
    var headH = 64 * K, pillsH = 56 * K, rowH = 26 * K, secH = 24 * K;
    var nRows = d.twoCols ? d.left.length : d.sorted.length;
    var h = headH + 3 * K + 16 * K + 30 * K + 12 * K + pillsH + 14 * K + secH + 6 * K;
    h += nRows * rowH;
    if (!c.movements.length) h += 20 * K;
    if (d.includeHistory) {
      h += 10 * K + secH + 6 * K;
      c.history.forEach(function (cy) { h += 16 * K + cy.movements.length * rowH; });
    }
    h += 10 * K + 2 * 16 * K + 6 * K + 34 * K + 14 * K + 26 * K + 18 * K;
    cv.width = W; cv.height = Math.ceil(h);
    // Fondo
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, cv.width, cv.height);
    // Encabezado
    ctx.fillStyle = "#0F1F14"; ctx.fillRect(0, 0, W, headH);
    var px = 18 * K; y = 0;
    ctx.fillStyle = "#4ADE80"; rr(px, 15 * K, 34 * K, 34 * K, 8 * K); ctx.fill();
    txt("KP", px + 17 * K, 38 * K, "800 " + (15 * K) + "px sans-serif", "#0F1F14", "center");
    txt("MAXIKIOSKO KP", px + 44 * K, 30 * K, "800 " + (15 * K) + "px sans-serif", "#FFFFFF");
    txt("Resumen de Cuenta", px + 44 * K, 44 * K, "500 " + (9 * K) + "px sans-serif", "#4ADE80");
    txt("ESTADO DE CUENTA", W - px, 28 * K, "600 " + (7 * K) + "px sans-serif", "#9AB5A3", "right");
    txt(d.dateStr, W - px, 42 * K, "500 " + (8 * K) + "px sans-serif", "#E8EFEA", "right");
    ctx.fillStyle = "#4ADE80"; ctx.fillRect(0, headH, W, 3 * K);
    y = headH + 3 * K + 16 * K;
    // Cliente + badge
    ctx.fillStyle = "#F3F4F6"; ctx.beginPath(); ctx.arc(px + 14 * K, y + 4 * K, 14 * K, 0, 7); ctx.fill();
    txt("CLIENTE", px + 34 * K, y, "600 " + (8 * K) + "px sans-serif", "#6B7280");
    txt(ell(c.name, W - px * 2 - 120 * K, "700 " + (14 * K) + "px sans-serif"), px + 34 * K, y + 18 * K, "700 " + (14 * K) + "px sans-serif", "#111111");
    var badge = d.total > 0 ? "Debe" : "Saldado";
    ctx.font = "700 " + (8 * K) + "px sans-serif";
    var bw = ctx.measureText(badge).width + 16 * K;
    ctx.fillStyle = d.total > 0 ? "#FEE2E2" : "#D1FAE5";
    rr(W - px - bw, y - 8 * K, bw, 18 * K, 9 * K); ctx.fill();
    txt(badge, W - px - bw / 2, y + 5 * K, "700 " + (8 * K) + "px sans-serif", d.total > 0 ? "#991B1B" : "#065F46", "center");
    y += 30 * K + 12 * K;
    // Pills
    function pill(label, value, xx) {
      ctx.font = "600 " + (9 * K) + "px sans-serif";
      var w = Math.max(ctx.measureText(label).width, ctx.measureText(value).width) + 16 * K;
      ctx.fillStyle = "#F3F4F6"; rr(xx, y, w, 34 * K, 6 * K); ctx.fill();
      txt(label, xx + 8 * K, y + 12 * K, "600 " + (7 * K) + "px sans-serif", "#6B7280");
      txt(value, xx + 8 * K, y + 26 * K, "600 " + (9 * K) + "px sans-serif", "#111111");
      return w + 8 * K;
    }
    var xx = px;
    xx += pill("EMITIDO", d.dateStr, xx);
    xx += pill("CUENTA DESDE", F.formatDateShort(s().accountStart(c)), xx);
    if (c.movements.length) xx += pill("CICLO DESDE", F.formatDateShort(s().cycleStart(c.movements)), xx);
    if (c.limit > 0) xx += pill("CREDITO MAX", "$" + F.fmt(c.limit), xx);
    pill("RECARGO", F.trimNumber(c.interestRate) + "% / " + c.interestDays + "d", xx);
    y += pillsH + 14 * K;
    ctx.fillStyle = "#E5E7EB"; ctx.fillRect(px, y, W - px * 2, K); y += 10 * K;
    txt("MOVIMIENTOS (" + c.movements.length + ")", px, y, "700 " + (10 * K) + "px sans-serif", "#111111");
    y += 6 * K + 12 * K;
    var chipStyle = {
      abono: ["Abono", "#D1FAE5", "#065F46"], favor: ["A favor", "#D1FAE5", "#065F46"],
      manual: ["Manual", "#DBEAFE", "#1E40AF"], interes: ["Interes", "#FEE2E2", "#991B1B"],
      fiado: ["Fiado", "#FFEDD5", "#9A3412"]
    };
    function movRow(m, rx, colW) {
      var chip = moveChip(m), st = chipStyle[chip.cls], out = F.isOutflow(m.type);
      ctx.font = "700 " + (8 * K) + "px sans-serif";
      var cw = ctx.measureText(st[0]).width + 12 * K;
      ctx.fillStyle = st[1]; rr(rx, y, cw, 14 * K, 4 * K); ctx.fill();
      txt(st[0], rx + 6 * K, y + 10.5 * K, "700 " + (8 * K) + "px sans-serif", st[2]);
      var ax = rx + cw + 8 * K;
      var amt = (out ? "−" : "+") + "$" + F.fmt(m.amount);
      ctx.font = "700 " + (11 * K) + "px sans-serif";
      var aw = ctx.measureText(amt).width;
      txt(ell(m.description, colW - cw - aw - 20 * K, "500 " + (10 * K) + "px sans-serif"), ax, y + 9 * K, "500 " + (10 * K) + "px sans-serif", "#111111");
      txt(F.ticketDate(m.date), ax, y + 20 * K, "400 " + (8 * K) + "px sans-serif", "#6B7280");
      txt(amt, rx + colW, y + 12 * K, "700 " + (11 * K) + "px sans-serif", out ? "#065F46" : "#111111", "right");
      y += rowH;
    }
    if (!c.movements.length) {
      txt("Sin movimientos", px, y + 12 * K, "italic 400 " + (10 * K) + "px sans-serif", "#6B7280");
      y += 20 * K;
    } else if (!d.twoCols) {
      for (var i = 0; i < d.sorted.length; i++) movRow(d.sorted[i], px, W - px * 2);
    } else {
      var y0 = y, colW = (W - px * 2 - 14 * K) / 2;
      for (var a = 0; a < d.left.length; a++) movRow(d.left[a], px, colW);
      var yL = y; y = y0;
      for (var b = 0; b < d.right.length; b++) movRow(d.right[b], px + colW + 14 * K, colW);
      y = Math.max(y, yL);
    }
    if (d.includeHistory) {
      y += 10 * K;
      txt("HISTORIAL (" + c.history.length + " ciclos)", px, y, "700 " + (10 * K) + "px sans-serif", "#111111");
      y += 6 * K + 12 * K;
      c.history.forEach(function (cy) {
        txt("Ciclo " + F.formatDateShort(s().cycleStart(cy.movements, cy.closedAt)) + " → " + F.formatDateShort(cy.closedAt) +
          " · Deuda $" + F.fmt(cy.totalDebt) + " · Pagado $" + F.fmt(cy.totalPaid), px, y, "600 " + (9 * K) + "px sans-serif", "#6B7280");
        y += 16 * K;
        cy.movements.slice().sort(function (m1, m2) { return new Date(m2.date) - new Date(m1.date); })
          .forEach(function (m) { movRow(m, px, W - px * 2); });
      });
    }
    y += 10 * K;
    ctx.fillStyle = "#E5E7EB"; ctx.fillRect(px, y, W - px * 2, K); y += 10 * K + 12 * K;
    txt("Deuda neta", px, y, "500 " + (10 * K) + "px sans-serif", "#6B7280");
    txt("$" + F.fmt(d.base), W - px, y, "500 " + (10 * K) + "px sans-serif", "#111111", "right");
    y += 16 * K;
    if (d.intr > 0) {
      txt("Recargo por intereses" + (d.periods > 1 ? " (x" + d.periods + ")" : ""), px, y, "500 " + (10 * K) + "px sans-serif", "#6B7280");
      txt("+$" + F.fmt(d.intr), W - px, y, "500 " + (10 * K) + "px sans-serif", "#111111", "right");
      y += 16 * K;
    }
    y += 6 * K;
    ctx.fillStyle = "#0F1F14"; rr(px, y, W - px * 2, 34 * K, 8 * K); ctx.fill();
    txt(d.total < 0 ? "SALDO A FAVOR" : "TOTAL A DEBER", px + 14 * K, y + 21 * K, "700 " + (9 * K) + "px sans-serif", "#9AB5A3");
    txt("$" + F.fmt(Math.abs(d.total)), W - px - 14 * K, y + 23 * K, "800 " + (16 * K) + "px sans-serif", "#4ADE80", "right");
    y += 34 * K + 14 * K;
    txt("Gracias por su confianza", W / 2, y + 10 * K, "500 " + (9 * K) + "px sans-serif", "#6B7280", "center");
    txt("Generado por MaxiKiosko KP", W / 2, y + 22 * K, "500 " + (7 * K) + "px sans-serif", "#9CA3AF", "center");
    return cv;
  }
  function shareFileName(c) {
    return "Fiado_" + safeName(c.name) + "_" + stampName() + ".png";
  }
  function shareCopy() {
    var c = s().getCustomer(shareState.cid);
    if (!c) return;
    copyText(s().clientTicket(c, shareState.includeHistory), "Resumen copiado al portapapeles");
  }
  function shareSend() {
    var c = s().getCustomer(shareState.cid);
    if (!c) return;
    var done = function () { hideOv("share-ov"); toast("Resumen de " + c.name + " compartido"); };
    try {
      if (navigator.share) {
        var cv = drawTicketCanvas(c, shareState.includeHistory);
        if (cv.toBlob) {
          cv.toBlob(function (blob) {
            try {
              if (blob && navigator.canShare) {
                var file = new File([blob], "fiado_" + safeName(c.name) + ".png", { type: "image/png" });
                try {
                  if (navigator.canShare({ files: [file] })) {
                    navigator.share({ files: [file], title: "Resumen de cuenta - " + c.name, text: "Resumen de cuenta de " + c.name }).then(done, function () { toast("Compartir cancelado", "warn"); });
                    return;
                  }
                } catch (e) {}
              }
              navigator.share({ title: "Resumen de cuenta - " + c.name, text: s().clientTicket(c, shareState.includeHistory) }).then(done, function () {});
            } catch (e) { shareCopy(); }
          }, "image/png");
          return;
        }
        navigator.share({ title: "Resumen de cuenta - " + c.name, text: s().clientTicket(c, shareState.includeHistory) }).then(done, function () {});
        return;
      }
    } catch (e) {}
    shareCopy();
  }
  function shareDownload() {
    var c = s().getCustomer(shareState.cid);
    if (!c) return;
    try {
      var url = drawTicketCanvas(c, shareState.includeHistory).toDataURL("image/png");
      var a = document.createElement("a");
      a.href = url;
      a.download = shareFileName(c);
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); }, 500);
      toast("Imagen guardada en Descargas");
    } catch (e) {
      toast("No se pudo generar la imagen", "danger");
    }
  }

  // ---------- INVENTARIO ----------
  function setInvFilter(f, el) {
    D().inventoryFilter = f;
    var btns = document.querySelectorAll(".filts button");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i] === el);
    s().persist();
    renderInventario();
  }
  function renderInventario() {
    var q = ($("inv-search").value || "").toLowerCase();
    var list = D().inventory.filter(function (p) {
      if (q && p.name.toLowerCase().indexOf(q) < 0 && (p.brand || "").toLowerCase().indexOf(q) < 0) return false;
      if (D().inventoryFilter === "nostock") return !(p.stock > 0);
      if (D().inventoryFilter === "low") return p.stock > 0 && p.stock <= 5;
      return true;
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    var html = "";
    list.forEach(function (p) {
      var cls = !(p.stock > 0) ? "zero" : (p.stock <= 5 ? "low" : "ok");
      html += '<div class="ci' + (D().selectedProductId === p.id ? " active" : "") + '" onclick="KP_UI.selectProduct(\'' + p.id + "')\">" +
        '<div class="ci-body"><div class="ci-name">' + F.esc(p.name) + "</div><div class=\"ci-sub\">" + F.esc(p.brand || "") + (p.brand && p.category ? " · " : "") + F.esc(p.category || "") + " · " + (p.unit === "kg" ? "$/kg" : "") + "</div></div>" +
        '<div class="ci-right"><div class="ci-debt pos">' + F.fmtCurrency(p.price) + '</div><span class="bdg ' + cls + '">' + F.esc(F.fmtQty(p.stock, p.unit)) + "</span></div></div>";
    });
    $("inv-list").innerHTML = html || '<p class="muted">Sin productos.</p>';
    renderInvDetail();
  }
  function selectProduct(id) { D().selectedProductId = id; s().persist(); renderInventario(); }
  function renderInvDetail() {
    var p = s().getProduct(D().selectedProductId);
    var sp = $("invSplit");
    if (sp) sp.classList.toggle("has-sel", !!p);
    if (!p) { $("inv-empty").style.display = ""; $("inv-edit").style.display = "none"; return; }
    $("inv-empty").style.display = "none";
    $("inv-edit").style.display = "flex";
    $("inv-en").textContent = p.name;
    $("inv-en2").value = p.name;
    $("inv-em").value = p.brand || "";
    $("inv-ec").value = p.category || "";
    $("inv-ep").value = F.editDecimal(p.price);
    $("inv-ebp").value = F.editDecimal(p.buyPrice || 0);
    $("inv-es").value = F.stockEditText(p);
    $("inv-unit").value = p.unit === "kg" ? "kg" : "u";
    var val = (p.price || 0) * (p.stock || 0);
    $("inv-val").textContent = "Vale en stock: " + F.fmtCurrency(val);
  }
  function showNewProductForm() {
    $("inv-n").value = ""; $("inv-m").value = ""; $("inv-c").value = "";
    $("inv-p").value = ""; $("inv-bp").value = "0"; $("inv-s").value = "0";
    $("inv-u").value = "u";
    showOv("new-product-ov");
  }
  function createProduct(ev) {
    ev.preventDefault();
    var name = $("inv-n").value.trim();
    if (!name) return;
    var unit = $("inv-u").value === "kg" ? "kg" : "u";
    withPrice($("inv-p").value, function (price) {
      withPrice($("inv-bp").value || "0", function (buy) {
        var rawS = $("inv-s").value.trim() || "0";
        var stock = unit === "kg" ? F.parseWeight(rawS) : Math.round(F.parseAmount(rawS));
        if (stock < 0) stock = 0;
        s().addProduct({ name: name, brand: $("inv-m").value.trim(), category: $("inv-c").value.trim(), price: price, buyPrice: buy, unit: unit, stock: F.stockRound(stock) });
        hideOv("new-product-ov");
        render();
        toast("Producto agregado");
      });
    });
  }
  function updateProduct(ev) {
    ev.preventDefault();
    var p = s().getProduct(D().selectedProductId);
    if (!p) return;
    var unit = $("inv-unit").value === "kg" ? "kg" : "u";
    withPrice($("inv-ep").value, function (price) {
      withPrice($("inv-ebp").value || "0", function (buy) {
        var rawS = $("inv-es").value.trim() || "0";
        var stock = unit === "kg" ? F.parseWeight(rawS) : Math.round(F.parseAmount(rawS));
        if (stock < 0) stock = 0;
        p.name = $("inv-en2").value.trim() || p.name;
        p.brand = $("inv-em").value.trim();
        p.category = $("inv-ec").value.trim();
        p.price = price; p.buyPrice = buy; p.unit = unit; p.stock = F.stockRound(stock);
        s().updateProduct(p);
        render();
        toast("Producto guardado");
      });
    });
  }
  function deleteProduct() {
    var p = s().getProduct(D().selectedProductId);
    if (!p) return;
    if (!confirm("¿Eliminar " + p.name + "?")) return;
    s().deleteProduct(p.id);
    render();
    toast("Producto eliminado", "warn");
  }

  // ---------- COBRAR ----------
  function setPM(m, el) {
    D().paymentMethod = m;
    var btns = document.querySelectorAll("#pm-group button");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i] === el);
    s().persist();
  }
  function addToCart(id) {
    var p = s().getProduct(id);
    if (!p) return;
    if (p.unit === "kg") { openWeightDialog(p); return; }
    if (!(p.stock > 0)) { toast("Sin stock: " + p.name, "danger"); return; }
    for (var i = 0; i < D().cart.length; i++) {
      if (D().cart[i].productId === p.id) {
        if (D().cart[i].quantity + 1 > p.stock) { toast("Stock insuficiente", "danger"); return; }
        D().cart[i].quantity += 1;
        s().persist(); renderCobrar();
        return;
      }
    }
    D().cart.push({ name: p.name, productId: p.id, price: p.price, quantity: 1, unit: "u" });
    s().persist(); renderCobrar();
  }
  var weightPid = null;
  function openWeightDialog(p) {
    weightPid = p.id;
    $("wName").textContent = p.name + " — $" + F.fmt(p.price) + "/kg (stock " + F.fmtQtyShort(p.stock) + " kg)";
    $("wInput").value = "";
    $("wTotal").textContent = "$" + F.fmt(0);
    showOv("weight-ov");
  }
  function weightPreview() {
    var p = s().getProduct(weightPid);
    if (!p) return;
    var w = F.parseWeight($("wInput").value || "0");
    $("wTotal").textContent = "$" + F.fmt((p.price || 0) * w);
  }
  function weightConfirm() {
    var p = s().getProduct(weightPid);
    if (!p) { hideOv("weight-ov"); return; }
    var w = F.parseWeight($("wInput").value || "0");
    if (!(w > 0)) { toast("Peso inválido", "warn"); return; }
    var inCart = 0;
    for (var i = 0; i < D().cart.length; i++) if (D().cart[i].productId === p.id) inCart = D().cart[i].quantity;
    if (w + inCart > p.stock + 1e-9) { toast("Supera el stock (" + F.fmtQty(p.stock, "kg") + ")", "danger"); return; }
    var found = false;
    for (var j = 0; j < D().cart.length; j++) {
      if (D().cart[j].productId === p.id) { D().cart[j].quantity = F.stockRound(D().cart[j].quantity + w); found = true; }
    }
    if (!found) D().cart.push({ name: p.name, productId: p.id, price: p.price, quantity: w, unit: "kg" });
    hideOv("weight-ov");
    s().persist(); renderCobrar();
  }
  function cartQty(idx, d) {
    var it = D().cart[idx];
    if (!it) return;
    var p = s().productForItem(it);
    if (it.unit === "kg") { editCartWeight(idx); return; }
    var nq = Math.round(it.quantity + d);
    if (nq <= 0) { D().cart.splice(idx, 1); }
    else {
      if (p && nq > p.stock) { toast("Stock insuficiente", "danger"); return; }
      it.quantity = nq;
    }
    s().persist(); renderCobrar();
  }
  function editCartWeight(idx) {
    var it = D().cart[idx];
    if (!it) return;
    var raw = prompt("Peso en kg para " + it.name + " (ej 0,5 - 700g):", F.fmtQtyShort(it.quantity));
    if (raw == null) return;
    var w = F.parseWeight(raw);
    if (!(w > 0)) { toast("Peso inválido", "warn"); return; }
    var p = s().productForItem(it);
    if (p && w > p.stock + 1e-9) { toast("Supera el stock", "danger"); return; }
    it.quantity = w;
    s().persist(); renderCobrar();
  }
  function cartDel(idx) { D().cart.splice(idx, 1); s().persist(); renderCobrar(); }
  function renderCobrar() {
    var q = ($("sale-search").value || "").toLowerCase();
    var list = D().inventory.filter(function (p) {
      return !q || p.name.toLowerCase().indexOf(q) >= 0 || (p.brand || "").toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var html = "";
    list.forEach(function (p) {
      html += '<div class="si" onclick="KP_UI.addToCart(\'' + p.id + "')\">" +
        "<h5>" + F.esc(p.name) + "</h5>" +
        (p.brand ? '<div class="si-brand">' + F.esc(p.brand) + "</div>" : "") +
        '<div class="si-price">' + F.fmtCurrency(p.price) + (p.unit === "kg" ? "<small>/kg</small>" : "") + "</div>" +
        '<div class="si-stock">' + F.esc(F.fmtQty(p.stock, p.unit)) + "</div></div>";
    });
    $("sale-catalog").innerHTML = html || '<p class="muted">Sin productos.</p>';
    // carrito
    var ch = "";
    D().cart.forEach(function (it, i) {
      var sub = F.money(it.price * it.quantity);
      var qtyCtl = it.unit === "kg"
        ? '<span>' + F.fmtQtyShort(it.quantity) + ' kg</span><button onclick="KP_UI.editCartWeight(' + i + ')"><span class="ic sm">edit</span></button>'
        : '<button onclick="KP_UI.cartQty(' + i + ",-1)\"><span class=\"ic sm\">remove</span></button><span>" + Math.round(it.quantity) + "</span><button onclick=\"KP_UI.cartQty(" + i + ",1)\"><span class=\"ic sm\">add</span></button>";
      ch += '<div class="ci-cart"><span class="cc-name">' + F.esc(it.name) + '</span><span class="cc-qty">' + qtyCtl + '</span><span class="cc-sub">' + F.fmtCurrency(sub) + '</span><button class="cc-del" onclick="KP_UI.cartDel(' + i + ')"><span class="ic sm">close</span></button></div>';
    });
    $("cart-items").innerHTML = ch;
    $("cart-empty").style.display = D().cart.length ? "none" : "";
    $("cart-total").textContent = F.fmtCurrency(s().cartTotal());
    $("cart-obtained").textContent = F.fmtCurrency(s().cartObtained());
    var dl = "";
    D().customers.forEach(function (c) { dl += '<option value="' + F.esc(c.name) + '">'; });
    $("sale-client-options").innerHTML = dl;
    $("md-client-options").innerHTML = dl;
  }
  function confirmSale() {
    if (!D().cart.length) { toast("Carrito vacío", "warn"); return; }
    for (var i = 0; i < D().cart.length; i++) {
      var it = D().cart[i], p = s().productForItem(it);
      if (p && it.quantity - p.stock > 1e-9) { toast("Stock insuficiente: " + p.name, "danger"); return; }
    }
    var total = s().cartTotal();
    s().addSale({ total: total, method: D().paymentMethod, clientName: $("sale-client-name").value.trim(), items: D().cart.map(function (x) { return { name: x.name, productId: x.productId, price: x.price, quantity: x.quantity, unit: x.unit }; }), date: new Date().toISOString() });
    $("sale-client-name").value = "";
    if ($("chk-ticket").checked) {
      var last = D().sales[D().sales.length - 1];
      if (last) download("Ticket_" + Date.now() + ".txt", s().saleTicket(last));
    }
    render();
    toast("Venta cobrada: " + F.fmtCurrency(total));
  }
  function toggleMiniDeuda() { $("mini-deuda-form").classList.toggle("open"); }
  function cobrarMiniDeuda() {
    var desc = $("md-desc").value.trim();
    var raw = $("md-amt").value.trim();
    var amt = F.parseAmount(raw);
    if (!desc || !(amt > 0)) { toast("Razón y monto válidos", "warn"); return; }
    function commit(v) {
      var client = $("md-client").value.trim();
      s().addSale({ total: F.money(v), method: D().paymentMethod, clientName: (client ? client + " (mini deuda: " : "(mini deuda: ") + desc + ")", items: [{ name: desc, productId: "_manual", price: F.money(v), quantity: 1, unit: "u" }], date: new Date().toISOString() });
      $("md-desc").value = ""; $("md-amt").value = ""; $("md-client").value = "";
      render();
      toast("Mini deuda cobrada: " + F.fmtCurrency(v));
    }
    var amb = F.dotAmbiguity(raw);
    if (amb != null && Math.abs(amb - amt) > 0.005) confirmPrice(raw, amt, amb, commit);
    else commit(amt);
  }

  // ---------- GASTOS ----------
  function renderGastos() {
    var groups = {};
    D().expenses.forEach(function (e) {
      var d = new Date(e.date);
      var k = d.getFullYear() + "-" + F.pad2(d.getMonth() + 1);
      (groups[k] = groups[k] || { d: new Date(d.getFullYear(), d.getMonth(), 1), items: [], sub: 0 }).items.push(e);
      groups[k].sub += e.amount;
    });
    var keys = Object.keys(groups).sort().reverse();
    var html = "";
    keys.forEach(function (k) {
      var g = groups[k];
      g.items.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      html += '<div class="mhead">' + F.monthLabel(g.d) + " · " + F.fmtCurrency(g.sub) + "</div>";
      g.items.forEach(function (e) {
        html += '<div class="ex"><span>' + F.esc(e.description) + " <small>" + F.dateDisplay(e.date) + '</small></span><span><b class="neg">' + F.fmtCurrency(e.amount) + '</b> <button class="mi-del" onclick="KP_UI.deleteExpense(\'' + e.id + "')\">" + '<span class="ic sm">delete</span></button></span></div>';
      });
    });
    $("gastos-list").innerHTML = html || '<p class="muted">Sin gastos.</p>';
  }
  function deleteExpense(id) {
    if (!confirm("¿Eliminar gasto?")) return;
    s().deleteExpense(id);
    render();
  }

  // ---------- HISTORIAL ----------
  function renderHistorial() {
    var q = ($("hist-q").value || "").toLowerCase();
    var m = D().histMethod || "todos";
    var list = D().sales.filter(function (sl) {
      if (m !== "todos" && sl.method !== m) return false;
      if (!q) return true;
      if ((sl.clientName || "").toLowerCase().indexOf(q) >= 0) return true;
      for (var i = 0; i < sl.items.length; i++) if (sl.items[i].name.toLowerCase().indexOf(q) >= 0) return true;
      return false;
    }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var shown = list.slice(0, D().histShown || 100);
    var groups = {}, order = [];
    shown.forEach(function (sl) {
      var d = new Date(sl.date);
      var k = d.getFullYear() + "-" + d.getMonth();
      if (!groups[k]) { groups[k] = { d: new Date(d.getFullYear(), d.getMonth(), 1), items: [], sub: 0 }; order.push(k); }
      groups[k].items.push(sl);
      groups[k].sub += sl.total;
    });
    var html = "";
    order.forEach(function (k) {
      var g = groups[k];
      html += '<div class="mhead">' + F.monthLabel(g.d) + " · " + F.fmtCurrency(g.sub) + "</div>";
      g.items.forEach(function (sl) {
        var items = sl.items.map(function (it) { return F.itemQtyPrefix(it.quantity, it.unit) + " " + it.name; }).join(", ");
        html += '<div class="sale"><div class="sale-top"><b>' + F.fmtCurrency(sl.total) + '</b><span class="muted">' + F.esc(sl.clientName || "Público") + " · " + F.esc(sl.method) + " · " + F.dateDisplay(sl.date) + "</span></div>" +
          '<div class="sale-items">' + F.esc(items) + "</div>" +
          '<div class="sale-acts"><button class="btn sm" onclick="KP_UI.shareSale(' + "'" + sl.id + "'" + ')">' + '<span class="ic sm">receipt_long</span> Ticket</button>' +
          '<button class="btn sm danger" onclick="KP_UI.deleteSale(' + "'" + sl.id + "'" + ')">' + '<span class="ic sm">delete</span> Anular</button></div></div>';
      });
    });
    if (list.length > shown.length) html += '<button class="btn" style="width:100%" onclick="KP_UI.histMore()">Cargar más (' + (list.length - shown.length) + " restantes)</button>";
    $("hist-list").innerHTML = html || '<p class="muted">Sin ventas.</p>';
    $("histCount").textContent = list.length + " ventas";
  }
  function histMore() { D().histShown = (D().histShown || 100) + 100; s().persist(); renderHistorial(); }
  function histReset() { D().histShown = 100; s().persist(); renderHistorial(); }
  function setHistMethod(m, el) {
    D().histMethod = m;
    var btns = document.querySelectorAll("#hist-methods button");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i] === el);
    histReset();
  }
  function shareSale(id) {
    var sl = null;
    for (var i = 0; i < D().sales.length; i++) if (D().sales[i].id === id) sl = D().sales[i];
    if (!sl) return;
    var t = s().saleTicket(sl);
    copyText(t, "Ticket copiado");
    download("Ticket_" + id.slice(0, 8) + ".txt", t);
  }
  function deleteSale(id) {
    if (!confirm("¿Anular venta y devolver stock?")) return;
    var ok = s().deleteSale(id);
    render();
    toast(ok ? "Venta anulada, stock devuelto" : "Venta anulada (algún producto ya no existe)", ok ? "" : "warn");
  }

  // ---------- importar / cargar ----------
  var importTicketData = null, loadBackupData = null;
  function openImportTicket() { $("import-preview").style.display = "none"; $("import-file").value = ""; showOv("import-ov"); }
  function handleImportFile(ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      var parsed = window.KP_PARSERS.parseTicketText(String(rd.result || ""));
      if (!parsed.items.length) { toast("No se encontraron items", "danger"); return; }
      importTicketData = parsed;
      $("import-ticket-content").textContent = "Cliente: " + parsed.customer + "\n" + parsed.items.map(function (it) {
        return F.itemQtyPrefix(it.quantity, it.unit) + " " + it.name + "  $" + F.fmt(it.price * it.quantity);
      }).join("\n") + "\nTOTAL: $" + F.fmt(parsed.total);
      $("import-total").textContent = "$" + F.fmt(parsed.total);
      $("import-preview").style.display = "";
    };
    rd.readAsText(file);
  }
  function applyImportTicket() {
    if (!importTicketData) return;
    var unmatched = 0;
    var items = importTicketData.items.map(function (it) {
      var q = it.name.toLowerCase(), pid = null, exact = null, first = null;
      for (var i = 0; i < D().inventory.length; i++) {
        if (D().inventory[i].name.toLowerCase() === q) {
          if (!first) first = D().inventory[i];
          if (Math.abs(D().inventory[i].price - it.price) < 0.01) exact = D().inventory[i];
        }
      }
      pid = exact ? exact.id : (first ? first.id : null);
      if (!pid) unmatched++;
      return { name: it.name, productId: pid, price: it.price, quantity: it.quantity, unit: it.unit };
    });
    s().addSale({ total: importTicketData.total, method: "efectivo", clientName: importTicketData.customer + " (importado)", items: items, date: new Date().toISOString() });
    hideOv("import-ov");
    importTicketData = null;
    render();
    toast(unmatched ? "Importado. " + unmatched + " item(s) sin stock descontado." : "Ticket importado", unmatched ? "warn" : "");
  }
  function openLoadData() { $("load-preview").style.display = "none"; $("load-file").value = ""; $("load-confirm").value = ""; showOv("load-ov"); }
  function handleLoadFile(ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      var parsed = window.KP_PARSERS.parseBackupText(String(rd.result || ""));
      if (!parsed) { toast("Formato no reconocido", "danger"); return; }
      loadBackupData = parsed;
      $("load-content").textContent = parsed.customers.length + " clientes, " + parsed.products.length + " productos, " + parsed.sales.length + " ventas, " + parsed.expenses.length + " gastos.";
      $("load-preview").style.display = "";
    };
    rd.readAsText(file);
  }
  function applyLoadData() {
    if (!loadBackupData) return;
    if ($("load-confirm").value.trim() !== "REEMPLAZAR") { toast("Escribí REEMPLAZAR para confirmar", "warn"); return; }
    s().replaceAllData(loadBackupData);
    hideOv("load-ov");
    loadBackupData = null;
    render();
    toast("Datos cargados y sincronizando…");
  }

  // ---------- modales genéricos ----------
  function showOv(id) { $(id).classList.add("show"); }
  function hideOv(id) { $(id).classList.remove("show"); }

  function init() {
    s().restore();
    var valid = ["inicio", "fiados", "inventario", "cobrar", "gastos", "historial"];
    if (valid.indexOf(D().currentView) < 0) D().currentView = "inicio";
    s().on(render);
    var btns = document.querySelectorAll(".sb-btn");
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", btns[i].getAttribute("data-view") === D().currentView);
    var views = document.querySelectorAll(".view");
    for (var j = 0; j < views.length; j++) views[j].classList.toggle("active", views[j].id === "view-" + D().currentView);
    render();
    s().fullSync().then(render);
    s().startAutoSync();
    window.addEventListener("online", function () { s().fullSync().then(render); });
  }

  window.KP_UI = {
    init: init, toast: toast, switchView: switchView, toggleSidebar: toggleSidebar,
    homeTogglePanel: homeTogglePanel, addExpenseFrom: addExpenseFrom, exportData: exportData,
    pickPrice: pickPrice, selectCustomer: selectCustomer, deselectCustomer: deselectCustomer,
    showNewClientForm: showNewClientForm, createCustomer: createCustomer, renameCustomer: renameCustomer,
    deleteCustomer: deleteCustomer, updateInterestSettings: updateInterestSettings,
    addPayment: addPayment, settleAccount: settleAccount, autoFillPrice: autoFillPrice,
    acFiadoInput: acFiadoInput, acCobrarInput: acCobrarInput, acPick: acPick, acHide: acHide, acKey: acKey,
    addProductFiado: addProductFiado, addManualAmount: addManualAmount, deleteMovement: deleteMovement,
    archiveCycle: archiveCycle, deleteCycle: deleteCycle, shareClient: shareClient,
    shareRetoggle: shareRetoggle, shareCopy: shareCopy, shareSend: shareSend, shareDownload: shareDownload,
    setInvFilter: setInvFilter, selectProduct: selectProduct, showNewProductForm: showNewProductForm,
    createProduct: createProduct, updateProduct: updateProduct, deleteProduct: deleteProduct,
    setPM: setPM, addToCart: addToCart, weightPreview: weightPreview, weightConfirm: weightConfirm,
    cartQty: cartQty, editCartWeight: editCartWeight, cartDel: cartDel,
    confirmSale: confirmSale, toggleMiniDeuda: toggleMiniDeuda, cobrarMiniDeuda: cobrarMiniDeuda,
    deleteExpense: deleteExpense, histMore: histMore, histReset: histReset, setHistMethod: setHistMethod,
    shareSale: shareSale, deleteSale: deleteSale,
    openImportTicket: openImportTicket, handleImportFile: handleImportFile, applyImportTicket: applyImportTicket,
    openLoadData: openLoadData, handleLoadFile: handleLoadFile, applyLoadData: applyLoadData,
    showOv: showOv, hideOv: hideOv
  };
})();
