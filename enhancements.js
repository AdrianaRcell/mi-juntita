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
  // Durante la prueba duran 2 minutos.
  // Para producción cambia TEST_ARCHIVE_MS por REAL_ARCHIVE_MS.
  // ============================================================

  const ARCHIVE_KEY = "miJuntita.completedJuntas.v1";
  const HIDDEN_COMPLETED_KEY = "miJuntita.hiddenCompletedJuntas.v1";

  const TEST_ARCHIVE_MS = 2 * 60 * 1000;
  const REAL_ARCHIVE_MS = 14 * 24 * 60 * 60 * 1000;

  // 🧪 PRUEBA ACTUAL: 2 minutos.
  // Cuando terminemos las pruebas, cambia esta línea por REAL_ARCHIVE_MS.
  const ARCHIVE_DURATION_MS = TEST_ARCHIVE_MS;

  const TEST_JUNTA_NAMES = new Set([
    "junta test",
    "junta de prueba",
    "junta prueba"
  ]);

  function isKnownTestJunta(junta) {
    if (window.MiJuntitaTestMode) return false;
    const name = String(junta?.name || "").trim().toLowerCase();
    return TEST_JUNTA_NAMES.has(name);
  }

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
    const value = readJsonStorage(ARCHIVE_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function getHiddenCompletedIds() {
    const value = readJsonStorage(HIDDEN_COMPLETED_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function cleanCompletedArchive() {
    const now = Date.now();
    const archive = getCompletedArchive();
    const hidden = new Set(getHiddenCompletedIds());

    const activeArchive = [];
    let changed = false;

    for (const item of archive) {
      if (!item?.id || !item.expiresAt) {
        changed = true;
        continue;
      }

      if (Number(item.expiresAt) <= now) {
        hidden.add(item.id);
        changed = true;
        continue;
      }

      activeArchive.push(item);
    }

    if (changed) {
      writeJsonStorage(ARCHIVE_KEY, activeArchive);
      writeJsonStorage(HIDDEN_COMPLETED_KEY, Array.from(hidden));
    }

    return activeArchive;
  }

  function isJuntaSuppressed(id) {
    if (!id) return false;

    const archived = getCompletedArchive().some(
      item => item?.id === id
    );

    const hidden = getHiddenCompletedIds().includes(id);

    return archived || hidden;
  }

  function getJuntaPaid(junta) {
    return (junta?.payments || []).reduce(
      (sum, payment) =>
        sum + Number(payment?.amount || 0),
      0
    );
  }

  function archiveCompletedJuntas(state) {
    if (!state) return;

    cleanCompletedArchive();

    const archive = getCompletedArchive();

    for (const junta of state.juntas || []) {
      if (!junta?.id) continue;
      if (isKnownTestJunta(junta)) continue;

      const paid = getJuntaPaid(junta);
      const goal = Number(junta.goal || 0);

      if (goal <= 0 || paid < goal) continue;

      const alreadyArchived = archive.find(
        item => item?.id === junta.id
      );

      if (!alreadyArchived) {
        archive.push({
          id: junta.id,
          name: junta.name || "Junta",
          goal,
          normal: Number(junta.normal || 0),
          modality: junta.modality || "",
          completedAt: Date.now(),
          expiresAt: Date.now() + ARCHIVE_DURATION_MS,
          payments: Array.isArray(junta.payments)
            ? junta.payments.map(item => ({ ...item }))
            : []
        });
      }
    }

    writeJsonStorage(ARCHIVE_KEY, archive);

    for (const junta of state.juntas || []) {
      if (!junta?.id) continue;

      const paid = getJuntaPaid(junta);
      const goal = Number(junta.goal || 0);

      if (
        !isKnownTestJunta(junta) &&
        goal > 0 &&
        paid >= goal
      ) {
        const hidden = new Set(getHiddenCompletedIds());
        hidden.add(junta.id);
        writeJsonStorage(
          HIDDEN_COMPLETED_KEY,
          Array.from(hidden)
        );
      }
    }
  }

  function restoreVisibleJuntas(state) {
    if (!state) return;

    const hidden = new Set(getHiddenCompletedIds());
    const archive = getCompletedArchive();

    state.juntas = (state.juntas || []).filter(junta => {
      if (!junta?.id) return false;

      if (isKnownTestJunta(junta)) {
        return true;
      }

      const goal = Number(junta.goal || 0);
      const paid = getJuntaPaid(junta);

      if (goal > 0 && paid >= goal) {
        hidden.add(junta.id);
        return false;
      }

      if (hidden.has(junta.id)) {
        const archiveItem = archive.find(
          item => item?.id === junta.id
        );

        if (archiveItem && Number(archiveItem.expiresAt) > Date.now()) {
          return false;
        }

        hidden.delete(junta.id);
      }

      return true;
    });

    writeJsonStorage(
      HIDDEN_COMPLETED_KEY,
      Array.from(hidden)
    );
  }

  function getArchiveForDisplay() {
    return cleanCompletedArchive().filter(
      item => item && Number(item.expiresAt) > Date.now()
    );
  }

  function makeButton(html, attrs = "") {
    return `<button type="button" ${attrs}>${html}</button>`;
  }

  function injectExtraStyles() {
    if ($("#mj-enhancements-style")) return;

    const style = document.createElement("style");
    style.id = "mj-enhancements-style";
    style.textContent = `
      .mj-section-title{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        margin:24px 0 10px;
      }

      .mj-section-title h2{
        margin:0;
        font-size:19px;
      }

      .mj-section-title span{
        color:var(--muted);
        font-size:11px;
      }

      .mj-kelly-card{
        margin-top:18px;
      }

      .mj-history-wrap{
        margin-top:18px;
        border-top:1px solid var(--line);
        padding-top:18px;
      }

      .mj-history-btn{
        width:100%;
        justify-content:center;
        display:flex;
        align-items:center;
        gap:8px;
      }

      .mj-share-btn{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
      }

      .mj-card-actions{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:9px;
        margin-top:16px;
      }

      .mj-card-actions button{
        min-width:0;
      }

      .mj-card-actions .wide{
        grid-column:1/-1;
      }

      .mj-history-row{
        width:100%;
        border:1px solid var(--line);
        background:var(--card);
        color:var(--text);
        border-radius:16px;
        padding:13px;
        margin-bottom:9px;
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        text-align:left;
        cursor:pointer;
      }

      .mj-history-row:hover{
        transform:translateY(-2px);
      }

      .mj-history-main{
        min-width:0;
      }

      .mj-history-main strong{
        display:block;
        font-size:13px;
      }

      .mj-history-main small{
        display:block;
        color:var(--muted);
        font-size:10px;
        margin-top:4px;
      }

      .mj-history-amount{
        font-weight:800;
        white-space:nowrap;
      }

      .mj-history-arrow{
        color:var(--muted);
        font-size:19px;
        flex:none;
      }

      .mj-detail-shell{
        display:grid;
        gap:16px;
      }

      .mj-back-btn{
        justify-self:start;
      }

      .mj-detail-heading{
        display:flex;
        align-items:center;
        gap:12px;
      }

      .mj-detail-icon{
        width:48px;
        height:48px;
        border-radius:16px;
        display:grid;
        place-items:center;
        background:color-mix(in srgb,var(--pink2) 65%,transparent);
        font-size:25px;
      }

      .mj-detail-heading h2{
        margin:0;
      }

      .mj-detail-heading p{
        margin:3px 0 0;
        color:var(--muted);
        font-size:11px;
      }

      .mj-detail-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
      }

      .mj-detail-item{
        border:1px solid var(--line);
        background:var(--card);
        border-radius:16px;
        padding:13px;
      }

      .mj-detail-item.full{
        grid-column:1/-1;
      }

      .mj-detail-item span{
        display:block;
        color:var(--muted);
        font-size:10px;
        margin-bottom:5px;
      }

      .mj-detail-item strong{
        font-size:15px;
      }

      .mj-detail-note{
        white-space:pre-wrap;
      }

      .mj-receipt-preview{
        width:100%;
        max-height:340px;
        object-fit:contain;
        border-radius:18px;
        border:1px solid var(--line);
        background:#fff;
        cursor:pointer;
      }

      .mj-detail-actions{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:9px;
      }

      .mj-delete-btn{
        border:1px solid rgba(190,80,110,.3);
        background:color-mix(in srgb,#f0a3b9 22%,var(--card-solid));
        color:#9f395d;
      }

      .mj-delete-btn:hover{
        filter:brightness(.98);
      }

      .mj-confirm-shell{
        text-align:center;
        padding:8px 0;
      }

      .mj-confirm-icon{
        font-size:34px;
        margin-bottom:9px;
      }

      .mj-confirm-shell h2{
        margin-bottom:8px;
      }

      .mj-confirm-shell .intro{
        line-height:1.55;
      }

      .mj-confirm-note{
        border:1px solid var(--line);
        border-radius:14px;
        padding:11px;
        color:var(--muted);
        font-size:11px;
        margin-top:12px;
      }

      .mj-confirm-actions{
        justify-content:center;
      }

      .mj-danger-btn{
        border:0;
        border-radius:14px;
        padding:11px 13px;
        cursor:pointer;
        background:#c85f7f;
        color:#fff;
      }

      .mj-danger-btn:disabled{
        opacity:.65;
        cursor:wait;
      }

      .mj-archive-card{
        margin-top:12px;
        padding:16px;
        border:1px solid var(--line);
        background:var(--card);
        border-radius:20px;
      }

      .mj-archive-card h3{
        margin:0 0 4px;
      }

      .mj-archive-card p{
        margin:0;
        color:var(--muted);
        font-size:11px;
      }

      .mj-photo-shell{
        display:grid;
        gap:12px;
      }

      .mj-large-receipt{
        max-width:100%;
        max-height:70vh;
        border-radius:18px;
        display:block;
        margin:auto;
      }

      .mj-empty-history{
        color:var(--muted);
        font-size:12px;
        padding:14px 0;
      }

      .mj-shared-history .mj-delete-btn,
      .mj-shared-history [data-mj-delete-payment],
      .mj-shared-history [data-mj-confirm-delete-payment]{
        display:none !important;
      }

      .mj-shared-history .mj-detail-actions{
        grid-template-columns:1fr;
      }

      @media(max-width:760px){
        .mj-detail-grid{
          grid-template-columns:1fr;
        }

        .mj-detail-item.full{
          grid-column:auto;
        }

        .mj-card-actions{
          grid-template-columns:1fr;
        }

        .mj-card-actions .wide{
          grid-column:auto;
        }

        .mj-detail-actions{
          grid-template-columns:1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function getKellyPaid(state) {
    return (state?.kelly?.payments || []).reduce(
      (sum, payment) =>
        sum + Number(payment?.amount || 0),
      0
    );
  }

  function getKellyOriginal(state) {
    return Number(state?.kelly?.original || 2800);
  }

  function getKellyBalance(state) {
    return Math.max(
      0,
      getKellyOriginal(state) - getKellyPaid(state)
    );
  }

  function getJuntaHistory(junta) {
    const payments = Array.isArray(junta?.payments)
      ? junta.payments
      : [];

    return [...payments].sort((a, b) => {
      const da = String(a?.date || "");
      const db = String(b?.date || "");

      if (da === db) {
        return String(b?.id || "").localeCompare(
          String(a?.id || "")
        );
      }

      return db.localeCompare(da);
    });
  }

  function getKellyHistory(state) {
    const payments = Array.isArray(state?.kelly?.payments)
      ? state.kelly.payments
      : [];

    return [...payments].sort((a, b) => {
      const da = String(a?.date || "");
      const db = String(b?.date || "");

      if (da === db) {
        return String(b?.id || "").localeCompare(
          String(a?.id || "")
        );
      }

      return db.localeCompare(da);
    });
  }

  function createHistoryRow(type, parentId, payment) {
    const receipt =
      payment?.receiptUrl ||
      payment?.receipt_url ||
      payment?.receiptData ||
      "";

    return `
      <button
        type="button"
        class="mj-history-row"
        data-mj-detail-type="${esc(type)}"
        data-mj-detail-parent="${esc(parentId || "")}"
        data-mj-detail-id="${esc(payment?.id || "")}"
      >
        <span class="mj-history-main">
          <strong>${money(payment?.amount)}</strong>
          <small>
            ${formatDate(payment?.date)}
            · ${esc(payment?.method || "Sin método")}
            ${receipt ? " · 📷" : ""}
          </small>
        </span>
        <span class="mj-history-arrow">›</span>
      </button>
    `;
  }

  function openHistory(type, parentId = "") {
    if (type === "junta") {
      const junta = sharedMode
        ? sharedPayload?.junta
        : (getState()?.juntas || []).find(
            item => String(item.id) === String(parentId)
          );

      if (!junta) {
        toast("No se encontró la Junta.");
        return;
      }

      const history = getJuntaHistory(junta);

      openModal(`
        <div class="mj-history-shell">
          <button
            class="secondary mj-back-btn"
            type="button"
            data-mj-close-history="true"
          >
            ← Volver
          </button>

          <div class="mj-detail-heading" style="margin-top:14px">
            <span class="mj-detail-icon">🌸</span>
            <div>
              <h2>Movimientos</h2>
              <p>${esc(junta.name || "Junta")}</p>
            </div>
          </div>

          <div class="history" style="margin-top:18px">
            ${
              history.length
                ? history.map(payment =>
                    createHistoryRow(
                      "junta",
                      junta.id,
                      payment
                    )
                  ).join("")
                : `<div class="mj-empty-history">Todavía no hay movimientos registrados.</div>`
            }
          </div>
        </div>
      `);

      currentDetailContext = {
        type: "junta",
        parentId: junta.id,
        paymentId: null
      };

      return;
    }

    const state = getState();

    if (!state?.kelly) {
      toast("No se encontró Kelly.");
      return;
    }

    const history = getKellyHistory(state);

    openModal(`
      <div class="mj-history-shell">
        <button
          class="secondary mj-back-btn"
          type="button"
          data-mj-close-history="true"
        >
          ← Volver
        </button>

        <div class="mj-detail-heading" style="margin-top:14px">
          <span class="mj-detail-icon">💗</span>
          <div>
            <h2>Pagos de Kelly</h2>
            <p>Historial de pagos registrados</p>
          </div>
        </div>

        <div class="history" style="margin-top:18px">
          ${
            history.length
              ? history.map(payment =>
                  createHistoryRow(
                    "kelly",
                    "",
                    payment
                  )
                ).join("")
              : `<div class="mj-empty-history">Todavía no hay pagos registrados.</div>`
          }
        </div>
      </div>
    `);

    currentDetailContext = {
      type: "kelly",
      parentId: "",
      paymentId: null
    };
  }

  function findPayment(type, parentId, paymentId) {
    if (sharedMode) {
      return (
        (sharedPayload?.payments || []).find(
          p => String(p?.id) === String(paymentId)
        ) || null
      );
    }

    const state = getState();
    if (!state) return null;

    if (type === "junta") {
      const junta = (state.juntas || []).find(
        j => String(j.id) === String(parentId)
      );

      return (
        junta?.payments?.find(
          p => String(p?.id) === String(paymentId)
        ) || null
      );
    }

    return (
      state.kelly?.payments?.find(
        p => String(p?.id) === String(paymentId)
      ) || null
    );
  }

  function openDetail(type, parentId, paymentId) {
    const payment = findPayment(
      type,
      parentId,
      paymentId
    );

    if (!payment) {
      toast("No se encontró ese movimiento.");
      return;
    }

    const junta = type === "junta"
      ? (
          sharedMode
            ? sharedPayload?.junta
            : (getState()?.juntas || []).find(
                j => String(j.id) === String(parentId)
              )
        )
      : null;

    const backText = type === "junta"
      ? "← Volver a movimientos"
      : "← Volver a pagos";

    const receipt =
      payment.receiptUrl ||
      payment.receipt_url ||
      payment.receiptData ||
      "";

    currentDetailContext = {
      type,
      parentId,
      paymentId
    };

    openModal(`
      <div class="mj-detail-shell">
        <button
          class="secondary mj-back-btn"
          type="button"
          data-mj-back-history="true"
        >
          ${backText}
        </button>

        <div class="mj-detail-heading">
          <span class="mj-detail-icon">
            ${type === "junta" ? "🌸" : "💗"}
          </span>

          <div>
            <h2>
              ${type === "junta"
                ? "Detalle del aporte"
                : "Detalle del pago"}
            </h2>

            <p>
              ${
                type === "junta"
                  ? esc(junta?.name || "Junta")
                  : "Pago registrado para Kelly"
              }
            </p>
          </div>
        </div>

        <div class="mj-detail-grid">
          <div class="mj-detail-item">
            <span>Monto</span>
            <strong>${money(payment.amount)}</strong>
          </div>

          <div class="mj-detail-item">
            <span>Fecha</span>
            <strong>${formatDate(payment.date)}</strong>
          </div>

          <div class="mj-detail-item">
            <span>Método</span>
            <strong>${esc(payment.method || "Sin método")}</strong>
          </div>

          <div class="mj-detail-item">
            <span>Comprobante</span>
            <strong>${receipt ? "Sí 📷" : "No"}</strong>
          </div>

          ${
            payment.note
              ? `
                <div class="mj-detail-item full">
                  <span>Nota</span>
                  <strong class="mj-detail-note">
                    ${esc(payment.note)}
                  </strong>
                </div>
              `
              : ""
          }
        </div>

        ${
          receipt
            ? `
              <div>
                <img
                  src="${esc(receipt)}"
                  alt="Comprobante del movimiento"
                  class="mj-receipt-preview"
                  data-mj-large-receipt="${esc(receipt)}"
                >
              </div>
            `
            : ""
        }

        <div class="mj-detail-actions">
          ${
            receipt
              ? `
                <button
                  type="button"
                  class="secondary"
                  data-mj-large-receipt="${esc(receipt)}"
                >
                  📷 Ver comprobante
                </button>
              `
              : `
                <span></span>
              `
          }

          ${
            sharedMode
              ? ""
              : `
                <button
                  type="button"
                  class="mj-delete-btn"
                  data-mj-delete-payment="true"
                >
                  🗑 Eliminar
                </button>
              `
          }
        </div>
      </div>
    `);
  }

  function openLargeReceipt(url) {
    if (!url) {
      toast("No hay comprobante disponible.");
      return;
    }

    openModal(`
      <div class="mj-photo-shell">
        <button
          type="button"
          class="secondary mj-back-btn"
          data-mj-photo-back="true"
        >
          ← Volver
        </button>

        <img
          src="${esc(url)}"
          alt="Comprobante"
          class="mj-large-receipt"
        >
      </div>
    `);
  }

  function renderKellyCard(state) {
    if (!state?.kelly) return "";

    const original = getKellyOriginal(state);
    const paid = getKellyPaid(state);
    const balance = getKellyBalance(state);
    const payments = getKellyHistory(state);
    const percent = original > 0
      ? Math.min(100, Math.round((paid / original) * 100))
      : 0;

    if (balance <= 0 && original > 0) {
      return "";
    }

    return `
      <section class="card mj-kelly-card stagger" id="mjKellyCard">
        <div class="card-head">
          <div class="title-line">
            <span class="symbol">💗</span>
            <div>
              <h2>Kelly</h2>
              <div class="sub">Kelly te debe</div>
            </div>
          </div>
        </div>

        <div class="money">
          ${money(balance)}
          <small>pendiente</small>
        </div>

        <div class="stats">
          <span class="pill">
            💗 Deuda original: ${money(original)}
          </span>

          <span class="pill">
            ✓ Pagado: ${money(paid)}
          </span>

          <span class="pill">
            ${payments.length} ${payments.length === 1 ? "pago" : "pagos"}
          </span>
        </div>

        <div class="progress-row">
          <div class="progress-meta">
            <span>Progreso</span>
            <strong>${percent}%</strong>
          </div>

          <div class="progress">
            <span style="width:${percent}%"></span>
          </div>
        </div>

        <div class="mj-card-actions">
          <button
            type="button"
            class="primary"
            data-mj-kelly-register="true"
          >
            💗 Registrar pago
          </button>

          <button
            type="button"
            class="secondary mj-history-btn"
            data-mj-history-type="kelly"
          >
            📖 Historial
          </button>

          <button
            type="button"
            class="secondary mj-share-btn wide"
            data-mj-share-type="kelly"
          >
            ↗ Compartir solo Kelly
          </button>
        </div>
      </section>
    `;
  }

  function renderArchiveCard(item) {
    const payments = Array.isArray(item.payments)
      ? item.payments
      : [];

    return `
      <article class="mj-archive-card">
        <h3>🌸 ${esc(item.name || "Junta")}</h3>

        <p>
          Completada · ${money(item.goal || 0)}
        </p>

        <div class="stats" style="margin-bottom:0">
          <span class="pill">
            ✓ ${payments.length} ${payments.length === 1 ? "movimiento" : "movimientos"}
          </span>

          <span class="pill">
            ${formatDate(new Date(item.completedAt).toISOString().slice(0,10))}
          </span>
        </div>
      </article>
    `;
  }

  function renderPreviousJuntas(state) {
    const archive = getArchiveForDisplay();

    if (!archive.length) return "";

    return `
      <section style="margin-top:24px">
        <div class="mj-section-title">
          <h2>Juntas anteriores</h2>
          <span>Guardadas por ahora</span>
        </div>

        <div>
          ${archive.map(renderArchiveCard).join("")}
        </div>
      </section>
    `;
  }

  function renderMainStructure() {
    if (sharedMode) return;

    const state = getState();
    if (!state) return;

    archiveCompletedJuntas(state);
    restoreVisibleJuntas(state);

    const grid = $("#juntasGrid");
    if (!grid) return;

    const juntas = (state.juntas || []).filter(
      junta => !isKnownTestJunta(junta) &&
        !isJuntaSuppressed(junta.id)
    );

    if (!juntas.length) {
      grid.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
          Todavía no tienes una Junta activa.
        </div>
      `;
    }

    const kellyExisting = $("#mjKellyCard");

    if (!kellyExisting && grid.parentElement) {
      // Kelly se inserta inmediatamente después de juntas.
      const existingKelly = document.querySelector(".mj-kelly-card");
      if (existingKelly) existingKelly.remove();
    }

    const archiveTarget = document.querySelector(
      "[data-mj-previous-juntas]"
    );

    if (archiveTarget) {
      archiveTarget.innerHTML =
        renderPreviousJuntas(state);
    }
  }

  function renderPreviousSection() {
    if (sharedMode) return;

    const state = getState();
    if (!state) return;

    let container = document.querySelector(
      "[data-mj-previous-juntas]"
    );

    if (!container) {
      container = document.createElement("section");
      container.setAttribute(
        "data-mj-previous-juntas",
        "true"
      );
      container.style.marginTop = "24px";

      const lowerGrid =
        document.querySelector(".lower-grid");

      const shell =
        document.querySelector(".shell");

      if (lowerGrid && lowerGrid.parentNode) {
        lowerGrid.parentNode.insertBefore(
          container,
          lowerGrid
        );
      } else if (shell) {
        shell.appendChild(container);
      }
    }

    container.innerHTML =
      renderPreviousJuntas(state);
  }

  function renderKellySection() {
    if (sharedMode) return;

    const state = getState();
    if (!state) return;

    let container = document.querySelector(
      "[data-mj-kelly-section]"
    );

    if (!container) {
      container = document.createElement("div");
      container.setAttribute(
        "data-mj-kelly-section",
        "true"
      );

      const lowerGrid =
        document.querySelector(".lower-grid");

      const shell =
        document.querySelector(".shell");

      if (lowerGrid && lowerGrid.parentNode) {
        lowerGrid.parentNode.insertBefore(
          container,
          lowerGrid
        );
      } else if (shell) {
        shell.appendChild(container);
      }
    }

    const card = renderKellyCard(state);

    container.innerHTML = card;
  }

  function addAnimations() {
    if ($("#mj-extra-animations")) return;

    const style = document.createElement("style");
    style.id = "mj-extra-animations";
    style.textContent = `
      .mj-history-row{
        transition:
          transform .2s ease,
          box-shadow .2s ease;
      }

      .mj-history-row:active{
        transform:scale(.98);
      }

      .mj-delete-btn:active{
        transform:scale(.97);
      }

      .mj-detail-shell{
        animation:mjDetailIn .32s ease both;
      }

      @keyframes mjDetailIn{
        from{
          opacity:0;
          transform:translateY(12px);
        }
        to{
          opacity:1;
          transform:none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function getCurrentVisibleJuntasSignature(state) {
    return JSON.stringify(
      (state?.juntas || [])
        .filter(j => !isKnownTestJunta(j))
        .map(j => ({
          id:j.id,
          name:j.name,
          goal:j.goal,
          paid:getJuntaPaid(j),
          payments:(j.payments || []).map(p => ({
            id:p.id,
            amount:p.amount,
            date:p.date
          }))
        }))
    );
  }

  function starsAnimation(key = "") {
    if (lastStarSignature === key) return;
    lastStarSignature = key;

    const layer = document.createElement("div");
    layer.style.position = "fixed";
    layer.style.inset = "0";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "100";
    layer.setAttribute("aria-hidden", "true");

    const stars = ["✦","✧","★","⋆","✿","❀"];

    for (let i = 0; i < 14; i++) {
      const star = document.createElement("span");
      star.textContent = stars[i % stars.length];

      const x = 15 + Math.random() * 70;
      const y = 25 + Math.random() * 45;

      star.style.position = "absolute";
      star.style.left = `${x}%`;
      star.style.top = `${y}%`;
      star.style.fontSize = `${12 + Math.random() * 16}px`;
      star.style.opacity = "0";
      star.style.transform = "scale(.4)";
      star.style.transition =
        "opacity .35s ease, transform .7s ease";
      star.style.color = "var(--pink)";

      layer.appendChild(star);

      setTimeout(() => {
        star.style.opacity = ".9";
        star.style.transform =
          `scale(1) rotate(${Math.random() * 30 - 15}deg)`;
      }, 40 + i * 25);

      setTimeout(() => {
        star.style.opacity = "0";
        star.style.transform =
          `translateY(-20px) scale(.55)`;
      }, 550 + i * 24);
    }

    document.body.appendChild(layer);

    setTimeout(() => layer.remove(), 1200);
  }

  function maybeCelebrateSaved() {
    if (!lastSaved) return;

    const signature =
      `${lastSaved.type}:${lastSaved.parentId || ""}:${lastSaved.paymentId || ""}`;

    starsAnimation(signature);

    setTimeout(() => {
      lastSaved = null;
    }, 1100);
  }

  function getMainCardButtons(card) {
    return {
      history: card.querySelector("[data-mj-history-type]"),
      share: card.querySelector("[data-mj-share-type]")
    };
  }

  function enhanceJuntaCards() {
    if (sharedMode) return;

    const state = getState();
    if (!state) return;

    const cards = $$("#juntasGrid .card");

    cards.forEach(card => {
      if (card.dataset.mjEnhanced === "1") return;

      const text =
        card.textContent
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

      const junta = (state.juntas || []).find(
        item =>
          item?.name &&
          text.includes(String(item.name).toLowerCase())
      );

      if (!junta) return;

      card.dataset.mjEnhanced = "1";

      const actionArea =
        card.querySelector(".card-actions");

      if (!actionArea) return;

      const historyButton =
        document.createElement("button");

      historyButton.type = "button";
      historyButton.className = "secondary";
      historyButton.dataset.mjHistoryType = "junta";
      historyButton.dataset.mjHistoryParent =
        String(junta.id || "");
      historyButton.textContent = "📖 Historial";

      const shareButton =
        document.createElement("button");

      shareButton.type = "button";
      shareButton.className = "secondary mj-share-btn";
      shareButton.dataset.mjShareType = "junta";
      shareButton.dataset.mjShareId =
        String(junta.id || "");
      shareButton.textContent = "↗ Compartir";

      actionArea.appendChild(historyButton);
      actionArea.appendChild(shareButton);
    });
  }

  function enhanceMain() {
    if (structuring) return;

    const state = getState();
    if (!state) return;

    structuring = true;

    try {
      injectExtraStyles();
      addAnimations();

      archiveCompletedJuntas(state);
      restoreVisibleJuntas(state);

      enhanceJuntaCards();
      renderKellySection();
      renderPreviousSection();

      const signature =
        getCurrentVisibleJuntasSignature(state);

      if (signature !== lastSignature) {
        lastSignature = signature;
      }

      maybeCelebrateSaved();
    } finally {
      structuring = false;
    }
  }

  function setSharedShell() {
    document.documentElement.classList.add("mj-shared");
    document.body.dataset.sharedMode = "true";

    const topbar = $(".topbar");
    if (topbar) {
      topbar.style.display = "none";
    }

    const lowerGrid = $(".lower-grid");
    if (lowerGrid) {
      lowerGrid.style.display = "none";
    }

    const welcome = $(".welcome");
    if (welcome) {
      welcome.style.display = "none";
    }

    const settings = $("#settingsBtn");
    if (settings) {
      settings.style.display = "none";
    }

    const quickGrid = $(".quick-grid");
    if (quickGrid) {
      quickGrid.style.display = "none";
    }
  }

  function renderSharedHistoryRows(type) {
    if (!sharedPayload) return "";

    const payments = Array.isArray(
      sharedPayload.payments
    )
      ? sharedPayload.payments
      : [];

    return payments.length
      ? payments.map(payment =>
          createHistoryRow(
            type,
            sharedPayload.junta?.id || "",
            payment
          )
        ).join("")
      : `
          <div class="mj-empty-history">
            Todavía no hay movimientos.
          </div>
        `;
  }

  function renderSharedView() {
    if (!sharedMode || !sharedPayload) return;
    if (renderingShared) return;

    renderingShared = true;

    try {
      const main = document.querySelector("main.shell");
      if (!main) return;

      const type = sharedPayload.type;
      const data =
        sharedPayload.junta ||
        sharedPayload.kelly ||
        null;

      if (!data) {
        main.innerHTML = `
          <section class="card">
            <h2>No hay datos para mostrar.</h2>
            <p class="muted">El enlace compartido no contiene información.</p>
          </section>
        `;
        return;
      }

      const payments = Array.isArray(
        sharedPayload.payments
      )
        ? sharedPayload.payments
        : [];

      const original =
        type === "kelly"
          ? Number(data.original || 2800)
          : Number(data.goal || 0);

      const paid =
        type === "kelly"
          ? payments.reduce(
              (sum, p) =>
                sum + Number(p.amount || 0),
              0
            )
          : payments.reduce(
              (sum, p) =>
                sum + Number(p.amount || 0),
              0
            );

      const balance =
        type === "kelly"
          ? Math.max(0, original - paid)
          : Math.max(0, original - paid);

      const percent =
        original > 0
          ? Math.min(
              100,
              Math.round((paid / original) * 100)
            )
          : 0;

      main.innerHTML = `
        <section class="card" style="max-width:720px;margin:auto">
          <div class="card-head">
            <div class="title-line">
              <span class="symbol">
                ${type === "kelly" ? "💗" : "🌸"}
              </span>

              <div>
                <h2>${esc(
                  data.name ||
                  (type === "kelly"
                    ? "Kelly"
                    : "Junta")
                )}</h2>

                <div class="sub">
                  Solo lectura
                </div>
              </div>
            </div>
          </div>

          <div class="money">
            ${money(balance)}
            <small>
              ${type === "kelly"
                ? "pendiente"
                : "por completar"}
            </small>
          </div>

          <div class="stats">
            <span class="pill">
              Total: ${money(original)}
            </span>

            <span class="pill">
              Pagado: ${money(paid)}
            </span>

            <span class="pill">
              ${payments.length}
              ${payments.length === 1
                ? "movimiento"
                : "movimientos"}
            </span>
          </div>

          <div class="progress-row">
            <div class="progress-meta">
              <span>Progreso</span>
              <strong>${percent}%</strong>
            </div>

            <div class="progress">
              <span style="width:${percent}%"></span>
            </div>
          </div>

          <div class="mj-history-wrap">
            <h3>Movimientos</h3>

            <div style="margin-top:10px">
              ${renderSharedHistoryRows(type)}
            </div>
          </div>
        </section>
      `;

      document.documentElement.classList.add(
        "mj-shared-history"
      );
    } finally {
      renderingShared = false;
    }
  }

  async function initializeSharedMode(token) {
    try {
      const result = await apiShareRead(token);

      sharedMode = true;
      sharedPayload = result.data;

      setSharedShell();
      renderSharedView();

    } catch (error) {
      console.error(
        "No se pudo abrir el enlace compartido:",
        error
      );

      const main = document.querySelector("main.shell");

      if (main) {
        main.innerHTML = `
          <section class="card">
            <h2>No se pudo abrir el enlace</h2>
            <p class="muted">
              ${esc(
                error instanceof Error
                  ? error.message
                  : "Error desconocido."
              )}
            </p>
          </section>
        `;
      }
    }
  }

  async function shareRecord(type, id = "") {
    try {
      const result = await apiShareCreate(type, id);

      const copied = await copyText(result.url);

      openModal(`
        <div class="mj-confirm-shell">
          <div class="mj-confirm-icon">↗</div>

          <h2>Enlace listo</h2>

          <p class="intro">
            Este enlace es de solo lectura.
            ${type === "junta"
              ? "Solo mostrará esta Junta y sus movimientos."
              : "Solo mostrará Kelly y sus pagos."}
          </p>

          <div
            class="field"
            style="margin-top:12px"
          >
            <input
              value="${esc(result.url)}"
              readonly
              onclick="this.select()"
            >
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="primary"
              data-mj-copy-share="${esc(result.url)}"
            >
              ${copied ? "✓ Copiado" : "Copiar enlace"}
            </button>

            <button
              type="button"
              class="secondary"
              data-mj-close-share="true"
            >
              Cerrar
            </button>
          </div>
        </div>
      `);

    } catch (error) {
      console.error(
        "Error compartiendo:",
        error
      );

      toast(
        error instanceof Error
          ? error.message
          : "No se pudo crear el enlace."
      );
    }
  }

  function openRegisterKelly() {
    const state = getState();

    if (!state?.kelly) {
      toast("No se encontró Kelly.");
      return;
    }

    const original =
      getKellyOriginal(state);

    const paid =
      getKellyPaid(state);

    const balance =
      Math.max(0, original - paid);

    if (balance <= 0) {
      toast("Kelly ya está totalmente pagado.");
      return;
    }

    const form =
      document.querySelector(
        '[data-mj-kelly-form="true"]'
      );

    if (form) {
      form.scrollIntoView({
        behavior:"smooth",
        block:"center"
      });
      return;
    }

    // Fallback: usamos el botón original de Kelly.
    const originalButton =
      $("#kellyBtn");

    if (originalButton) {
      originalButton.click();
      return;
    }

    toast("No se pudo abrir el registro de Kelly.");
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

    gridObserver.observe(
      grid,
      {
        childList:true,
        subtree:false
      }
    );

    setTimeout(() => {
      if (!sharedMode) {
        enhanceMain();
      }
    }, 50);
  }

  function addSharedModeRoutingGuard() {
    if (!getShareToken()) return;

    const bodyObserver =
      new MutationObserver(() => {
        if (!sharedMode) return;
        setSharedShell();
      });

    bodyObserver.observe(
      document.body,
      {
        childList:true,
        subtree:true
      }
    );
  }

  function delegateClicks(event) {
    const target =
      event.target instanceof Element
        ? event.target
        : event.target?.parentElement;

    if (!target) return;

    // ============================================================
    // HISTORIAL DE JUNTA / KELLY
    // ============================================================

    const historyButton =
      target.closest("[data-mj-history-type]");

    if (historyButton && !historyButton.closest(".mj-history-row")) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const type =
        historyButton.dataset.mjHistoryType || "junta";

      const parentId =
        historyButton.dataset.mjHistoryParent || "";

      openHistory(type, parentId);
      return;
    }

    // ============================================================
    // REGISTRAR KELLY
    // ============================================================

    const registerKelly =
      target.closest("[data-mj-kelly-register]");

    if (registerKelly && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openRegisterKelly();
      return;
    }

    // ============================================================
    // COMPARTIR
    // ============================================================

    const shareButton =
      target.closest("[data-mj-share-type]");

    if (shareButton && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const type =
        shareButton.dataset.mjShareType || "junta";

      const id =
        shareButton.dataset.mjShareId ||
        shareButton.dataset.mjShareParent ||
        "";

      shareRecord(type, id);
      return;
    }

    const copyShare =
      target.closest("[data-mj-copy-share]");

    if (copyShare) {
      event.preventDefault();
      event.stopImmediatePropagation();

      copyText(
        copyShare.dataset.mjCopyShare || ""
      ).then(() => {
        copyShare.textContent = "✓ Copiado";
      });

      return;
    }

    const closeShare =
      target.closest("[data-mj-close-share]");

    if (closeShare) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
      return;
    }

    // ============================================================
    // ABRIR DETALLE
    // ============================================================

    const detail =
      target.closest("[data-mj-detail-type]");

    if (detail) {
      event.preventDefault();
      event.stopImmediatePropagation();

      openDetail(
        detail.dataset.mjDetailType || "kelly",
        detail.dataset.mjDetailParent || "",
        detail.dataset.mjDetailId || ""
      );

      return;
    }

    // ============================================================
    // VOLVER DEL DETALLE
    // ============================================================

    const backHistory =
      target.closest("[data-mj-back-history]");

    if (backHistory) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (sharedMode) {
        closeModal();
      } else if (currentDetailContext) {
        openHistory(
          currentDetailContext.type,
          currentDetailContext.parentId || ""
        );
      }

      return;
    }

    // ============================================================
    // CERRAR HISTORIAL
    // ============================================================

    const closeHistory =
      target.closest("[data-mj-close-history]");

    if (closeHistory) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
      return;
    }

    // ============================================================
    // ELIMINAR MOVIMIENTO
    // ============================================================

    const deletePayment =
      target.closest("[data-mj-delete-payment]");

    if (deletePayment && !sharedMode) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const ctx = currentDetailContext;

      if (
        !ctx ||
        !ctx.paymentId ||
        !["kelly", "junta"].includes(ctx.type)
      ) {
        toast("No se pudo identificar el movimiento.");
        return;
      }

      const payment = findPayment(
        ctx.type,
        ctx.parentId || "",
        ctx.paymentId
      );

      if (!payment) {
        toast("Ese movimiento ya no existe.");
        return;
      }

      const label =
        ctx.type === "junta"
          ? "aporte de la Junta"
          : "pago de Kelly";

      openModal(`
        <div class="mj-confirm-shell">
          <div class="mj-confirm-icon">🗑️</div>

          <h2>¿Eliminar este movimiento?</h2>

          <p class="intro">
            Vas a eliminar el ${label}
            de <b>${money(payment.amount)}</b>.
            Esta acción no se puede deshacer.
          </p>

          ${
            payment.receiptUrl ||
            payment.receipt_url ||
            payment.receiptData
              ? `
                <div class="mj-confirm-note">
                  También se eliminará el comprobante asociado.
                </div>
              `
              : ""
          }

          <div class="form-actions mj-confirm-actions">
            <button
              class="secondary"
              type="button"
              data-mj-cancel-delete="true"
            >
              Cancelar
            </button>

            <button
              class="mj-danger-btn mj-danger-confirm"
              type="button"
              data-mj-confirm-delete-payment="true"
            >
              Sí, eliminar
            </button>
          </div>
        </div>
      `);

      return;
    }

    // ============================================================
    // CANCELAR BORRADO
    // ============================================================

    const cancelDelete =
      target.closest("[data-mj-cancel-delete]");

    if (cancelDelete) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const ctx =
        currentDetailContext;

      if (ctx?.paymentId) {
        openDetail(
          ctx.type,
          ctx.parentId || "",
          ctx.paymentId
        );
      } else {
        closeModal();
      }

      return;
    }

    // ============================================================
    // CONFIRMAR BORRADO
    // ============================================================

    const confirmDeletePayment =
      target.closest(
        "[data-mj-confirm-delete-payment]"
      );

    if (
      confirmDeletePayment &&
      !sharedMode
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const ctx =
        currentDetailContext;

      if (
        !ctx ||
        !ctx.paymentId ||
        !["kelly", "junta"].includes(ctx.type)
      ) {
        toast("No se pudo identificar el movimiento.");
        return;
      }

      const state = getState();

      const paymentId =
        ctx.paymentId;

      const endpoint =
        ctx.type === "junta"
          ? "/api/delete-junta-payment"
          : "/api/delete-kelly-payment";

      // ========================================================
      // IMPORTANTE:
      // Recuperamos el pago aquí mismo.
      // No usamos ninguna variable "payment" de otro bloque.
      // ========================================================

      const payment = findPayment(
        ctx.type,
        ctx.parentId || "",
        ctx.paymentId
      );

      if (!payment) {
        toast(
          "Ese movimiento ya no existe en la copia local."
        );
        return;
      }

      confirmDeletePayment.disabled = true;
      confirmDeletePayment.textContent =
        "Eliminando…";

      try {
        const payload = {
          paymentId,

          amount:
            Number(payment.amount || 0),

          date:
            payment.date || "",

          method:
            payment.method || "",

          note:
            payment.note || "",

          receiptUrl:
            payment.receiptUrl ||
            payment.receipt_url ||
            ""
        };

        if (ctx.type === "junta") {
          payload.juntaId =
            ctx.parentId || "";
        }

        const response =
          await fetch(
            endpoint,
            {
              method:"POST",
              headers:{
                "Content-Type":
                  "application/json",

                Accept:
                  "application/json"
              },
              body:
                JSON.stringify(payload)
            }
          );

        const data =
          await response
            .json()
            .catch(() => null);

        if (
          !response.ok ||
          !data?.ok
        ) {
          throw new Error(
            data?.error ||
            "No se pudo eliminar el movimiento."
          );
        }

        // ========================================================
        // ACTUALIZAR EL ESTADO EN MEMORIA
        // ========================================================

        if (
          ctx.type === "kelly"
        ) {
          if (state?.kelly) {
            if (
              Array.isArray(
                data?.kelly?.payments
              )
            ) {
              state.kelly.payments =
                data.kelly.payments.map(
                  item => ({
                    id:item.id,
                    amount:
                      Number(item.amount || 0),
                    date:
                      item.date || "",
                    method:
                      item.method || "",
                    note:
                      item.note || "",
                    receiptUrl:
                      item.receipt_url ||
                      item.receiptUrl ||
                      ""
                  })
                );
            } else {
              state.kelly.payments =
                state.kelly.payments.filter(
                  item =>
                    String(item.id) !==
                    String(paymentId)
                );
            }

            if (
              data?.kelly?.original !==
              undefined
            ) {
              state.kelly.original =
                Number(
                  data.kelly.original
                );
            } else {
              state.kelly.original =
                Number(
                  state.kelly.original ||
                  2800
                );
            }
          }
        } else {
          const junta =
            (state?.juntas || []).find(
              j =>
                String(j.id) ===
                String(ctx.parentId)
            );

          if (junta) {
            junta.payments =
              Array.isArray(
                junta.payments
              )
                ? junta.payments.filter(
                    item =>
                      String(item.id) !==
                      String(paymentId)
                  )
                : [];
          }

          const archive =
            getCompletedArchive();

          const archiveIndex =
            archive.findIndex(
              item =>
                String(item.id) ===
                String(ctx.parentId)
            );

          if (archiveIndex >= 0) {
            archive[
              archiveIndex
            ].payments =
              Array.isArray(
                archive[
                  archiveIndex
                ].payments
              )
                ? archive[
                    archiveIndex
                  ].payments.filter(
                    item =>
                      String(item.id) !==
                      String(paymentId)
                  )
                : [];

            writeJsonStorage(
              ARCHIVE_KEY,
              archive
            );
          }
        }

        // ========================================================
        // ACTUALIZAR LOCALSTORAGE
        // ========================================================

        try {
          const raw =
            localStorage.getItem(
              "miJuntita.v2"
            );

          if (raw) {
            const localState =
              JSON.parse(raw);

            if (
              ctx.type === "kelly" &&
              localState?.kelly
            ) {
              if (
                Array.isArray(
                  data?.kelly?.payments
                )
              ) {
                localState.kelly.payments =
                  data.kelly.payments;
              } else {
                localState.kelly.payments =
                  Array.isArray(
                    localState.kelly.payments
                  )
                    ? localState.kelly.payments.filter(
                        item =>
                          String(item.id) !==
                          String(paymentId)
                      )
                    : [];
              }

              localState.kelly.original =
                Number(
                  data?.kelly?.original ??
                  localState.kelly.original ??
                  2800
                );
            }

            if (
              ctx.type === "junta" &&
              Array.isArray(
                localState?.juntas
              )
            ) {
              const localJunta =
                localState.juntas.find(
                  j =>
                    String(j.id) ===
                    String(ctx.parentId)
                );

              if (localJunta) {
                localJunta.payments =
                  Array.isArray(
                    localJunta.payments
                  )
                    ? localJunta.payments.filter(
                        item =>
                          String(item.id) !==
                          String(paymentId)
                      )
                    : [];
              }
            }

            localStorage.setItem(
              "miJuntita.v2",
              JSON.stringify(
                localState
              )
            );
          }
        } catch (storageError) {
          console.warn(
            "No se pudo actualizar la copia local:",
            storageError
          );
        }

        // ========================================================
        // LIMPIAR CONTEXTO Y ACTUALIZAR
        // ========================================================

        currentDetailContext = null;

        closeModal();

        toast(
          ctx.type === "junta"
            ? "Aporte eliminado correctamente."
            : "Pago eliminado correctamente."
        );

        setTimeout(() => {
          window.location.reload();
        }, 450);

      } catch (error) {
        console.error(
          "Error eliminando movimiento:",
          error
        );

        confirmDeletePayment.disabled =
          false;

        confirmDeletePayment.textContent =
          "Sí, eliminar";

        toast(
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el movimiento."
        );
      }

      return;
    }

    // ============================================================
    // VER COMPROBANTE GRANDE
    // ============================================================

    const largeReceipt =
      target.closest(
        "[data-mj-large-receipt]"
      );

    if (largeReceipt) {
      event.preventDefault();
      event.stopImmediatePropagation();

      openLargeReceipt(
        largeReceipt.dataset
          .mjLargeReceipt || ""
      );

      return;
    }

    // ============================================================
    // VOLVER DE FOTO
    // ============================================================

    const photoBack =
      target.closest(
        "[data-mj-photo-back]"
      );

    if (photoBack) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const currentDetail =
        document.querySelector(
          ".mj-detail-shell"
        );

      if (currentDetail) {
        const ctx =
          currentDetailContext;

        if (ctx) {
          openDetail(
            ctx.type,
            ctx.parentId || "",
            ctx.paymentId || ""
          );
        } else {
          closeModal();
        }
      }

      return;
    }
  }

  function addEvents() {
    document.addEventListener(
      "click",
      delegateClicks,
      true
    );

    $("#modalClose")?.addEventListener(
      "click",
      () => {
        document.documentElement.classList.remove(
          "mj-shared-history",
          "mj-detail-open"
        );
      },
      true
    );
  }

  async function init() {
    addEvents();

    const token =
      getShareToken();

    if (token) {
      await initializeSharedMode(token);
      startObservers();
      addSharedModeRoutingGuard();
      return;
    }

    injectExtraStyles();
    addAnimations();
    startObservers();
    addSharedModeRoutingGuard();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once:true }
    );
  } else {
    init();
  }
})();
