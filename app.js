// v5.2.1 - Modal foto fecha automático após selecionar
//        - Registrar (novo item): se quiser foto -> sempre slot=1 (não pergunta)
//        - Observações (obs-input) grava na coluna M (OBS) via log_mov

const APP_VERSION = "v5.3.0";

const ENDPOINT_CONSULTA =
  "https://script.google.com/a/macros/realguindastes.com/s/AKfycbxE5uwmWek7HDPlBh1cD52HPDsIREptl31j-BTt2wXWaoj2KxOYQiVXmHMAP0PiDjeT/exec";

const ENDPOINT_REGISTRO =
  "https://script.google.com/a/macros/realguindastes.com/s/AKfycbxClcs2PLsAt7RjwMxV-ThLMVevpPesjnyH1rDrse6ORbPNgbP4-xAOSuq5O1xIWZ2j/exec";

let html5QrCode;
let scannerRunning = false;
let leituraProcessada = false;
let lastHandledAt = 0;

let gpsString = "";

// URLs das fotos do último get_lin
let FOTO_URLS = { 1:"", 2:"", 3:"", 4:"" };

// Modal/upload control
let pendingFoto = null; // {row, slot, origem}

/* =========================
   UI: Menu lateral + telas
========================= */

let CURRENT_SCREEN = "consulta";

function setScreenName(nome) {
  const el = document.getElementById("screenName");
  if (el) el.textContent = nome || "";
}

function openMenu() {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("overlay")?.classList.add("show");
}

function closeMenu() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("overlay")?.classList.remove("show");
}

function showScreen(key) {
  const map = {
    consulta: { id: "screen-consulta", name: "Consulta ítem" },
    cadastro: { id: "screen-cadastro", name: "Cadastro" },
    inventario: { id: "screen-inventario", name: "Consultar Inventário" },
    debug: { id: "screen-debug", name: "Debug" },
  };

  Object.keys(map).forEach(k => {
    const sec = document.getElementById(map[k].id);
    if (sec) sec.hidden = (k !== key);
  });

  document.querySelectorAll(".nav button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.screen === key);
  });

  CURRENT_SCREEN = key;
  setScreenName(map[key]?.name || "");
}

/* =========================
   UI: Binding (campo1/campo2 duplicados no Cadastro)
========================= */

function setCampo1Classes(el, valor) {
  if (!el) return;
  el.classList.remove("campo1-ok", "campo1-bad");
  const len = (String(valor || "").trim()).length;
  if (len === 9) el.classList.add("campo1-ok");
  else el.classList.add("campo1-bad");
}

function syncCampo1ToCadastro() {
  const master = document.getElementById("campo1");
  const slave  = document.getElementById("campo1_cad");
  if (!master || !slave) return;
  slave.value = master.value;
  setCampo1Classes(master, master.value);
  setCampo1Classes(slave, slave.value);
}

function syncCampo2ToCadastro() {
  const master = document.getElementById("campo2");
  const slave  = document.getElementById("campo2_cad");
  if (!master || !slave) return;
  slave.value = master.value;
}

function syncCadastroToMaster() {
  const master1 = document.getElementById("campo1");
  const slave1  = document.getElementById("campo1_cad");
  if (master1 && slave1) {
    master1.value = slave1.value;
    setCampo1Classes(master1, master1.value);
    setCampo1Classes(slave1, slave1.value);
  }

  const master2 = document.getElementById("campo2");
  const slave2  = document.getElementById("campo2_cad");
  if (master2 && slave2) master2.value = slave2.value;
}

function logDebug(msg) {
  const el = document.getElementById("debug-log");
  const ts = new Date().toLocaleTimeString();
  if (el) { el.value += `[${ts}] ${msg}\n`; el.scrollTop = el.scrollHeight; }
}

logDebug(`Carregado app.js versão ${APP_VERSION}`);
logDebug(`ENDPOINT_CONSULTA: ${ENDPOINT_CONSULTA}`);
logDebug(`ENDPOINT_REGISTRO: ${ENDPOINT_REGISTRO}`);

