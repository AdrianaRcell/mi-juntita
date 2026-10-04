(() => {
  "use strict";

  const KEY = "miJuntita.v2";

  const PHRASES = [
    "Ahorrar hoy, respirar mañana ♡",
    "Poquito a poquito, sí se puede ✦",
    "Cada aporte cuenta ♡",
    "Lo pequeño también construye sueños.",
    "Guarda un poco hoy para disfrutar después."
  ];

  const CELEBRATIONS = [
    ["🌸","✦","🌷","♡","✨"],
    ["💗","💌","✦","✨","♡"],
    ["🪙","💫","✦","🌿","💸"],
    ["🍃","🌟","🌸","✦","♡"]
  ];

  const $ = s => document.querySelector(s);

  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[c]));

  const today = () => new Date().toISOString().slice(0,10);

  const money = n =>
    `S/ ${Number(n || 0).toLocaleString("es-PE",{
      minimumFractionDigits:2,
      maximumFractionDigits:2
    })}`;

  const uid = p =>
    `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;


  // ============================================================
  // ESTADO INICIAL
  // ============================================================

  function initialState(){
    return {
      theme: "light",
      phraseIndex: 0,

      juntas: [{
        id:"junta_default",
        name:"Junta",
        goal:3000,
        normal:250,
        modality:"quincenal",
        variable:true,
        payments:[{
          id:uid("pay"),
          amount:300,
          date:today(),
          method:"",
          note:"Aporte inicial",
          receiptData:""
        }]
      }],

      kelly:{
        original:2800,
        payments:[]
      },

      expenses:[],

      tasks:[
        {
          id:uid("task"),
          text:"Registrar la junta",
          done:false
        },
        {
          id:uid("task"),
          text:"Revisar pagos",
          done:false
        },
        {
          id:uid("task"),
          text:"Guardar comprobantes",
          done:false
        }
      ],

      lastKellyReminder:null
    };
  }


  // ============================================================
  // ESTADO + API
  // ============================================================

  let state = load();
  let modalContext = null;


  // ------------------------------------------------------------
  // OBTENER JUNTAS DESDE NEON
  // ------------------------------------------------------------

  async function apiGetJuntas(){
    try{
      const response = await fetch("/api/juntas");

      const data = await response.json();

      if(!data.ok){
        throw new Error(
          data.error || "No se pudieron cargar las juntas"
        );
      }

      return data.juntas || [];

    }catch(error){
      console.error("Error cargando juntas:", error);
      return null;
    }
  }


  // ------------------------------------------------------------
  // CREAR JUNTA EN NEON
  // ------------------------------------------------------------

  async function apiCreateJunta(junta){
    try{
      const response = await fetch("/api/juntas",{
        method:"POST",

        headers:{
          "Content-Type":"application/json"
        },

        body:JSON.stringify({
          id:junta.id,
          name:junta.name,
          goal:junta.goal,
          normal:junta.normal,
          modality:junta.modality,
          variable:junta.variable
        })
      });

      const data = await response.json();

      if(!data.ok){
        throw new Error(
          data.error || "No se pudo crear la junta"
        );
      }

      return data.junta;

    }catch(error){
      console.error("Error creando junta:", error);

      toast("No se pudo guardar la junta en la nube.");

      return null;
    }
  }


  // ============================================================
  // LOCAL STORAGE
  // ============================================================

  function load(){
    try{
      const raw = localStorage.getItem(KEY);

      if(!raw){
        return initialState();
      }

      const parsed = JSON.parse(raw);
      const fresh = initialState();

      return {
        ...fresh,
        ...parsed,

        juntas:
          Array.isArray(parsed.juntas) && parsed.juntas.length
            ? parsed.juntas
            : fresh.juntas,

        kelly:{
          ...fresh.kelly,
          ...(parsed.kelly || {})
        },

        expenses:
          Array.isArray(parsed.expenses)
            ? parsed.expenses
            : [],

        tasks:
          Array.isArray(parsed.tasks)
            ? parsed.tasks
            : fresh.tasks
      };

    }catch(e){
      return initialState();
    }
  }


  function save(){
    localStorage.setItem(
      KEY,
      JSON.stringify(state)
    );
  }


  // ============================================================
  // INICIO
  // ============================================================

  function init(){
    applyTheme();
    render();
    bindStatic();
    rotatePhrase(false);
    maybeKellyReminder();
  }


  // ============================================================
  // EVENTOS PRINCIPALES
  // ============================================================

  function bindStatic(){

    $("#themeBtn").addEventListener(
      "click",
      toggleTheme
    );

    $("#notifyBtn").addEventListener(
      "click",
      showNotifications
    );

    $("#shareBtn").addEventListener(
      "click",
      openShareMenu
    );

    $("#newJuntaBtn").addEventListener(
      "click",
      openNewJunta
    );

    $("#kellyBtn").addEventListener(
      "click",
      openKellyPayment
    );

    $("#gastoBtn").addEventListener(
      "click",
      openExpense
    );

    $("#settingsBtn").addEventListener(
      "click",
      openSettings
    );

    $("#modalClose").addEventListener(
      "click",
      closeModal
    );

    $("#modalBackdrop").addEventListener(
      "click",
      e => {
        if(e.target === $("#modalBackdrop")){
          closeModal();
        }
      }
    );

    document.addEventListener(
      "click",
      e => {
        const img = e.target.closest(
          "[data-receipt-view]"
        );

        if(img){
          openReceipt(
            img.dataset.receiptView
          );
        }
      }
    );
  }


  // ============================================================
  // TEMA
  // ============================================================

  function applyTheme(){
    document.documentElement.classList.toggle(
      "dark",
      state.theme === "dark"
    );

    $("#themeBtn").textContent =
      state.theme === "dark"
        ? "☀"
        : "☾";
  }


  function toggleTheme(){
    state.theme =
      state.theme === "dark"
        ? "light"
        : "dark";

    save();
    applyTheme();
  }


  // ============================================================
  // FRASES
  // ============================================================

  function rotatePhrase(animate=true){

    const el = $("#savingPhrase");

    if(!el) return;

    if(animate){
      el.classList.add("phrase-swap");
    }

    setTimeout(() => {

      state.phraseIndex =
        (state.phraseIndex + 1) %
        PHRASES.length;

      el.textContent =
        PHRASES[state.phraseIndex];

      if(animate){
        requestAnimationFrame(() =>
          el.classList.remove("phrase-swap")
        );
      }

      save();

    }, animate ? 180 : 0);
  }


  // ============================================================
  // RENDER GENERAL
  // ============================================================

  function render(){

    renderJuntas();
    renderExpenses();
    renderTasks();

    const phrase =
      $("#savingPhrase");

    if(phrase){
      phrase.textContent =
        PHRASES[
          state.phraseIndex %
          PHRASES.length
        ];
    }

    $("#decor").innerHTML = `
      <span
        class="decor-item"
        style="left:8%;top:22%;font-size:20px"
      >✦</span>

      <span
        class="decor-item"
        style="left:88%;top:34%;font-size:18px;animation-delay:1s"
      >🌸</span>

      <span
        class="decor-item"
        style="left:74%;top:78%;font-size:17px;animation-delay:2s"
      >🍃</span>
    `;
  }


  // ============================================================
  // JUNTAS
  // ============================================================

  function renderJuntas(){

    $("#juntasGrid").innerHTML =
      state.juntas.map((j, idx) => {

        const paid =
          j.payments.reduce(
            (s,p) =>
              s + Number(p.amount || 0),
            0
          );

        const pct =
          j.goal
            ? Math.min(
                100,
                (paid / j.goal) * 100
              )
            : 0;

        const equivalent =
          j.normal
            ? paid / j.normal
            : 0;

        const receipts =
          j.payments.filter(
            p => p.receiptData
          );

        const complete =
          paid >= j.goal;

        return `
        <article
          class="card ${
            idx === state.juntas.length - 1 &&
            state.juntas.length > 1
              ? "new-card"
              : ""
          }"
          data-junta-card="${esc(j.id)}"
        >

          <div class="card-head">

            <div>

              <div class="title-line">

                <span class="symbol">🌸</span>

                <h2>
                  ${esc(j.name)}
                </h2>

              </div>

              <div class="sub">
                ${esc(j.modality || "Aporte")}
                ·
                ${
                  j.variable
                    ? "aportes variables"
                    : "aporte fijo"
                }
              </div>

            </div>

            <button
              class="more"
              data-junta-history="${esc(j.id)}"
              title="Ver historial"
            >⋯</button>

          </div>

          <div class="money">
            ${money(paid)}
            <small>acumulado</small>
          </div>

          <div class="stats">

            <span class="pill">
              ${equivalent.toFixed(1)}
              /
              ${(j.goal/(j.normal||1)).toFixed(0)}
              cuotas aprox.
            </span>

            <span class="pill">
              Meta ${money(j.goal)}
            </span>

            <span class="pill">
              ${receipts.length} 📷
            </span>

          </div>

          <div class="progress-row">

            <div class="progress-meta">
              <span>Progreso</span>
              <b>${pct.toFixed(0)}%</b>
            </div>

            <div
              class="progress"
              id="progress-${esc(j.id)}"
            >
              <span
                style="width:${pct}%"
              ></span>
            </div>

          </div>

          ${
            complete
              ? `
                <div class="complete-banner">
                  ✨ ¡Junta completada!
                  Qué bonito ver cómo poquito
                  a poquito llegó a la meta.
                </div>
              `
              : ""
          }

          <div class="card-actions">

            <button
              class="primary junta-btn"
              data-add-junta="${esc(j.id)}"
            >
              🌸 Registrar junta
            </button>

            <button
              class="secondary"
              data-share-junta="${esc(j.id)}"
            >
              ↗ Compartir
            </button>

          </div>

        </article>
        `;
      }).join("");


    document
      .querySelectorAll("[data-add-junta]")
      .forEach(b =>
        b.addEventListener(
          "click",
          () =>
            openJuntaPayment(
              b.dataset.addJunta
            )
        )
      );


    document
      .querySelectorAll("[data-share-junta]")
      .forEach(b =>
        b.addEventListener(
          "click",
          () =>
            openReadOnlyShare(
              "junta",
              b.dataset.shareJunta
            )
        )
      );


    document
      .querySelectorAll("[data-junta-history]")
      .forEach(b =>
        b.addEventListener(
          "click",
          () =>
            openJuntaHistory(
              b.dataset.juntaHistory
            )
        )
      );
  }


  // ============================================================
  // GASTOS
  // ============================================================

  function renderExpenses(){

    const total =
      state.expenses.reduce(
        (s,e) =>
          s + Number(e.amount || 0),
        0
      );

    $("#expensesPanel").innerHTML = `

      <div class="panel-head">
        <h3>🪙 Gastos hormiga</h3>
        <span class="tiny">
          ${state.expenses.length} recientes
        </span>
      </div>

      <div class="expense-total">
        ${money(total)}
      </div>

      <div class="list">

        ${
          state.expenses
            .slice(-5)
            .reverse()
            .map(e => `
              <div class="list-row">

                <div class="left">
                  <b>
                    ${esc(
                      e.note ||
                      "Gasto rápido"
                    )}
                  </b>

                  <small>
                    ${esc(e.date)}
                  </small>
                </div>

                <strong>
                  ${money(e.amount)}
                </strong>

              </div>
            `)
            .join("")
          ||
          `
            <div class="empty">
              Todavía no hay gastos rápidos ♡
            </div>
          `
        }

      </div>
    `;
  }


  // ============================================================
  // TAREAS
  // ============================================================

  function renderTasks(){

    $("#tasksPanel").innerHTML = `

      <div class="panel-head">

        <h3>🌷 Pendientes</h3>

        <button
          class="add-task"
          id="addTaskBtn"
        >
          ＋ agregar
        </button>

      </div>

      <div style="margin-top:10px">

        ${
          state.tasks.map(t => `

            <div
              class="task ${t.done ? "done" : ""}"
              data-task="${esc(t.id)}"
            >

              <button
                class="check"
                data-check-task="${esc(t.id)}"
              >
                ${t.done ? "✓" : ""}
              </button>

              <span>
                ${esc(t.text)}
              </span>

            </div>

          `).join("")
          ||
          `
            <div class="empty">
              Nada pendiente por ahora ✨
            </div>
          `
        }

      </div>
    `;


    $("#addTaskBtn")
      .addEventListener(
        "click",
        addTask
      );


    document
      .querySelectorAll("[data-check-task]")
      .forEach(b =>
        b.addEventListener(
          "click",
          () =>
            completeTask(
              b.dataset.checkTask
            )
        )
      );
  }


  // ============================================================
  // MODALES
  // ============================================================

  function openModal(
    html,
    context=null
  ){

    modalContext = context;

    $("#modalContent").innerHTML =
      html;

    $("#modalBackdrop").hidden =
      false;

    requestAnimationFrame(() =>
      $(
        "#modalContent input, #modalContent select, #modalContent textarea"
      )?.focus()
    );
  }


  function closeModal(){

    $("#modalBackdrop").hidden =
      true;

    modalContext = null;
  }


  // ============================================================
  // COMPROBANTES
  // ============================================================

  function fileToDataURL(file){

    return new Promise(
      (resolve,reject) => {

        if(!file){
          return resolve("");
        }

        const reader =
          new FileReader();

        reader.onload = () =>
          resolve(reader.result);

        reader.onerror =
          reject;

        reader.readAsDataURL(file);
      }
    );
  }


  function receiptField(required=true){

    return `
      <div class="field full">

        <label>
          Comprobante
          ${
            required
              ? '<span class="required">*</span>'
              : ""
          }
        </label>

        <div
          class="file-box"
          id="receiptBox"
        >

          <input
            id="receiptFile"
            type="file"
            accept="image/*"
            ${required ? "required" : ""}
          >

          <div class="hint">
            La foto queda vinculada
            específicamente a este pago.
          </div>

          <img
            class="receipt-preview"
            id="receiptPreview"
            alt="Vista previa del comprobante"
          >

          <div
            class="file-required-error"
            id="receiptError"
          >
            Necesitas adjuntar el comprobante
            para guardar este pago.
          </div>

        </div>

      </div>
    `;
  }


  function bindReceiptPreview(){

    const input =
      $("#receiptFile");

    if(!input) return;

    input.addEventListener(
      "change",
      e => {

        const file =
          e.target.files?.[0];

        const img =
          $("#receiptPreview");

        if(file){

          img.src =
            URL.createObjectURL(file);

          img.classList.add("show");

          $("#receiptBox")
            .classList
            .remove("invalid");

          $("#receiptError")
            .style.display =
            "none";
        }
      }
    );
  }


  // ============================================================
  // REGISTRAR APORTE DE JUNTA
  // ============================================================

  function openJuntaPayment(juntaId){

    const j =
      state.juntas.find(
        x => x.id === juntaId
      );

    if(!j) return;

    openModal(`

      <h2>🌸 Registrar aporte</h2>

      <p class="intro">
        ${esc(j.name)}
        · cada aporte puede tener
        un monto diferente.
      </p>

      <div class="form-grid">

        <div class="field">
          <label>
            Monto
            <span class="required">*</span>
          </label>

          <input
            id="amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="250"
          >
        </div>

        <div class="field">

          <label>
            Fecha
            <span class="required">*</span>
          </label>

          <input
            id="date"
            type="date"
            value="${today()}"
          >

        </div>

        <div class="field">

          <label>
            Método de pago
          </label>

          <select id="method">
            <option value="">
              Seleccionar
            </option>
            <option>Yape</option>
            <option>Plin</option>
            <option>Transferencia</option>
            <option>Efectivo</option>
            <option>Otro</option>
          </select>

        </div>

        <div class="field">

          <label>
            Nota opcional
          </label>

          <input
            id="note"
            placeholder="Aporte de quincena"
          >

        </div>

        ${receiptField(true)}

      </div>

      <div class="form-actions">

        <button
          class="secondary"
          id="cancelForm"
        >
          Cancelar
        </button>

        <button
          class="primary"
          id="saveJuntaPayment"
        >
          Guardar aporte ✦
        </button>

      </div>

    `,{
      type:"juntaPayment",
      juntaId
    });

    bindReceiptPreview();

    $("#cancelForm").onclick =
      closeModal;

    $("#saveJuntaPayment").onclick =
      saveJuntaPayment;
  }


  async function saveJuntaPayment(){

    const amount =
      Number($("#amount").value);

    const file =
      $("#receiptFile")
        ?.files?.[0];

    if(!amount || amount <= 0){
      return toast(
        "Escribe un monto válido."
      );
    }

    if(!file){

      $("#receiptBox")
        .classList
        .add("invalid");

      $("#receiptError")
        .style.display =
        "block";

      return;
    }

    const data =
      await fileToDataURL(file);

    const j =
      state.juntas.find(
        x =>
          x.id ===
          modalContext.juntaId
      );

    const before =
      j.payments.reduce(
        (s,p) =>
          s + Number(p.amount || 0),
        0
      );

    const after =
      before + amount;

    j.payments.push({

      id:uid("pay"),

      amount,

      date:
        $("#date").value ||
        today(),

      method:
        $("#method").value,

      note:
        $("#note").value.trim(),

      receiptData:data
    });

    save();

    closeModal();

    render();

    animatePayment(j.id);

    if(
      before < j.goal &&
      after >= j.goal
    ){
      celebrate();
    }

    toast(
      `Aporte de ${money(amount)} guardado ♡`
    );
  }


  // ============================================================
  // ANIMACIÓN APORTE
  // ============================================================

  function animatePayment(juntaId){

    const card =
      document.querySelector(
        `[data-junta-card="${CSS.escape(juntaId)}"]`
      );

    if(!card) return;

    card.classList.remove(
      "payment-pop"
    );

    requestAnimationFrame(() =>
      card.classList.add(
        "payment-pop"
      )
    );

    const bar =
      card.querySelector(
        ".progress"
      );

    bar?.classList.add(
      "payment-glow"
    );

    setTimeout(
      () =>
        bar?.classList.remove(
          "payment-glow"
        ),
      1200
    );

    const symbols =
      ["✦","🌸","♡","🍃","✨"];

    for(let i=0;i<7;i++){

      const p =
        document.createElement(
          "span"
        );

      p.className =
        "payment-spark";

      p.textContent =
        symbols[
          Math.floor(
            Math.random() *
            symbols.length
          )
        ];

      p.style.left =
        (30 + Math.random()*45) +
        "%";

      p.style.top =
        (55 + Math.random()*20) +
        "%";

      p.style.setProperty(
        "--dx",
        `${(Math.random()-.5)*100}px`
      );

      p.style.setProperty(
        "--dy",
        `${-30-Math.random()*70}px`
      );

      p.style.setProperty(
        "--rot",
        `${(Math.random()-.5)*80}deg`
      );

      card.appendChild(p);

      setTimeout(
        () => p.remove(),
        950
      );
    }
  }


  // ============================================================
  // CELEBRACIÓN
  // ============================================================

  function celebrate(){

    const layer =
      $("#celebrationLayer");

    const set =
      CELEBRATIONS[
        Math.floor(
          Math.random() *
          CELEBRATIONS.length
        )
      ];

    for(let i=0;i<22;i++){

      const p =
        document.createElement(
          "span"
        );

      p.className =
        "celebrate-piece";

      p.textContent =
        set[
          Math.floor(
            Math.random() *
            set.length
          )
        ];

      p.style.setProperty(
        "--x",
        `${(Math.random()-.5)*70}vw`
      );

      p.style.setProperty(
        "--y",
        `${(Math.random()-.5)*55}vh`
      );

      p.style.setProperty(
        "--scale",
        `${.7+Math.random()*1.1}`
      );

      p.style.setProperty(
        "--rot",
        `${(Math.random()-.5)*360}deg`
      );

      p.style.setProperty(
        "--duration",
        `${.9+Math.random()*.8}s`
      );

      layer.appendChild(p);

      setTimeout(
        () => p.remove(),
        1900
      );
    }
  }


  // ============================================================
  // KELLY
  // ============================================================

  function openKellyPayment(){

    openModal(`

      <h2>💗 Registrar pago a Kelly</h2>

      <p class="intro">
        Sin plazo fijo. Cada pago queda
        guardado con su comprobante.
      </p>

      <div class="form-grid">

        <div class="field">

          <label>
            Monto
            <span class="required">*</span>
          </label>

          <input
            id="amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="200"
          >

        </div>

        <div class="field">

          <label>
            Fecha
            <span class="required">*</span>
          </label>

          <input
            id="date"
            type="date"
            value="${today()}"
          >

        </div>

        <div class="field">

          <label>
            Método de pago
          </label>

          <select id="method">
            <option value="">
              Seleccionar
            </option>
            <option>Yape</option>
            <option>Plin</option>
            <option>Transferencia</option>
            <option>Efectivo</option>
            <option>Otro</option>
          </select>

        </div>

        <div class="field">

          <label>
            Nota opcional
          </label>

          <input
            id="note"
            placeholder="Pago parcial"
          >

        </div>

        ${receiptField(true)}

      </div>

      <div class="form-actions">

        <button
          class="secondary"
          id="cancelForm"
        >
          Cancelar
        </button>

        <button
          class="primary"
          id="saveKellyPayment"
        >
          Guardar pago 💗
        </button>

      </div>

    `,{
      type:"kellyPayment"
    });

    bindReceiptPreview();

    $("#cancelForm").onclick =
      closeModal;

    $("#saveKellyPayment").onclick =
      saveKellyPayment;
  }


  async function saveKellyPayment(){

    const amount =
      Number($("#amount").value);

    const file =
      $("#receiptFile")
        ?.files?.[0];

    if(!amount || amount <= 0){
      return toast(
        "Escribe un monto válido."
      );
    }

    if(!file){

      $("#receiptBox")
        .classList
        .add("invalid");

      $("#receiptError")
        .style.display =
        "block";

      return;
    }

    const data =
      await fileToDataURL(file);

    state.kelly.payments.push({

      id:uid("kelly"),

      amount,

      date:
        $("#date").value ||
        today(),

      method:
        $("#method").value,

      note:
        $("#note").value.trim(),

      receiptData:data
    });

    save();

    closeModal();

    render();

    toast(
      `Pago de ${money(amount)} registrado para Kelly 💗`
    );

    animateKelly();
  }


  function animateKelly(){

    const btn =
      document.querySelector(
        ".kelly-action .action-icon"
      );

    if(btn){

      btn.animate(
        [
          {
            transform:
              "scale(1)"
          },
          {
            transform:
              "scale(1.22) rotate(-7deg)"
          },
          {
            transform:
              "scale(1)"
          }
        ],
        {
          duration:700,
          easing:
            "cubic-bezier(.2,.8,.2,1)"
        }
      );
    }
  }


  // ============================================================
  // GASTOS
  // ============================================================

  function openExpense(){

    openModal(`

      <h2>🪙 Gasto rápido</h2>

      <p class="intro">
        Solo lo esencial. Sin comprobante.
      </p>

      <div class="form-grid">

        <div class="field">

          <label>
            Monto
            <span class="required">*</span>
          </label>

          <input
            id="amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="8"
          >

        </div>

        <div class="field">

          <label>
            Fecha
          </label>

          <input
            id="date"
            type="date"
            value="${today()}"
          >

        </div>

        <div class="field full">

          <label>
            Nota
          </label>

          <input
            id="note"
            placeholder="Café"
          >

        </div>

      </div>

      <div class="form-actions">

        <button
          class="secondary"
          id="cancelForm"
        >
          Cancelar
        </button>

        <button
          class="primary"
          id="saveExpense"
        >
          Guardar gasto 🪙
        </button>

      </div>

    `);

    $("#cancelForm").onclick =
      closeModal;

    $("#saveExpense").onclick = () => {

      const amount =
        Number($("#amount").value);

      if(!amount || amount <= 0){
        return toast(
          "Escribe un monto válido."
        );
      }

      state.expenses.push({

        id:uid("exp"),

        amount,

        date:
          $("#date").value ||
          today(),

        note:
          $("#note").value.trim()
      });

      save();

      closeModal();

      render();

      toast(
        "Gasto guardado ✦"
      );

      randomExpenseAnimation();
    };
  }


  function randomExpenseAnimation(){

    const icon =
      document.querySelector(
        ".gasto-action .action-icon"
      );

    if(!icon) return;

    const effects =
      ["🪙","✦","🍃","✨","💸"];

    icon.textContent =
      effects[
        Math.floor(
          Math.random() *
          effects.length
        )
      ];

    icon.animate(
      [
        {
          transform:
            "translateY(0) rotate(0)"
        },
        {
          transform:
            "translateY(-5px) rotate(12deg) scale(1.15)"
        },
        {
          transform:
            "translateY(0) rotate(0) scale(1)"
        }
      ],
      {
        duration:650,
        easing:"ease-out"
      }
    );

    setTimeout(
      () =>
        icon.textContent="🪙",
      900
    );
  }


  // ============================================================
  // TAREAS
  // ============================================================

  function addTask(){

    const text =
      prompt(
        "¿Qué pendiente quieres agregar?"
      );

    if(!text?.trim()) return;

    state.tasks.push({
      id:uid("task"),
      text:text.trim(),
      done:false
    });

    save();

    renderTasks();

    toast(
      "Pendiente agregado ♡"
    );
  }


  function completeTask(id){

    const t =
      state.tasks.find(
        x => x.id === id
      );

    if(!t || t.done) return;

    t.done = true;

    save();

    const row =
      document.querySelector(
        `[data-task="${CSS.escape(id)}"]`
      );

    row
      ?.querySelector(".check")
      ?.animate(
        [
          {
            transform:"scale(1)"
          },
          {
            transform:"scale(1.25)"
          },
          {
            transform:"scale(1)"
          }
        ],
        {
          duration:320
        }
      );

    setTimeout(() => {

      state.tasks =
        state.tasks.filter(
          x => x.id !== id
        );

      save();

      renderTasks();

    },580);
  }


  // ============================================================
  // HISTORIAL
  // ============================================================

  function openJuntaHistory(id){

    const j =
      state.juntas.find(
        x => x.id === id
      );

    if(!j) return;

    openModal(`

      <h2>
        🌸 Historial ·
        ${esc(j.name)}
      </h2>

      <p class="intro">
        Todos los aportes y sus comprobantes.
      </p>

      <div class="history">

        ${
          j.payments
            .slice()
            .reverse()
            .map(p => `

              <div class="history-row">

                <div>

                  <b>
                    ${money(p.amount)}
                  </b>

                  <br>

                  <small>
                    ${esc(p.date)}
                    ${
                      p.note
                        ? ` · ${esc(p.note)}`
                        : ""
                    }
                  </small>

                </div>

                ${
                  p.receiptData
                    ? `
                      <button
                        class="secondary"
                        data-receipt-view="${esc(p.receiptData)}"
                      >
                        📷 Ver
                      </button>
                    `
                    : ""
                }

              </div>

            `)
            .join("")
        }

      </div>
    `);
  }


  // ============================================================
  // VER COMPROBANTE
  // ============================================================

  function openReceipt(src){

    openModal(`
      <h2>📷 Comprobante</h2>

      <img
        class="photo-modal-preview"
        src="${esc(src)}"
        alt="Comprobante"
      >
    `);
  }


  // ============================================================
  // COMPARTIR
  // ============================================================

  function openShareMenu(){

    openModal(`

      <h2>
        ↗ Compartir visualización
      </h2>

      <p class="intro">
        Elige qué quieres mostrar.
        Los gastos hormiga quedan siempre fuera.
      </p>

      <div class="share-options">

        <button
          class="share-option"
          id="shareJuntaChoose"
        >

          <span>🌸</span>

          <b>
            Compartir Junta
          </b>

          <small>
            Progreso, historial y comprobantes.
          </small>

        </button>


        <button
          class="share-option"
          id="shareKellyChoose"
        >

          <span>💗</span>

          <b>
            Compartir Kelly
          </b>

          <small>
            Deuda, pagos, saldo y comprobantes.
          </small>

        </button>

      </div>
    `);


    $("#shareJuntaChoose").onclick = () => {

      const id =
        state.juntas[0]?.id;

      if(id){
        openReadOnlyShare(
          "junta",
          id
        );
      }
    };


    $("#shareKellyChoose").onclick =
      () =>
        openReadOnlyShare(
          "kelly"
        );
  }


  function openReadOnlyShare(
    type,
    id
  ){

    if(type === "junta"){

      const j =
        state.juntas.find(
          x => x.id === id
        );

      if(!j) return;

      const paid =
        j.payments.reduce(
          (s,p) =>
            s + Number(p.amount || 0),
          0
        );

      const pct =
        j.goal
          ? Math.min(
              100,
              paid / j.goal * 100
            )
          : 0;

      const receipts =
        j.payments
          .filter(
            p => p.receiptData
          )
          .map(
            p => p.receiptData
          );

      const token =
        btoa(
          unescape(
            encodeURIComponent(
              JSON.stringify({
                t:"junta",
                id:j.id
              })
            )
          )
        )
        .replace(/=+$/,"")
        .slice(0,36);


      openModal(`

        <h2>
          🌸 Compartir Junta
        </h2>

        <p class="intro">
          Vista preparada como solo lectura.
        </p>

        <div class="readonly-box">

          <b>
            ${esc(j.name)}
          </b>

          <br>

          ${money(paid)}
          de
          ${money(j.goal)}
          ·
          ${pct.toFixed(0)}%

        </div>


        ${
          receipts.length
            ? `
              <div class="readonly-receipts">

                ${
                  receipts
                    .map(r => `

                      <img
                        data-receipt-view="${esc(r)}"
                        src="${esc(r)}"
                        alt="Comprobante"
                      >

                    `)
                    .join("")
                }

              </div>
            `
            : `
              <div class="empty">
                Todavía no hay comprobantes.
              </div>
            `
        }


        <div class="share-link-box">

          <input
            readonly
            value="${esc(
              location.origin +
              location.pathname +
              "#share=" +
              token
            )}"
          >

          <button
            class="primary"
            id="copyShare"
          >
            Copiar enlace ↗
          </button>

        </div>

      `);


      $("#copyShare").onclick =
        () =>
          copyShareLink(
            type,
            id,
            token
          );

    }else{

      const paid =
        state.kelly.payments.reduce(
          (s,p) =>
            s + Number(p.amount || 0),
          0
        );

      const balance =
        Math.max(
          0,
          state.kelly.original - paid
        );

      const receipts =
        state.kelly.payments
          .filter(
            p => p.receiptData
          )
          .map(
            p => p.receiptData
          );

      const token =
        btoa(
          unescape(
            encodeURIComponent(
              JSON.stringify({
                t:"kelly"
              })
            )
          )
        )
        .replace(/=+$/,"")
        .slice(0,36);


      openModal(`

        <h2>
          💗 Compartir Kelly
        </h2>

        <p class="intro">
          Sin plazo fijo · vista preparada
          como solo lectura.
        </p>

        <div class="readonly-box">

          <b>Deuda original:</b>
          ${money(state.kelly.original)}

          <br>

          <b>Pagado:</b>
          ${money(paid)}

          <br>

          <b>Saldo:</b>
          ${money(balance)}

        </div>


        ${
          receipts.length
            ? `
              <div class="readonly-receipts">

                ${
                  receipts
                    .map(r => `

                      <img
                        data-receipt-view="${esc(r)}"
                        src="${esc(r)}"
                        alt="Comprobante"
                      >

                    `)
                    .join("")
                }

              </div>
            `
            : `
              <div class="empty">
                Todavía no hay comprobantes.
              </div>
            `
        }


        <div class="share-link-box">

          <input
            readonly
            value="${esc(
              location.origin +
              location.pathname +
              "#share=" +
              token
            )}"
          >

          <button
            class="primary"
            id="copyShare"
          >
            Copiar enlace ↗
          </button>

        </div>

      `);


      $("#copyShare").onclick =
        () =>
          copyShareLink(
            type,
            id,
            token
          );
    }
  }


  async function copyShareLink(){

    const input =
      document.querySelector(
        ".share-link-box input"
      );

    try{

      await navigator.clipboard
        .writeText(
          input.value
        );

      toast(
        "Enlace copiado ↗"
      );

    }catch(e){

      input.select();

      document.execCommand(
        "copy"
      );

      toast(
        "Enlace copiado ↗"
      );
    }
  }


  // ============================================================
  // NOTIFICACIONES
  // ============================================================

  function openNotifications(){

    const paid =
      state.kelly.payments.reduce(
        (s,p) =>
          s + Number(p.amount || 0),
        0
      );

    const balance =
      Math.max(
        0,
        state.kelly.original - paid
      );

    openModal(`

      <h2>
        🔔 Recordatorios
      </h2>

      <p class="intro">
        Pequeños avisos para que no
        se te pase nada.
      </p>

      <div class="list">

        <div class="list-row">

          <div class="left">

            <b>
              Kelly
            </b>

            <small>
              ${
                balance
                  ? `Saldo actual ${money(balance)}`
                  : "Deuda completada ♡"
              }
            </small>

          </div>

          <span>
            💗
          </span>

        </div>


        <div class="list-row">

          <div class="left">

            <b>
              Juntas
            </b>

            <small>
              Revisa tus aportes
              y comprobantes.
            </small>

          </div>

          <span>
            🌸
          </span>

        </div>

      </div>


      <div class="kelly-reminder">

        <strong>
          Recordatorio mensual:
        </strong>

        Kelly no tiene fecha límite.
        Mi Juntita te avisará al menos
        una vez al mes para que recuerdes
        revisar si corresponde hacer un pago.

      </div>

    `);


    $("#notifyBtn")
      .classList
      .remove("has-notif");

    $("#notifDot")
      .style.display =
      "none";
  }


  function showNotifications(){
    openNotifications();
  }


  function maybeKellyReminder(){

    const now =
      new Date();

    const monthKey =
      `${now.getFullYear()}-${now.getMonth()+1}`;

    if(
      state.lastKellyReminder !== monthKey &&
      state.kelly.original >
        state.kelly.payments.reduce(
          (s,p) =>
            s + Number(p.amount || 0),
          0
        )
    ){

      state.lastKellyReminder =
        monthKey;

      save();

      setTimeout(() => {

        $("#notifyBtn")
          .classList
          .add("has-notif");

        toast(
          "🔔 Recuerda revisar si corresponde hacer un pago a Kelly."
        );

      },1200);
    }
  }


  // ============================================================
  // NUEVA JUNTA — AHORA CON NEON
  // ============================================================

  function openNewJunta(){

    openModal(`

      <h2>
        🌸 Nueva Junta
      </h2>

      <p class="intro">
        Crea otra meta sin complicarla.
      </p>

      <div class="form-grid">

        <div class="field full">

          <label>
            Nombre
            <span class="required">*</span>
          </label>

          <input
            id="name"
            placeholder="Junta Navidad"
          >

        </div>


        <div class="field">

          <label>
            Meta total
            <span class="required">*</span>
          </label>

          <input
            id="goal"
            type="number"
            min="1"
            placeholder="3000"
          >

        </div>


        <div class="field">

          <label>
            Aporte normal
          </label>

          <input
            id="normal"
            type="number"
            min="0"
            placeholder="250"
          >

        </div>


        <div class="field">

          <label>
            Modalidad
          </label>

          <select id="modality">

            <option>
              semanal
            </option>

            <option>
              quincenal
            </option>

            <option>
              mensual
            </option>

            <option>
              variable
            </option>

            <option>
              otra
            </option>

          </select>

        </div>


        <div class="field">

          <label>
            ¿Puede variar?
          </label>

          <select id="variable">

            <option value="yes">
              Sí
            </option>

            <option value="no">
              No
            </option>

          </select>

        </div>

      </div>


      <div class="form-actions">

        <button
          class="secondary"
          id="cancelForm"
        >
          Cancelar
        </button>

        <button
          class="primary"
          id="createJunta"
        >
          Crear Junta 🌸
        </button>

      </div>

    `);


    $("#cancelForm").onclick =
      closeModal;


    $("#createJunta").onclick =
      async () => {

        const name =
          $("#name")
            .value
            .trim();

        const goal =
          Number(
            $("#goal").value
          );


        if(!name || !goal){

          return toast(
            "Completa el nombre y la meta."
          );
        }


        const junta = {

          id:uid("junta"),

          name,

          goal,

          normal:
            Number(
              $("#normal").value
            ) || 0,

          modality:
            $("#modality").value,

          variable:
            $("#variable").value === "yes",

          payments:[]
        };


        // Primero intentamos guardarla
        // en Neon.

        const savedJunta =
          await apiCreateJunta(
            junta
          );


        // Si Neon falla, NO la agregamos
        // localmente para evitar que parezca
        // guardada cuando realmente no lo está.

        if(!savedJunta){
          return;
        }


        // Si Neon respondió correctamente,
        // también la guardamos localmente.

        state.juntas.push(
          junta
        );

        save();

        closeModal();

        render();

        toast(
          "Nueva Junta guardada 🌸"
        );
      };
  }


  // ============================================================
  // CONFIGURACIÓN
  // ============================================================

  function openSettings(){

    openModal(`

      <h2>
        ⚙️ Configuración
      </h2>

      <p class="intro">
        Por ahora estamos preparando
        la base local. La nube vendrá después.
      </p>

      <div class="list">

        <div class="list-row">

          <div class="left">

            <b>
              Modo
            </b>

            <small>
              ${
                state.theme === "dark"
                  ? "Oscuro"
                  : "Claro"
              }
            </small>

          </div>

          <button
            class="secondary"
            id="settingsTheme"
          >
            Cambiar
          </button>

        </div>


        <div class="list-row">

          <div class="left">

            <b>
              Datos
            </b>

            <small>
              Guardados en este navegador.
            </small>

          </div>

          <button
            class="secondary"
            id="exportData"
          >
            Exportar
          </button>

        </div>

      </div>

    `);


    $("#settingsTheme").onclick =
      () => {

        closeModal();

        toggleTheme();
      };


    $("#exportData").onclick =
      () => {

        const blob =
          new Blob(
            [
              JSON.stringify(
                state,
                null,
                2
              )
            ],
            {
              type:
                "application/json"
            }
          );

        const a =
          document.createElement(
            "a"
          );

        a.href =
          URL.createObjectURL(
            blob
          );

        a.download =
          "mi-juntita-respaldo.json";

        a.click();

        toast(
          "Respaldo descargado ♡"
        );
      };
  }


  // ============================================================
  // TOAST
  // ============================================================

  function toast(msg){

    const wrap =
      $("#toastWrap");

    const el =
      document.createElement(
        "div"
      );

    el.className =
      "toast";

    el.textContent =
      msg;

    wrap.appendChild(el);

    setTimeout(
      () => el.remove(),
      3000
    );
  }


  // ============================================================
  // FRASE AUTOMÁTICA
  // ============================================================

  setTimeout(
    () =>
      rotatePhrase(true),
    5000
  );


  // ============================================================
  // DEBUG
  // ============================================================

  window.MiJuntita = {
    state,
    save,
    render
  };


  // ============================================================
  // ARRANCAR APP
  // ============================================================

  init();

})();
