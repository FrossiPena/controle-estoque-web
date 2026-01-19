// v3.81 - NumInv (Inventário): adiciona campo numinv-input no frontend e envia para log_mov (Inventário)
// Mantém separação: ENDPOINT_CONSULTA (Consolidado) vs ENDPOINT_REGISTRO (Inventário)

const APP_VERSION = "v3.81";

const ENDPOINT_CONSULTA =
  "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";

const ENDPOINT_REGISTRO =
  "https://script.google.com/macros/s/AKfycbzvE45zfPWrCMCKRBRTkBitwSvE0XSLBjxp1ZVeBW0ASGPolGugtDUorcbr3seAAROp/exec";


let html5QrCode;
let scannerRunning = false;
let leituraProcessada = false;
let lastHandledAt = 0;

let gpsString = "";

// -------------------- DEBUG --------------------
function logDebug(msg) {
  const el = document.getElementById("debug-log");
  const ts = new Date().toLocaleTimeString();
  if (el) {
    el.value += `[${ts}] ${msg}\n`;
    el.scrollTop = el.scrollHeight;
  }
}
function limparDebug() { const el = document.getElementById("debug-log"); if (el) el.value = ""; }
function copiarDebug() { const el = document.getElementById("debug-log"); if (!el) return; el.select(); document.execCommand("copy"); }

logDebug(`Carregado app.js versão ${APP_VERSION}`);
logDebug(`ENDPOINT_CONSULTA: ${ENDPOINT_CONSULTA}`);
logDebug(`ENDPOINT_REGISTRO: ${ENDPOINT_REGISTRO}`);

window.addEventListener("DOMContentLoaded", () => {
  const rua = document.getElementById("rua-input");
  const andar = document.getElementById("andar-input");
  const numInv = document.getElementById("numinv-input");
  const campo1 = document.getElementById("campo1");
  const campo2 = document.getElementById("campo2");

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

  onlyDigits(numInv, "NumInv");
  onlyDigits(rua, "Rua");
  onlyDigits(andar, "Andar");

  if (campo1) campo1.addEventListener("input", () => setCampo1CorPorTamanho(campo1.value.trim()));

  if (campo2) {
    campo2.addEventListener("blur", () => {
      let v = (campo2.value || "").trim();
      const original = v;
      v = v.replace(/^0+/, "");
      if (v === "") v = "0";
      if (v !== original) logDebug(`Campo2 normalizado (blur): ${original} -> ${v}`);
      campo2.value = v;
    });
  }

  testarDiagRegistro();
});

// -------------------- DIAG REGISTRO --------------------
async function testarDiagRegistro() {
  const url = `${ENDPOINT_REGISTRO}?mode=diag&t=${Date.now()}`;
  logDebug("GET DIAG (registro): " + url);
  try {
    const raw = await (await fetch(url)).text();
    logDebug("Resposta DIAG (registro) raw: " + raw);
    let j = null;
    try { j = JSON.parse(raw); } catch {}
    if (j && j.ok) logDebug(`Backend REGISTRO OK. version=${j.version}`);
    else logDebug("DIAG (registro) retornou resposta não-ok.");
  } catch (e) {
    logDebug("Erro DIAG (registro): " + e);
  }
}

// -------------------- CAMPO1 COR --------------------
function setCampo1CorPorTamanho(valor) {
  const el = document.getElementById("campo1");
  if (!el) return;
  el.classList.remove("campo1-ok", "campo1-bad");
  const len = (valor || "").length;
  if (len === 9) el.classList.add("campo1-ok");
  else el.classList.add("campo1-bad");
}

// -------------------- QR SCANNER --------------------
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
    (qrCodeMessage) => processarQRCode(qrCodeMessage)
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
        (qrCodeMessage) => processarQRCode(qrCodeMessage)
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

  setCampo1CorPorTamanho(parte0);
  logDebug(`Parte[1] original: ${parte1Original} | limpa: ${parte1Limpo}`);

  consultarDados();
}