window.addEventListener("DOMContentLoaded", () => {

  // Menu lateral
  const btnMenu = document.getElementById("btnMenu");
  const btnClose = document.getElementById("btnClose");
  const overlay = document.getElementById("overlay");

  if (btnMenu) btnMenu.addEventListener("click", openMenu);
  if (btnClose) btnClose.addEventListener("click", closeMenu);
  if (overlay) overlay.addEventListener("click", closeMenu);

  document.querySelectorAll(".nav button").forEach(btn => {
    btn.addEventListener("click", () => {
      showScreen(btn.dataset.screen);
      closeMenu();
    });
  });

  // ESC fecha o menu
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // Tela padrão
  showScreen("consulta");

  const rua = document.getElementById("rua-input");
  const andar = document.getElementById("andar-input");
  const campo1 = document.getElementById("campo1");
  const codigoC = document.getElementById("codigo-c-input");
  const numInv = document.getElementById("numinv-input");
  const campo1Cad = document.getElementById("campo1_cad");
  const campo2Cad = document.getElementById("campo2_cad");


  function onlyDigits(el, label) {
    if (!el) return;
    el.addEventListener("input", () => {
      const before = el.value;
      const after = before.replace(/\D+/g, "");
      if (before !== after) {
        el.value = after;
        logDebug(`${label}: removidos caracteres não numéricos.`);
      }
    });
  }

  onlyDigits(rua, "Rua");
  onlyDigits(andar, "Andar");
  onlyDigits(numInv, "NumInv");
  onlyDigits(codigoC, "Codigo C");

  if (campo1) campo1.addEventListener("input", () => setCampo1CorPorTamanho(campo1.value.trim()));

  // Bind: master (Consulta) <-> Cadastro (duplicados)
  if (campo1) campo1.addEventListener("input", () => { syncCampo1ToCadastro(); });
  if (campo2) campo2.addEventListener("input", () => { syncCampo2ToCadastro(); });

  if (campo1Cad) campo1Cad.addEventListener("input", () => { syncCadastroToMaster(); });
  if (campo2Cad) campo2Cad.addEventListener("input", () => { syncCadastroToMaster(); });

  // Inicializa duplicados
  syncCampo1ToCadastro();
  syncCampo2ToCadastro();


  // Substituir foto (pede slot 1..4)
  const btnSub = document.getElementById("btn-substfoto");
  if (btnSub) btnSub.addEventListener("click", () => substituirFotoLinhaUI());

  // Modal handlers
  const btnOpen = document.getElementById("foto-modal-open");
  const btnCancel = document.getElementById("foto-modal-cancel");
  const fileInput = document.getElementById("foto-input");

  if (btnOpen && fileInput) {
    btnOpen.addEventListener("click", () => {
      fileInput.value = ""; // permite escolher o mesmo arquivo novamente
      fileInput.click();    // gesto do usuário => mobile abre câmera
    });
  }

  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
      fecharModalFoto();
      pendingFoto = null;
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      // ✅ FECHA O MODAL IMEDIATAMENTE após tirar/selecionar (pedido do usuário)
      fecharModalFoto();

      try {
        const file = fileInput.files && fileInput.files[0];
        if (!file) { pendingFoto = null; return; }

        if (!pendingFoto || !pendingFoto.row || !pendingFoto.slot) {
          logDebug("foto-input: pendingFoto vazio. Cancelando upload.");
          pendingFoto = null;
          return;
        }

        const { row, slot, origem } = pendingFoto;
        pendingFoto = null;

        logDebug(`Foto selecionada (${origem}). row=${row}, slot=${slot}, name=${file.name}, type=${file.type}, size=${file.size}`);

        const j = await uploadFotoParaLinha(row, slot, file);
        logDebug(`Foto OK: row=${j.row} slot=${j.slot} url=${j.fotoUrl}`);

        await consultarLinhaInventario(row); // atualiza resumo + habilita/desabilita botões
      } catch (e) {
        logDebug("Erro ao processar/enviar foto: " + e);
      }
    });
  }

  // Inicializa botões visíveis e desabilitados
  atualizarBotoesFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
});

