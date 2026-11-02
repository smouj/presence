(function () {
  "use strict";

  var S = { accounts: null, data: null, filter: "all", sort: "priority", q: "", editing: null, dirty: false };

  var LABELS = {
    followers: "Followers", following: "Following", repos: "Repos", stars: "Stars",
    posts: "Posts", downloads_month: "Downloads/mo", packages: "Packages", models: "Models",
    spaces: "Spaces", likes: "Likes", members: "Members", online: "Online",
    subscribers: "Subscribers", videos: "Videos"
  };
  var PRIORITY = { high: 3, medium: 2, low: 1 };
  var fmt = new Intl.NumberFormat();

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(value) { return typeof value === "number" ? fmt.format(value) : "—"; }
  function initials(name) { return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase(); }

  function metricsOf(id) {
    if (!S.data || !S.data.platforms) return {};
    for (var i = 0; i < S.data.platforms.length; i++) {
      if (S.data.platforms[i].id === id) return S.data.platforms[i];
    }
    return {};
  }

  function toast(message, bad) {
    var t = $("toast");
    t.textContent = message;
    t.className = "toast on" + (bad ? " bad" : "");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = "toast"; }, 3400);
  }

  function sparkline(series) {
    if (!series || series.length < 2) return '<div class="spark"></div>';
    var values = series.map(function (p) { return p.v; });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = (max - min) || 1, width = 100, height = 26, pad = 2;
    var points = values.map(function (v, i) {
      var x = pad + i * (width - 2 * pad) / (values.length - 1);
      var y = height - pad - ((v - min) / span) * (height - 2 * pad);
      return x.toFixed(2) + "," + y.toFixed(2);
    });
    return '<div class="spark"><svg viewBox="0 0 100 26" preserveAspectRatio="none">' +
      '<polyline points="' + points.join(" ") + '" fill="none" stroke="#e0a44a" stroke-width="1.3" ' +
      'vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg></div>';
  }

  function bigChart(series) {
    if (!series || series.length < 2) {
      return '<div class="chart" style="display:grid;place-items:center;color:var(--dim);font-size:12px">' +
        "History appears after the second collection.</div>";
    }
    var values = series.map(function (p) { return p.v; });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = (max - min) || 1, width = 100, height = 40, pad = 3;
    var points = values.map(function (v, i) {
      var x = pad + i * (width - 2 * pad) / (values.length - 1);
      var y = height - pad - ((v - min) / span) * (height - 2 * pad);
      return x.toFixed(2) + "," + y.toFixed(2);
    });
    var area = points.join(" ") + " " + (width - pad) + "," + (height - pad) + " " + pad + "," + (height - pad);
    return '<div class="chart"><svg viewBox="0 0 100 40" preserveAspectRatio="none">' +
      '<polygon points="' + area + '" fill="rgba(224,164,74,.09)"/>' +
      '<polyline points="' + points.join(" ") + '" fill="none" stroke="#e0a44a" stroke-width="1.4" ' +
      'vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
      '<text x="2" y="7" fill="#6b7280" font-size="3.6">' + fmt.format(max) + "</text>" +
      '<text x="2" y="38" fill="#6b7280" font-size="3.6">' + fmt.format(min) + "</text>" +
      "</svg></div>";
  }

  function filtered() {
    var list = S.accounts.platforms.slice();
    if (S.filter === "auto") list = list.filter(function (p) { return p.tracking === "auto"; });
    if (S.filter === "manual") list = list.filter(function (p) { return p.tracking === "manual"; });
    if (S.filter === "open") list = list.filter(function (p) {
      return (p.checklist || []).some(function (c) { return c.done !== true; });
    });
    if (S.filter === "error") list = list.filter(function (p) { return metricsOf(p.id).error; });
    if (S.q) {
      var q = S.q.toLowerCase();
      list = list.filter(function (p) {
        return [p.name, p.handle, p.role, p.next_action, p.url].join(" ").toLowerCase().indexOf(q) >= 0;
      });
    }
    list.sort(function (a, b) {
      if (S.sort === "name") return a.name.localeCompare(b.name);
      if (S.sort === "pending") {
        var pa = (a.checklist || []).filter(function (c) { return c.done !== true; }).length;
        var pb = (b.checklist || []).filter(function (c) { return c.done !== true; }).length;
        return pb - pa;
      }
      if (S.sort === "metric") return (b.health ? b.health.score : 0) - (a.health ? a.health.score : 0);
      return (PRIORITY[b.priority] || 0) - (PRIORITY[a.priority] || 0) || a.name.localeCompare(b.name);
    });
    return list;
  }

  function cardHtml(p) {
    var d = metricsOf(p.id);
    var m = d.metrics || {};
    var keys = Object.keys(m).filter(function (k) { return typeof m[k] === "number"; }).slice(0, 3);
    var metrics = keys.map(function (k) {
      var delta = (d.delta || {})[k];
      var dhtml = "";
      if (typeof delta === "number" && delta !== 0) {
        dhtml = '<span class="delta ' + (delta > 0 ? "up" : "down") + '">' +
          (delta > 0 ? "+" : "") + fmt.format(delta) + "</span>";
      }
      return '<div class="m"><b>' + num(m[k]) + dhtml + "</b><small>" + esc(LABELS[k] || k) + "</small></div>";
    }).join("");

    var items = p.checklist || [];
    var done = items.filter(function (c) { return c.done === true; }).length;
    var pct = items.length ? Math.round(100 * done / items.length) : 0;
    var status = d.error ? "err" : (p.tracking === "auto" ? "auto" : "manual");
    var statusText = d.error ? "error" : (p.tracking === "auto" ? "auto" : "manual");

    return '<article class="card' + (S.editing === p.id ? " isediting" : "") + '" data-id="' + esc(p.id) + '">' +
      '<div class="chead">' +
        '<div class="mark">' + esc(initials(p.name)) + "</div>" +
        '<div class="who">' +
          '<div class="name"><span class="dot ' + esc(p.priority || "low") + '" title="Priority ' + esc(p.priority || "low") + '"></span>' + esc(p.name) + "</div>" +
          '<div class="handle"><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.handle) + "</a></div>" +
        "</div>" +
        '<span class="pill ' + status + '">' + statusText + "</span>" +
      "</div>" +
      '<div class="role">' + esc(p.role || "") + "</div>" +
      (keys.length ? '<div class="metrics">' + metrics + "</div>"
                   : '<div class="errmsg">Manual metrics. Edit them in the workspace config.</div>') +
      sparkline(d.series) +
      (p.next_action ? '<div class="next">' + esc(p.next_action) + "</div>" : "") +
      (items.length
        ? '<div class="chk"><div class="lbl"><span>Setup</span><span>' + done + "/" + items.length + "</span></div>" +
          '<div class="bar"><i style="width:' + pct + '%"></i></div></div>'
        : "") +
      (d.error ? '<div class="errmsg">' + esc(d.error) + "</div>" : "") +
      '<div class="cfoot"><span>' + (p.verified ? "Verified" : "Unverified") + "</span>" +
        '<button class="linkbtn" data-edit="' + esc(p.id) + '">Configure →</button></div>' +
    "</article>";
  }

  function render() {
    if (!S.accounts) return;
    var list = filtered();
    $("grid").innerHTML = list.length ? list.map(cardHtml).join("")
      : '<p class="empty">Nothing matches this filter.</p>';
    Array.prototype.forEach.call(document.querySelectorAll("[data-edit]"), function (b) {
      b.onclick = function () { openDrawer(b.getAttribute("data-edit")); };
    });
  }

  function renderKpis() {
    var counts = (S.data && S.data.counts) || {};
    var rows = [
      [counts.total || 0, "platforms"],
      [(counts.auto_ok || 0) + "/" + (counts.auto || 0), "with live data"],
      [counts.manual || 0, "manual"],
      [(counts.checklist_done || 0) + "/" + (counts.checklist_total || 0), "setup items"],
      [counts.checklist_open || 0, "open tasks"],
      [(counts.health || 0) + "%", "setup health"]
    ];
    $("kpis").innerHTML = rows.map(function (r) {
      return '<div class="kpi"><b>' + r[0] + "</b><small>" + r[1] + "</small></div>";
    }).join("");
  }

  function chips() {
    var defs = [["all", "All"], ["auto", "Automatic"], ["manual", "Manual"],
                ["open", "With open tasks"], ["error", "With errors"]];
    $("chips").innerHTML = defs.map(function (d) {
      return '<button class="chip' + (S.filter === d[0] ? " on" : "") + '" data-f="' + d[0] + '">' + d[1] + "</button>";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("[data-f]"), function (b) {
      b.onclick = function () { S.filter = b.getAttribute("data-f"); chips(); render(); };
    });
  }

  function openDrawer(id) {
    var p = S.accounts.platforms.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    S.editing = id;
    S.dirty = false;
    var d = metricsOf(id);
    var items = (p.checklist || []).map(function (c, i) {
      var state = c.done === true ? "true" : c.done === false ? "false" : "null";
      var glyph = c.done === true ? "✓" : c.done === false ? "✗" : "?";
      return '<div class="citem"><button class="tri" data-i="' + i + '" data-v="' + state + '" ' +
        'title="Done / open / unknown">' + glyph + "</button><span>" + esc(c.item) + "</span></div>";
    }).join("");

    var metricRows = Object.keys(d.metrics || {})
      .filter(function (k) { return typeof d.metrics[k] === "number"; })
      .map(function (k) {
        return "<div><b>" + num(d.metrics[k]) + "</b><small>" + esc(LABELS[k] || k) + "</small></div>";
      }).join("");

    $("drawer").innerHTML =
      '<div class="dhead"><div class="mark">' + esc(initials(p.name)) + "</div>" +
        "<div><h2>" + esc(p.name) + '</h2><div class="handle">' + esc(p.handle) + " · " + esc(p.tracking) + "</div></div>" +
        '<button class="close" id="dclose" aria-label="Close">×</button></div>' +
      '<div class="dbody">' +
        '<div class="sect"><h3>Identity</h3>' +
          '<div class="row">' +
            '<div class="field"><label>Handle</label><input id="f-handle" value="' + esc(p.handle) + '"></div>' +
            '<div class="field"><label>Priority</label><select id="f-priority">' +
              ["high", "medium", "low"].map(function (x) {
                return '<option value="' + x + '"' + (p.priority === x ? " selected" : "") + ">" + x + "</option>";
              }).join("") +
            "</select></div>" +
          "</div>" +
          '<div class="field"><label>URL</label><input id="f-url" value="' + esc(p.url) + '"></div>' +
          '<div class="field"><label>Role</label><input id="f-role" value="' + esc(p.role || "") + '"></div>' +
          '<div class="field"><label>Next action</label><input id="f-next" value="' + esc(p.next_action || "") + '"></div>' +
          '<div class="field"><label>Notes</label><textarea id="f-notes">' + esc(p.notes || "") + "</textarea></div>" +
        "</div>" +
        (metricRows ? '<div class="sect"><h3>Current metrics</h3><div class="mlist">' + metricRows + "</div>" +
          '<div style="height:10px"></div>' + bigChart(d.series) + "</div>" : "") +
        (items ? '<div class="sect"><h3>Setup checklist</h3><div class="checklist">' + items + "</div></div>" : "") +
      "</div>" +
      '<div class="dfoot"><span class="state" id="dstate">No changes</span>' +
        '<a class="btn ghost" href="' + esc(p.url) + '" target="_blank" rel="noopener">Open profile</a>' +
        '<button class="btn primary" id="dsave">Save</button></div>';

    $("drawer").classList.add("on");
    $("drawer").setAttribute("aria-hidden", "false");
    $("overlay").classList.add("on");
    $("dclose").onclick = closeDrawer;
    $("overlay").onclick = closeDrawer;

    Array.prototype.forEach.call(document.querySelectorAll(".tri"), function (b) {
      b.onclick = function () {
        var v = b.getAttribute("data-v");
        var next = v === "true" ? "false" : v === "false" ? "null" : "true";
        b.setAttribute("data-v", next);
        b.textContent = next === "true" ? "✓" : next === "false" ? "✗" : "?";
        markDirty();
      };
    });
    ["f-handle", "f-url", "f-role", "f-next", "f-notes", "f-priority"].forEach(function (x) {
      $(x).addEventListener("input", markDirty);
    });
    $("dsave").onclick = saveDrawer;
    render();
  }

  function markDirty() {
    S.dirty = true;
    $("dstate").textContent = "Unsaved changes";
  }

  function closeDrawer() {
    $("drawer").classList.remove("on");
    $("drawer").setAttribute("aria-hidden", "true");
    $("overlay").classList.remove("on");
    S.editing = null;
    S.dirty = false;
    render();
  }

  function saveDrawer() {
    var p = S.accounts.platforms.filter(function (x) { return x.id === S.editing; })[0];
    if (!p) return;
    p.handle = $("f-handle").value.trim();
    p.url = $("f-url").value.trim();
    p.role = $("f-role").value.trim();
    p.next_action = $("f-next").value.trim();
    p.notes = $("f-notes").value;
    p.priority = $("f-priority").value;
    Array.prototype.forEach.call(document.querySelectorAll(".tri"), function (b) {
      var i = parseInt(b.getAttribute("data-i"), 10);
      var v = b.getAttribute("data-v");
      if (p.checklist[i]) p.checklist[i].done = v === "true" ? true : v === "false" ? false : null;
    });

    $("dsave").disabled = true;
    fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(S.accounts)
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; });
    }).then(function (res) {
      if (!res.body.ok) {
        toast((res.body.errors || [res.body.error || "Could not save"]).join(" · "), true);
        return;
      }
      S.accounts = res.body.config;
      S.dirty = false;
      $("dstate").textContent = "Saved";
      toast("Configuration saved");
      refreshState();
    }).catch(function (e) {
      toast("Network error: " + e.message, true);
    }).then(function () {
      $("dsave").disabled = false;
    });
  }

  function refreshState() {
    return fetch("/api/state").then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.error || "state unavailable");
      S.accounts = j.accounts;
      S.data = j.data || {};
      renderKpis();
      chips();
      render();
    });
  }

  function collect() {
    var b = $("collect");
    b.disabled = true;
    b.textContent = "Collecting…";
    fetch("/api/collect", { method: "POST" }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.data) {
        S.data = j.data;
        renderKpis();
        render();
      }
      if (j.ok) {
        toast("Collected in " + j.seconds + "s");
      } else {
        var first = Object.keys(j.errors || {})[0];
        toast(first ? first + ": " + j.errors[first] : "Collection failed", true);
      }
    }).catch(function (e) {
      toast("Error: " + e.message, true);
    }).then(function () {
      b.disabled = false;
      b.textContent = "Collect";
    });
  }

  function boot() {
    refreshState().catch(function (e) {
      $("grid").innerHTML = '<p class="empty">Could not load state (' + esc(e.message) +
        "). Start the server with <code>presence serve</code>.</p>";
    });
    $("q").addEventListener("input", function (e) { S.q = e.target.value; render(); });
    $("sort").addEventListener("change", function (e) { S.sort = e.target.value; render(); });
    $("collect").onclick = collect;
    $("export").onclick = function () { window.location = "/api/export.csv"; };
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== $("q")) { e.preventDefault(); $("q").focus(); }
      if (e.key === "Escape" && S.editing) closeDrawer();
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && S.editing) { e.preventDefault(); saveDrawer(); }
    });
  }

  boot();
})();
