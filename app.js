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

  const today = () =>
    new Date().toISOString().slice(0,10);

  const money = n =>
    `S/ ${Number(n || 0).toLocaleString("es-PE",{
      minimumFractionDigits:2,
      maximumFractionDigits:2
    })}`;

  const uid = p =>
    `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

  const formatDate = value => {
    const text = String(value || "").trim();

    const match =
      text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if(!match){
      return text || "Sin fecha";
    }

    return `${match[3]}/${match[2]}/${match[1]}`;
  };


  // ============================================================
  // ESTADO DE SINCRONIZACIÓN
  // ============================================================

  let cloudReady = false;
  let cloudSyncFailed = false;


  // ============================================================
  // CARGA INICIAL
  // ============================================================

  function createLoadingScreen(){

    if(document.querySelector("#miJuntitaLoader")){
      return;
    }

    const loader =
      document.createElement("div");

    loader.id =
      "miJuntitaLoader";

    loader.innerHTML = `
      <div class="mj-loader-content">

        <div class="mj-loader-flower">
          🌸
        </div>

        <div class="mj-loader-name">
          Mi Juntita
        </div>

        <div class="mj-loader-text">
          cargando tus datos…
        </div>

      </div>
    `;

    const style =
      document.createElement("style");

    style.id =
      "miJuntitaLoaderStyle";

    style.textContent = `

      #miJuntitaLoader{
        position:fixed;
        inset:0;
        z-index:99999;
        display:flex;
        align-items:center;
        justify-content:center;
        background:rgba(255,250,252,.98);
        opacity:1;
        transition:opacity .28s ease;
      }

      html.dark #miJuntitaLoader{
        background:rgba(25,20,25,.98);
      }

      #miJuntitaLoader.mj-loader-hide{
        opacity:0;
        pointer-events:none;
      }

      .mj-loader-content{
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:7px;
        text-align:center;
      }

      .mj-loader-flower{
        font-size:42px;
        line-height:1;
        animation:
          mjFlowerFloat 1s ease-in-out infinite;
      }

      .mj-loader-name{
        font-size:18px;
        font-weight:700;
        letter-spacing:.2px;
        color:#7f6075;
      }

      .mj-loader-text{
        font-size:12px;
        color:#9b8795;
      }

      @keyframes mjFlowerFloat{
        0%,100%{
          transform:translateY(0) rotate(-3deg) scale(1);
        }

        50%{
          transform:translateY(-5px) rotate(3deg) scale(1.05);
        }
      }

      @media (prefers-reduced-motion:reduce){
        .mj-loader-flower{
          animation:none;
        }
      }
    `;

    document.head.appendChild(style);

    // Se agrega ANTES de renderizar visualmente
    // el estado viejo.
    document.body.appendChild(loader);
  }


  function updateLoadingText(text){

    const el =
      document.querySelector(
        "#miJuntitaLoader .mj-loader-text"
      );

    if(el){
      el.textContent = text;
    }
  }


  function hideLoadingScreen(){

    const loader =
      $("#miJuntitaLoader");

    if(!loader) return;

    loader.classList.add(
      "mj-loader-hide"
    );

    setTimeout(() => {

      loader.remove();

      const style =
        $("#miJuntitaLoaderStyle");

      style?.remove();

    },350);
  }


  // ============================================================
  // ESTADO INICIAL
  // ============================================================

  function initialState(){

    return {

      theme:"light",

      phraseIndex:0,

      juntas:[{
        id:"junta_default",
        name:"Junta",
        goal:4000,
        normal:250,
        modality:"quincenal",
        variable:true,
        payments:[]
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

      lastKellyReminder:null,

      migrations:{}
    };
  }


  let state = load();

  let modalContext = null;


  // ============================================================
  // API — JUNTAS
  // ============================================================

  async function apiGetJuntas(){

    try{

      const response =
        await fetch(
          "/api/juntas",
          {
            cache:"no-store",
            headers:{
              Accept:"application/json"
            }
          }
        );

      const data =
        await response.json();

      if(!response.ok || !data.ok){

        throw new Error(
          data?.error ||
          "No se pudieron cargar las juntas"
        );
      }

      return Array.isArray(data.juntas)
        ? data.juntas
        : [];

    }catch(error){

      console.error(
        "Error cargando juntas:",
        error
      );

      return null;
    }
  }


  async function apiCreateJunta(junta){

    try{

      const response =
        await fetch(
          "/api/juntas",
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json",
              Accept:
                "application/json"
            },

            body:
              JSON.stringify({

                id:
                  String(junta.id),

                name:
                  junta.name,

                goal:
                  junta.goal,

                normal:
                  junta.normal,

                modality:
                  junta.modality,

                variable:
                  junta.variable
              })
          }
        );

      const data =
        await response.json();

      if(!response.ok || !data.ok){

        throw new Error(
          data?.error ||
          "No se pudo guardar la junta"
        );
      }

      return data.junta || null;

    }catch(error){

      console.error(
        "Error guardando junta:",
        error
      );

      toast(
        "No se pudo guardar la junta en la nube."
      );

      return null;
    }
  }


  // ============================================================
  // API — APORTES DE JUNTAS
  // ============================================================

  async function apiGetJuntaPayments(juntaId){

    try{

      const response =
        await fetch(
          `/api/junta-payments?junta_id=${encodeURIComponent(juntaId)}`,
          {
            cache:"no-store",
            headers:{
              Accept:"application/json"
            }
          }
        );

      const data =
        await response.json();

      if(!response.ok || !data.ok){

        throw new Error(
          data?.error ||
          "No se pudieron cargar los aportes"
        );
      }

      return Array.isArray(data.payments)
        ? data.payments
        : [];

    }catch(error){

      console.error(
        "Error cargando aportes:",
        error
      );

      return null;
    }
  }


  async function apiCreateJuntaPayment(payment){

    try{

      const response =
        await fetch(
          "/api/junta-payments",
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json",
              Accept:
                "application/json"
            },

            body:
              JSON.stringify({

                id:
                  String(payment.id),

                junta_id:
                  String(payment.juntaId),

                amount:
                  payment.amount,

                payment_date:
                  payment.date,

                method:
                  payment.method,

                note:
                  payment.note,

                receipt_url:
                  payment.receiptUrl || ""
              })
          }
        );

      const data =
        await response.json();

      if(!response.ok || !data.ok){

        throw new Error(
          data?.error ||
          "No se pudo guardar el aporte"
        );
      }

      return data.payment || null;

    }catch(error){

      console.error(
        "Error guardando aporte:",
        error
      );

      toast(
        "No se pudo guardar el aporte en la nube."
      );

      return null;
    }
  }


  // ============================================================
  // API — KELLY
  // ============================================================

  async function apiGetKelly(){

    try{

      const response =
        await fetch(
          "/api/kelly",
          {
            cache:"no-store",
            headers:{
              Accept:"application/json"
            }
          }
        );

      const data =
        await response.json();

      if(!response.ok || !data.ok){

        throw new Error(
          data?.error ||
          "No se pudo cargar Kelly"
        );
      }

      return data.kelly || null;

    }catch(error){

      console.error(
        "Error cargando Kelly:",
        error
      );

      return null;
    }
  }


  async function apiSaveKelly(kelly){

    try{

      const response =
        await fetch(
          "/api/kelly",
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json",
              Accept:
                "application/json"
            },

            body:
              JSON.stringify({
                original:
                  Number(kelly.original) || 0
              })
          }
        );

      const data =
        await response.json();

      if(!response.ok || !data.ok){

        throw new Error(
          data?.error ||
          "No se pudo guardar Kelly"
        );
      }

      return data.kelly || null;

    }catch(error){

      console.error(
        "Error guardando Kelly:",
        error
      );

      toast(
        "No se pudo guardar Kelly en la nube."
      );

      return null;
    }
  }


  async function apiGetKellyPayments(){

    try{

      const response =
        await fetch(
          "/api/kelly-payments",
          {
            cache:"no-store",
            headers:{
              Accept:"application/json"
            }
          }
        );

      const data =
        await response.json();

      if(!response.ok || !data.ok){

        throw new Error(
          data?.error ||
          "No se pudieron cargar los pagos de Kelly"
        );
      }

      return Array.isArray(data.payments)
        ? data.payments
        : [];

    }catch(error){

      console.error(
        "Error cargando pagos de Kelly:",
        error
      );

      return null;
    }
  }


  async function apiCreateKellyPayment(payment){

    try{

      const response =
        await fetch(
          "/api/kelly-payments",
          {
            method:"POST",

            headers:{
              "Content-Type":
                "application/json",
              Accept:
                "application/json"
            },

            body:
              JSON.stringify({

                id:
                  String(payment.id),

                amount:
                  payment.amount,

                payment_date:
                  payment.date,

                method:
                  payment.method,

                note:
                  payment.note,

                receipt_url:
                  payment.receiptUrl || ""
              })
          }
        );

      const data =
        await response.json();

      if(!response.ok || !data.ok){

        throw new Error(
          data?.error ||
          "No se pudo guardar el pago de Kelly"
        );
      }

      return data.payment || null;

    }catch(error){

      console.error(
        "Error guardando pago de Kelly:",
        error
      );

      toast(
        "No se pudo guardar el pago de Kelly en la nube."
      );

      return null;
    }
  }


  // ============================================================
  // API — VERCEL BLOB / COMPROBANTES
  // ============================================================

  async function uploadReceipt(file){

    if(!file){

      throw new Error(
        "No se recibió ningún comprobante."
      );
    }

    if(
      !file.type ||
      !file.type.startsWith("image/")
    ){

      throw new Error(
        "El comprobante debe ser una imagen."
      );
    }

    if(
      file.size >
      8 * 1024 * 1024
    ){

      throw new Error(
        "El comprobante no puede superar los 8 MB."
      );
    }

    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    const response =
      await fetch(
        "/api/upload-receipt",
        {
          method:"POST",
          body:formData,
          cache:"no-store"
        }
      );

    let data = null;

    try{

      data =
        await response.json();

    }catch{

      throw new Error(
        "Vercel no devolvió una respuesta válida."
      );
    }

    if(
      !response.ok ||
      !data.ok ||
      !data.url
    ){

      throw new Error(
        data?.error ||
        "No se pudo subir el comprobante."
      );
    }

    return data.url;
  }


  // ============================================================
  // SINCRONIZAR JUNTAS
  //
  // IMPORTANTE:
  // NEON ES LA FUENTE OFICIAL.
  //
  // Ya NO:
  // - crea automáticamente Juntas que no existen en Neon;
  // - vuelve a subir pagos locales eliminados;
  // - mezcla datos viejos con los nuevos.
  // ============================================================

  async function syncCloudData(){

    try{

      const cloudJuntas =
        await apiGetJuntas();

      if(cloudJuntas === null){
        return false;
      }

      const freshJuntas = [];

      for(
        const cloudJunta
        of cloudJuntas
      ){

        if(!cloudJunta?.id){
          continue;
        }

        const cloudPayments =
          await apiGetJuntaPayments(
            cloudJunta.id
          );

        if(cloudPayments === null){

          // Si una Junta no pudo cargar sus pagos,
          // abortamos toda la sincronización.
          // Así nunca mostramos un estado parcial.
          return false;
        }

        const payments =
          cloudPayments.map(
            payment => ({

              id:
                String(payment.id),

              amount:
                Number(
                  payment.amount || 0
                ),

              date:
                String(
                  payment.payment_date ||
                  ""
                ).slice(0,10),

              method:
                payment.method || "",

              note:
                payment.note || "",

              receiptUrl:
                payment.receipt_url || "",

              receiptData:""
            })
          );

        freshJuntas.push({

          id:
            String(cloudJunta.id),

          name:
            cloudJunta.name || "Junta",

          goal:
            Number(
              cloudJunta.goal || 0
            ),

          normal:
            Number(
              cloudJunta.normal || 0
            ),

          modality:
            cloudJunta.modality ||
            "quincenal",

          variable:
            Boolean(
              cloudJunta.variable
            ),

          payments
        });
      }

      // ESTA ES LA PARTE IMPORTANTE:
      // reemplazamos TODO el listado local por el
      // listado que realmente existe en Neon.
      //
      // Si una Junta fue eliminada de Neon,
      // desaparece aquí definitivamente.
      state.juntas =
        freshJuntas;

      save();

      console.log(
        "Mi Juntita: Juntas sincronizadas con Neon."
      );

      return true;

    }catch(error){

      console.error(
        "Error sincronizando Juntas con Neon:",
        error
      );

      return false;
    }
  }


  // ============================================================
  // SINCRONIZAR KELLY
  //
  // NEON ES LA FUENTE OFICIAL.
  // Ya NO se vuelven a subir pagos que solo existen localmente.
  // ============================================================

  async function syncKellyCloud(){

    try{

      const cloudKelly =
        await apiGetKelly();

      if(cloudKelly === null){
        return false;
      }

      const cloudPayments =
        await apiGetKellyPayments();

      if(cloudPayments === null){
        return false;
      }

      state.kelly = {

        original:
          Number(
            cloudKelly.original || 0
          ),

        payments:
          cloudPayments.map(
            payment => ({

              id:
                String(payment.id),

              amount:
                Number(
                  payment.amount || 0
                ),

              date:
                String(
                  payment.payment_date ||
                  ""
                ).slice(0,10),

              method:
                payment.method || "",

              note:
                payment.note || "",

              receiptUrl:
                payment.receipt_url || "",

              receiptData:""
            })
          )
      };

      save();

      console.log(
        "Mi Juntita: Kelly sincronizada con Neon."
      );

      return true;

    }catch(error){

      console.error(
        "Error sincronizando Kelly con Neon:",
        error
      );

      return false;
    }
  }


  // ============================================================
  // LOCAL STORAGE
  //
  // Se mantiene para:
  // - tema
  // - frase
  // - gastos
  // - tareas
  // - respaldo local
  //
  // PERO JUNTAS Y KELLY SE REEMPLAZAN POR NEON
  // al iniciar correctamente.
  // ============================================================

  function load(){

    try{

      const raw =
        localStorage.getItem(KEY);

      if(!raw){
        return initialState();
      }

      const parsed =
        JSON.parse(raw);

      const fresh =
        initialState();

      const loaded = {

        ...fresh,

        ...parsed,

        juntas:
          Array.isArray(parsed.juntas) &&
          parsed.juntas.length
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
            : fresh.tasks,

        migrations:{
          ...(fresh.migrations || {}),
          ...(parsed.migrations || {})
        }
      };

      let migrated = false;

      if(
        !loaded.migrations
          .initial300Removed
      ){

        loaded.juntas =
          loaded.juntas.map(j => {

            if(
              j.id === "junta_default"
            ){

              return {

                ...j,

                payments:
                  Array.isArray(j.payments)
                    ? j.payments.filter(
                        p =>
                          !(
                            Number(p.amount) === 300 &&
                            p.note === "Aporte inicial" &&
                            !p.receiptData
                          )
                      )
                    : []
              };
            }

            return j;
          });

        loaded.migrations = {

          ...(loaded.migrations || {}),

          initial300Removed:true
        };

        migrated = true;
      }

      if(migrated){

        localStorage.setItem(
          KEY,
          JSON.stringify(loaded)
        );
      }

      return loaded;

    }catch(e){

      console.error(
        "Error cargando datos:",
        e
      );

      return initialState();
    }
  }


  function save(){

    try{

      localStorage.setItem(
        KEY,
        JSON.stringify(state)
      );

    }catch(error){

      console.error(
        "Error guardando datos locales:",
        error
      );
    }
  }


  // ============================================================
  // RENDER
  // ============================================================

  function render(){

    if(!cloudReady){

      renderJuntasLoading();

    }else{

      renderJuntas();

    }

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

    const decor =
      $("#decor");

    if(decor){

      decor.innerHTML = `

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
  }


  // ============================================================
  // ESTADO DE CARGA PARA LA ZONA FINANCIERA
  // ============================================================

  function renderJuntasLoading(){

    const grid =
      $("#juntasGrid");

    if(!grid) return;

    if(cloudSyncFailed){

      grid.innerHTML = `

        <article class="card">

          <div class="title-line">

            <span class="symbol">
              🌸
            </span>

            <h2>
              No pudimos actualizar tus datos
            </h2>

          </div>

          <p class="sub">
            Mi Juntita no pudo conectarse con
            tus datos en la nube.
          </p>

          <div class="card-actions">

            <button
              class="primary"
              id="retryCloudSync"
              type="button"
            >
              ↻ Reintentar
            </button>

          </div>

        </article>
      `;

      $("#retryCloudSync")
        ?.addEventListener(
          "click",
          retryCloudSync
        );

      return;
    }

    grid.innerHTML = `

      <article
        class="card"
        aria-live="polite"
      >

        <div class="title-line">

          <span class="symbol">
            🌸
          </span>

          <h2>
            Cargando tus datos…
          </h2>

        </div>

        <div class="sub">
          Estamos comprobando tus Juntas
          y pagos actualizados.
        </div>

      </article>
    `;
  }


  async function retryCloudSync(){

    cloudSyncFailed = false;
    cloudReady = false;

    createLoadingScreen();

    updateLoadingText(
      "actualizando tus datos…"
    );

    render();

    const juntasOk =
      await syncCloudData();

    if(!juntasOk){

      cloudSyncFailed = true;
      render();
      updateLoadingText(
        "No pudimos conectar con la nube."
      );
      hideLoadingScreen();
      return;
    }

    updateLoadingText(
      "cargando Kelly…"
    );

    const kellyOk =
      await syncKellyCloud();

    if(!kellyOk){

      cloudSyncFailed = true;
      render();
      updateLoadingText(
        "No pudimos cargar Kelly."
      );
      hideLoadingScreen();
      return;
    }

    cloudReady = true;
    cloudSyncFailed = false;

    render();

    setTimeout(
      () => hideLoadingScreen(),
      60
    );
  }


  // ============================================================
  // JUNTAS
  // ============================================================

  function renderJuntas(){

    const grid =
      $("#juntasGrid");

    if(!grid) return;

    grid.innerHTML =
      state.juntas
        .map((j, idx) => {

          const paid =
            (j.payments || []).reduce(
              (s,p) =>
                s +
                Number(
                  p.amount || 0
                ),
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
            (j.payments || []).filter(
              p =>
                p.receiptUrl ||
                p.receiptData
            );

          const complete =
            paid >= j.goal;

          const quotaTotal =
            j.normal > 0
              ? Math.round(
                  j.goal / j.normal
                )
              : 0;

          return `

          <article
            class="card ${
              idx ===
              state.juntas.length - 1 &&
              state.juntas.length > 1
                ? "new-card"
                : ""
            }"
            data-junta-card="${esc(j.id)}"
          >

            <div class="card-head">

              <div>

                <div class="title-line">

                  <span class="symbol">
                    🌸
                  </span>

                  <h2>
                    ${esc(j.name)}
                  </h2>

                </div>

                <div class="sub">

                  ${esc(
                    j.modality ||
                    "Aporte"
                  )}

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
              >
                ⋯
              </button>

            </div>

            <div class="money">

              ${money(paid)}

              <small>
                acumulado
              </small>

            </div>

            <div class="stats">

              <span class="pill">

                ${equivalent.toFixed(1)}
                /
                ${quotaTotal}
                cuotas aprox.

              </span>

              <span class="pill">

                Meta
                ${money(j.goal)}

              </span>

              <span class="pill">

                ${receipts.length}
                📷

              </span>

            </div>

            <div class="progress-row">

              <div class="progress-meta">

                <span>
                  Progreso
                </span>

                <b>
                  ${pct.toFixed(0)}%
                </b>

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
        })
        .join("");


    document
      .querySelectorAll(
        "[data-add-junta]"
      )
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
      .querySelectorAll(
        "[data-share-junta]"
      )
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
      .querySelectorAll(
        "[data-junta-history]"
      )
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

    const panel =
      $("#expensesPanel");

    if(!panel) return;

    const total =
      state.expenses.reduce(
        (s,e) =>
          s +
          Number(
            e.amount || 0
          ),
        0
      );

    panel.innerHTML = `

      <div class="panel-head">

        <h3>
          🪙 Gastos hormiga
        </h3>

        <span class="tiny">

          ${state.expenses.length}
          recientes

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

              Todavía no hay
              gastos rápidos ♡

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

    const panel =
      $("#tasksPanel");

    if(!panel) return;

    panel.innerHTML = `

      <div class="panel-head">

        <h3>
          🌷 Pendientes
        </h3>

        <button
          class="add-task"
          id="addTaskBtn"
        >
          ＋ agregar
        </button>

      </div>

      <div style="margin-top:10px">

        ${
          state.tasks
            .map(t => `

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

            `)
            .join("")

          ||

          `
            <div class="empty">

              Nada pendiente
              por ahora ✨

            </div>
          `
        }

      </div>
    `;

    $("#addTaskBtn")
      ?.addEventListener(
        "click",
        addTask
      );

    document
      .querySelectorAll(
        "[data-check-task]"
      )
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

    modalContext =
      context;

    $("#modalContent")
      .innerHTML =
      html;

    $("#modalBackdrop")
      .hidden =
      false;

    requestAnimationFrame(() =>
      $(
        "#modalContent input, #modalContent select, #modalContent textarea"
      )?.focus()
    );
  }


  function closeModal(){

    $("#modalBackdrop")
      .hidden =
      true;

    modalContext =
      null;
  }


  // ============================================================
  // COMPROBANTES
  // ============================================================

  function receiptField(
    required=true
  ){

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

            El comprobante se subirá
            de forma segura a la nube.

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

          img.classList.add(
            "show"
          );

          $("#receiptBox")
            .classList
            .remove(
              "invalid"
            );

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

  function openJuntaPayment(
    juntaId
  ){

    const j =
      state.juntas.find(
        x =>
          x.id === juntaId
      );

    if(!j) return;

    openModal(`

      <h2>
        🌸 Registrar aporte
      </h2>

      <p class="intro">

        ${esc(j.name)}

        · cada aporte puede tener
        un monto diferente.

      </p>

      <div class="form-grid">

        <div class="field">

          <label>

            Monto

            <span class="required">
              *
            </span>

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

            <span class="required">
              *
            </span>

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
      Number(
        $("#amount").value
      );

    const file =
      $("#receiptFile")
        ?.files?.[0];

    if(
      !amount ||
      amount <= 0
    ){

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

    const j =
      state.juntas.find(
        x =>
          String(x.id) ===
          String(modalContext?.juntaId)
      );

    if(!j){

      return toast(
        "No se encontró la junta."
      );
    }

    let receiptUrl = "";

    try{

      toast(
        "Subiendo comprobante…"
      );

      receiptUrl =
        await uploadReceipt(
          file
        );

    }catch(error){

      console.error(
        "Error subiendo comprobante:",
        error
      );

      return toast(
        error.message ||
        "No se pudo subir el comprobante."
      );
    }

    const payment = {

      id:
        uid("pay"),

      juntaId:
        String(j.id),

      amount,

      date:
        $("#date").value ||
        today(),

      method:
        $("#method").value,

      note:
        $("#note")
          .value
          .trim(),

      receiptUrl,

      receiptData:""
    };

    const savedPayment =
      await apiCreateJuntaPayment(
        payment
      );

    if(!savedPayment){
      return;
    }

    const before =
      (j.payments || []).reduce(
        (s,p) =>
          s +
          Number(
            p.amount || 0
          ),
        0
      );

    const after =
      before + amount;

    j.payments.push({

      id:
        String(
          savedPayment.id ??
          payment.id
        ),

      amount:
        Number(
          savedPayment.amount ??
          payment.amount
        ),

      date:
        String(
          savedPayment.payment_date ??
          payment.date
        ).slice(0,10),

      method:
        savedPayment.method ??
        payment.method,

      note:
        savedPayment.note ??
        payment.note,

      receiptUrl:
        savedPayment.receipt_url ||
        receiptUrl,

      receiptData:""
    });

    save();

    closeModal();

    render();

    animatePayment(
      j.id
    );

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

  function animatePayment(
    juntaId
  ){

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
      [
        "✦",
        "🌸",
        "♡",
        "🍃",
        "✨"
      ];

    for(
      let i=0;
      i<7;
      i++
    ){

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
        (
          30 +
          Math.random()*45
        ) +
        "%";

      p.style.top =
        (
          55 +
          Math.random()*20
        ) +
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

      card.appendChild(
        p
      );

      setTimeout(
        () =>
          p.remove(),
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

    if(!layer) return;

    const set =
      CELEBRATIONS[
        Math.floor(
          Math.random() *
          CELEBRATIONS.length
        )
      ];

    for(
      let i=0;
      i<22;
      i++
    ){

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

      layer.appendChild(
        p
      );

      setTimeout(
        () =>
          p.remove(),
        1900
      );
    }
  }


  // ============================================================
  // KELLY
  // ============================================================

  function openKellyPayment(){

    openModal(`

      <h2>
        💗 Registrar pago a Kelly
      </h2>

      <p class="intro">

        Sin plazo fijo.
        Cada pago queda
        guardado con su comprobante.

      </p>

      <div class="form-grid">

        <div class="field">

          <label>

            Monto

            <span class="required">
              *
            </span>

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

            <span class="required">
              *
            </span>

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
          id="viewKellyHistory"
        >
          Ver pagos anteriores
        </button>

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

    $("#viewKellyHistory").onclick =
      openKellyHistory;

    $("#cancelForm").onclick =
      closeModal;

    $("#saveKellyPayment").onclick =
      saveKellyPayment;
  }


  async function saveKellyPayment(){

    const amount =
      Number(
        $("#amount").value
      );

    const file =
      $("#receiptFile")
        ?.files?.[0];

    if(
      !amount ||
      amount <= 0
    ){

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

    let receiptUrl = "";

    try{

      toast(
        "Subiendo comprobante…"
      );

      receiptUrl =
        await uploadReceipt(
          file
        );

    }catch(error){

      console.error(
        "Error subiendo comprobante:",
        error
      );

      return toast(
        error.message ||
        "No se pudo subir el comprobante."
      );
    }

    const payment = {

      id:
        uid("kelly"),

      amount,

      date:
        $("#date").value ||
        today(),

      method:
        $("#method").value,

      note:
        $("#note")
          .value
          .trim(),

      receiptUrl,

      receiptData:""
    };

    const savedPayment =
      await apiCreateKellyPayment(
        payment
      );

    if(!savedPayment){
      return;
    }

    state.kelly.payments.push({

      id:
        String(
          savedPayment.id ??
          payment.id
        ),

      amount:
        Number(
          savedPayment.amount ??
          payment.amount
        ),

      date:
        String(
          savedPayment.payment_date ??
          payment.date
        ).slice(0,10),

      method:
        savedPayment.method ??
        payment.method,

      note:
        savedPayment.note ??
        payment.note,

      receiptUrl:
        savedPayment.receipt_url ||
        receiptUrl,

      receiptData:""
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

      <h2>
        🪙 Gasto rápido
      </h2>

      <p class="intro">

        Solo lo esencial.
        Sin comprobante.

      </p>

      <div class="form-grid">

        <div class="field">

          <label>

            Monto

            <span class="required">
              *
            </span>

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

    $("#saveExpense").onclick =
      () => {

        const amount =
          Number(
            $("#amount").value
          );

        if(
          !amount ||
          amount <= 0
        ){

          return toast(
            "Escribe un monto válido."
          );
        }

        state.expenses.push({

          id:
            uid("exp"),

          amount,

          date:
            $("#date").value ||
            today(),

          note:
            $("#note")
              .value
              .trim()
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
      [
        "🪙",
        "✦",
        "🍃",
        "✨",
        "💸"
      ];

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

      id:
        uid("task"),

      text:
        text.trim(),

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
            transform:
              "scale(1)"
          },
          {
            transform:
              "scale(1.25)"
          },
          {
            transform:
              "scale(1)"
          }
        ],
        {
          duration:320
        }
      );

    setTimeout(() => {

      state.tasks =
        state.tasks.filter(
          x =>
            x.id !== id
        );

      save();

      renderTasks();

    },580);
  }


  // ============================================================
  // HISTORIAL DE JUNTAS
  // ============================================================

  function openJuntaHistory(id){

    const j =
      state.juntas.find(
        x =>
          String(x.id) ===
          String(id)
      );

    if(!j) return;

    openModal(`

      <h2>

        🌸 Historial ·
        ${esc(j.name)}

      </h2>

      <p class="intro">

        Toca un registro para ver
        el detalle completo y su comprobante.

      </p>

      <div class="history">

        ${
          (j.payments || []).length
            ?
          j.payments
            .slice()
            .reverse()
            .map(p => {

              return `

                <div
                  class="history-row"
                >

                  <div class="left">

                    <b>
                      ${money(p.amount)}
                    </b>

                    <small>

                      ${esc(
                        formatDate(p.date)
                      )}

                      ${
                        p.method
                          ? ` · ${esc(p.method)}`
                          : ""
                      }

                    </small>

                    ${
                      p.note
                        ? `
                          <small>
                            ${esc(p.note)}
                          </small>
                        `
                        : ""
                    }

                  </div>

                  <button
                    class="secondary"
                    type="button"
                    data-junta-payment-detail="${esc(String(p.id))}"
                    data-junta-id="${esc(String(j.id))}"
                  >
                    Ver detalle →
                  </button>

                </div>

              `;
            })
            .join("")

            :

          `
            <div class="empty">

              Todavía no hay aportes.

            </div>
          `
        }

      </div>

    `,{
      type:"juntaHistory",
      juntaId:String(id)
    });
  }


  // ============================================================
  // DETALLE DE APORTE DE JUNTA
  // ============================================================

  function openJuntaPaymentDetail(
    juntaId,
    paymentId
  ){

    const j =
      state.juntas.find(
        x =>
          String(x.id) ===
          String(juntaId)
      );

    if(!j) return;

    const payment =
      (j.payments || []).find(
        p =>
          String(p.id) ===
          String(paymentId)
      );

    if(!payment){

      return toast(
        "No se encontró ese aporte."
      );
    }

    const receipt =
      payment.receiptUrl ||
      payment.receiptData ||
      "";

    openModal(`

      <div class="receipt-detail">

        <button
          class="secondary"
          id="backToJuntaHistory"
          type="button"
        >
          ← Volver a movimientos
        </button>

        <h2>
          🌸 Detalle del aporte
        </h2>

        <p class="intro">
          ${esc(j.name)}
        </p>

        <div class="readonly-box">

          <div style="margin-bottom:8px">

            <small>
              Monto
            </small>

            <br>

            <strong>
              ${money(payment.amount)}
            </strong>

          </div>

          <div style="margin-bottom:8px">

            <small>
              Fecha
            </small>

            <br>

            <strong>
              ${esc(formatDate(payment.date))}
            </strong>

          </div>

          <div style="margin-bottom:8px">

            <small>
              Método
            </small>

            <br>

            <strong>
              ${
                esc(
                  payment.method ||
                  "No indicado"
                )
              }
            </strong>

          </div>

          ${
            payment.note
              ? `
                <div>

                  <small>
                    Nota
                  </small>

                  <br>

                  <strong>
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
              <div style="margin-top:16px">

                <p
                  class="tiny"
                  style="margin-bottom:8px"
                >
                  Comprobante
                </p>

                <img
                  class="photo-modal-preview"
                  src="${esc(receipt)}"
                  alt="Comprobante del aporte"
                >

              </div>
            `
            : `
              <div class="empty">

                Este aporte no tiene
                comprobante asociado.

              </div>
            `
        }

      </div>

    `,{
      type:"juntaPaymentDetail",
      juntaId,
      paymentId
    });

    $("#backToJuntaHistory")?.addEventListener(
      "click",
      () =>
        openJuntaHistory(
          juntaId
        )
    );
  }


  // ============================================================
  // HISTORIAL DE KELLY
  // ============================================================

  function openKellyHistory(){

    const payments =
      Array.isArray(
        state.kelly.payments
      )
        ? state.kelly.payments
        : [];

    openModal(`

      <h2>
        💗 Pagos de Kelly
      </h2>

      <p class="intro">

        Toca un pago para revisar
        todos sus datos y comprobante.

      </p>

      <div class="history">

        ${
          payments.length
            ?
          payments
            .slice()
            .reverse()
            .map(p => `

              <div
                class="history-row"
              >

                <div class="left">

                  <b>
                    ${money(p.amount)}
                  </b>

                  <small>

                    ${esc(
                      formatDate(p.date)
                    )}

                    ${
                      p.method
                        ? ` · ${esc(p.method)}`
                        : ""
                    }

                  </small>

                  ${
                    p.note
                      ? `
                        <small>
                          ${esc(p.note)}
                        </small>
                      `
                      : ""
                  }

                </div>

                <button
                  class="secondary"
                  type="button"
                  data-kelly-payment-detail="${esc(String(p.id))}"
                >
                  Ver detalle →
                </button>

              </div>

            `)
            .join("")

            :

          `
            <div class="empty">

              Todavía no hay pagos
              registrados para Kelly.

            </div>
          `
        }

      </div>

    `,{
      type:"kellyHistory"
    });
  }


  // ============================================================
  // DETALLE DE PAGO DE KELLY
  // ============================================================

  function openKellyPaymentDetail(
    paymentId
  ){

    const payment =
      state.kelly.payments.find(
        p =>
          String(p.id) ===
          String(paymentId)
      );

    if(!payment){

      return toast(
        "No se encontró ese pago."
      );
    }

    const receipt =
      payment.receiptUrl ||
      payment.receiptData ||
      "";

    openModal(`

      <div class="receipt-detail">

        <button
          class="secondary"
          id="backToKellyHistory"
          type="button"
        >
          ← Volver a pagos
        </button>

        <h2>
          💗 Detalle del pago
        </h2>

        <p class="intro">
          Pago registrado para Kelly
        </p>

        <div class="readonly-box">

          <div style="margin-bottom:8px">

            <small>
              Monto
            </small>

            <br>

            <strong>
              ${money(payment.amount)}
            </strong>

          </div>

          <div style="margin-bottom:8px">

            <small>
              Fecha
            </small>

            <br>

            <strong>
              ${esc(formatDate(payment.date))}
            </strong>

          </div>

          <div style="margin-bottom:8px">

            <small>
              Método
            </small>

            <br>

            <strong>
              ${
                esc(
                  payment.method ||
                  "No indicado"
                )
              }
            </strong>

          </div>

          ${
            payment.note
              ? `
                <div>

                  <small>
                    Nota
                  </small>

                  <br>

                  <strong>
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
              <div style="margin-top:16px">

                <p
                  class="tiny"
                  style="margin-bottom:8px"
                >
                  Comprobante
                </p>

                <img
                  class="photo-modal-preview"
                  src="${esc(receipt)}"
                  alt="Comprobante del pago de Kelly"
                >

              </div>
            `
            : `
              <div class="empty">

                Este pago no tiene
                comprobante asociado.

              </div>
            `
        }

      </div>

    `,{
      type:"kellyPaymentDetail",
      paymentId
    });

    $("#backToKellyHistory")?.addEventListener(
      "click",
      openKellyHistory
    );
  }


  // ============================================================
  // VER COMPROBANTE
  // ============================================================

  function openReceipt(
    src,
    detail={}
  ){

    if(!src){

      return toast(
        "No se encontró el comprobante."
      );
    }

    let backLabel =
      "← Volver";

    if(
      detail.backType ===
      "junta"
    ){

      backLabel =
        "← Volver a movimientos";

    }else if(
      detail.backType ===
      "kelly"
    ){

      backLabel =
        "← Volver a pagos";
    }


    openModal(`

      <div class="receipt-detail">

        <button
          class="secondary"
          id="receiptBack"
          type="button"
        >
          ${backLabel}
        </button>

        <h2>
          📷 Comprobante
        </h2>

        ${
          detail.amount ||
          detail.date ||
          detail.method ||
          detail.note
            ? `

              <div class="readonly-box">

                ${
                  detail.amount
                    ? `
                      <div style="margin-bottom:8px">

                        <small>
                          Monto
                        </small>

                        <br>

                        <strong>
                          ${money(detail.amount)}
                        </strong>

                      </div>
                    `
                    : ""
                }

                ${
                  detail.date
                    ? `
                      <div style="margin-bottom:8px">

                        <small>
                          Fecha
                        </small>

                        <br>

                        <strong>
                          ${esc(
                            formatDate(
                              detail.date
                            )
                          )}
                        </strong>

                      </div>
                    `
                    : ""
                }

                ${
                  detail.method
                    ? `
                      <div style="margin-bottom:8px">

                        <small>
                          Método
                        </small>

                        <br>

                        <strong>
                          ${esc(detail.method)}
                        </strong>

                      </div>
                    `
                    : ""
                }

                ${
                  detail.note
                    ? `
                      <div>

                        <small>
                          Nota
                        </small>

                        <br>

                        <strong>
                          ${esc(detail.note)}
                        </strong>

                      </div>
                    `
                    : ""
                }

              </div>
            `
            : ""
        }

        <img
          class="photo-modal-preview"
          src="${esc(src)}"
          alt="Comprobante"
        >

      </div>

    `,{
      type:"receipt",
      ...detail
    });


    $("#receiptBack")?.addEventListener(
      "click",
      () => {

        if(
          detail.backType ===
          "junta" &&
          detail.backId
        ){

          openJuntaHistory(
            detail.backId
          );

          return;
        }


        if(
          detail.backType ===
          "kelly"
        ){

          openKellyHistory();

          return;
        }


        closeModal();
      }
    );
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
        Los gastos hormiga quedan
        siempre fuera.

      </p>

      <div class="share-options">

        <button
          class="share-option"
          id="shareJuntaChoose"
        >

          <span>
            🌸
          </span>

          <b>
            Compartir Junta
          </b>

          <small>
            Progreso, historial
            y comprobantes.
          </small>

        </button>

        <button
          class="share-option"
          id="shareKellyChoose"
        >

          <span>
            💗
          </span>

          <b>
            Compartir Kelly
          </b>

          <small>
            Deuda, pagos, saldo
            y comprobantes.
          </small>

        </button>

      </div>
    `);

    $("#shareJuntaChoose").onclick =
      () => {

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
          x =>
            String(x.id) ===
            String(id)
        );

      if(!j) return;

      const paid =
        (j.payments || []).reduce(
          (s,p) =>
            s +
            Number(
              p.amount || 0
            ),
          0
        );

      const pct =
        j.goal
          ? Math.min(
              100,
              paid /
              j.goal *
              100
            )
          : 0;

      const receipts =
        (j.payments || [])
          .map(
            p =>
              p.receiptUrl ||
              p.receiptData ||
              ""
          )
          .filter(Boolean);

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
        .replace(
          /=+$/,
          ""
        )
        .slice(
          0,
          36
        );

      openModal(`

        <h2>
          🌸 Compartir Junta
        </h2>

        <p class="intro">

          Vista preparada
          como solo lectura.

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

              <div
                class="readonly-receipts"
              >

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

                Todavía no hay
                comprobantes.

              </div>

            `
        }

        <div
          class="share-link-box"
        >

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
          copyShareLink();


    }else{

      const paid =
        state.kelly.payments.reduce(
          (s,p) =>
            s +
            Number(
              p.amount || 0
            ),
          0
        );

      const balance =
        Math.max(
          0,
          state.kelly.original -
          paid
        );

      const receipts =
        state.kelly.payments
          .map(
            p =>
              p.receiptUrl ||
              p.receiptData ||
              ""
          )
          .filter(Boolean);

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
        .replace(
          /=+$/,
          ""
        )
        .slice(
          0,
          36
        );

      openModal(`

        <h2>
          💗 Compartir Kelly
        </h2>

        <p class="intro">

          Sin plazo fijo · vista preparada
          como solo lectura.

        </p>

        <div class="readonly-box">

          <b>
            Deuda original:
          </b>

          ${money(
            state.kelly.original
          )}

          <br>

          <b>
            Pagado:
          </b>

          ${money(paid)}

          <br>

          <b>
            Saldo:
          </b>

          ${money(balance)}

        </div>

        ${
          receipts.length
            ? `

              <div
                class="readonly-receipts"
              >

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

                Todavía no hay
                comprobantes.

              </div>

            `
        }

        <div
          class="share-link-box"
        >

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
          copyShareLink();
    }
  }


  async function copyShareLink(){

    const input =
      document.querySelector(
        ".share-link-box input"
      );

    if(!input){
      return;
    }

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
          s +
          Number(
            p.amount || 0
          ),
        0
      );

    const balance =
      Math.max(
        0,
        state.kelly.original -
        paid
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
      ?.classList
      .remove(
        "has-notif"
      );

    const notifDot =
      $("#notifDot");

    if(notifDot){

      notifDot.style.display =
        "none";
    }
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

      state.lastKellyReminder !==
      monthKey &&

      state.kelly.original >
      state.kelly.payments.reduce(
        (s,p) =>
          s +
          Number(
            p.amount || 0
          ),
        0
      )

    ){

      state.lastKellyReminder =
        monthKey;

      save();

      setTimeout(() => {

        $("#notifyBtn")
          ?.classList
          .add(
            "has-notif"
          );

        toast(
          "🔔 Recuerda revisar si corresponde hacer un pago a Kelly."
        );

      },1200);
    }
  }


  // ============================================================
  // NUEVA JUNTA
  // ============================================================

  function openNewJunta(){

    openModal(`

      <h2>
        🌸 Nueva Junta
      </h2>

      <p class="intro">

        Crea otra meta
        sin complicarla.

      </p>

      <div class="form-grid">

        <div class="field full">

          <label>

            Nombre

            <span class="required">
              *
            </span>

          </label>

          <input
            id="name"
            placeholder="Junta Navidad"
          >

        </div>

        <div class="field">

          <label>

            Meta total

            <span class="required">
              *
            </span>

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

            <option>semanal</option>
            <option selected>quincenal</option>
            <option>mensual</option>
            <option>variable</option>
            <option>otra</option>

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

        if(
          !name ||
          !goal
        ){

          return toast(
            "Completa el nombre y la meta."
          );
        }

        const junta = {

          id:
            uid("junta"),

          name,

          goal,

          normal:
            Number(
              $("#normal").value
            ) || 0,

          modality:
            $("#modality").value,

          variable:
            $("#variable").value ===
            "yes",

          payments:[]
        };

        const savedJunta =
          await apiCreateJunta(
            junta
          );

        if(!savedJunta){
          return;
        }

        state.juntas.push({

          id:
            String(
              savedJunta.id ??
              junta.id
            ),

          name:
            savedJunta.name ??
            junta.name,

          goal:
            Number(
              savedJunta.goal ??
              junta.goal
            ),

          normal:
            Number(
              savedJunta.normal ??
              junta.normal
            ),

          modality:
            savedJunta.modality ??
            junta.modality,

          variable:
            Boolean(
              savedJunta.variable ??
              junta.variable
            ),

          payments:[]
        });

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

        Juntas, aportes de juntas,
        pagos de Kelly y comprobantes
        ya se guardan en la nube.

        Los gastos y tareas
        todavía usan almacenamiento local.

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

              Juntas, aportes,
              Kelly, pagos y URLs
              de comprobantes.

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

    if(!wrap){

      console.log(msg);

      return;
    }

    const el =
      document.createElement(
        "div"
      );

    el.className =
      "toast";

    el.textContent =
      msg;

    wrap.appendChild(
      el
    );

    setTimeout(
      () =>
        el.remove(),
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
  //
  // IMPORTANTE:
  // NO renderizamos la información financiera "vieja"
  // y NO ocultamos el loader después de 1.5 segundos.
  //
  // Esperamos realmente a Neon.
  // ============================================================

  async function init(){

    // El loader se crea primero.
    createLoadingScreen();

    applyTheme();

    bindStatic();

    rotatePhrase(false);

    // Pintamos solamente el estado de carga.
    render();

    updateLoadingText(
      "cargando tus Juntas…"
    );

    try{

      const juntasOk =
        await syncCloudData();

      if(!juntasOk){

        throw new Error(
          "No se pudieron sincronizar las Juntas."
        );
      }

      updateLoadingText(
        "cargando Kelly…"
      );

      const kellyOk =
        await syncKellyCloud();

      if(!kellyOk){

        throw new Error(
          "No se pudo sincronizar Kelly."
        );
      }

      cloudReady = true;
      cloudSyncFailed = false;

      // Ahora sí mostramos la información real.
      render();

      // El recordatorio debe calcularse con
      // los datos reales de Neon, no con el estado viejo.
      maybeKellyReminder();

      console.log(
        "Mi Juntita: sincronización inicial completada."
      );

      // Le damos un instante al DOM/Enhancements
      // para reconstruir las tarjetas reales.
      setTimeout(
        () => hideLoadingScreen(),
        80
      );

    }catch(error){

      console.error(
        "Error en sincronización inicial:",
        error
      );

      cloudReady = false;
      cloudSyncFailed = true;

      render();

      updateLoadingText(
        "No pudimos actualizar tus datos."
      );

      setTimeout(
        () => hideLoadingScreen(),
        300
      );
    }
  }


  // ============================================================
  // EVENTOS
  // ============================================================

  function bindStatic(){

    $("#themeBtn")?.addEventListener(
      "click",
      toggleTheme
    );

    $("#notifyBtn")?.addEventListener(
      "click",
      showNotifications
    );

    $("#shareBtn")?.addEventListener(
      "click",
      openShareMenu
    );

    $("#newJuntaBtn")?.addEventListener(
      "click",
      openNewJunta
    );

    $("#kellyBtn")?.addEventListener(
      "click",
      openKellyPayment
    );

    $("#gastoBtn")?.addEventListener(
      "click",
      openExpense
    );

    $("#settingsBtn")?.addEventListener(
      "click",
      openSettings
    );

    $("#modalClose")?.addEventListener(
      "click",
      closeModal
    );

    $("#modalBackdrop")?.addEventListener(
      "click",
      e => {

        if(
          e.target ===
          $("#modalBackdrop")
        ){

          closeModal();
        }
      }
    );


    document.addEventListener(
      "click",
      e => {

        const juntaDetail =
          e.target.closest(
            "[data-junta-payment-detail]"
          );

        if(juntaDetail){

          openJuntaPaymentDetail(
            juntaDetail.dataset.juntaId,
            juntaDetail.dataset.juntaPaymentDetail
          );

          return;
        }


        const kellyDetail =
          e.target.closest(
            "[data-kelly-payment-detail]"
          );

        if(kellyDetail){

          openKellyPaymentDetail(
            kellyDetail.dataset.kellyPaymentDetail
          );

          return;
        }


        const img =
          e.target.closest(
            "[data-receipt-view]"
          );

        if(img){

          openReceipt(
            img.dataset.receiptView,
            {
              backType:
                img.dataset.receiptBackType || "",

              backId:
                img.dataset.receiptBackId || "",

              amount:
                img.dataset.receiptAmount || "",

              date:
                img.dataset.receiptDate || "",

              method:
                img.dataset.receiptMethod || "",

              note:
                img.dataset.receiptNote || ""
            }
          );
        }
      }
    );
  }


  // ============================================================
  // TEMA
  // ============================================================

  function applyTheme(){

    document.documentElement
      .classList
      .toggle(
        "dark",
        state.theme === "dark"
      );

    const themeBtn =
      $("#themeBtn");

    if(themeBtn){

      themeBtn.textContent =
        state.theme === "dark"
          ? "☀"
          : "☾";
    }
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

  function rotatePhrase(
    animate=true
  ){

    const el =
      $("#savingPhrase");

    if(!el) return;

    if(animate){

      el.classList.add(
        "phrase-swap"
      );
    }

    setTimeout(() => {

      state.phraseIndex =
        (
          state.phraseIndex + 1
        ) %
        PHRASES.length;

      el.textContent =
        PHRASES[
          state.phraseIndex
        ];

      if(animate){

        requestAnimationFrame(() =>
          el.classList.remove(
            "phrase-swap"
          )
        );
      }

      save();

    }, animate ? 180 : 0);
  }


  // ============================================================
  // INICIAR
  // ============================================================

  init();

})();