function setCampo1CorPorTamanho(valor) {
  const el = document.getElementById("campo1");
  setCampo1Classes(el, valor);
  const elCad = document.getElementById("campo1_cad");
  setCampo1Classes(elCad, valor);
}

function limparDebug() { const el = document.getElementById("debug-log"); if (el) el.value = ""; }
function copiarDebug() { const el = document.getElementById("debug-log"); if (!el) return; el.select(); document.execCommand("copy"); }

/* =========================
   Fotos: botões sempre visíveis (disabled quando vazio)
========================= */

function atualizarBotoesFotos(d) {
  FOTO_URLS[1] = String(d.fotoUrl  || "").trim();
  FOTO_URLS[2] = String(d.fotoUrl2 || "").trim();
  FOTO_URLS[3] = String(d.fotoUrl3 || "").trim();
  FOTO_URLS[4] = String(d.fotoUrl4 || "").trim();

  for (let i=1;i<=4;i++){
    const btn = document.getElementById(`btn-abrirfoto${i}`);
    if (!btn) continue;
    const url = FOTO_URLS[i];
    btn.disabled = !url;
    btn.title = url ? url : "Sem foto nesta posição";
  }
}

function abrirFoto(slot) {
  const url = FOTO_URLS[Number(slot)] || "";
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

/* =========================
   Modal foto
========================= */

function abrirModalFoto(row, slot, origem) {
  pendingFoto = { row:Number(row), slot:Number(slot), origem:String(origem||"") };

  const modal = document.getElementById("foto-modal");
  const txt = document.getElementById("foto-modal-text");

  if (txt) txt.innerText = `Linha ${row} — Foto ${slot}: clique em "Abrir câmera / selecionar arquivo"`;
  if (modal) modal.style.display = "block";
}

function fecharModalFoto() {
  const modal = document.getElementById("foto-modal");
  if (modal) modal.style.display = "none";
}

/* =========================
   QR / Scanner
========================= */

function iniciarLeitor() {
  if (scannerRunning) return;
  logDebug("Iniciando leitor...");
  html5QrCode = new Html5Qrcode("qr-reader");

  leituraProcessada = false;
  lastHandledAt = 0;

  const config = { fps: 10, qrbox: 250 };

  html5QrCode.start(
    { facingMode: { exact: "environment" } },
    config,
    qrCodeMessage => processarQRCode(qrCodeMessage)
  ).then(() => {
    scannerRunning = true;
    logDebug("Leitor iniciado com facingMode=environment.");
  }).catch(async (err) => {
    logDebug("Falhou facingMode=environment, listando câmeras... " + err);
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || !cameras.length) { logDebug("Nenhuma câmera encontrada."); return; }
      const preferidas = cameras.filter(c => /back|rear|traseira|environment/i.test(c.label || ""));
      const escolhida = preferidas[0] || cameras[cameras.length - 1];
      logDebug("Câmera escolhida: " + (escolhida.label || escolhida.id));
      html5QrCode.start(
        escolhida.id,
        config,
        qrCodeMessage => processarQRCode(qrCodeMessage)
      ).then(() => {
        scannerRunning = true;
        leituraProcessada = false;
        lastHandledAt = 0;
        logDebug("Leitor iniciado com cameraId selecionada.");
      }).catch(e2 => logDebug("Erro ao iniciar com cameraId: " + e2));
    } catch (e) {
      logDebug("Erro ao obter lista de câmeras: " + e);
    }
  });
}

function pararLeitor() {
  if (html5QrCode && scannerRunning) {
    logDebug("Parando leitor...");
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      scannerRunning = false;
      logDebug("Leitor parado e área limpa.");
    }).catch(err => logDebug("Erro ao parar leitor: " + err));
  }
}

