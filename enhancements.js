(() => {
  "use strict";

  const APP = () => window.MiJuntita;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let sharedMode = false;
  let sharedPayload = null;
  let renderingShared = false;
  let structuring = false;
  let lastSignature = null;
  let lastSaved = null;
  let gridObserver = null;
  let currentDetailContext = null;
  let lastStarSignature = "";

  // ============================================================
  // JUNTAS COMPLETADAS
  // En producción una Junta completada NO se conserva en
  // "Juntas anteriores": se elimina de la interfaz y de Neon.
  // ============================================================

  const ARCHIVE_KEY = "miJuntita.completedJuntas.v1";
  const HIDDEN_COMPLETED_KEY = "miJuntita.hiddenCompletedJuntas.v1";

  const TEST_JUNTA_NAMES = new Set([
    "junta test",
    "junta de prueba",
    "junta prueba"
  ]);

  function isKnownTestJunta(junta) {
    const name = String(junta?.name || "").trim().toLowerCase();
    return TEST_JUNTA_NAMES.has(name) || name.includes("test") || name.includes("prueba");
  }

  function clearCompletedJuntaArchive() {
    try {
      localStorage.removeItem(ARCHIVE_KEY);
      localStorage.removeItem(HIDDEN_COMPLETED_KEY);
    } catch (error) {
      console.warn("No se pudo limpiar el historial local de Juntas anteriores:", error);
    }
  }

  // Cuando Kelly alcanza el 100 %, se retira de la interfaz.
  // Conservamos sus pagos en Neon para no perder el historial.
  function isKellyCompleted(state) {
    const original = Number(state?.kelly?.original || 0);
    if (original <= 0) return false;

    const paid = (state?.kelly?.payments || []).reduce(
      (sum, payment) => sum + Number(payment?.amount || 0),
      0
    );

    return paid >= original;
  }

  let archiveCleanupTimer = null;

  const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[c]));

  const money = value =>
    `S/ ${Number(value || 0).toLocaleString("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;

  const formatDate = value => {
    const text = String(value || "").trim();
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (text || "Sin fecha");
  };

  function getState() {
    return APP()?.state || null;
  }

  function openModal(html) {
    const backdrop = $("#modalBackdrop");
    const content = $("#modalContent");
    if (!backdrop || !content) return;

    content.innerHTML = html;
    backdrop.hidden = false;
  }

  function closeModal() {
    const backdrop = $("#modalBackdrop");
    if (backdrop) backdrop.hidden = true;
    document.documentElement.classList.remove("mj-detail-open");
  }

  function injectDeleteStyles() {
    if (document.getElementById("mj-delete-styles")) return;

    const style = document.createElement("style");
    style.id = "mj-delete-styles";
    style.textContent = `
      .mj-delete-zone{
        margin-top:14px;
        padding-top:12px;
        border-top:1px solid var(--line);
      }

      .mj-delete-btn{
        width:100%;
        min-height:42px;
        border:1px solid color-mix(in srgb,#c85f7f 32%,var(--line));
        border-radius:14px;
        background:color-mix(in srgb,#f1b0c0 18%,var(--card-solid));
        color:#9d3b5d;
        font-weight:750;
        cursor:pointer;
        transition:transform .18s ease,filter .2s ease;
      }

      .mj-delete-btn:hover{
        filter:brightness(.98);
        transform:translateY(-1px);
      }

      .mj-delete-btn:active{
        transform:scale(.98);
      }

      .mj-delete-btn:disabled{
        opacity:.65;
        cursor:wait;
        transform:none;
      }
    `;

    document.head.appendChild(style);
  }

  function injectKellyLauncherStyles() {
    if (document.getElementById("mj-kelly-launcher-styles")) return;

    const style = document.createElement("style");
    style.id = "mj-kelly-launcher-styles";
    style.textContent = `
      .mj-kelly-launcher{
        position:absolute !important;
        left:-10000px !important;
        top:auto !important;
        width:1px !important;
        height:1px !important;
        margin:0 !important;
        padding:0 !important;
        overflow:hidden !important;
        opacity:0 !important;
        pointer-events:none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function getShareToken() {
    const params = new URLSearchParams(location.search);
    const queryToken = params.get("share");
    if (queryToken) return queryToken;

    const hash = location.hash.replace(/^#/, "");
    if (!hash) return "";

    const hashParams = new URLSearchParams(hash);
    return hashParams.get("share") || "";
  }

  async function apiShareCreate(type, id = "") {
    const response = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok || !data.url) {
      throw new Error(data?.error || "No se pudo crear el enlace.");
    }

    return data;
  }

  async function apiShareRead(token) {
    const response = await fetch(
      `/api/share?token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" } }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok || !data.data) {
      throw new Error(data?.error || "El enlace compartido no es válido.");
    }

    return data;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const input = document.createElement("input");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      return ok;
    }
  }

  function toast(message) {
    const wrap = $("#toastWrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function readJsonStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;

      const value = JSON.parse(raw);
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("No se pudo guardar el estado de Juntas anteriores:", error);
      return false;
    }
  }

  function getCompletedArchive() {
    return [];
  }

  function getHiddenCompletedIds() {
    return [];
  }

  function cleanCompletedArchive() {
    clearCompletedJuntaArchive();
    return [];
  }

  function isJuntaSuppressed(id) {
    return false;
  }

  function getJuntaPaid(junta) {
    return (junta?.payments || []).reduce(
      (sum, payment) => sum + Number(payment?.amount || 0),
      0
    );
  }

  function archiveCompletedJuntas(state) {
    clearCompletedJuntaArchive();
  }

  function paymentSignature(state) {
    const juntaPart = (state.juntas || [])
      .map(j => {
        const last = j.payments?.[j.payments.length - 1];
        return `${j.id}:${j.payments?.length || 0}:${last?.id || ""}`;
      })
      .join("|");

    const kp = state.kelly?.payments || [];
    const lastKelly = kp[kp.length - 1];
    const kellyPart = `kelly:${kp.length}:${lastKelly?.id || ""}`;

    return `${juntaPart}|${kellyPart}`;
  }

  function detectNewRecord(state) {
    const signature = paymentSignature(state);

    if (lastSignature === null) {
      lastSignature = signature;
      return;
    }

    if (signature === lastSignature) return;

    for (const junta of state.juntas || []) {
      const last = junta.payments?.[junta.payments.length - 1];
      if (last && signature.includes(`${junta.id}:${junta.payments.length}:${last.id}`)) {
        lastSaved = { type: "junta", parentId: junta.id, paymentId: last.id };
      }
    }

    const kp = state.kelly?.payments || [];
    const lastKelly = kp[kp.length - 1];
    if (lastKelly) {
      lastSaved = { type: "kelly", paymentId: lastKelly.id };
    }

    lastSignature = signature;
  }

  function makeSectionHeader(icon, eyebrow, title, subtitle) {
    const header = document.createElement("div");
    header.className = "mj-section-head";
    header.innerHTML = `
      <div class="mj-section-icon">${icon}</div>
      <div>
        <div class="mj-section-eyebrow">${esc(eyebrow)}</div>
        <h2>${esc(title)}</h2>
        <p>${esc(subtitle)}</p>
      </div>
    `;
    return header;
  }

  function makeKellyCard(state) {
    const original = Number(state.kelly?.original || 0);
    const paid = (state.kelly?.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const balance = Math.max(0, original - paid);
    const pct = original > 0 ? Math.min(100, paid / original * 100) : 0;
    const payments = state.kelly?.payments?.length || 0;

    const article = document.createElement("article");
    article.className = "card mj-kelly-card";
    article.dataset.mjKellyCard = "true";

    if (lastSaved?.type === "kelly") {
      article.classList.add("mj-saved-card");
    }

    article.innerHTML = `
      <div class="card-head">
        <div>
          <div class="title-line">
            <span class="symbol">💗</span>
            <h2>Kelly</h2>
          </div>
          <div class="sub">Deuda · sin fecha límite</div>
        </div>

      </div>

      <div class="money mj-kelly-money">
        ${money(balance)}
        <small>saldo pendiente</small>
      </div>

      <div class="stats">
        <span class="pill">Deuda ${money(original)}</span>
        <span class="pill">Pagado ${money(paid)}</span>
        <span class="pill">${payments} ${payments === 1 ? "pago" : "pagos"}</span>
      </div>

      <div class="progress-row">
        <div class="progress-meta">
          <span>Pagado</span>
          <b>${pct.toFixed(0)}%</b>
        </div>
        <div class="progress mj-kelly-progress">
          <span style="width:${pct}%"></span>
        </div>
      </div>

      <div class="card-actions">
        <button class="primary" type="button" data-kelly-add-enhanced="true">
          💗 Registrar pago
        </button>
        <button class="secondary mj-card-history-btn" type="button" data-kelly-history-enhanced="true">
          📋 Historial
        </button>
        <button class="secondary" type="button" data-kelly-share-enhanced="true">
          ↗ Compartir
        </button>
      </div>
    `;

    return article;
  }

  function prepareJuntaCard(card, junta) {
    if (!card || !junta) return;

    const oldMore = card.querySelector("[data-junta-history]");
    if (oldMore) oldMore.remove();

    const actions = card.querySelector(".card-actions");
    if (!actions) return;

    if (!actions.querySelector("[data-mj-history-button]")) {
      const history = document.createElement("button");
      history.className = "secondary mj-card-history-btn";
      history.type = "button";
      history.dataset.juntaHistory = junta.id;
      history.dataset.mjHistoryButton = "true";
      history.textContent = "📋 Historial";

      const share = actions.querySelector("[data-share-junta]");
      if (share) {
        actions.insertBefore(history, share);
      } else {
        actions.appendChild(history);
      }
    }
  }

  function hideLegacyKellyQuickAction() {
    const legacy = $(".kelly-action");
    if (!legacy) return;

    // El botón original de Kelly sigue siendo el punto de entrada de app.js.
    // No lo ocultamos con hidden=true porque algunas versiones de app.js
    // usan ese mismo botón para abrir el formulario. Lo dejamos en el DOM,
    // fuera de la vista y fuera del flujo de teclado.
    legacy.hidden = false;
    legacy.classList.add("mj-kelly-launcher");
    legacy.setAttribute("aria-hidden", "true");
    legacy.tabIndex = -1;
  }

  function ensureRefreshButton() {
    if (sharedMode) return;

    const bind = button => {
      if (!button || button.dataset.mjRefreshBound === "1") return;
      button.dataset.mjRefreshBound = "1";
      button.addEventListener("click", () => {
        button.disabled = true;
        button.classList.add("mj-refreshing");
        const label = button.getAttribute("title") || "Actualizar datos";
        toast(`${label}…`);
        setTimeout(() => window.location.reload(), 180);
      });
    };

    const existing = $("#mjRefreshBtn");
    if (existing) {
      bind(existing);
      return;
    }

    const actions = $(".top-actions");
    if (!actions) return;

    const button = document.createElement("button");
    button.className = "icon-btn mj-refresh-btn";
    button.id = "mjRefreshBtn";
    button.type = "button";
    button.title = "Actualizar datos";
    button.setAttribute("aria-label", "Actualizar datos");
    button.textContent = "↻";
    actions.insertBefore(button, actions.firstChild);
    bind(button);
  }

  function playNewPaymentStars(type = "junta") {
    const layer = $("#celebrationLayer");
    if (!layer) return;

    const symbols = type === "kelly"
      ? ["✦", "💗", "✨", "♡", "✦"]
      : ["✦", "✧", "🌸", "✨", "★"];

    for (let i = 0; i < 14; i++) {
      const star = document.createElement("span");
      star.className = "mj-payment-star";
      star.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      star.style.setProperty("--mj-star-x", `${(Math.random() - .5) * 72}vw`);
      star.style.setProperty("--mj-star-y", `${(Math.random() - .5) * 58}vh`);
      star.style.setProperty("--mj-star-r", `${(Math.random() - .5) * 70}deg`);
      star.style.setProperty("--mj-star-scale", `${.72 + Math.random() * .62}`);
      star.style.setProperty("--mj-star-delay", `${Math.random() * .16}s`);
      layer.appendChild(star);

      setTimeout(() => star.remove(), 1500);
    }
  }

  async function deleteJuntaFromCloud(juntaId) {
    if (!juntaId) return false;

    try {
      const response = await fetch("/api/delete-junta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ juntaId })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        console.warn("No se pudo eliminar la Junta:", data?.error || response.status);
        return false;
      }

      return true;
    } catch (error) {
      console.warn("No se pudo conectar con la limpieza de Juntas:", error);
      return false;
    }
  }

  async function purgeObsoleteJuntasFromCloud(state) {
    if (sharedMode || !state?.juntas?.length) return;

    const INITIAL_CLEANUP_KEY = "miJuntita.initialCleanup.v2";
    const initialCleanupDone = localStorage.getItem(INITIAL_CLEANUP_KEY) === "1";

    let obsolete = [];

    if (!initialCleanupDone) {
      // Limpieza única de los datos de prueba/anteriores:
      // conservamos solamente la Junta normal de S/4,000.
      const candidates = (state.juntas || []).filter(junta => {
        if (!junta?.id) return false;
        const name = String(junta.name || "").trim().toLowerCase();
        const goal = Number(junta.goal || 0);
        const normal = Number(junta.normal || 0);
        return name === "junta" && goal === 4000 && normal === 250;
      });

      const keep = candidates[0]
        || (state.juntas || []).find(junta => {
          return junta?.id
            && Number(junta.goal || 0) === 4000
            && Number(junta.normal || 0) === 250;
        });

      // Solo ejecutamos la limpieza masiva si encontramos la Junta normal.
      // Así no corremos el riesgo de borrar todo ante un estado incompleto.
      if (keep) {
        obsolete = (state.juntas || []).filter(
          junta => junta?.id && String(junta.id) !== String(keep.id)
        );
      }
    }

    // Regla permanente: una Junta completada o una Junta de prueba no se conserva.
    for (const junta of state.juntas || []) {
      if (!junta?.id) continue;

      const alreadySelected = obsolete.some(
        item => String(item.id) === String(junta.id)
      );
      if (alreadySelected) continue;

      const paid = getJuntaPaid(junta);
      const goal = Number(junta.goal || 0);

      if (isKnownTestJunta(junta) || (goal > 0 && paid >= goal)) {
        obsolete.push(junta);
      }
    }

    // Quitar duplicados por seguridad.
    const unique = Array.from(
      new Map(obsolete.map(junta => [String(junta.id), junta])).values()
    );

    if (!unique.length) {
      if (!initialCleanupDone) {
        const keepExists = (state.juntas || []).some(junta => {
          return junta?.id
            && String(junta.name || "").trim().toLowerCase() === "junta"
            && Number(junta.goal || 0) === 4000
            && Number(junta.normal || 0) === 250;
        });

        if (keepExists) {
          localStorage.setItem(INITIAL_CLEANUP_KEY, "1");
        }
      }
      return;
    }

    const results = await Promise.all(
      unique.map(junta => deleteJuntaFromCloud(junta.id))
    );

    if (results.every(Boolean)) {
      clearCompletedJuntaArchive();
      localStorage.setItem(INITIAL_CLEANUP_KEY, "1");
      setTimeout(() => window.location.reload(), 250);
    }
  }

  function enhanceMain() {
    if (sharedMode || structuring) return;

    const state = getState();
    const grid = $("#juntasGrid");
    if (!state || !grid) return;

    hideLegacyKellyQuickAction();
    ensureRefreshButton();

    // Este observer vigila cambios hechos por la app principal.
    // Como aquí reconstruimos #juntasGrid a propósito, lo
    // desconectamos temporalmente para evitar un bucle infinito
    // de renderizado que puede congelar la página.
    const observerWasConnected = Boolean(gridObserver);
    if (observerWasConnected) {
      gridObserver.disconnect();
    }

    detectNewRecord(state);
    archiveCompletedJuntas(state);
    void purgeObsoleteJuntasFromCloud(state);

    const juntaCards = Array.from(grid.children)
      .filter(el => el.classList.contains("card"))
      .filter(el => {
        const juntaId = el.dataset.juntaCard || "";
        const junta = (state.juntas || []).find(j => j.id === juntaId);
        return !isJuntaSuppressed(juntaId) && !isKnownTestJunta(junta);
      });

    structuring = true;
    grid.classList.remove("cards-grid");
    grid.classList.add("mj-finance-root");
    grid.innerHTML = "";

    const savings = document.createElement("section");
    savings.className = "mj-finance-section mj-savings-section";
    savings.appendChild(
      makeSectionHeader(
        "🌸",
        "AHORROS",
        "Tus juntitas",
        "Metas que vas construyendo poquito a poquito."
      )
    );

    const savingsCards = document.createElement("div");
    savingsCards.className = "mj-finance-cards";

    for (const card of juntaCards) {
      const juntaId = card.dataset.juntaCard || "";
      const junta = (state.juntas || []).find(j => j.id === juntaId);

      prepareJuntaCard(card, junta);

      if (
        junta &&
        lastSaved?.type === "junta" &&
        lastSaved.parentId === junta.id &&
        lastSaved.paymentId === junta.payments?.[junta.payments.length - 1]?.id
      ) {
        card.classList.add("mj-saved-card");
      }

      savingsCards.appendChild(card);
    }

    if (!juntaCards.length) {
      const empty = document.createElement("div");
      empty.className = "mj-finance-empty";
      empty.innerHTML = `
        <span>🌷</span>
        <div>
          <b>No hay juntas activas</b>
          <small>Cuando crees una nueva meta aparecerá aquí.</small>
        </div>
      `;
      savingsCards.appendChild(empty);
    }

    savings.appendChild(savingsCards);
    grid.appendChild(savings);

    // Kelly desaparece de la interfaz cuando queda completamente pagada.
    // Con deuda original S/0 todavía se muestra para permitir iniciar/revisar.
    if (!isKellyCompleted(state)) {
      const debts = document.createElement("section");
      debts.className = "mj-finance-section mj-debts-section";
      debts.appendChild(
        makeSectionHeader(
          "💗",
          "DEUDAS",
          "Lo pendiente",
          "Aquí puedes revisar Kelly y sus pagos."
        )
      );

      const debtCards = document.createElement("div");
      debtCards.className = "mj-finance-cards";
      debtCards.appendChild(makeKellyCard(state));
      debts.appendChild(debtCards);

      grid.appendChild(debts);
    }

    if (lastSaved) {
      const starSignature = [
        lastSaved.type,
        lastSaved.parentId || "",
        lastSaved.paymentId || ""
      ].join(":");

      if (starSignature !== lastStarSignature) {
        lastStarSignature = starSignature;
        const savedType = lastSaved.type;
        requestAnimationFrame(() => playNewPaymentStars(savedType));
      }
    }

    if (lastSaved) {
      const savedSnapshot = lastSaved;
      setTimeout(() => {
        if (lastSaved === savedSnapshot) {
          lastSaved = null;
        }
      }, 3200);
    }

    structuring = false;

    if (observerWasConnected) {
      gridObserver.observe(grid, { childList: true, subtree: false });
    }

  }

  function historyRows(type, parentId = "") {
    if (sharedMode) {
      if (sharedPayload?.type === "junta") {
        return (sharedPayload.payments || []).slice().reverse();
      }
      if (sharedPayload?.type === "kelly") {
        return (sharedPayload.payments || []).slice().reverse();
      }
      return [];
    }

    const state = getState();
    if (!state) return [];

    if (type === "junta") {
      const junta = (state.juntas || []).find(j => j.id === parentId);
      return junta ? (junta.payments || []).slice().reverse() : [];
    }

    return (state.kelly?.payments || []).slice().reverse();
  }

  function openHistory(type, parentId = "") {
    let title = "";
    let intro = "";
    let rows = [];

    if (type === "junta") {
      const junta = sharedMode
        ? sharedPayload?.junta
        : (getState()?.juntas || []).find(j => j.id === parentId);
      if (!junta) return;
      title = `🌸 Historial · ${esc(junta.name)}`;
      intro = "Selecciona un movimiento para revisar todo el detalle.";
      rows = historyRows("junta", parentId);
    } else {
      title = "💗 Pagos de Kelly";
      intro = "Selecciona un pago para revisar todo el detalle.";
      rows = historyRows("kelly");
    }

    openModal(`
      <div class="mj-history-shell">
        <div class="mj-history-topline">
          <span class="mj-readonly-chip">${sharedMode ? "SOLO LECTURA" : "MOVIMIENTOS"}</span>
        </div>

        <h2>${title}</h2>
        <p class="intro">${intro}</p>

        <div class="history mj-history-list">
          ${rows.length ? rows.map((p, index) => {
            const isNew = !sharedMode && lastSaved && lastSaved.paymentId === p.id && lastSaved.type === type && (type !== "junta" || lastSaved.parentId === parentId);
            return `
              <button
                class="mj-history-row ${isNew ? "mj-record-new" : ""}"
                type="button"
                data-mj-detail-type="${type}"
                data-mj-detail-parent="${esc(parentId)}"
                data-mj-detail-id="${esc(p.id)}"
                style="--mj-delay:${index * 55}ms"
              >
                <span class="mj-history-icon">${type === "junta" ? "🌸" : "💗"}</span>
                <span class="mj-history-main">
                  <b>${money(p.amount)}</b>
                  <small>${esc(formatDate(p.date))}${p.method ? ` · ${esc(p.method)}` : ""}</small>
                  ${p.note ? `<small class="mj-history-note">${esc(p.note)}</small>` : ""}
                </span>
                <span class="mj-history-arrow">›</span>
              </button>
            `;
          }).join("") : `
            <div class="empty">Todavía no hay movimientos registrados.</div>
          `}
        </div>
      </div>
    `);

    if (sharedMode) {
      document.documentElement.classList.add("mj-shared-history");
    }
  }

  function findPayment(type, parentId, paymentId) {
    const wanted = String(paymentId ?? "");

    if (sharedMode) {
      return (sharedPayload?.payments || []).find(
        p => String(p?.id ?? "") === wanted
      ) || null;
    }

    const state = getState();
    if (!state) return null;

    if (type === "junta") {
      const junta = (state.juntas || []).find(
        j => String(j?.id ?? "") === String(parentId ?? "")
      );

      return junta?.payments?.find(
        p => String(p?.id ?? "") === wanted
      ) || null;
    }

    return state.kelly?.payments?.find(
      p => String(p?.id ?? "") === wanted
    ) || null;
  }

  function openDetail(type, parentId, paymentId) {
    const payment = findPayment(type, parentId, paymentId);
    if (!payment) {
      toast("No se encontró ese movimiento.");
      return;
    }

    const junta = type === "junta"
      ? (sharedMode ? sharedPayload?.junta : (getState()?.juntas || []).find(j => j.id === parentId))
      : null;

    const backText = type === "junta"
      ? "← Volver a movimientos"
      : "← Volver a pagos";

    const receipt = payment.receiptUrl || payment.receiptData || "";

    currentDetailContext = { type, parentId, paymentId };

    openModal(`
      <div class="mj-detail-shell">
        <button class="secondary mj-back-btn" type="button" data-mj-back-history="true">
          ${backText}
        </button>

        <div class="mj-detail-heading">
          <span class="mj-detail-icon">${type === "junta" ? "🌸" : "💗"}</span>
          <div>
            <h2>${type === "junta" ? "Detalle del aporte" : "Detalle del pago"}</h2>
            <p>${type === "junta" ? esc(junta?.name || "Junta") : "Pago registrado para Kelly"}</p>
          </div>
        </div>

        <div class="mj-detail-grid">
          <div class="mj-detail-item">
            <span>Monto</span>
            <strong>${money(payment.amount)}</strong>
          </div>
          <div class="mj-detail-item">
            <span>Fecha</span>
            <strong>${esc(formatDate(payment.date))}</strong>
          </div>
          <div class="mj-detail-item">
            <span>Método</span>
            <strong>${esc(payment.method || "No indicado")}</strong>
          </div>
          <div class="mj-detail-item">
            <span>Nota</span>
            <strong>${esc(payment.note || "Sin nota")}</strong>
          </div>
        </div>

        <div class="mj-receipt-title">Comprobante</div>
        ${receipt ? `
          <button class="mj-receipt-stage" type="button" data-mj-large-receipt="${esc(receipt)}">
            <img src="${esc(receipt)}" alt="Comprobante del movimiento" class="mj-receipt-image">
            <span>↗ Ver comprobante completo</span>
          </button>
        ` : `
          <div class="empty">Este movimiento no tiene comprobante asociado.</div>
        `}

        ${!sharedMode ? `
          <div class="mj-delete-zone">
            <button
              type="button"
              class="mj-delete-btn"
              data-mj-delete-payment="true"
            >
              🗑️ Eliminar ${type === "junta" ? "aporte" : "pago"}
            </button>
          </div>
        ` : ""}
      </div>
    `);

    document.documentElement.classList.add("mj-detail-open");
  }

  function openLargeReceipt(src) {
    if (!src) return;
    openModal(`
      <div class="mj-photo-viewer">
        <button class="secondary mj-back-btn" type="button" data-mj-photo-back="true">
          ← Volver al detalle
        </button>
        <h2>📷 Comprobante</h2>
        <img src="${esc(src)}" alt="Comprobante" class="photo-modal-preview mj-soft-zoom">
      </div>
    `);
  }

  function renderSharedView() {
    if (!sharedMode || !sharedPayload || renderingShared) return;
    const grid = $("#juntasGrid");
    if (!grid) return;

    renderingShared = true;

    grid.classList.remove("cards-grid");
    grid.classList.add("mj-shared-root");

    const title = sharedPayload.type === "junta"
      ? sharedPayload.junta?.name || "Junta"
      : "Kelly";

    if (sharedPayload.type === "junta") {
      const junta = sharedPayload.junta;
      const payments = sharedPayload.payments || [];
      const paid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const goal = Number(junta.goal || 0);
      const pct = goal ? Math.min(100, paid / goal * 100) : 0;

      grid.innerHTML = `
        <section class="mj-shared-section">
          <div class="mj-shared-badge">🌸 SOLO LECTURA</div>
          <div class="mj-shared-header">
            <div>
              <div class="mj-section-eyebrow">AHORROS</div>
              <h2>${esc(title)}</h2>
              <p>Esta vista contiene solamente esta Junta.</p>
            </div>
            <div class="mj-shared-symbol">🌸</div>
          </div>

          <div class="mj-shared-summary">
            <div>
              <span>Acumulado</span>
              <strong>${money(paid)}</strong>
            </div>
            <div>
              <span>Meta</span>
              <strong>${money(goal)}</strong>
            </div>
            <div>
              <span>Progreso</span>
              <strong>${pct.toFixed(0)}%</strong>
            </div>
          </div>

          <div class="progress mj-shared-progress">
            <span style="width:${pct}%"></span>
          </div>

          <div class="mj-shared-history-label">Historial</div>
          <div class="mj-shared-list">
            ${payments.slice().reverse().map((p, index) => `
              <button
                class="mj-history-row mj-shared-row"
                type="button"
                data-mj-detail-type="junta"
                data-mj-detail-parent="${esc(junta.id)}"
                data-mj-detail-id="${esc(p.id)}"
                style="--mj-delay:${index * 55}ms"
              >
                <span class="mj-history-icon">🌸</span>
                <span class="mj-history-main">
                  <b>${money(p.amount)}</b>
                  <small>${esc(formatDate(p.date))}${p.method ? ` · ${esc(p.method)}` : ""}</small>
                  ${p.note ? `<small>${esc(p.note)}</small>` : ""}
                </span>
                <span class="mj-history-arrow">›</span>
              </button>
            `).join("") || `<div class="empty">Todavía no hay movimientos registrados.</div>`}
          </div>
        </section>
      `;
    } else {
      const original = Number(sharedPayload.original || 0);
      const payments = sharedPayload.payments || [];
      const paid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const balance = Math.max(0, original - paid);
      const pct = original ? Math.min(100, paid / original * 100) : 0;

      grid.innerHTML = `
        <section class="mj-shared-section mj-shared-kelly">
          <div class="mj-shared-badge">💗 SOLO LECTURA</div>
          <div class="mj-shared-header">
            <div>
              <div class="mj-section-eyebrow">DEUDAS</div>
              <h2>Kelly</h2>
              <p>Esta vista contiene solamente la información de Kelly.</p>
            </div>
            <div class="mj-shared-symbol">💗</div>
          </div>

          <div class="mj-shared-summary">
            <div>
              <span>Saldo pendiente</span>
              <strong>${money(balance)}</strong>
            </div>
            <div>
              <span>Deuda original</span>
              <strong>${money(original)}</strong>
            </div>
            <div>
              <span>Pagado</span>
              <strong>${money(paid)}</strong>
            </div>
          </div>

          <div class="progress mj-shared-progress">
            <span style="width:${pct}%"></span>
          </div>

          <div class="mj-shared-history-label">Historial de pagos</div>
          <div class="mj-shared-list">
            ${payments.slice().reverse().map((p, index) => `
              <button
                class="mj-history-row mj-shared-row"
                type="button"
                data-mj-detail-type="kelly"
                data-mj-detail-parent=""
                data-mj-detail-id="${esc(p.id)}"
                style="--mj-delay:${index * 55}ms"
              >
                <span class="mj-history-icon">💗</span>
                <span class="mj-history-main">
                  <b>${money(p.amount)}</b>
                  <small>${esc(formatDate(p.date))}${p.method ? ` · ${esc(p.method)}` : ""}</small>
                  ${p.note ? `<small>${esc(p.note)}</small>` : ""}
                </span>
                <span class="mj-history-arrow">›</span>
              </button>
            `).join("") || `<div class="empty">Todavía no hay pagos registrados.</div>`}
          </div>
        </section>
      `;
    }

    renderingShared = false;
  }

  function setSharedShell() {
    document.documentElement.classList.add("mj-shared-mode");
    document.documentElement.classList.remove("mj-shared-mode-pending");
    sharedMode = true;

    const brandText = $(".brand strong");
    const brandSub = $("#savingPhrase") || $(".brand span");

    if (brandText) brandText.textContent = "Mi Juntita";
    if (brandSub) brandSub.textContent = "Vista compartida · solo lectura";

    const welcome = $(".welcome");
    if (welcome) welcome.hidden = true;

    const actions = $(".quick-grid");
    if (actions) actions.hidden = true;

    const lower = $(".lower-grid");
    if (lower) lower.hidden = true;

    const settings = $("#settingsBtn");
    if (settings) settings.hidden = true;

    const topActions = $(".top-actions");
    if (topActions) topActions.hidden = true;
  }

  async function initializeSharedMode(token) {
    setSharedShell();

    const grid = $("#juntasGrid");
    if (grid) {
      grid.classList.remove("cards-grid");
      grid.classList.add("mj-shared-root");
      grid.innerHTML = `
        <section class="mj-shared-section mj-shared-loading">
          <div class="mj-loading-flower">🌸</div>
          <h2>Abriendo la vista compartida…</h2>
          <p>Solo se mostrará la información que te compartieron.</p>
        </section>
      `;
    }

    try {
      const data = await apiShareRead(token);
      sharedPayload = {
        type: data.type,
        ...(data.data || {})
      };
      renderSharedView();
    } catch (error) {
      document.documentElement.classList.remove("mj-shared-mode-pending");
      if (grid) {
        grid.innerHTML = `
          <section class="mj-shared-section mj-shared-error">
            <div class="mj-shared-symbol">🌷</div>
            <h2>Enlace no disponible</h2>
            <p>${esc(error.message || "No se pudo abrir esta vista compartida.")}</p>
          </section>
        `;
      }
    }
  }

  async function openOwnerShare(type, id = "") {
    const label = type === "junta" ? "Compartir Junta" : "Compartir Kelly";
    const icon = type === "junta" ? "🌸" : "💗";

    openModal(`
      <div class="mj-share-builder">
        <div class="mj-share-icon">${icon}</div>
        <h2>${label}</h2>
        <p class="intro">Creando un enlace que muestra solamente esta sección y su historial.</p>
        <div class="mj-share-loading-box">
          <div class="mj-loading-flower">✦</div>
          <span>Preparando enlace seguro…</span>
        </div>
      </div>
    `);

    try {
      const result = await apiShareCreate(type, id);
      openModal(`
        <div class="mj-share-builder">
          <div class="mj-share-icon">${icon}</div>
          <h2>${label}</h2>
          <p class="intro">La persona que reciba este enlace verá únicamente esta sección, su historial y sus comprobantes. No verá tus otras juntas, gastos ni pendientes.</p>

          <div class="mj-readonly-box">
            <span class="mj-readonly-chip">SOLO LECTURA</span>
            <strong>No permite agregar, editar ni registrar pagos.</strong>
          </div>

          <div class="share-link-box mj-share-link-new">
            <input id="mjShareLinkInput" readonly value="${esc(result.url)}" aria-label="Enlace compartido">
            <button class="primary" type="button" id="mjCopyShareLink">Copiar enlace ↗</button>
          </div>
        </div>
      `);

      $("#mjCopyShareLink")?.addEventListener("click", async () => {
        const ok = await copyText(result.url);
        toast(ok ? "Enlace copiado ↗" : "No se pudo copiar el enlace.");
      });
    } catch (error) {
      openModal(`
        <div class="mj-share-builder">
          <div class="mj-share-icon">🌷</div>
          <h2>No se pudo crear el enlace</h2>
          <p class="intro">${esc(error.message || "Ocurrió un error al preparar el enlace.")}</p>
          <button class="primary" type="button" data-mj-close-share="true">Cerrar</button>
        </div>
      `);
    }
  }

  function openShareChooser() {
    const state = getState();
    if (!state) return;

    const juntaOptions = (state.juntas || []).map((j, index) => `
      <button class="mj-share-choice" type="button" data-mj-share-type="junta" data-mj-share-id="${esc(j.id)}">
        <span>🌸</span>
        <div>
          <b>${esc(j.name || `Junta ${index + 1}`)}</b>
          <small>Compartir solamente esta Junta</small>
        </div>
        <strong>›</strong>
      </button>
    `).join("");

    openModal(`
      <div class="mj-share-builder">
        <div class="mj-share-icon">↗</div>
        <h2>Compartir una sección</h2>
        <p class="intro">Elige exactamente qué quieres mostrar. La otra persona no verá el resto de Mi Juntita.</p>

        <div class="mj-share-group-title">AHORROS</div>
        <div class="mj-share-choices">
          ${juntaOptions || `<div class="empty">Todavía no tienes una Junta.</div>`}
        </div>

        <div class="mj-share-group-title">DEUDAS</div>
        <div class="mj-share-choices">
          <button class="mj-share-choice" type="button" data-mj-share-type="kelly" data-mj-share-id="">
            <span>💗</span>
            <div>
              <b>Kelly</b>
              <small>Compartir solamente Kelly</small>
            </div>
            <strong>›</strong>
          </button>
        </div>
      </div>
    `);
  }

  async function delegateClicks(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const historyButton = target.closest("[data-junta-history]");
    if (historyButton && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openHistory("junta", historyButton.dataset.juntaHistory || "");
      return;
    }

    const kellyHistory = target.closest("[data-kelly-history-enhanced]");
    if (kellyHistory && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openHistory("kelly");
      return;
    }

    const kellyAdd = target.closest("[data-kelly-add-enhanced]");
    if (kellyAdd && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const launcher = $("#kellyBtn");
      if (!launcher) {
        toast("No se encontró el registro de Kelly.");
        return;
      }

      // Abrimos el flujo ORIGINAL de app.js.
      // Lo hacemos mediante un evento nativo sobre el botón original y
      // no construimos otro formulario paralelo, para no duplicar la
      // lógica de comprobantes, Neon y Blob.
      launcher.hidden = false;
      launcher.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      return;
    }

    const kellyShare = target.closest("[data-kelly-share-enhanced]");
    if (kellyShare && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openOwnerShare("kelly");
      return;
    }

    const juntaShare = target.closest("[data-share-junta]");
    if (juntaShare && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openOwnerShare("junta", juntaShare.dataset.shareJunta || "");
      return;
    }

    const mainShare = target.closest("#shareBtn");
    if (mainShare && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openShareChooser();
      return;
    }

    const shareChoice = target.closest("[data-mj-share-type]");
    if (shareChoice && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openOwnerShare(
        shareChoice.dataset.mjShareType,
        shareChoice.dataset.mjShareId || ""
      );
      return;
    }

    const archiveHistory = target.closest("[data-mj-archive-history]");
    if (archiveHistory && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const archiveId = archiveHistory.dataset.mjArchiveId || "";
      const state = getState();
      const junta = (state?.juntas || []).find(j => j.id === archiveId);
      if (junta) {
        openHistory("junta", archiveId);
      } else {
        const item = getCompletedArchive().find(x => x.id === archiveId);
        if (item) {
          openModal(`
            <div class="mj-history-shell">
              <button class="secondary mj-back-btn" type="button" data-mj-close-archive="true">← Volver a anteriores</button>
              <span class="mj-readonly-chip">HISTORIAL</span>
              <h2>🌸 ${esc(item.name || "Junta")}</h2>
              <p class="intro">Esta Junta fue completada y está conservada temporalmente.</p>
              <div class="history mj-history-list">
                ${(item.payments || []).slice().reverse().map((p, index) => `
                  <button class="mj-history-row" type="button" data-mj-detail-type="junta" data-mj-detail-parent="${esc(item.id)}" data-mj-detail-id="${esc(p.id)}" style="--mj-delay:${index * 55}ms">
                    <span class="mj-history-icon">🌸</span>
                    <span class="mj-history-main">
                      <b>${money(p.amount)}</b>
                      <small>${esc(formatDate(p.date))}${p.method ? ` · ${esc(p.method)}` : ""}</small>
                      ${p.note ? `<small>${esc(p.note)}</small>` : ""}
                    </span>
                    <span class="mj-history-arrow">›</span>
                  </button>
                `).join("") || `<div class="empty">No hay movimientos en esta Junta.</div>`}
              </div>
            </div>
          `);
        }
      }
      return;
    }

    const closeArchive = target.closest("[data-mj-close-archive]");
    if (closeArchive) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
      return;
    }

    const detail = target.closest("[data-mj-detail-type]");
    if (detail) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openDetail(
        detail.dataset.mjDetailType,
        detail.dataset.mjDetailParent || "",
        detail.dataset.mjDetailId || ""
      );
      return;
    }

    const backHistory = target.closest("[data-mj-back-history]");
    if (backHistory) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (sharedMode) {
        closeModal();
      } else if (currentDetailContext) {
        openHistory(currentDetailContext.type, currentDetailContext.parentId || "");
      }
      return;
    }

    const largeReceipt = target.closest("[data-mj-large-receipt]");
    if (largeReceipt) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openLargeReceipt(largeReceipt.dataset.mjLargeReceipt || "");
      return;
    }

    const photoBack = target.closest("[data-mj-photo-back]");
    if (photoBack) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const currentDetail = document.querySelector(".mj-detail-shell");
      if (currentDetail) {
        const ctx = currentDetailContext;
        if (ctx) {
          openDetail(ctx.type, ctx.parentId || "", ctx.paymentId || "");
        } else {
          closeModal();
        }
      }
      return;
    }

    const deleteButton = target.closest("[data-mj-delete-payment]");
    if (deleteButton && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const ctx = currentDetailContext;
      if (!ctx?.paymentId) {
        toast("No se pudo identificar este movimiento.");
        return;
      }

      const payment = findPayment(
        ctx.type,
        ctx.parentId || "",
        ctx.paymentId
      );

      if (!payment) {
        toast("No se encontró este movimiento en la memoria actual.");
        return;
      }

      const label = ctx.type === "junta" ? "aporte" : "pago";
      const ok = window.confirm(
        `¿Eliminar este ${label} de ${money(payment.amount)}?\n\nSe eliminará el registro y su comprobante. Esta acción no se puede deshacer.`
      );

      if (!ok) return;

      deleteButton.disabled = true;
      deleteButton.textContent = "🗑️ Eliminando…";

      const endpoint = ctx.type === "junta"
        ? "/api/delete-junta-payment"
        : "/api/delete-kelly-payment";

      const payload = {
        paymentId: payment.id,
        amount: Number(payment.amount || 0),
        date: payment.date || "",
        method: payment.method || "",
        note: payment.note || "",
        receiptUrl: payment.receiptUrl || payment.receipt_url || ""
      };

      if (ctx.type === "junta") {
        payload.juntaId = ctx.parentId || "";
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.ok) {
          throw new Error(
            result?.error ||
            "No se pudo eliminar el movimiento."
          );
        }

        toast(
          result.receiptDeleted === false
            ? `${label} eliminado, pero el comprobante no pudo borrarse.`
            : `${label.charAt(0).toUpperCase() + label.slice(1)} eliminado correctamente.`
        );

        currentDetailContext = null;
        closeModal();

        // Neon ya tiene el cambio. Recargamos para que app.js
        // vuelva a sincronizar el estado completo y Kelly/Junta
        // muestre el monto real actualizado.
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } catch (error) {
        console.error("Error eliminando movimiento:", error);
        deleteButton.disabled = false;
        deleteButton.textContent = `🗑️ Eliminar ${ctx.type === "junta" ? "aporte" : "pago"}`;
        toast(
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el movimiento."
        );
      }

      return;
    }

    const closeShare = target.closest("[data-mj-close-share]");
    if (closeShare) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
    }
  }

  function modalContextTypeFromDom() {
    return $(".mj-detail-icon")?.textContent?.includes("💗") ? "kelly" : "junta";
  }

  function startObservers() {
    const grid = $("#juntasGrid");
    if (!grid || gridObserver) return;

    gridObserver = new MutationObserver(() => {
      if (sharedMode) {
        if (!renderingShared) renderSharedView();
        return;
      }
      enhanceMain();
    });

    gridObserver.observe(grid, { childList: true, subtree: false });

    setTimeout(() => {
      if (!sharedMode) enhanceMain();
    }, 50);
  }

  function addSharedModeRoutingGuard() {
    if (!getShareToken()) return;

    const bodyObserver = new MutationObserver(() => {
      if (!sharedMode) return;
      setSharedShell();
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function addEvents() {
    document.addEventListener("click", delegateClicks, true);

    $("#modalClose")?.addEventListener("click", () => {
      document.documentElement.classList.remove("mj-shared-history", "mj-detail-open");
    }, true);
  }

  async function init() {
    injectDeleteStyles();
    injectKellyLauncherStyles();
    addEvents();

    const token = getShareToken();
    if (token) {
      await initializeSharedMode(token);
      startObservers();
      return;
    }

    startObservers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
