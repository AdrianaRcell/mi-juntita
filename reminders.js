(() => {
  "use strict";

  const KEY = "miJuntita.reminders.v1";
  const $ = s => document.querySelector(s);

  function app() {
    return window.MiJuntita || null;
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      const value = raw ? JSON.parse(raw) : {};
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function write(value) {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch (error) {
      console.warn("Mi Juntita: no se pudieron guardar los recordatorios.", error);
    }
  }

  function activeJunta(state) {
    return (state?.juntas || []).find(j => {
      const name = String(j?.name || "").trim().toLowerCase();
      if (["junta test", "junta de prueba", "junta prueba"].includes(name) && !window.MiJuntitaTestMode) return false;
      const paid = (j.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
      return Number(j.goal || 0) <= 0 || paid < Number(j.goal || 0);
    }) || null;
  }

  function periodInfo(date = new Date()) {
    const day = date.getDate();
    const year = date.getFullYear();
    const month = date.getMonth();

    if (day === 15) {
      return {
        key: `mid-${year}-${String(month + 1).padStart(2, "0")}`,
        label: "la quincena"
      };
    }

    if (day === 1 || day >= 30) {
      const next = new Date(year, month, day >= 30 ? 1 : 1);
      if (day >= 30) next.setMonth(next.getMonth() + 1);
      return {
        key: `start-${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
        label: "el inicio del mes"
      };
    }

    return null;
  }

  function toast(message) {
    const wrap = $("#toastWrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function openReminder(period, junta) {
    const backdrop = $("#modalBackdrop");
    const content = $("#modalContent");
    if (!backdrop || !content) return;

    backdrop.hidden = false;
    content.innerHTML = `
      <div class="mj-reminder-card">
        <div class="mj-reminder-icon">🌸</div>
        <div class="mj-readonly-chip">RECORDATORIO</div>
        <h2>¿Pagaste la Junta?</h2>
        <p class="intro">
          Corresponde revisar tu aporte de ${period.label}.
          ${junta?.name ? `<br><strong>${String(junta.name).replace(/[<>&"']/g, "")}</strong>` : ""}
        </p>

        <div class="mj-reminder-choice-list">
          <button class="mj-reminder-choice mj-reminder-yes" type="button" id="mjReminderYes">
            <span>✓</span>
            <div>
              <b>Sí, ya pagué</b>
              <small>Marca este período como cubierto sin crear otro movimiento.</small>
            </div>
          </button>

          <button class="mj-reminder-choice mj-reminder-no" type="button" id="mjReminderNo">
            <span>🌸</span>
            <div>
              <b>No todavía</b>
              <small>Ir a registrar el aporte correspondiente.</small>
            </div>
          </button>
        </div>
      </div>
    `;

    document.documentElement.classList.add("mj-reminder-open");

    $("#mjReminderYes")?.addEventListener("click", () => {
      const reminders = read();
      reminders[period.key] = { status: "paid", at: Date.now() };
      write(reminders);
      backdrop.hidden = true;
      document.documentElement.classList.remove("mj-reminder-open");
      toast("✓ Listo. No volveremos a recordarte este período.");
    });

    $("#mjReminderNo")?.addEventListener("click", () => {
      const reminders = read();
      reminders[period.key] = { status: "registering", at: Date.now() };
      write(reminders);
      backdrop.hidden = true;
      document.documentElement.classList.remove("mj-reminder-open");

      const button = junta
        ? document.querySelector(`[data-add-junta="${CSS.escape(junta.id)}"]`)
        : null;

      if (button) {
        button.click();
        watchForRegisteredPayment(period.key, junta.id);
      } else {
        toast("Abre tu Junta y registra el aporte correspondiente.");
      }
    });
  }

  function watchForRegisteredPayment(periodKey, juntaId) {
    const state = app()?.state;
    const beforeCount = (state?.juntas || []).find(j => j.id === juntaId)?.payments?.length || 0;
    const started = Date.now();

    const timer = setInterval(() => {
      const current = app()?.state;
      const junta = (current?.juntas || []).find(j => j.id === juntaId);
      const count = junta?.payments?.length || 0;

      if (count > beforeCount) {
        const reminders = read();
        reminders[periodKey] = { status: "paid", at: Date.now(), registered: true };
        write(reminders);
        clearInterval(timer);
        toast("✓ Aporte registrado. Recordatorio completado.");
        return;
      }

      if (Date.now() - started > 45000) {
        clearInterval(timer);
      }
    }, 700);
  }

  function maybeAskReminder() {
    const state = app()?.state;
    const junta = activeJunta(state);
    if (!junta) return;

    const period = periodInfo(new Date());
    if (!period) return;

    const reminders = read();
    if (reminders[period.key]?.status === "paid") return;

    setTimeout(() => {
      const bell = $("#notifyBtn");
      bell?.classList.add("has-notif");
      $("#notifDot")?.style && ($("#notifDot").style.display = "block");
      openReminder(period, junta);
    }, 1200);
  }

  function init() {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (app()?.state) {
        clearInterval(timer);
        setTimeout(maybeAskReminder, 500);
      } else if (attempts > 40) {
        clearInterval(timer);
      }
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
