/* Kiosko KP Web — store: estado, persistencia local, sync Supabase, totales.
 * Port de lib/services/storage_service.dart (lógica de negocio idéntica).
 */
(function () {
  "use strict";

  var LS_KEY = "kiosko_kp_web_v1";
  var F = null, DB = null;
  function f() { if (!F) F = window.KP_FMT; return F; }
  function db() { if (!DB) DB = window.KP_DB; return DB; }

  var S = {
    customers: [], inventory: [], sales: [], expenses: [],
    currentView: "inicio", selectedCustomerId: null, selectedProductId: null,
    cart: [], paymentMethod: "efectivo", inventoryFilter: "all",
    histQuery: "", histMethod: "todos", histShown: 100,
    online: false, syncing: false, lastSync: null,
    pending: { customers: [], movements: [], products: [], sales: [], expenses: [], cycles: [] },
    tomb: { customers: [], movements: [], products: [], sales: [], expenses: [], cycles: [] },
    // Tombstones ya confirmados por la nube (solo memoria, NO se persisten:
    // al reiniciar se re-pushean una vez, es seguro e idempotente).
    // Los tombstones NUNCA se borran: un id borrado no debe resucitar
    // aunque otro dispositivo lo re-inserte (paridad con Flutter).
    acked: { customers: [], movements: [], products: [], sales: [], expenses: [], cycles: [] },
    listeners: []
  };

  function on(fn) { S.listeners.push(fn); }
  function emit() { for (var i = 0; i < S.listeners.length; i++) { try { S.listeners[i](); } catch (e) {} } }

  function setAdd(arr, v) { if (arr.indexOf(v) < 0) arr.push(v); }
  function setDel(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); }
  function setHas(arr, v) { return arr.indexOf(v) >= 0; }

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        customers: S.customers, inventory: S.inventory, sales: S.sales, expenses: S.expenses,
        currentView: S.currentView, selectedCustomerId: S.selectedCustomerId,
        selectedProductId: S.selectedProductId, inventoryFilter: S.inventoryFilter,
        paymentMethod: S.paymentMethod, pending: S.pending, tomb: S.tomb
      }));
    } catch (e) {}
  }

  function restore() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      S.customers = d.customers || [];
      S.inventory = d.inventory || [];
      S.sales = d.sales || [];
      S.expenses = d.expenses || [];
      S.currentView = d.currentView || "inicio";
      S.selectedCustomerId = d.selectedCustomerId || null;
      S.selectedProductId = d.selectedProductId || null;
      S.inventoryFilter = d.inventoryFilter || "all";
      S.paymentMethod = d.paymentMethod || "efectivo";
      if (d.pending) S.pending = d.pending;
      if (d.tomb) S.tomb = d.tomb;
    } catch (e) {}
  }

  function hasPending() {
    return S.pending.customers.length || S.pending.movements.length || S.pending.products.length ||
      S.pending.sales.length || S.pending.expenses.length || S.pending.cycles.length;
  }

  // Tombstones sin confirmar (falta delete en la nube). Van aparte de
  // hasPending para que el sync no rote con deletes ya confirmados.
  function unacked(tombArr, ackArr) {
    return tombArr.filter(function (v) { return ackArr.indexOf(v) < 0; });
  }
  function hasTombstones() {
    return unacked(S.tomb.customers, S.acked.customers).length ||
      unacked(S.tomb.movements, S.acked.movements).length ||
      unacked(S.tomb.products, S.acked.products).length ||
      unacked(S.tomb.sales, S.acked.sales).length ||
      unacked(S.tomb.expenses, S.acked.expenses).length ||
      unacked(S.tomb.cycles, S.acked.cycles).length;
  }
  // Marca un id como borrado (tombstone) y lo saca de confirmados para que
  // el próximo push lo envíe.
  function addTomb(kind, v) { setAdd(S.tomb[kind], v); setDel(S.acked[kind], v); }

  // ---------- lookups ----------
  function getCustomer(id) { for (var i = 0; i < S.customers.length; i++) if (S.customers[i].id === id) return S.customers[i]; return null; }
  function getProduct(id) { for (var i = 0; i < S.inventory.length; i++) if (S.inventory[i].id === id) return S.inventory[i]; return null; }
  function productForItem(item) {
    if (item.productId) { var p = getProduct(item.productId); if (p) return p; return null; }
    var q = String(item.name || "").toLowerCase();
    for (var i = 0; i < S.inventory.length; i++) if (String(S.inventory[i].name || "").toLowerCase() === q) return S.inventory[i];
    return null;
  }

  // ---------- totales fiado (idéntico a Flutter) ----------
  function baseTotal(c) {
    var t = 0;
    for (var i = 0; i < c.movements.length; i++) {
      var m = c.movements[i];
      if (f().isOutflow(m.type)) t -= m.amount; else t += m.amount;
    }
    return f().money(t);
  }
  function oldestDebtDate(c) {
    var oldest = null;
    for (var i = 0; i < c.movements.length; i++) {
      var m = c.movements[i];
      if (!f().isDebtMove(m.type)) continue;
      var d = new Date(m.date);
      if (!oldest || d < oldest) oldest = d;
    }
    return oldest;
  }
  function interestPeriods(c) {
    if (baseTotal(c) <= 0 || !(c.interestDays > 0)) return 0;
    var oldest = oldestDebtDate(c);
    if (!oldest) return 0;
    return Math.floor((Date.now() - oldest.getTime()) / 86400000 / c.interestDays);
  }
  function customerTotal(c) {
    var t = baseTotal(c);
    if (t > 0 && c.movements.length) {
      var per = interestPeriods(c);
      if (per > 0) t = f().money(t + t * (c.interestRate / 100) * per);
    }
    return f().money(t);
  }
  function interestAmount(c) { var t = customerTotal(c) - baseTotal(c); return f().money(t > 0 ? t : 0); }
  function customerStatus(c) {
    if (baseTotal(c) <= 0) return "ok";
    var oldest = oldestDebtDate(c);
    if (!oldest) return "due";
    var overdue = Math.floor((Date.now() - oldest.getTime()) / 86400000) - (c.interestDays || 0);
    if (overdue < 0) return "due";
    return overdue >= 7 ? "critical" : "overdue";
  }
  function daysToDue(c) {
    if (baseTotal(c) <= 0) return null;
    var oldest = oldestDebtDate(c);
    if (!oldest) return null;
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var due = new Date(oldest.getTime() + (c.interestDays || 0) * 86400000);
    var dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    return Math.round((dueDay - today) / 86400000);
  }
  function accountStart(c) {
    if (c.createdAt) return new Date(c.createdAt);
    var o = oldestDebtDate(c);
    return o || new Date();
  }
  function cycleStart(movs, fallback) {
    var debt = null, any = null;
    for (var i = 0; i < movs.length; i++) {
      var d = new Date(movs[i].date);
      if (!any || d < any) any = d;
      if (f().isDebtMove(movs[i].type) && (!debt || d < debt)) debt = d;
    }
    return debt || any || (fallback ? new Date(fallback) : new Date());
  }
  function cartTotal() {
    var t = 0;
    for (var i = 0; i < S.cart.length; i++) t += S.cart[i].price * S.cart[i].quantity;
    return f().money(t);
  }
  function cartObtained() {
    var total = cartTotal(), cost = 0;
    for (var i = 0; i < S.cart.length; i++) {
      var p = productForItem(S.cart[i]);
      if (p) cost += (p.buyPrice || 0) * S.cart[i].quantity;
    }
    return f().money(total - cost);
  }

  // ---------- sync ----------
  function markDirty() { persist(); emit(); pushSoon(); }

  var pushTimer = null;
  function pushSoon() {
    if (pushTimer) return;
    pushTimer = setTimeout(function () { pushTimer = null; fullSync(); }, 1200);
  }

  function filterTombstones() {
    function has(arr, v) { return arr.indexOf(v) >= 0; }
    S.customers = S.customers.filter(function (c) { return !has(S.tomb.customers, c.id); });
    S.inventory = S.inventory.filter(function (p) { return !has(S.tomb.products, p.id); });
    S.sales = S.sales.filter(function (s) { return !has(S.tomb.sales, s.id); });
    S.expenses = S.expenses.filter(function (e) { return !has(S.tomb.expenses, e.id); });
    for (var i = 0; i < S.customers.length; i++) {
      (function (c) {
        c.movements = (c.movements || []).filter(function (m) { return !has(S.tomb.movements, c.id + "|" + m.id); });
        c.history = (c.history || []).filter(function (h) { return !has(S.tomb.cycles, h.id); });
      })(S.customers[i]);
    }
  }

  function pull() {
    var withUnit = false, withCycles = false;
    return db().probe("products", "unit").then(function (u) {
      withUnit = !!u;
      return db().probe("debt_cycles", "id");
    }).then(function (cy) {
      withCycles = !!cy;
      return db().fetchAll();
    }).then(function (res) {
      var rawC = res[0], rawM = res[1], rawP = res[2], rawS = res[3], rawSI = res[4], rawE = res[5];
      var movBy = {};
      for (var i = 0; i < rawM.length; i++) {
        var m = rawM[i];
        (movBy[m.customer_id] = movBy[m.customer_id] || []).push({
          id: m.id, type: m.type || "", description: m.description || "",
          amount: Number(m.amount) || 0, date: m.date || new Date().toISOString()
        });
      }
      var itemsBy = {};
      for (var j = 0; j < rawSI.length; j++) {
        var si = rawSI[j];
        (itemsBy[si.sale_id] = itemsBy[si.sale_id] || []).push({
          name: si.name || "", productId: si.product_id || null,
          price: Number(si.price) || 0, quantity: Number(si.quantity) || 1,
          unit: withUnit && si.unit === "kg" ? "kg" : "u"
        });
      }
      S.customers = rawC.map(function (c) {
        return {
          id: c.id, name: c.name || "", limit: Number(c.limit_value) || 0,
          interestDays: c.interest_days != null ? c.interest_days : 30,
          interestRate: c.interest_rate != null ? Number(c.interest_rate) : 10,
          movements: movBy[c.id] || [], history: [],
          updatedAt: c.updated_at || null, createdAt: c.created_at || null
        };
      });
      S.inventory = rawP.map(function (p) {
        return {
          id: p.id, name: p.name || "", brand: p.brand || "", category: p.category || "",
          price: Number(p.price) || 0, buyPrice: Number(p.buy_price) || 0,
          unit: withUnit && p.unit === "kg" ? "kg" : "u",
          stock: Number(p.stock) || 0, updatedAt: p.updated_at || null
        };
      });
      S.sales = rawS.map(function (sl) {
        return {
          id: sl.id, total: Number(sl.total) || 0, method: sl.method || "efectivo",
          clientName: sl.client_name || "", date: sl.date || new Date().toISOString(),
          items: itemsBy[sl.id] || [], updatedAt: sl.updated_at || null
        };
      });
      S.expenses = rawE.map(function (e) {
        return {
          id: e.id, description: e.description || "", amount: Number(e.amount) || 0,
          date: e.date || new Date().toISOString(), updatedAt: e.updated_at || null
        };
      });
      if (!withCycles) { filterTombstones(); return { withUnit: withUnit, withCycles: false }; }
      return db().fetchTable("debt_cycles").then(function (rc) {
        return db().fetchTable("archived_movements").then(function (ra) {
          var byCycle = {};
          for (var a = 0; a < ra.length; a++) {
            var am = ra[a];
            (byCycle[am.cycle_id] = byCycle[am.cycle_id] || []).push({
              id: am.id, type: am.type || "", description: am.description || "",
              amount: Number(am.amount) || 0, date: am.date || new Date().toISOString()
            });
          }
          var byCust = {};
          for (var b = 0; b < rc.length; b++) {
            var cyc = rc[b];
            (byCust[cyc.customer_id] = byCust[cyc.customer_id] || []).push({
              id: cyc.id, customerId: cyc.customer_id, closedAt: cyc.closed_at || new Date().toISOString(),
              totalDebt: Number(cyc.total_debt) || 0, totalPaid: Number(cyc.total_paid) || 0,
              movements: byCycle[cyc.id] || []
            });
          }
          for (var k = 0; k < S.customers.length; k++) {
            var list = byCust[S.customers[k].id] || [];
            list.sort(function (x, y) { return new Date(y.closedAt) - new Date(x.closedAt); });
            S.customers[k].history = list;
          }
          filterTombstones();
          return { withUnit: withUnit, withCycles: true };
        });
      }).catch(function () { filterTombstones(); return { withUnit: withUnit, withCycles: false }; });
    });
  }

  function push() {
    var withUnit = false, withCycles = false;
    return db().probe("products", "unit").then(function (u) {
      withUnit = !!u;
      return db().probe("debt_cycles", "id");
    }).then(function (cy) {
      withCycles = !!cy;
      var pc = S.pending.customers.map(function (id) { return getCustomer(id); }).filter(Boolean);
      var pp = S.pending.products.map(function (id) { return getProduct(id); }).filter(Boolean);
      var ps = S.pending.sales.map(function (id) {
        for (var i = 0; i < S.sales.length; i++) if (S.sales[i].id === id) return S.sales[i];
        return null;
      }).filter(Boolean);
      var pe = S.pending.expenses.map(function (id) {
        for (var i = 0; i < S.expenses.length; i++) if (S.expenses[i].id === id) return S.expenses[i];
        return null;
      }).filter(Boolean);

      var custRows = pc.map(function (c) { return { id: c.id, name: c.name, limit_value: c.limit, interest_days: c.interestDays, interest_rate: c.interestRate }; });
      var prodRows = pp.map(function (p) {
        var r = { id: p.id, name: p.name, brand: p.brand || "", category: p.category || "", price: p.price, buy_price: p.buyPrice || 0, stock: withUnit ? p.stock : Math.round(p.stock) };
        if (withUnit) r.unit = p.unit;
        return r;
      });
      var saleRows = ps.map(function (s) { return { id: s.id, total: s.total, method: s.method, client_name: s.clientName || "", date: new Date(s.date).toISOString() }; });
      var expRows = pe.map(function (e) { return { id: e.id, description: e.description, amount: e.amount, date: new Date(e.date).toISOString() }; });

      return db().upsert("customers", custRows)
        .then(function () { return db().upsert("products", prodRows); })
        .then(function () { return db().upsert("expenses", expRows); })
        .then(function () { return db().upsert("sales", saleRows); })
        .then(function () {
          // sale_items: delete + reinsert por venta (evita duplicados)
          var chain = Promise.resolve();
          ps.forEach(function (s) {
            chain = chain.then(function () { return db().delEq("sale_items", "sale_id", s.id); })
              .then(function () {
                var rows = s.items.map(function (it) {
                  var r = { sale_id: s.id, name: it.name, price: it.price, quantity: it.quantity };
                  if (withUnit) r.unit = it.unit;
                  return r;
                });
                return db().upsert("sale_items", rows);
              });
          });
          return chain;
        })
        .then(function () {
          var mrows = [];
          S.pending.movements.forEach(function (key) {
            var bar = key.indexOf("|");
            var cid = key.slice(0, bar), mid = key.slice(bar + 1);
            var c = getCustomer(cid);
            if (!c) return;
            for (var i = 0; i < c.movements.length; i++) {
              if (c.movements[i].id === mid) {
                var m = c.movements[i];
                mrows.push({ id: m.id, customer_id: cid, type: m.type, description: m.description, amount: m.amount, date: new Date(m.date).toISOString() });
              }
            }
          });
          return db().upsert("movements", mrows);
        })
        .then(function () {
          if (!withCycles) return null;
          var cycRows = [], archRows = [];
          S.pending.cycles.forEach(function (cid) {
            for (var i = 0; i < S.customers.length; i++) {
              var h = S.customers[i].history || [];
              for (var j = 0; j < h.length; j++) {
                if (h[j].id === cid) {
                  cycRows.push({ id: h[j].id, customer_id: h[j].customerId, closed_at: new Date(h[j].closedAt).toISOString(), total_debt: h[j].totalDebt, total_paid: h[j].totalPaid });
                  h[j].movements.forEach(function (m) {
                    archRows.push({ id: m.id, cycle_id: h[j].id, customer_id: h[j].customerId, type: m.type, description: m.description, amount: m.amount, date: new Date(m.date).toISOString() });
                  });
                }
              }
            }
          });
          return db().upsert("debt_cycles", cycRows).then(function () { return db().upsert("archived_movements", archRows); });
        })
        .then(function () {
          // deletes por lote, SOLO no-confirmados. Los tombstones NUNCA se
          // limpian: impiden resurrecciones en pulls futuros.
          var dc = unacked(S.tomb.customers, S.acked.customers);
          var dm = unacked(S.tomb.movements, S.acked.movements);
          var dp = unacked(S.tomb.products, S.acked.products);
          var ds = unacked(S.tomb.sales, S.acked.sales);
          var de = unacked(S.tomb.expenses, S.acked.expenses);
          var dy = unacked(S.tomb.cycles, S.acked.cycles);
          return db().delIn("movements", "customer_id", dc)
            .then(function () { return db().delIn("customers", "id", dc); })
            .then(function () { return db().delIn("movements", "id", dm.map(function (k) { return k.slice(k.indexOf("|") + 1); })); })
            .then(function () { return db().delIn("products", "id", dp); })
            .then(function () { return db().delIn("sale_items", "sale_id", ds); })
            .then(function () { return db().delIn("sales", "id", ds); })
            .then(function () { return db().delIn("expenses", "id", de); })
            .then(function () {
              if (!withCycles) return null;
              return db().delIn("archived_movements", "cycle_id", dy)
                .then(function () { return db().delIn("debt_cycles", "id", dy); });
            })
            .then(function () {
              // Todo subió: limpiar pendientes y marcar tombstones confirmados.
              S.pending = { customers: [], movements: [], products: [], sales: [], expenses: [], cycles: [] };
              dc.forEach(function (v) { setAdd(S.acked.customers, v); });
              dm.forEach(function (v) { setAdd(S.acked.movements, v); });
              dp.forEach(function (v) { setAdd(S.acked.products, v); });
              ds.forEach(function (v) { setAdd(S.acked.sales, v); });
              de.forEach(function (v) { setAdd(S.acked.expenses, v); });
              dy.forEach(function (v) { setAdd(S.acked.cycles, v); });
              persist();
            });
        });
    });
  }

  function fullSync() {
    if (S.syncing) return Promise.resolve();
    S.syncing = true; emit();
    var doPush = hasPending() || hasTombstones();
    var chain = doPush ? push().catch(function (e) { S.online = false; throw e; }) : Promise.resolve();
    return chain.then(pull).then(function () {
      S.online = true;
      S.lastSync = new Date();
      // lo que quedó pendiente del snapshot previo se reintenta arriba;
      // segundo push para lo que el pull no trajo: no hace falta, push ya limpió.
      persist(); S.syncing = false; emit();
    }).catch(function () {
      S.online = false; S.syncing = false; persist(); emit();
    });
  }

  function startAutoSync() {
    setInterval(function () {
      if (document.hidden) return;
      fullSync();
    }, window.KP_CONFIG.SYNC_MS_OK);
  }

  // ---------- mutaciones ----------
  function touchCustomer(id, mid) {
    setAdd(S.pending.customers, id);
    if (mid) setAdd(S.pending.movements, id + "|" + mid);
  }

  function addCustomer(name, limit) {
    var c = { id: f().generateId(), name: name, limit: limit || 0, interestDays: 30, interestRate: 10, movements: [], history: [], updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
    S.customers.push(c);
    setAdd(S.pending.customers, c.id);
    markDirty();
    return c;
  }
  function renameCustomer(id, name) {
    var c = getCustomer(id);
    if (!c) return;
    c.name = name; c.updatedAt = new Date().toISOString();
    setAdd(S.pending.customers, id);
    markDirty();
  }
  function deleteCustomer(id) {
    var c = getCustomer(id);
    if (c) {
      (c.movements || []).forEach(function (m) { setDel(S.pending.movements, id + "|" + m.id); addTomb("movements", id + "|" + m.id); });
      (c.history || []).forEach(function (h) { setDel(S.pending.cycles, h.id); addTomb("cycles", h.id); });
    }
    S.customers = S.customers.filter(function (x) { return x.id !== id; });
    if (S.selectedCustomerId === id) S.selectedCustomerId = null;
    setDel(S.pending.customers, id);
    addTomb("customers", id);
    markDirty();
  }
  function setInterest(id, days, rate) {
    var c = getCustomer(id);
    if (!c) return;
    c.interestDays = days; c.interestRate = rate; c.updatedAt = new Date().toISOString();
    setAdd(S.pending.customers, id);
    markDirty();
  }
  function addMovement(cid, m) {
    var c = getCustomer(cid);
    if (!c) return;
    c.movements.unshift(m);
    c.updatedAt = new Date().toISOString();
    touchCustomer(cid, m.id);
    markDirty();
  }
  function deleteMovement(cid, mid) {
    var c = getCustomer(cid);
    if (!c) return;
    c.movements = c.movements.filter(function (m) { return m.id !== mid; });
    c.updatedAt = new Date().toISOString();
    setAdd(S.pending.customers, cid);
    setDel(S.pending.movements, cid + "|" + mid);
    addTomb("movements", cid + "|" + mid);
    markDirty();
  }

  // Pago con materialización de recargo + saldo a favor + cierre automático (idéntico a Flutter).
  function registerPayment(cid, amount, type, description) {
    var c = getCustomer(cid);
    if (!c || !(amount > 0)) return { closed: false };
    var total = customerTotal(c);
    if (!(total > 0)) return { closed: false };
    var amt = f().money(amount), favor = 0;
    if (amt > total) { favor = f().money(amt - total); amt = total; }
    var closing = amt >= total - 0.01;
    if (closing) {
      var intr = interestAmount(c);
      if (intr > 0) {
        var im = { id: f().generateId(), type: "interest", description: "Recargo " + f().trimNumber(c.interestRate) + "%", amount: intr, date: new Date().toISOString() };
        c.movements.unshift(im);
        setAdd(S.pending.movements, cid + "|" + im.id);
      }
    }
    var pm = { id: f().generateId(), type: type || "payment", description: (type === "settle" ? "Saldo total" : (description || "Abono")), amount: amt, date: new Date().toISOString() };
    c.movements.unshift(pm);
    c.updatedAt = new Date().toISOString();
    setAdd(S.pending.customers, cid);
    setAdd(S.pending.movements, cid + "|" + pm.id);
    var closed = false;
    if (Math.abs(customerTotal(c)) <= 0.01) {
      closeCycleInternal(c);
      if (favor > 0) {
        var cr = { id: f().generateId(), type: "credit", description: "Saldo a favor", amount: f().money(favor), date: new Date().toISOString() };
        c.movements.unshift(cr);
        c.updatedAt = new Date().toISOString();
        setAdd(S.pending.customers, cid);
        setAdd(S.pending.movements, cid + "|" + cr.id);
      }
      closed = true;
    }
    markDirty();
    return { closed: closed, favor: favor };
  }

  function closeCycleInternal(c) {
    if (!c.movements.length) return false;
    var debt = 0, paid = 0;
    for (var i = 0; i < c.movements.length; i++) {
      if (f().isOutflow(c.movements[i].type)) paid += c.movements[i].amount;
      else debt += c.movements[i].amount;
    }
    var cyc = { id: f().generateId(), customerId: c.id, closedAt: new Date().toISOString(), totalDebt: f().money(debt), totalPaid: f().money(paid), movements: c.movements.slice() };
    for (var j = 0; j < c.movements.length; j++) {
      var key = c.id + "|" + c.movements[j].id;
      setDel(S.pending.movements, key);
      addTomb("movements", key);
    }
    c.history.unshift(cyc);
    c.movements = [];
    c.updatedAt = new Date().toISOString();
    setAdd(S.pending.customers, c.id);
    setAdd(S.pending.cycles, cyc.id);
    return true;
  }
  function archiveCycleManual(cid) {
    var c = getCustomer(cid);
    if (!c || !c.movements.length) return false;
    closeCycleInternal(c);
    markDirty();
    return true;
  }
  function deleteCycle(cid, cycleId) {
    var c = getCustomer(cid);
    if (!c) return;
    c.history = (c.history || []).filter(function (h) { return h.id !== cycleId; });
    c.updatedAt = new Date().toISOString();
    setAdd(S.pending.customers, cid);
    setDel(S.pending.cycles, cycleId);
    addTomb("cycles", cycleId);
    markDirty();
  }

  function addFiado(cid, productName, price, qty, productId, unit) {
    var c = getCustomer(cid);
    if (!c || !(qty > 0) || !(price > 0)) return false;
    var isKg = unit === "kg";
    var desc = isKg ? productName + " x" + f().fmtQtyShort(qty) + "kg" : productName + " x" + Math.round(qty);
    addMovement(cid, { id: f().generateId(), type: "product", description: desc, amount: f().money(price * qty), date: new Date().toISOString() });
    var prod = productId ? getProduct(productId) : null;
    if (!prod) {
      var q = String(productName || "").toLowerCase();
      for (var i = 0; i < S.inventory.length; i++) if (String(S.inventory[i].name || "").toLowerCase() === q) { prod = S.inventory[i]; break; }
    }
    if (prod) {
      prod.stock = f().stockRound(prod.stock - qty);
      if (prod.stock < 0) prod.stock = 0;
      prod.updatedAt = new Date().toISOString();
      setAdd(S.pending.products, prod.id);
      persist(); emit();
    }
    return true;
  }

  function addProduct(p) {
    p.id = p.id || f().generateId();
    p.updatedAt = new Date().toISOString();
    S.inventory.push(p);
    setAdd(S.pending.products, p.id);
    markDirty();
    return p;
  }
  function updateProduct(p) {
    for (var i = 0; i < S.inventory.length; i++) {
      if (S.inventory[i].id === p.id) {
        p.updatedAt = new Date().toISOString();
        S.inventory[i] = p;
        setAdd(S.pending.products, p.id);
        markDirty();
        return;
      }
    }
  }
  function deleteProduct(id) {
    S.inventory = S.inventory.filter(function (p) { return p.id !== id; });
    if (S.selectedProductId === id) S.selectedProductId = null;
    setDel(S.pending.products, id);
    addTomb("products", id);
    markDirty();
  }

  function addSale(s) {
    s.id = s.id || f().generateId();
    s.date = s.date || new Date().toISOString();
    s.updatedAt = new Date().toISOString();
    for (var i = 0; i < s.items.length; i++) {
      var prod = productForItem(s.items[i]);
      if (prod) {
        prod.stock = f().stockRound(prod.stock - s.items[i].quantity);
        if (prod.stock < 0) prod.stock = 0;
        prod.updatedAt = new Date().toISOString();
        setAdd(S.pending.products, prod.id);
      }
    }
    S.sales.push(s);
    S.cart = [];
    setAdd(S.pending.sales, s.id);
    markDirty();
  }
  function deleteSale(id) {
    var sale = null;
    for (var i = 0; i < S.sales.length; i++) if (S.sales[i].id === id) sale = S.sales[i];
    if (!sale) return false;
    var ok = true;
    for (var j = 0; j < sale.items.length; j++) {
      var prod = productForItem(sale.items[j]);
      if (prod) {
        prod.stock = f().stockRound(prod.stock + sale.items[j].quantity);
        prod.updatedAt = new Date().toISOString();
        setAdd(S.pending.products, prod.id);
      } else ok = false;
    }
    S.sales = S.sales.filter(function (s) { return s.id !== id; });
    setDel(S.pending.sales, id);
    addTomb("sales", id);
    markDirty();
    return ok;
  }

  function addExpense(desc, amount) {
    var e = { id: f().generateId(), description: desc, amount: f().money(amount), date: new Date().toISOString(), updatedAt: new Date().toISOString() };
    S.expenses.push(e);
    setAdd(S.pending.expenses, e.id);
    markDirty();
    return e;
  }
  function deleteExpense(id) {
    S.expenses = S.expenses.filter(function (e) { return e.id !== id; });
    setDel(S.pending.expenses, id);
    addTomb("expenses", id);
    markDirty();
  }

  function replaceAllData(data) {
    var i, j;
    for (i = 0; i < S.customers.length; i++) {
      var c = S.customers[i];
      addTomb("customers", c.id);
      for (j = 0; j < (c.movements || []).length; j++) addTomb("movements", c.id + "|" + c.movements[j].id);
      for (j = 0; j < (c.history || []).length; j++) addTomb("cycles", c.history[j].id);
    }
    for (i = 0; i < S.inventory.length; i++) addTomb("products", S.inventory[i].id);
    for (i = 0; i < S.sales.length; i++) addTomb("sales", S.sales[i].id);
    for (i = 0; i < S.expenses.length; i++) addTomb("expenses", S.expenses[i].id);
    S.pending = { customers: [], movements: [], products: [], sales: [], expenses: [], cycles: [] };
    var now = new Date().toISOString();
    S.customers = data.customers || [];
    S.inventory = data.products || [];
    S.sales = data.sales || [];
    S.expenses = data.expenses || [];
    S.customers.forEach(function (cc) {
      cc.updatedAt = now;
      setAdd(S.pending.customers, cc.id);
      (cc.movements || []).forEach(function (m) { setAdd(S.pending.movements, cc.id + "|" + m.id); });
      (cc.history || []).forEach(function (h) { setAdd(S.pending.cycles, h.id); });
    });
    S.inventory.forEach(function (p) { p.updatedAt = now; setAdd(S.pending.products, p.id); });
    S.sales.forEach(function (s) { s.updatedAt = now; setAdd(S.pending.sales, s.id); });
    S.expenses.forEach(function (e) { e.updatedAt = now; setAdd(S.pending.expenses, e.id); });
    markDirty();
  }

  // ---------- export (formato idéntico al Flutter) ----------
  function buildExport() {
    var line = "========================================";
    var now = new Date();
    var dateStr = now.getDate() + "/" + (now.getMonth() + 1) + "/" + now.getFullYear() + " " + now.getHours() + ":" + f().pad2(now.getMinutes());
    var t = "=== MaxiKiosko KP - BASE DE DATOS ===\nFecha exportacion: " + dateStr + "\n\n" + line + "\n  CLIENTES (" + S.customers.length + ")\n" + line + "\n";
    function tag(m) {
      if (m.type === "payment" || m.type === "settle") return "[Abono]";
      if (m.type === "interest") return "[Recargo]";
      if (m.type === "credit") return "[Favor]";
      return "[Fiado]";
    }
    S.customers.forEach(function (c) {
      var total = customerTotal(c);
      t += "\nNombre: " + String(c.name).replace(/\|/g, " ") + "\nDeuda: $" + f().fmt(total);
      if (c.limit > 0) t += " | Limite: $" + f().fmt(c.limit);
      if (c.interestDays > 0) t += " | Recargo: " + f().trimNumber(c.interestRate) + "% despues de " + c.interestDays + " dias";
      var st = accountStart(c);
      t += " | Desde: " + st.getDate() + "/" + (st.getMonth() + 1) + "/" + st.getFullYear() + "\n";
      if (!c.movements.length) t += "  (sin movimientos)\n";
      else c.movements.forEach(function (m) {
        t += "  " + tag(m) + " " + f().exportDate(m.date) + " | " + String(m.description).replace(/\|/g, " ") + " | $" + f().fmt(m.amount) + "\n";
      });
    });
    var cycleCount = 0;
    S.customers.forEach(function (c) { cycleCount += (c.history || []).length; });
    t += "\n" + line + "\n  HISTORIAL (" + cycleCount + " ciclos)\n" + line + "\n";
    S.customers.forEach(function (c) {
      (c.history || []).forEach(function (h) {
        var cl = new Date(h.closedAt);
        t += "\nCliente: " + String(c.name).replace(/\|/g, " ") + " | Ciclo: " + f().exportDate(cl) + " | Deuda: $" + f().fmt(h.totalDebt) + " | Pagado: $" + f().fmt(h.totalPaid) + "\n";
        h.movements.forEach(function (m) {
          t += "  " + tag(m) + " " + f().exportDate(m.date) + " | " + String(m.description).replace(/\|/g, " ") + " | $" + f().fmt(m.amount) + "\n";
        });
      });
    });
    t += "\n" + line + "\n  INVENTARIO (" + S.inventory.length + " productos)\n" + line + "\n";
    S.inventory.forEach(function (p) {
      t += "\nNombre: " + String(p.name).replace(/\|/g, " ");
      if (p.brand) t += " | Marca: " + String(p.brand).replace(/\|/g, " ");
      if (p.category) t += " | Cat: " + String(p.category).replace(/\|/g, " ");
      t += "\nPrecio: $" + f().fmt(p.price);
      if (p.buyPrice > 0) t += " | Costo: $" + f().fmt(p.buyPrice);
      t += " | Stock: " + f().fmtQty(p.stock, p.unit);
      if (p.unit === "kg") t += " | Unidad: kg";
      t += "\n";
    });
    t += "\n" + line + "\n  VENTAS (" + S.sales.length + ")\n" + line + "\n";
    S.sales.forEach(function (s) {
      t += "\n" + f().exportDate(s.date) + " | " + String(s.clientName || "Publico General").replace(/\|/g, " ") + " | Pago: " + s.method + "\n";
      s.items.forEach(function (it) {
        t += "  " + f().itemQtyPrefix(it.quantity, it.unit) + " " + String(it.name).replace(/\|/g, " ") + " | $" + f().fmt(it.price * it.quantity) + "\n";
      });
      t += "  TOTAL: $" + f().fmt(s.total) + "\n";
    });
    t += "\n" + line + "\n  GASTOS (" + S.expenses.length + ")\n" + line + "\n";
    S.expenses.forEach(function (e) {
      t += "\n" + f().exportDate(e.date) + " | " + String(e.description).replace(/\|/g, " ") + " | $" + f().fmt(e.amount) + "\n";
    });
    var ms = 0, me = 0;
    S.sales.forEach(function (s) { var d = new Date(s.date); if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) ms += s.total; });
    S.expenses.forEach(function (e) { var d = new Date(e.date); if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) me += e.amount; });
    t += "\n" + line + "\n  RESUMEN\n" + line + "\n";
    t += "Ventas del mes: $" + f().fmt(ms) + "\nGastos del mes: $" + f().fmt(me) + "\nGanancia neta: $" + f().fmt(ms - me) + "\n";
    t += "Clientes: " + S.customers.length + " | Productos: " + S.inventory.length + "\n" + line + "\n  FIN DE DATOS\n" + line + "\n";
    return t;
  }

  function clientTicket(c, includeHistory) {
    var total = customerTotal(c), base = baseTotal(c), intr = total - base;
    var line = "========================================", sep = "----------------------------------------";
    var now = new Date();
    var t = line + "\n       MaxiKiosko KP\n      Resumen de Cuenta\n" + line + "\n";
    t += "Cliente: " + c.name + "\nFecha: " + f().exportDate(now) + "\n";
    t += "Cuenta desde: " + f().formatDateShort(accountStart(c)) + "\n";
    if (c.movements.length) t += "Ciclo actual desde: " + f().formatDateShort(cycleStart(c.movements)) + "\n";
    if (c.limit > 0) t += "Credito Maximo: $" + f().fmt(c.limit) + "\n";
    t += "Recargo: " + f().trimNumber(c.interestRate) + "% despues de " + c.interestDays + " dias\n" + sep + "\nMOVIMIENTOS:\n";
    var sorted = c.movements.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    sorted.forEach(function (m) {
      t += "  " + f().ticketDate(m.date) + " | " + m.description + " | " + (f().isOutflow(m.type) ? "-" : "+") + "$" + f().fmt(m.amount) + "\n";
    });
    t += sep + "\nDeuda neta: $" + f().fmt(base) + "\n";
    if (intr > 0) {
      var per = interestPeriods(c);
      t += "Recargo: +$" + f().fmt(intr) + (per > 1 ? " (x" + per + ")" : "") + "\n";
    }
    if (total < 0) t += "SALDO A FAVOR: $" + f().fmt(-total) + "\n";
    else t += "TOTAL A DEBER: $" + f().fmt(total) + "\n";
    if (includeHistory && (c.history || []).length) {
      t += sep + "\nHISTORIAL (" + c.history.length + " ciclos):\n";
      c.history.forEach(function (h) {
        t += "Ciclo " + f().formatDateShort(cycleStart(h.movements, h.closedAt)) + " → " + f().formatDateShort(h.closedAt) + " · Deuda $" + f().fmt(h.totalDebt) + " · Pagado $" + f().fmt(h.totalPaid) + "\n";
        h.movements.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).forEach(function (m) {
          t += "  " + f().ticketDate(m.date) + " | " + m.description + " | " + (f().isOutflow(m.type) ? "-" : "+") + "$" + f().fmt(m.amount) + "\n";
        });
      });
    }
    t += line + "\nGracias por su confianza!\n" + line + "\n";
    return t;
  }

  function saleTicket(s) {
    var line = "========================================";
    var t = "==== MAXIKIOSKO KP ====\nFecha: " + f().exportDate(s.date) + "\nCliente: " + (s.clientName || "Publico General") + "\nPago: " + s.method + "\n" + line + "\n";
    s.items.forEach(function (it) {
      t += f().itemQtyPrefix(it.quantity, it.unit) + " " + it.name + "  $" + f().fmt(it.price * it.quantity) + "\n";
    });
    t += line + "\nTOTAL: $" + f().fmt(s.total) + "\n" + line + "\nGracias por su compra!\n";
    return t;
  }

  window.KP_STORE = {
    S: S, on: on, emit: emit, persist: persist, restore: restore,
    fullSync: fullSync, startAutoSync: startAutoSync,
    getCustomer: getCustomer, getProduct: getProduct, productForItem: productForItem,
    baseTotal: baseTotal, customerTotal: customerTotal, interestAmount: interestAmount,
    interestPeriods: interestPeriods, customerStatus: customerStatus, daysToDue: daysToDue,
    accountStart: accountStart, cycleStart: cycleStart, cartTotal: cartTotal, cartObtained: cartObtained,
    addCustomer: addCustomer, renameCustomer: renameCustomer, deleteCustomer: deleteCustomer,
    setInterest: setInterest, addMovement: addMovement, deleteMovement: deleteMovement,
    registerPayment: registerPayment, archiveCycleManual: archiveCycleManual, deleteCycle: deleteCycle,
    addFiado: addFiado, addProduct: addProduct, updateProduct: updateProduct, deleteProduct: deleteProduct,
    addSale: addSale, deleteSale: deleteSale, addExpense: addExpense, deleteExpense: deleteExpense,
    replaceAllData: replaceAllData, buildExport: buildExport, clientTicket: clientTicket, saleTicket: saleTicket
  };
})();
