/* Kiosko KP Web — capa Supabase vía PostgREST directo (sin dependencias).
 * Tablas: customers, movements, products, sales, sale_items, expenses,
 *         debt_cycles, archived_movements (+ pending_sales opcionales).
 * Upserts por lote con Prefer: resolution=merge-duplicates.
 */
(function () {
  "use strict";

  function cfg() { return window.KP_CONFIG; }

  function headers(extra) {
    var h = {
      "apikey": cfg().SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + cfg().SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }
  function url(path) { return cfg().SUPABASE_URL + "/rest/v1/" + path; }

  function check(res) {
    if (res.ok) return res;
    var err = new Error("Supabase HTTP " + res.status);
    err.status = res.status;
    throw err;
  }

  function getJSON(path) {
    return fetch(url(path), { headers: headers() }).then(check).then(function (r) { return r.json(); });
  }

  function fetchTable(table) {
    var all = [];
    var page = cfg().PAGE_SIZE || 500;
    function one(start) {
      var end = start + page - 1;
      return fetch(url(table + "?select=*&order=id&offset=" + start + "&limit=" + page), { headers: headers() })
        .then(check).then(function (r) { return r.json(); })
        .then(function (rows) {
          rows = rows || [];
          all = all.concat(rows);
          if (rows.length === page) return one(start + page);
          return all;
        });
    }
    return one(0);
  }

  function fetchAll() {
    return Promise.all([
      fetchTable("customers"),
      fetchTable("movements"),
      fetchTable("products"),
      fetchTable("sales"),
      fetchTable("sale_items"),
      fetchTable("expenses")
    ]);
  }

  function upsert(table, rows) {
    if (!rows || !rows.length) return Promise.resolve();
    return fetch(url(table), {
      method: "POST", headers: headers({ "Prefer": "resolution=merge-duplicates" }),
      body: JSON.stringify(rows)
    }).then(check).then(function () {});
  }

  function delIn(table, col, ids) {
    if (!ids || !ids.length) return Promise.resolve();
    // PostgREST in.(a,b,c) — ids son texto, van entre comillas si tienen guiones.
    var list = ids.map(function (id) { return '"' + String(id).replace(/"/g, "") + '"'; }).join(",");
    return fetch(url(table + "?" + col + "=in.(" + encodeURIComponent(list) + ")"), {
      method: "DELETE", headers: headers()
    }).then(check).then(function () {});
  }

  function delEq(table, col, val) {
    return fetch(url(table + "?" + col + "=eq." + encodeURIComponent(val)), {
      method: "DELETE", headers: headers()
    }).then(check).then(function () {});
  }

  var probeCache = {};
  function probe(table, col) {
    var key = table + "." + col;
    if (probeCache[key] !== undefined) return Promise.resolve(probeCache[key]);
    return fetch(url(table + "?select=" + col + "&limit=1"), { headers: headers() })
      .then(function (res) { probeCache[key] = res.ok; return res.ok; })
      .catch(function () { probeCache[key] = false; return false; });
  }

  window.KP_DB = {
    fetchAll: fetchAll, fetchTable: fetchTable, upsert: upsert,
    delIn: delIn, delEq: delEq, probe: probe, getJSON: getJSON
  };
})();
