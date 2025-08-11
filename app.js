// v1.5 - Gruas aplicáveis passa a exibir C (todas) e M (todas) vindas do Apps Script; mantém debounce e auto-stop

let html5QrCode;
let scannerRunning = false;
let leituraProcessada = false;
let fetchStarted = false;
let lastHandledAt = 0;

function logDebug(msg) {
  const el = document.getElementById("debug-log");
  const ts = new Date().toLocaleTimeString();
  if (el) { el.value += `[${ts}] ${msg}\n`; el.scrollTop = el.scrollHeight; }
}

function limparDebug() { const el = document.getElementById("debug-log"); if (el) el.value = ""; }
function copiarDebug() { const el = document.getElementById("debug-log"); if (!el) return; el.select(); document.execCommand("copy"); }

function iniciarLeitor() {
  if (scannerRunning) return;
  logDebug("Iniciando leitor...");
  html5QrCode = new Html5Qrcode("qr-reader");

  leituraProcessada = false;
  fetchStarted = false;
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
        fetchStarted = false;
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

  if (partes.length < 4) {
    logDebug("Formato inválido: esperado 4 partes.");
    leituraProcessada = false;
    return;
  }

  pararLeitor(); // evita novos callbacks

  const parte0 = String(partes[0]).trim();
  const parte1Original = String(partes[1]).trim();
  let parte1Limpo = parte1Original.replace(/^0+/, "");
  if (parte1Limpo === "") parte1Limpo = "0";
  partes[1] = parte1Limpo;

  document.getElementById("codigo-lido").value = qrCodeMessage;
  document.getElementById("campo1").value = parte0;
  document.getElementById("campo2").value = parte1Limpo;
  document.getElementById("campo3").value = partes[2];
  document.getElementById("campo4").value = partes[3];

  const elI = document.getElementById("resultado-google");
  const elGruas = document.getElementById("gruas-aplicaveis");
  const elExata = document.getElementById("correspondencia-exata");
  if (elI) elI.value = "";
  if (elGruas) elGruas.value = "";
  if (elExata) elExata.value = "";

  logDebug(`Parte[1] original: ${parte1Original} | limpa: ${parte1Limpo}`);

  if (fetchStarted) { logDebug("Fetch bloqueado (já iniciado)."); return; }
  fetchStarted = true;

  const endpoint = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";

  // (A) H -> I
  const urlI = `${endpoint}?mode=i_por_h&codigo=${encodeURIComponent(parte0)}`;
  logDebug("GET Resultado da consulta (H->I): " + urlI);
  fetch(urlI).then(r=>r.text()).then(raw=>{
    logDebug("Resposta (H->I) raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) { const v=(j.resultado||"").trim(); if (elI) elI.value = v || "Não encontrado"; }
    else { if (elI) elI.value = "Não encontrado"; logDebug("H->I: resposta inválida/sem ok"); }
  }).catch(err=>{ if (elI) elI.value="Erro na consulta"; logDebug("Erro H->I:", err); });

  // (B) H -> C[] e M[] (todas)
  const urlGruas = `${endpoint}?mode=gruas&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Gruas aplicáveis (H->C[] & M[]): " + urlGruas);
  fetch(urlGruas).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Gruas raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) {
      const listaC = Array.isArray(j.gruasC) ? j.gruasC : [];
      const listaM = Array.isArray(j.gruasM) ? j.gruasM : [];
      // Monta texto: primeiro C (modelos de linha), depois M (GT-xx etc.)
      const linhas = [];
      if (listaC.length) linhas.push(`Modelos (C): ${listaC.join(", ")}`);
      if (listaM.length) linhas.push(`Aplicações (M): ${listaM.join(", ")}`);
      const texto = linhas.length ? linhas.join("\n") : "Não encontrado";
      if (elGruas) elGruas.value = texto;
    } else {
      if (elGruas) elGruas.value = "Não encontrado";
      logDebug("Gruas: resposta inválida/sem ok");
    }
  }).catch(err=>{ if (elGruas) elGruas.value="Erro na consulta"; logDebug("Erro Gruas:", err); });

  // (C) H & K -> M (exata)
  const urlExata = `${endpoint}?mode=exata&h=${encodeURIComponent(parte0)}&k=${encodeURIComponent(parte1Limpo)}`;
  logDebug("GET Correspondência exata (H&K->M): " + urlExata);
  fetch(urlExata).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Exata raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) {
      const valor = (j.exata || "").trim();
      if (elExata) elExata.value = valor || "Não encontrado";
    } else {
      if (elExata) elExata.value = "Não encontrado";
      logDebug("Exata: resposta inválida/sem ok");
    }
  }).catch(err=>{ if (elExata) elExata.value="Erro na consulta"; logDebug("Erro Exata:", err); });
}
