// v3.4 - Checkbox GPS no Registrar: captura latitude/longitude e salva em string (gpsString)

const APP_VERSION = "v3.4";

let html5QrCode;
let scannerRunning = false;
let leituraProcessada = false;
let lastHandledAt = 0;

// Armazena a última leitura de GPS em string, quando solicitada
let gpsString = "";

function logDebug(msg) {
  const el = document.getElementById("debug-log");
  const ts = new Date().toLocaleTimeString();
  if (el) { el.value += `[${ts}] ${msg}\n`; el.scrollTop = el.scrollHeight; }
}
logDebug(`Carregado app.js versão ${APP_VERSION}`);

window.addEventListener("DOMContentLoaded", () => {
  const rua = document.getElementById("rua-input");
  const andar = document.getElementById("andar-input");
  const campo1 = document.getElementById("campo1");

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

  if (campo1) {
    campo1.addEventListener("input", () => setCampo1CorPorTamanho(campo1.value.trim()));
  }
});

function setCampo1CorPorTamanho(valor) {
  const el = document.getElementById("campo1");
  if (!el) return;

  el.classList.remove("campo1-ok", "campo1-bad");
  const len = (valor || "").length;

  if (len === 9) el.classList.add("campo1-ok");
  else el.classList.add("campo1-bad");

  logDebug(`Validação campo1: "${valor}" (len=${len}) => ${len === 9 ? "OK" : "ERRO"}`);
}

function limparDebug() { const el = document.getElementById("debug-log"); if (el) el.value = ""; }
function copiarDebug() { const el = document.getElementById("debug-log"); if (!el) return; el.select(); document.execCommand("copy"); }

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

  setCampo1CorPorTamanho(parte0);

  logDebug(`Parte[1] original: ${parte1Original} | limpa: ${parte1Limpo}`);

  // dispara a consulta automaticamente após leitura
  consultarDados();
}

function consultarDados() {
  const endpoint = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";

  const parte0 = (document.getElementById("campo1")?.value || "").trim();
  let parte1 = (document.getElementById("campo2")?.value || "").trim();

  const parte1Original = parte1;
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
    logDebug("Consultar: campo1 vazio. Nada a consultar.");
    if (elI) elI.value = "Não encontrado";
    if (elGruas) elGruas.value = "Não encontrado";
    if (elExata) elExata.value = "Não encontrado";
    if (elDescPT) elDescPT.value = "Não encontrado";
    return;
  }

  setCampo1CorPorTamanho(parte0);
  logDebug(`Consultar: parte0=${parte0} | parte1=${parte1} (original=${parte1Original})`);

  const urlI = `${endpoint}?mode=i_por_h&codigo=${encodeURIComponent(parte0)}`;
  logDebug("GET Resultado da consulta (H->I): " + urlI);
  fetch(urlI).then(r=>r.text()).then(raw=>{
    logDebug("Resposta (H->I) raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) { const v=(j.resultado||"").trim(); if (elI) elI.value = v || "Não encontrado"; }
    else { if (elI) elI.value = "Não encontrado"; logDebug("H->I: resposta inválida/sem ok"); }
  }).catch(err=>{ if (elI) elI.value="Erro na consulta"; logDebug("Erro H->I: " + err); });

  const urlGruas = `${endpoint}?mode=gruas&h=${encodeURIComponent(parte0)}`;
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
      logDebug("Gruas aplicáveis (texto final): " + texto);
    } else {
      document.getElementById("gruas-aplicaveis").value = "Não encontrado";
      logDebug("Gruas: resposta inválida/sem ok");
    }
  }).catch(err=>{
    document.getElementById("gruas-aplicaveis").value = "Erro na consulta";
    logDebug("Erro Gruas: " + err);
  });

  const urlExata = `${endpoint}?mode=exata&h=${encodeURIComponent(parte0)}&k=${encodeURIComponent(parte1)}`;
  logDebug("GET Correspondência exata (H&K->M): " + urlExata);
  fetch(urlExata).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Exata raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) {
      const valor = (j.exata || "").trim();
      document.getElementById("correspondencia-exata").value = valor || "Não encontrado";
    } else {
      document.getElementById("correspondencia-exata").value = "Não encontrado";
      logDebug("Exata: resposta inválida/sem ok");
    }
  }).catch(err=>{
    document.getElementById("correspondencia-exata").value = "Erro na consulta";
    logDebug("Erro Exata: " + err);
  });

  const urlDescPT = `${endpoint}?mode=desc_pt&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Descrição Português (H->L[16]->Relação[H]->B): " + urlDescPT);
  fetch(urlDescPT).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Descrição PT raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) {
      const valor = (j.descricao || "").trim();
      document.getElementById("descricao-pt").value = valor || "Não encontrado";
      logDebug("Descrição PT preenchida: " + (valor || "Não encontrado"));
    } else {
      document.getElementById("descricao-pt").value = "Não encontrado";
      logDebug("Descrição PT: resposta inválida/sem ok");
    }
  }).catch(err=>{
    document.getElementById("descricao-pt").value = "Erro na consulta";
    logDebug("Erro Descrição PT: " + err);
  });
}

// --- NOVO: GPS ---
function obterGpsString() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation não suportado neste navegador."));
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = pos.coords.accuracy; // metros
        const ts = new Date(pos.timestamp).toISOString();

        const s = `lat=${lat}, lon=${lon}, acc_m=${acc}, ts=${ts}`;
        resolve(s);
      },
      (err) => {
        reject(new Error(`Falha ao obter GPS: ${err.message}`));
      },
      options
    );
  });
}

async function registrarMovimentacaoUI() {
  const parte0 = (document.getElementById("campo1")?.value || "").trim();
  const parte1 = (document.getElementById("campo2")?.value || "").trim();
  const loc = (document.getElementById("loc-select")?.value || "").trim();
  const rua = (document.getElementById("rua-input")?.value || "").trim();
  const andar = (document.getElementById("andar-input")?.value || "").trim();

  const gpsOn = !!document.getElementById("gps-check")?.checked;

  logDebug(`Registrar (novo): parte0=${parte0} parte1=${parte1} loc=${loc} rua=${rua} andar=${andar} gps=${gpsOn ? 1 : 0}`);

  const status = document.getElementById("status-msg");
  if (status) status.innerText = gpsOn ? "Obtendo GPS..." : "Registrando sem GPS...";

  gpsString = "";

  if (gpsOn) {
    try {
      gpsString = await obterGpsString();
      logDebug("GPS capturado: " + gpsString);
      if (status) status.innerText = "GPS capturado. Pronto para registrar.";
    } catch (e) {
      logDebug("Erro GPS: " + e);
      if (status) status.innerText = "Erro ao capturar GPS (ver debug).";
      // segue sem gpsString
    }
  } else {
    if (status) status.innerText = "Pronto para registrar (sem GPS).";
  }

  // Neste ponto você já tem gpsString (ou vazio).
  // Próximo passo (quando você mandar): enviar via POST para o Apps Script e gravar em planilha de log.
  logDebug("gpsString atual: " + (gpsString || "(vazio)"));
}
