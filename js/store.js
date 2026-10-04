(function () {
  const KEY = "shopbook.v1";
  let mode = "local";
  let urls = [];

  function migrate(state) {
    const blank = Model.blankState();
    const next = blank;
    if (!state || typeof state !== "object") return next;
    next.updatedAt = state.updatedAt || blank.updatedAt;
    next.settings = Object.assign(blank.settings, state.settings || {});
    if (!next.settings.categories || !next.settings.categories.length) {
      next.settings.categories = blank.settings.categories;
    }
    ["products", "customers", "bills", "purchases", "expenses", "payments", "stockMoves"].forEach(function (key) {
      next[key] = Array.isArray(state[key]) ? state[key] : [];
    });
    next.version = 1;
    return next;
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function writeLocal(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }

  async function load() {
    const local = readLocal();
    try {
      const health = await fetch("/api/health", { cache: "no-store" });
      if (!health.ok) throw new Error("offline");
      mode = "server";
      const info = await fetch("/api/info", { cache: "no-store" }).then(function (r) { return r.json(); });
      urls = info.urls || [];
      const remoteRaw = await fetch("/api/shop", { cache: "no-store" }).then(function (r) { return r.json(); });
      const remote = remoteRaw && remoteRaw.settings ? migrate(remoteRaw) : null;
      let state = remote || local || Model.blankState();
      let pushed = false;
      if (local && remote && local.updatedAt > remote.updatedAt) {
        state = local;
        pushed = true;
        await save(state, remote.updatedAt, true);
      } else if (!remote && local && local.settings && local.settings.setupDone) {
        state = local;
        pushed = true;
        await save(state, "", true);
      }
      writeLocal(state);
      return { state: state, mode: mode, urls: urls, pushed: pushed };
    } catch (e) {
      mode = "local";
      urls = [];
      return { state: local || Model.blankState(), mode: mode, urls: urls, pushed: false };
    }
  }

  async function save(state, expected, force) {
    if (mode !== "server") {
      state.updatedAt = state.updatedAt || new Date().toISOString();
      writeLocal(state);
      return { ok: true };
    }
    const res = await fetch("/api/shop", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expected: expected || "",
        force: !!force,
        state: state
      })
    });
    if (res.status === 409) {
      const current = migrate(await res.json());
      return { ok: false, conflict: true, current: current };
    }
    if (!res.ok) throw new Error("save");
    writeLocal(state);
    return { ok: true };
  }

  window.Store = {
    load: load,
    save: save,
    writeLocal: writeLocal,
    migrate: migrate,
    mode: function () { return mode; },
    urls: function () { return urls; }
  };
})();
