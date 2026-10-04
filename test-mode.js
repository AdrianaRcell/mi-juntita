(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const hash = location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hash);
  const testValue = params.get("test") || hashParams.get("test");
  const enabled = testValue === "1" || testValue === "true";

  if (!enabled) return;

  window.MiJuntitaTestMode = true;
  document.documentElement.classList.add("mj-test-mode");

  const REAL_KEY = "miJuntita.v2";
  const TEST_KEY = "miJuntita.test.v2";

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  function isLocal(storage) {
    try { return storage === window.localStorage; } catch { return false; }
  }

  function testState() {
    return {
      theme: "light",
      phraseIndex: 0,
      juntas: [{
        id: "junta_test",
        name: "Junta Test",
        goal: 300,
        normal: 250,
        modality: "quincenal",
        variable: true,
        payments: []
      }],
      kelly: {
        original: 2800,
        payments: []
      },
      expenses: [],
      tasks: [
        { id: "task_test_1", text: "Probar un aporte", done: false },
        { id: "task_test_2", text: "Probar historial", done: false }
      ],
      lastKellyReminder: null,
      migrations: {}
    };
  }

  try {
    if (!originalGetItem.call(window.localStorage, TEST_KEY)) {
      originalSetItem.call(
        window.localStorage,
        TEST_KEY,
        JSON.stringify(testState())
      );
    }
  } catch (error) {
    console.warn("Mi Juntita: no se pudo preparar el estado de prueba.", error);
  }

  Storage.prototype.getItem = function(key) {
    if (isLocal(this) && key === REAL_KEY) {
      return originalGetItem.call(this, TEST_KEY);
    }
    return originalGetItem.call(this, key);
  };

  Storage.prototype.setItem = function(key, value) {
    if (isLocal(this) && key === REAL_KEY) {
      return originalSetItem.call(this, TEST_KEY, value);
    }
    return originalSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function(key) {
    if (isLocal(this) && key === REAL_KEY) {
      return originalRemoveItem.call(this, TEST_KEY);
    }
    return originalRemoveItem.call(this, key);
  };

  const realFetch = window.fetch.bind(window);

  function response(payload, status = 200) {
    return new Response(
      JSON.stringify(payload),
      {
        status,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  function getTestState() {
    try {
      const raw = originalGetItem.call(window.localStorage, TEST_KEY);
      return raw ? JSON.parse(raw) : testState();
    } catch {
      return testState();
    }
  }

  function saveTestState(value) {
    originalSetItem.call(
      window.localStorage,
      TEST_KEY,
      JSON.stringify(value)
    );
  }

  function dummyReceipt() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
        <rect width="900" height="1200" fill="#fff8fc"/>
        <rect x="70" y="80" width="760" height="1040" rx="42" fill="#f7dce9"/>
        <text x="450" y="500" text-anchor="middle" font-family="Arial" font-size="52" fill="#7d6074">COMPROBANTE</text>
        <text x="450" y="575" text-anchor="middle" font-family="Arial" font-size="42" fill="#7d6074">DE PRUEBA</text>
        <text x="450" y="675" text-anchor="middle" font-family="Arial" font-size="28" fill="#9b8393">Modo test · no se guardó en la nube</text>
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  window.fetch = async function(input, init = {}) {
    const url = new URL(
      typeof input === "string" ? input : input.url,
      location.origin
    );
    const method = String(init.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();

    if (!url.pathname.startsWith("/api/")) {
      return realFetch(input, init);
    }

    const state = getTestState();

    if (url.pathname === "/api/juntas" && method === "GET") {
      return response({
        ok: true,
        juntas: (state.juntas || []).map(j => ({
          id: j.id,
          name: j.name,
          goal: j.goal,
          normal: j.normal,
          modality: j.modality,
          variable: j.variable
        }))
      });
    }

    if (url.pathname === "/api/junta-payments" && method === "GET") {
      const juntaId = url.searchParams.get("junta_id") || "";
      const junta = (state.juntas || []).find(j => j.id === juntaId);
      return response({
        ok: true,
        payments: (junta?.payments || []).map(p => ({
          id: p.id,
          junta_id: juntaId,
          amount: p.amount,
          payment_date: p.date,
          method: p.method || "",
          note: p.note || "",
          receipt_url: p.receiptUrl || ""
        }))
      });
    }

    if (url.pathname === "/api/junta-payments" && method === "POST") {
      const body = JSON.parse(init.body || "{}");
      const payment = {
        id: body.id,
        junta_id: body.junta_id,
        amount: Number(body.amount || 0),
        payment_date: body.payment_date || "",
        method: body.method || "",
        note: body.note || "",
        receipt_url: body.receipt_url || dummyReceipt()
      };
      return response({ ok: true, payment });
    }

    if (url.pathname === "/api/juntas" && method === "POST") {
      const body = JSON.parse(init.body || "{}");
      const current = getTestState();
      if (!(current.juntas || []).some(j => j.id === body.id)) {
        current.juntas.push({ ...body, payments: [] });
        saveTestState(current);
      }
      return response({ ok: true, junta: body });
    }

    if (url.pathname === "/api/kelly" && method === "GET") {
      return response({
        ok: true,
        kelly: { original: Number(state.kelly?.original || 0) }
      });
    }

    if (url.pathname === "/api/kelly" && method === "POST") {
      const body = JSON.parse(init.body || "{}");
      const current = getTestState();
      current.kelly = {
        ...(current.kelly || {}),
        original: Number(body.original || 0)
      };
      saveTestState(current);
      return response({ ok: true, kelly: { original: current.kelly.original } });
    }

    if (url.pathname === "/api/kelly-payments" && method === "GET") {
      return response({
        ok: true,
        payments: (state.kelly?.payments || []).map(p => ({
          id: p.id,
          amount: p.amount,
          payment_date: p.date,
          method: p.method || "",
          note: p.note || "",
          receipt_url: p.receiptUrl || ""
        }))
      });
    }

    if (url.pathname === "/api/kelly-payments" && method === "POST") {
      const body = JSON.parse(init.body || "{}");
      const payment = {
        id: body.id,
        amount: Number(body.amount || 0),
        payment_date: body.payment_date || "",
        method: body.method || "",
        note: body.note || "",
        receipt_url: body.receipt_url || dummyReceipt()
      };
      return response({ ok: true, payment });
    }

    if (url.pathname === "/api/upload-receipt" && method === "POST") {
      let localUrl = dummyReceipt();

      try {
        const body = init?.body;
        const file = body instanceof FormData ? body.get("file") : null;

        if (file && typeof FileReader !== "undefined") {
          localUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || dummyReceipt()));
            reader.onerror = () => resolve(dummyReceipt());
            reader.readAsDataURL(file);
          });
        }
      } catch {
        localUrl = dummyReceipt();
      }

      return response({
        ok: true,
        url: localUrl,
        pathname: "test/comprobante-local",
        contentType: "local"
      });
    }

    if (url.pathname === "/api/share") {
      return response({
        ok: false,
        error: "El modo de prueba no crea enlaces públicos."
      }, 400);
    }

    return response({ ok: true });
  };

  const badge = document.createElement("div");
  badge.className = "mj-test-badge";
  badge.textContent = "🧪 MODO PRUEBA · no modifica la nube";
  document.body.appendChild(badge);
})();