// -------------------- CONSULTAR (Consolidado) --------------------
function consultarDados() {
  const parte0 = (document.getElementById("campo1")?.value || "").trim();
  let parte1 = (document.getElementById("campo2")?.value || "").trim();

  parte1 = parte1.replace(/^0+/, "");
  if (parte1 === "") parte1 = "0";
  if (document.getElementById("campo2")) document.getElementById("campo2").value = parte1;

  const elI = document.getElementById("resultado-google");
  const elGruas = document.getElementById("gruas-aplicaveis");
  const elExata = document.getElementById("correspondencia-exata");
  const elDescPT = document.getElementById("descricao-pt");

  if (elI) elI.value = "";
  if (elGruas) elGruas.value = "";
  if (elExata) elExata.value = "";
  if (elDescPT) elDescPT.value = "";

  if (!parte0) {
    if (elI) elI.value = "Não encontrado";
    if (elGruas) elGruas.value = "Não encontrado";
    if (elExata) elExata.value = "Não encontrado";
    if (elDescPT) elDescPT.value = "Não encontrado";
    logDebug("Consultar: campo1 vazio. Abortando consultas.");
    return;
  }

  setCampo1CorPorTamanho(parte0);
  const t = Date.now();

  const urlI = `${ENDPOINT_CONSULTA}?mode=i_por_h&codigo=${encodeURIComponent(parte0)}&t=${t}`;
  logDebug("GET Resultado da consulta (H->I) [CONSULTA]: " + urlI);
  fetch(urlI).then(r=>r.text()).then(raw=>{
    logDebug("Resposta (H->I) raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) { const v=(j.resultado||"").trim(); if (elI) elI.value = v || "Não encontrado"; }
    else { if (elI) elI.value = "Não encontrado"; }
  }).catch(e=>{ logDebug("Erro fetch (H->I): " + e); if (elI) elI.value = "Não encontrado"; });

  const urlGruas = `${ENDPOINT_CONSULTA}?mode=gruas&h=${encodeURIComponent(parte0)}&t=${t}`;
  logDebug("GET Gruas aplicáveis (H->C[] & M[]) [CONSULTA]: " + urlGruas);
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
      if (elGruas) elGruas.value = texto;
      logDebug("Gruas aplicáveis (texto final): " + texto.replace(/\n/g," | "));
    } else {
      if (elGruas) elGruas.value = "Não encontrado";
    }
  }).catch(e=>{ logDebug("Erro fetch Gruas: " + e); if (elGruas) elGruas.value = "Não encontrado"; });

  const urlExata = `${ENDPOINT_CONSULTA}?mode=exata&h=${encodeURIComponent(parte0)}&k=${encodeURIComponent(parte1)}&t=${t}`;
  logDebug("GET Correspondência exata (H&K->M) [CONSULTA]: " + urlExata);
  fetch(urlExata).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Exata raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (elExata) elExata.value = (j && j.ok && (j.exata||"").trim()) ? (j.exata||"").trim() : "Não encontrado";
  }).catch(e=>{ logDebug("Erro fetch Exata: " + e); if (elExata) elExata.value = "Não encontrado"; });

  const urlDescPT = `${ENDPOINT_CONSULTA}?mode=desc_pt&h=${encodeURIComponent(parte0)}&t=${t}`;
  logDebug("GET Descrição Português [CONSULTA]: " + urlDescPT);
  fetch(urlDescPT).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Descrição PT raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (elDescPT) elDescPT.value = (j && j.ok && (j.descricao||"").trim()) ? (j.descricao||"").trim() : "Não encontrado";
  }).catch(e=>{ logDebug("Erro fetch Desc PT: " + e); if (elDescPT) elDescPT.value = "Não encontrado"; });
}

function consultar() { consultarDados(); }
function consultarUI() { consultarDados(); }

// -------------------- GPS --------------------
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

// -------------------- REGISTRAR (Inventário) --------------------
async function registrarMovimentacaoUI() {
  const status = document.getElementById("status-msg");

  const campo1 = (document.getElementById("campo1")?.value || "").trim();
  let campo2 = (document.getElementById("campo2")?.value || "").trim();

  // NOVO: NumInv
  const numInv = (document.getElementById("numinv-input")?.value || "").trim();

  const loc   = (document.getElementById("loc-select")?.value || "").trim();
  const rua   = (document.getElementById("rua-input")?.value || "").trim();
  const andar = (document.getElementById("andar-input")?.value || "").trim();

  const gpsOn = !!document.getElementById("gps-check")?.checked;

  const campo2Original = campo2;
  campo2 = campo2.replace(/^0+/, "");
  if (campo2 === "") campo2 = "0";
  if (campo2 !== campo2Original) logDebug(`Campo2 normalizado (registrar): ${campo2Original} -> ${campo2}`);
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
      logDebug("Erro GPS (seguindo sem GPS): " + e);
      gpsString = "";
    }
  }

  const t = Date.now();
  const urlLog =
    `${ENDPOINT_REGISTRO}?mode=log_mov` +
    `&campo1=${encodeURIComponent(campo1)}` +
    `&campo2=${encodeURIComponent(campo2)}` +
    `&numInv=${encodeURIComponent(numInv)}` +          // NOVO
    `&loc=${encodeURIComponent(loc)}` +
    `&rua=${encodeURIComponent(rua)}` +
    `&andar=${encodeURIComponent(andar)}` +
    `&gpsString=${encodeURIComponent(gpsString)}` +
    `&t=${t}`;

  logDebug("GET Registrar (log_mov) [REGISTRO]: " + urlLog);

  try {
    const raw = await (await fetch(urlLog)).text();
    logDebug("Resposta Registrar raw: " + raw);

    let j = null;
    try { j = JSON.parse(raw); } catch {}

    if (j && j.ok && j.appended) {
      if (status) status.innerText = `Salvo com sucesso (linha ${j.row} em ${j.sheet} às ${j.dataHora}).`;
      logDebug(`Registro OK: row=${j.row} sheet=${j.sheet} dataHora=${j.dataHora}`);
    } else {
      const errMsg = (j && (j.error || j.detail)) ? `${j.error || ""} ${j.detail || ""}`.trim() : "Resposta inválida";
      if (status) status.innerText = `Falha ao salvar: ${errMsg}`;
      logDebug("Registrar: falha. " + errMsg);
    }
  } catch (err) {
    if (status) status.innerText = "Erro de rede ao salvar (ver debug).";
    logDebug("Erro Registrar: " + err);
  }
}