function processarQRCode(qrCodeMessage) {
  const now = Date.now();
  if (leituraProcessada || (now - lastHandledAt) < 800) {
    logDebug("Leitura ignorada (debounce ativo).");
    return;
  }
  leituraProcessada = true;
  lastHandledAt = now;

  logDebug("QR bruto lido: " + qrCodeMessage);
  const partes = qrCodeMessage.split("|").filter(Boolean);
  logDebug("Partes após split('|'): " + JSON.stringify(partes));

  if (partes.length < 2) {
    logDebug("Formato inválido: esperado ao menos parte0 e parte1.");
    leituraProcessada = false;
    return;
  }

  pararLeitor();

  const parte0 = String(partes[0]).trim();
  const parte1Original = String(partes[1] || "").trim();
  let parte1Limpo = parte1Original.replace(/^0+/, "");
  if (parte1Limpo === "") parte1Limpo = "0";

  document.getElementById("codigo-lido").value = qrCodeMessage;
  document.getElementById("campo1").value = parte0;
  document.getElementById("campo2").value = parte1Limpo;

  // sincroniza duplicados no Cadastro
  syncCampo1ToCadastro();
  syncCampo2ToCadastro();

  setCampo1CorPorTamanho(parte0);
  logDebug(`Parte[1] original: ${parte1Original} | limpa: ${parte1Limpo}`);

  consultarDados();
}

/* =========================
   CONSULTA (Consolidado) - mantém seu fluxo atual
========================= */

function consultarDados() {
  const parte0 = (document.getElementById("campo1")?.value || "").trim();
  let parte1 = (document.getElementById("campo2")?.value || "").trim();
  const codigoC = (document.getElementById("codigo-c-input")?.value || "").trim();

  const elI = document.getElementById("resultado-google");
  const elGruas = document.getElementById("gruas-aplicaveis");
  const elExata = document.getElementById("correspondencia-exata");
  const elDescPT = document.getElementById("descricao-pt");

  if (elI) elI.value = "";
  if (elGruas) elGruas.value = "";
  if (elExata) elExata.value = "";
  if (elDescPT) elDescPT.value = "";

  if (!parte0) {
    if (!codigoC) {
      if (elI) elI.value = "Não encontrado";
      if (elGruas) elGruas.value = "Não encontrado";
      if (elExata) elExata.value = "Não encontrado";
      if (elDescPT) elDescPT.value = "Não encontrado";
      logDebug("ConsultarUI: campo1 e Codigo C vazios. Nada a fazer.");
      return;
    }

    const chaveL = formatarCodigoC(codigoC);
    logDebug(`ConsultarUI: campo1 vazio -> buscando H por L usando chave "${chaveL}".`);

    const urlHporL = `${ENDPOINT_CONSULTA}?mode=h_por_l&l=${encodeURIComponent(chaveL)}&t=${Date.now()}`;
    logDebug("GET Buscar H por L (L->H): " + urlHporL);

    fetch(urlHporL).then(r=>r.text()).then(raw=>{
      logDebug("Resposta (L->H) raw: " + raw);
      let j=null; try{ j=JSON.parse(raw); }catch{}

      if (j && j.ok && (j.h||"").trim()) {
        const h = String(j.h).trim();
        document.getElementById("campo1").value = h;
        setCampo1CorPorTamanho(h);
        consultarDados();
      } else {
        logDebug("ConsultarUI: não encontrou ocorrência em L.");
        if (elI) elI.value = "Não encontrado";
        if (elGruas) elGruas.value = "Não encontrado";
        if (elExata) elExata.value = "Não encontrado";
        if (elDescPT) elDescPT.value = "Não encontrado";
      }
    });

    return;
  }

  parte1 = parte1.replace(/^0+/, "");
  if (parte1 === "") parte1 = "0";
  if (document.getElementById("campo2")) document.getElementById("campo2").value = parte1;

  setCampo1CorPorTamanho(parte0);

  const urlI = `${ENDPOINT_CONSULTA}?mode=i_por_h&codigo=${encodeURIComponent(parte0)}`;
  logDebug("GET Resultado da consulta (H->I): " + urlI);
  fetch(urlI).then(r=>r.text()).then(raw=>{
    logDebug("Resposta (H->I) raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) { const v=(j.resultado||"").trim(); if (elI) elI.value = v || "Não encontrado"; }
    else { if (elI) elI.value = "Não encontrado"; }
  });

  const urlGruas = `${ENDPOINT_CONSULTA}?mode=gruas&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Gruas aplicáveis (H->C[] & M[]): " + urlGruas);
  fetch(urlGruas).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Gruas raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) {
      const listaC = Array.isArray(j.gruasC) ? j.gruasC : [];
      const listaM = Array.isArray(j.gruasM) ? j.gruasM : [];
      const linhas = [];
      if (listaC.length) linhas.push(`Modelos (C): ${listaC.join(", ")}`);
      if (listaM.length) linhas.push(`Aplicações (M): ${listaM.join(", ")}`);
      const texto = linhas.length ? linhas.join("\n") : "Não encontrado";
      document.getElementById("gruas-aplicaveis").value = texto;
    } else {
      document.getElementById("gruas-aplicaveis").value = "Não encontrado";
    }
  });

  const urlExata = `${ENDPOINT_CONSULTA}?mode=exata&h=${encodeURIComponent(parte0)}&k=${encodeURIComponent(parte1)}`;
  logDebug("GET Correspondência exata (H&K->M): " + urlExata);
  fetch(urlExata).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Exata raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    document.getElementById("correspondencia-exata").value =
      (j && j.ok && (j.exata||"").trim()) ? (j.exata||"").trim() : "Não encontrado";
  });

  const urlDescPT = `${ENDPOINT_CONSULTA}?mode=desc_pt&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Descrição Português: " + urlDescPT);
  fetch(urlDescPT).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Descrição PT raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    document.getElementById("descricao-pt").value =
      (j && j.ok && (j.descricao||"").trim()) ? (j.descricao||"").trim() : "Não encontrado";
  });
}

