/* Presence — dashboard logic */
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
  var ICON_SLUG = { itchio: "itchdotio", itch: "itchdotio", "x-twitter": "x" };

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(value) { return typeof value === "number" ? fmt.format(value) : "—"; }
  function initials(name) { return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase(); }

  function icon(name, size) {
    var svg = '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) +
      '" aria-hidden="true"><path fill="currentColor" d="';
    var art = {
      search: "M10 18a8 8 0 1 1 5.3-2L21 21.7 19.6 23l-5.7-5.7A8 8 0 0 1 10 18Zm0-2a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z",
      refresh: "M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z",
      download: "M11 3h2v10l3.5-3.5 1.4 1.4L12 16.8 6.1 10.9l1.4-1.4L11 13V3ZM4 19h16v2H4v-2Z",
      sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15h-1v3h2V2h-1Zm0 18h-1v3h2v-3h-1ZM2 11h3v2H2v-2Zm17 0h3v2h-3v-2ZM5.3 4.6l2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4Zm9.3 9.3 2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4Zm2.1-7.2-2.1 2.1 1.4 1.4 2.1-2.1-1.4-1.4Zm-9.3 9.3-2.1 2.1 1.4 1.4 2.1-2.1-1.4-1.4Z",
      moon: "M21 13.2A8.5 8.5 0 1 1 10.8 3a6.6 6.6 0 0 0 10.2 10.2Z",
      palette: "M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5.5A3.5 3.5 0 0 0 21 9.5C21 5.9 16.9 3 12 3Zm-4.5 6a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm3-2.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm4.5 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z",
      arrow: "M9 5l7 7-7 7",
      check: "M9.5 16.2 4.8 11.5l-1.4 1.4 6.1 6.1L21 7.5l-1.4-1.4z",
      chevron: "M9 5l7 7-7 7",
      grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
      layers: "M12 2 2 7l10 5 10-5-10-5Zm0 12L2 9v5l10 5 10-5V9l-10 5Z",
      bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
      lock: "M12 2a4 4 0 0 0-4 4v3H6v13h12V9h-2V6a4 4 0 0 0-4-4Zm-2 7V6a2 2 0 1 1 4 0v3h-4Z",
      clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 11V6h-2v8h6v-2h-4Z",
      alert: "M12 2 1 21h22L12 2Zm1 14h-2v2h2v-2Zm0-7h-2v5h2V9Z",
      external: "M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h5v2H7v10h10v-3h2v5H5V5Z",
      settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 5.5.1-1.5-.1-1.5 2-1.6-1.9-3.3-2.4 1a7.6 7.6 0 0 0-2.6-1.5L16 2h-4l-.5 2.6A7.6 7.6 0 0 0 8.9 6l-2.4-1-1.9 3.3 2 1.6-.1 1.5.1 1.5-2 1.6 1.9 3.3 2.4-1a7.6 7.6 0 0 0 2.6 1.5L12 22h4l.5-2.6a7.6 7.6 0 0 0 2.6-1.5l2.4 1 1.9-3.3-2-1.6Z"
    };
    var d = art[name];
    if (!d) return "";
    return svg + d + '"/></svg>';
  }

  function brandIcon(platform, size) {
    var slug = ICON_SLUG[platform.id] || platform.id;
    var art = window.PRESENCE_ICONS && window.PRESENCE_ICONS[slug];
    if (!art) return '<span style="font-weight:700;font-size:' + Math.round((size || 20) * 0.7) + 'px;color:var(--muted)">' +
      esc(initials(platform.name)) + "</span>";
    var color = art.color === "auto" ? "currentColor" : art.color;
    var paths = art.paths.map(function (d) { return '<path fill="' + color + '" d="' + d + '"/>'; }).join("");
    return '<svg viewBox="' + art.viewBox + '" width="' + (size || 20) + '" height="' + (size || 20) +
      '" aria-hidden="true">' + paths + "</svg>";
  }

  function brandTile(platform, size) {
    var slug = ICON_SLUG[platform.id] || platform.id;
    var art = window.PRESENCE_ICONS && window.PRESENCE_ICONS[slug];
    var tint = art && art.color !== "auto"
      ? "background:color-mix(in srgb, " + art.color + " 14%, transparent);border-color:color-mix(in srgb, " + art.color + " 30%, transparent)"
      : "";
    return '<div class="brand-tile" style="' + tint + '">' + brandIcon(platform, size || 21) + "</div>";
  }

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
    var span = (max - min) || 1, width = 100, height = 30, pad = 2;
    var points = values.map(function (v, i) {
      var x = pad + i * (width - 2 * pad) / (values.length - 1);
      var y = height - pad - ((v - min) / span) * (height - 2 * pad);
      return x.toFixed(2) + "," + y.toFixed(2);
    });
    var last = points[points.length - 1].split(",");
    return '<div class="spark"><svg viewBox="0 0 100 30" preserveAspectRatio="none">' +
      '<line x1="0" y1="' + (height - 0.5) + '" x2="100" y2="' + (height - 0.5) + '" stroke="var(--grid-line)" stroke-width=".6"/>' +
      '<polyline points="' + points.join(" ") + '" fill="none" stroke="var(--accent)" stroke-width="1.6" ' +
      'vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.2" fill="var(--accent)"/></svg></div>';
  }

  function bigChart(series) {
    if (!series || series.length < 2) {
      return '<div class="chart" style="display:grid;place-items:center;color:var(--dim);font-size:12px">' +
        "History appears after the second collection.</div>";
    }
    var values = series.map(function (p) { return p.v; });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = (max - min) || 1, width = 100, height = 44, pad = 3;
    var points = values.map(function (v, i) {
      var x = pad + i * (width - 2 * pad) / (values.length - 1);
      var y = height - pad - ((v - min) / span) * (height - 2 * pad);
      return x.toFixed(2) + "," + y.toFixed(2);
    });
    var area = points.join(" ") + " " + (width - pad) + "," + height + " " + pad + "," + height;
    var grid = [0.25, 0.5, 0.75].map(function (t) {
      var y = (height * t).toFixed(1);
      return '<line x1="0" y1="' + y + '" x2="100" y2="' + y + '" stroke="var(--grid-line)" stroke-width=".5"/>';
    }).join("");
    return '<div class="chart"><svg viewBox="0 0 100 44" preserveAspectRatio="none">' + grid +
      '<polygon points="' + area + '" fill="var(--accent)" fill-opacity=".12"/>' +
      '<polyline points="' + points.join(" ") + '" fill="none" stroke="var(--accent)" stroke-width="1.5" ' +
      'vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<text x="1" y="5" fill="var(--dim)" font-size="3.6">' + fmt.format(max) + "</text>" +
      '<text x="1" y="42" fill="var(--dim)" font-size="3.6">' + fmt.format(min) + "</text>" +
      "</svg></div>";
  }

  function ring(pct, size) {
    var r = 44, c = (2 * Math.PI * r).toFixed(2), value = (Math.max(0, Math.min(100, pct)) / 100 * c).toFixed(2);
    return '<div class="ring" style="width:' + size + "px;height:" + size + 'px;flex-basis:' + size + 'px">' +
      '<svg viewBox="0 0 104 104" style="width:' + size + "px;height:" + size + 'px">' +
      '<circle class="track" cx="52" cy="52" r="44"/>' +
      '<circle class="value" cx="52" cy="52" r="44" stroke-dasharray="' + value + " " + c + '"/>' +
      "</svg><b>" + pct + "%</b></div>";
  }

  function filtered() {
    if (!S.accounts) return [];
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
        return [p.name, p.handle, p.role, p.next_action, p.url, p.category].join(" ").toLowerCase().indexOf(q) >= 0;
      });
    }
    list.sort(function (a, b) {
      if (S.sort === "name") return a.name.localeCompare(b.name);
      if (S.sort === "pending") {
        var pa = (a.checklist || []).filter(function (c) { return c.done !== true; }).length;
        var pb = (b.checklist || []).filter(function (c) { return c.done !== true; }).length;
        return pb - pa;
      }
      if (S.sort === "health") {
        var ha = (metricsOf(a.id).health || {}).score || 0;
        var hb = (metricsOf(b.id).health || {}).score || 0;
        return hb - ha;
      }
      return (PRIORITY[b.priority] || 0) - (PRIORITY[a.priority] || 0) || a.name.localeCompare(b.name);
    });
    return list;
  }

  function cardHtml(p) {
    var d = metricsOf(p.id);
    var m = d.metrics || {};
    var keys = Object.keys(m).filter(function (k) {
      return typeof m[k] === "number" && k !== "failed";
    }).slice(0, 4);
    var stats = keys.map(function (k) {
      var delta = (d.delta || {})[k];
      var chip = "";
      if (typeof delta === "number" && delta !== 0) {
        chip = '<span class="delta ' + (delta > 0 ? "up" : "down") + '">' +
          (delta > 0 ? "+" : "") + fmt.format(delta) + "</span>";
      }
      return '<div class="stat"><b>' + num(m[k]) + chip + "</b><small>" + esc(LABELS[k] || k) + "</small></div>";
    }).join("");

    var items = p.checklist || [];
    var done = items.filter(function (c) { return c.done === true; }).length;
    var pct = items.length ? Math.round(100 * done / items.length) : 0;
    var status = d.error ? "err" : (p.tracking === "auto" ? "auto" : "manual");
    var statusText = d.error ? "error" : (p.tracking === "auto" ? "auto" : "manual");

    return '<article class="card' + (S.editing === p.id ? " isediting" : "") + '" data-id="' + esc(p.id) + '">' +
      '<div class="chead">' + brandTile(p) +
        '<div class="who">' +
          '<div class="name"><span class="dot ' + esc(p.priority || "low") + '" title="Priority ' + esc(p.priority || "low") + '"></span>' + esc(p.name) + "</div>" +
          '<div class="handle"><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.handle) + "</a></div>" +
        "</div>" +
        '<span class="pill ' + status + '"><i></i>' + statusText + "</span>" +
      "</div>" +
      '<div class="role">' + esc(p.role || "") + "</div>" +
      (keys.length ? '<div class="stats">' + stats + "</div>"
                   : '<div class="errmsg">Manual platform. Metrics are typed by hand.</div>') +
      sparkline(d.series) +
      (p.next_action ? '<div class="next">' + icon("arrow", 13) + "<span>" + esc(p.next_action) + "</span></div>" : "") +
      (items.length
        ? '<div class="prog"><div class="lbl"><span>Setup</span><span>' + done + "/" + items.length +
          " · " + pct + '%</span></div><div class="bar"><i style="width:' + pct + '%"></i></div></div>'
        : "") +
      (d.error ? '<div class="errmsg">' + esc(d.error) + "</div>" : "") +
      '<div class="cfoot"><span class="v">' + (p.verified ? icon("check", 12) + "Verified" : "Unverified") + "</span>" +
        '<button class="linkbtn" data-edit="' + esc(p.id) + '">Configure ' + icon("arrow", 12) + "</button></div>" +
    "</article>";
  }

  function render() {
    if (!S.accounts) return;
    var list = filtered();
    var grid = $("grid");
    if (!list.length) {
      grid.innerHTML = '<p class="empty">Nothing matches this filter.</p>';
      return;
    }
    if (S.sort !== "priority") {
      grid.innerHTML = '<div class="section"><div class="section-head"><h2>' +
        (S.sort === "name" ? "All platforms" : S.sort === "pending" ? "Most open tasks" : "Best setup") +
        '</h2><span class="count">' + list.length + '</span><span class="rule"></span></div>' +
        '<div class="grid">' + list.map(cardHtml).join("") + "</div></div>";
    } else {
      var groups = [["high", "High priority"], ["medium", "Medium priority"], ["low", "Low priority"]];
      grid.innerHTML = groups.map(function (g) {
        var items = list.filter(function (p) { return (p.priority || "medium") === g[0]; });
        if (!items.length) return "";
        return '<div class="section"><div class="section-head"><h2>' + g[1] +
          '</h2><span class="count">' + items.length + '</span><span class="rule"></span></div>' +
          '<div class="grid">' + items.map(cardHtml).join("") + "</div></div>";
      }).join("");
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-edit]"), function (b) {
      b.onclick = function () { openDrawer(b.getAttribute("data-edit")); };
    });
  }

  function renderHero() {
    var counts = (S.data && S.data.counts) || {};
    var total = counts.total || 1;
    var autoOk = counts.auto_ok || 0;
    var autoFail = counts.auto_error || 0;
    var autoPending = counts.auto_pending || 0;
    var manual = counts.manual || 0;
    var health = counts.health || 0;
    var open = counts.checklist_open || 0;

    $("hero").innerHTML =
      '<div class="panel health">' + ring(health, 104) +
        "<div><h2>Setup health</h2><p>" +
        (open ? open + " open items across the registry." : "Every checklist item is closed.") +
        "</p></div></div>" +
      '<div class="panel"><div class="tiles">' +
        '<div class="tile"><div class="k">' + icon("layers", 12) + "Platforms</div><b>" + total + "</b></div>" +
        '<div class="tile"><div class="k">' + icon("bolt", 12) + "Live data</div><b>" + autoOk +
          "<small>/" + (counts.auto || 0) + "</small></b></div>" +
        '<div class="tile"><div class="k">' + icon("lock", 12) + "Manual</div><b>" + manual + "</b></div>" +
        '<div class="tile"><div class="k">' + icon("clock", 12) + "Open tasks</div><b>" + open + "</b></div>" +
        '<div class="dist"><div class="distbar">' +
          '<i class="a" style="width:' + (100 * autoOk / total).toFixed(1) + '%"></i>' +
          '<i class="e" style="width:' + (100 * autoFail / total).toFixed(1) + '%"></i>' +
          '<i class="p" style="width:' + (100 * autoPending / total).toFixed(1) + '%"></i>' +
          '<i class="m" style="width:' + (100 * manual / total).toFixed(1) + '%"></i>' +
        '</div><div class="legend">' +
          '<span><em class="a"></em>' + autoOk + " live</span>" +
          '<span><em class="e"></em>' + autoFail + " errors</span>" +
          '<span><em class="p"></em>' + autoPending + " pending</span>" +
          '<span><em class="m"></em>' + manual + " manual</span>" +
          '<span style="margin-left:auto">' + (counts.checklist_done || 0) + "/" + (counts.checklist_total || 0) +
          " checklist items done</span></div></div>" +
      "</div></div>";
  }

  function chips() {
    var defs = [["all", "All", "grid"], ["auto", "Automatic", "bolt"], ["manual", "Manual", "lock"],
                ["open", "With open tasks", "clock"], ["error", "With errors", "alert"]];
    $("chips").innerHTML = defs.map(function (d) {
      return '<button class="chip' + (S.filter === d[0] ? " on" : "") + '" data-f="' + d[0] + '">' +
        icon(d[2], 12) + d[1] + "</button>";
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
    var h = d.health || { score: 0, checklist_done: 0, checklist_total: 0 };
    var items = (p.checklist || []).map(function (c, i) {
      var state = c.done === true ? "true" : c.done === false ? "false" : "null";
      var glyph = c.done === true ? "✓" : c.done === false ? "✗" : "?";
      return '<div class="citem"><button class="tri" data-i="' + i + '" data-v="' + state + '" ' +
        'title="Done / open / unknown">' + glyph + "</button><span>" + esc(c.item) + "</span></div>";
    }).join("");

    var metricRows = Object.keys(d.metrics || {})
      .filter(function (k) { return typeof d.metrics[k] === "number"; })
      .map(function (k) {
        return '<div class="stat"><b>' + num(d.metrics[k]) + "</b><small>" + esc(LABELS[k] || k) + "</small></div>";
      }).join("");

    $("drawer").innerHTML =
      '<div class="dhead">' + brandTile(p, 23) +
        "<div><h2>" + esc(p.name) + '</h2><div class="sub">' + esc(p.handle) + " · " + esc(p.tracking) +
        " · " + esc(p.priority || "medium") + "</div></div>" +
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
        '<div class="sect"><h3>Setup</h3>' +
          '<div class="lbl" style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-bottom:6px">' +
          "<span>Checklist</span><span>" + h.checklist_done + "/" + h.checklist_total + "</span></div>" +
          '<div class="bar"><i style="width:' + (h.checklist_total ? Math.round(100 * h.checklist_done / h.checklist_total) : 100) + '%"></i></div>' +
          (items ? '<div class="checklist" style="margin-top:10px">' + items + "</div>" : "") +
        "</div>" +
        (metricRows ? '<div class="sect"><h3>Current metrics</h3><div class="stats">' + metricRows + "</div>" +
          '<div style="height:10px"></div>' + bigChart(d.series) + "</div>" : "") +
      "</div>" +
      '<div class="dfoot"><span class="state" id="dstate">No changes</span>' +
        '<a class="btn" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + icon("external", 15) + "Open</a>" +
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
      renderHero();
      chips();
      render();
    });
  }

  function collect() {
    var b = $("collect");
    b.disabled = true;
    b.textContent = "Collecting…";
    fetch("/api/collect", { method: "POST" }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.data) { S.data = j.data; renderHero(); render(); }
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
      b.innerHTML = icon("refresh", 15) + "Collect";
    });
  }

  function applyTheme() {
    var params = new URLSearchParams(location.search);
    if (params.get("theme") === "light" || params.get("theme") === "dark") {
      localStorage.setItem("presence-theme", params.get("theme"));
    }
    if (params.get("accent")) localStorage.setItem("presence-accent", params.get("accent"));
    var theme = localStorage.getItem("presence-theme");
    if (!theme) {
      theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", theme);
    $("theme").innerHTML = icon(theme === "dark" ? "sun" : "moon", 16);
    $("theme").setAttribute("title", theme === "dark" ? "Switch to light" : "Switch to dark");
    var accent = localStorage.getItem("presence-accent") || "amber";
    document.documentElement.setAttribute("data-accent", accent);
  }

  function boot() {
    applyTheme();
    $("theme").onclick = function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      localStorage.setItem("presence-theme", next);
      applyTheme();
    };
    $("accent").onclick = function () {
      var order = ["amber", "blue", "green"];
      var now = document.documentElement.getAttribute("data-accent") || "amber";
      var next = order[(order.indexOf(now) + 1) % order.length];
      localStorage.setItem("presence-accent", next);
      applyTheme();
    };
    $("searchicon").innerHTML = icon("search", 15);

    refreshState().then(function () {
      var match = /^#p=([a-z0-9_-]+)$/.exec(location.hash || "");
      if (match) openDrawer(match[1]);
    }).catch(function (e) {
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