function formatarCodigoC(apenasNumeros) {
  const raw = String(apenasNumeros || "").trim();
  const s = raw.replace(/\s+/g, "");
  if (s.length >= 12) {
    const a = s.substring(0,3);
    const b = s.substring(3,6);
    const c = s.substring(6,9);
    const d = s.substring(9,12);
    return `C${a}.${b}-${c}.${d}`;
  }
  return `C${s}`;
}

/* =========================
   GPS
========================= */

function obterGpsString() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation não suportado neste navegador."));
      return;
    }
    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        const ts = new Date(pos.timestamp).toISOString();
        resolve(`lat=${lat}, lon=${lon}, acc_m=${acc}, ts=${ts}`);
      },
      (err) => reject(new Error(`Falha ao obter GPS: ${err.message}`)),
      options
    );
  });
}

/* =========================
   REGISTRAR (Inventário)
========================= */

async function registrarMovimentacaoUI() {
  const status = document.getElementById("status-msg");

  const campo1 = (document.getElementById("campo1")?.value || "").trim();
  let campo2 = (document.getElementById("campo2")?.value || "").trim();

  const loc   = (document.getElementById("loc-select")?.value || "").trim();
  const rua   = (document.getElementById("rua-input")?.value || "").trim();
  const andar = (document.getElementById("andar-input")?.value || "").trim();
  const numInv = (document.getElementById("numinv-input")?.value || "").trim();

  const obs = (document.getElementById("obs-input")?.value || "").trim();

  const gpsOn = !!document.getElementById("gps-check")?.checked;

  campo2 = campo2.replace(/^0+/, "");
  if (campo2 === "") campo2 = "0";
  if (document.getElementById("campo2")) document.getElementById("campo2").value = campo2;

  setCampo1CorPorTamanho(campo1);

  if (!campo1) {
    logDebug("Registrar: campo1 vazio. Cancelando.");
    if (status) status.innerText = "Preencha o campo1 antes de registrar.";
    return;
  }

  gpsString = "";
  if (status) status.innerText = gpsOn ? "Obtendo GPS..." : "Registrando...";

  if (gpsOn) {
    try {
      gpsString = await obterGpsString();
      logDebug("GPS capturado: " + gpsString);
    } catch (e) {
      logDebug("Erro GPS: " + e);
      gpsString = "";
    }
  }

  const urlLog =
    `${ENDPOINT_REGISTRO}?mode=log_mov` +
    `&campo1=${encodeURIComponent(campo1)}` +
    `&campo2=${encodeURIComponent(campo2)}` +
    `&loc=${encodeURIComponent(loc)}` +
    `&rua=${encodeURIComponent(rua)}` +
    `&andar=${encodeURIComponent(andar)}` +
    `&gpsString=${encodeURIComponent(gpsString)}` +
    `&numInv=${encodeURIComponent(numInv)}` +
    `&obs=${encodeURIComponent(obs)}`;

  logDebug("GET Registrar (log_mov): " + urlLog);

  try {
    const raw = await (await fetch(urlLog)).text();
    logDebug("Resposta Registrar raw: " + raw);

    let j = null;
    try { j = JSON.parse(raw); } catch {}

    if (j && j.ok && j.appended) {
      if (status) status.innerText = `Registrado com sucesso (linha ${j.row} em ${j.sheet} às ${j.dataHora}).`;
      logDebug(`Registro OK: row=${j.row} dataHora=${j.dataHora}`);

      const inpLinha = document.getElementById("linha_consulta");
      if (inpLinha) inpLinha.value = String(j.row);

      // ✅ NOVO: registrar => foto óbvia = #1 (sem perguntar slot)
      const querFoto = confirm(`Deseja adicionar uma foto (Foto 1) para a linha ${j.row}?`);
      if (querFoto) {
        abrirModalFoto(j.row, 1, "registrar");
      }

      limparCamposAposRegistroOK();
    } else {
      if (status) status.innerText = "Falha ao registrar (ver debug).";
      logDebug("Registrar: resposta inválida/sem ok.");
    }
  } catch (err) {
    if (status) status.innerText = "Erro de rede ao registrar (ver debug).";
    logDebug("Erro Registrar: " + err);
  }
}

function limparCamposAposRegistroOK() {
  // limpa itens por item
  const ids = ["campo1","codigo-c-input","campo2","rua-input","andar-input","obs-input"];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  setCampo1CorPorTamanho("");
  syncCampo1ToCadastro();
  syncCampo2ToCadastro();
}


/* =========================
   LINHA: consultar / deletar (clear)
========================= */

async function consultarLinhaInventarioUI() {
  const inp = document.getElementById("linha_consulta");
  const row = parseInt(String(inp?.value || "").trim(), 10);
  await consultarLinhaInventario(row);
}

async function consultarLinhaInventario(row) {
  const txt = document.getElementById("txt-lin");

  if (!row || row < 2) {
    logDebug("Consultar linha: informe um número de linha válido (>=2).");
    if (txt) txt.value = "Linha inválida (>=2).";
    atualizarBotoesFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
    return;
  }

  const url = `${ENDPOINT_REGISTRO}?mode=get_lin&row=${row}&t=${Date.now()}`;
  logDebug("GET Consultar linha (get_lin): " + url);

  try {
    const raw = await (await fetch(url)).text();
    logDebug("Resposta get_lin raw: " + raw);

    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (!(j && j.ok && j.data)) {
      if (txt) txt.value = "Não encontrado";
      atualizarBotoesFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
      return;
    }

    const d = j.data;

    const resumo =
      `Linha ${row} | NumInv=${d.numInv || ""} | Campo1=${d.campo1 || ""} | Campo2=${d.campo2 || ""} | ` +
      `Pátio=${d.loc || ""} | Rua=${d.rua || ""} | Andar=${d.andar || ""} | OBS=${d.obs || ""} | DataHora=${d.dataHora || ""}`;

    if (txt) txt.value = resumo;

    atualizarBotoesFotos({
      fotoUrl: d.fotoUrl || "",
      fotoUrl2: d.fotoUrl2 || "",
      fotoUrl3: d.fotoUrl3 || "",
      fotoUrl4: d.fotoUrl4 || ""
    });

  } catch (err) {
    logDebug("Erro get_lin: " + err);
    if (txt) txt.value = "Erro ao consultar (ver debug).";
    atualizarBotoesFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
  }
}

async function deletarLinhaInventarioUI() {
  const inp = document.getElementById("linha_consulta");
  const txt = document.getElementById("txt-lin");

  const row = parseInt(String(inp?.value || "").trim(), 10);
  if (!row || row < 2) {
    logDebug("Deletar linha: informe um número de linha válido (>=2).");
    if (txt) txt.value = "Linha inválida (>=2).";
    return;
  }

  const ok = confirm(`Deseja deletar (limpar) a linha ${row}?`);
  if (!ok) return;

  const urlClear = `${ENDPOINT_REGISTRO}?mode=clear_lin&row=${row}&t=${Date.now()}`;
  logDebug("GET clear_lin: " + urlClear);

  try {
    const raw = await (await fetch(urlClear)).text();
    logDebug("Resposta clear_lin raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}

    if (j && j.ok && j.cleared) {
      if (txt) txt.value = `Linha ${row} limpa com sucesso.`;
      atualizarBotoesFotos({ fotoUrl:"", fotoUrl2:"", fotoUrl3:"", fotoUrl4:"" });
    } else {
      if (txt) txt.value = "Falha ao limpar linha (ver debug).";
    }
  } catch (err) {
    logDebug("Erro clear_lin: " + err);
    if (txt) txt.value = "Erro ao limpar (ver debug).";
  }
}

/* =========================
   FOTO: substituir (slot 1..4)
========================= */

function perguntarSlotFoto() {
  const ans = prompt("Qual foto deseja usar/substituir? Digite 1, 2, 3 ou 4:", "1");
  if (ans == null) return 0;
  const slot = parseInt(String(ans).trim(), 10);
  if (![1,2,3,4].includes(slot)) {
    alert("Valor inválido. Digite 1, 2, 3 ou 4.");
    return 0;
  }
  return slot;
}

async function substituirFotoLinhaUI() {
  const inp = document.getElementById("linha_consulta");
  const row = parseInt(String(inp?.value || "").trim(), 10);
  if (!row || row < 2) {
    logDebug("Substituir foto: informe linha válida (>=2).");
    alert("Informe uma linha válida (>=2) em linha_consulta.");
    return;
  }

  const slot = perguntarSlotFoto();
  if (!slot) return;

  abrirModalFoto(row, slot, "substituir");
}

/* =========================
   Upload Foto (POST text/plain)
========================= */

async function uploadFotoParaLinha(row, slot, file) {
  const base64 = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || "");
      const idx = s.indexOf("base64,");
      resolve(idx >= 0 ? s.substring(idx + 7) : s);
    };
    fr.onerror = () => reject(fr.error || new Error("Falha ao ler arquivo"));
    fr.readAsDataURL(file);
  });

  const payload = {
    mode: "upload_foto",
    row: Number(row),
    slot: Number(slot),
    mime: file.type || "image/jpeg",
    base64
  };

  logDebug(`POST upload_foto: row=${payload.row}, slot=${payload.slot}, mime=${payload.mime}, base64_len=${base64.length}`);

  const resp = await fetch(ENDPOINT_REGISTRO, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  const raw = await resp.text();
  logDebug("Resposta upload_foto raw: " + raw);
  logDebug(`upload_foto HTTP status: ${resp.status}`);

  let j = null;
  try { j = JSON.parse(raw); } catch {}

  if (!(j && j.ok && j.fotoUrl)) {
    throw new Error("upload_foto: resposta inválida/sem ok");
  }
  return j;
}
