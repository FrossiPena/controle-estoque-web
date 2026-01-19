// v3.84 - Linha Inventário: consultar/deletar por número da linha (get_row / del_row) no ENDPOINT_REGISTRO

const APP_VERSION = "v3.84";

const ENDPOINT_CONSULTA =
  "https://script.google.com/macros/s/AKfycbxE5uwmWek7HDPlBh1cD52HPDsIREptl31j-BTt2wXWaoj2KxOYQiVXmHMAP0PiDjeT/exec";

const ENDPOINT_REGISTRO =
  "https://script.google.com/macros/s/AKfycbwFTBzg19Oehw0rQxFi1oVm31st0MouechBMMhNAHnJrj4nrWJKnikI9vAino2E8a_Q/exec";

let html5QrCode;
let scannerRunning = false;
let leituraProcessada = false;
let lastHandledAt = 0;

let gpsString = "";

// -------------------- DEBUG --------------------
function logDebug(msg) {
  const el = document.getElementById("debug-log");
  const ts = new Date().toLocaleTimeString();
  if (el) { el.value += `[${ts}] ${msg}\n`; el.scrollTop = el.scrollHeight; }
}
logDebug(`Carregado app.js versão ${APP_VERSION}`);
logDebug(`ENDPOINT_CONSULTA: ${ENDPOINT_CONSULTA}`);
logDebug(`ENDPOINT_REGISTRO: ${ENDPOINT_REGISTRO}`);

function limparDebug() { const el = document.getElementById("debug-log"); if (el) el.value = ""; }
function copiarDebug() { const el = document.getElementById("debug-log"); if (!el) return; el.select(); document.execCommand("copy"); }

// -------------------- HELPERS --------------------
function setCampo1CorPorTamanho(valor) {
  const el = document.getElementById("campo1");
  if (!el) return;

  el.classList.remove("campo1-ok", "campo1-bad");
  const len = (valor || "").length;

  if (len === 9) el.classList.add("campo1-ok");
  else el.classList.add("campo1-bad");
}

function limparCamposPosRegistroSucesso() {
  const campo1 = document.getElementById("campo1");
  const campo2 = document.getElementById("campo2");
  const codigoC = document.getElementById("codigoC-input");
  const rua = document.getElementById("rua-input");
  const andar = document.getElementById("andar-input");

  if (campo1) campo1.value = "";
  if (codigoC) codigoC.value = "";
  if (campo2) campo2.value = "";
  if (rua) rua.value = "";
  if (andar) andar.value = "";

  setCampo1CorPorTamanho("");
  logDebug("Campos limpos após registro bem-sucedido.");
}

function onlyDigits(el, label, maxLen = null) {
  if (!el) return;
  el.addEventListener("input", () => {
    const before = el.value;
    let after = before.replace(/\D+/g, "");
    if (maxLen && after.length > maxLen) after = after.slice(0, maxLen);
    if (before !== after) {
      el.value = after;
      logDebug(`${label}: removidos caracteres não numéricos.`);
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  onlyDigits(document.getElementById("rua-input"), "Rua");
  onlyDigits(document.getElementById("andar-input"), "Andar");
  onlyDigits(document.getElementById("codigoC-input"), "Codigo C");
  onlyDigits(document.getElementById("numinv-input"), "NumInv");
  onlyDigits(document.getElementById("linha_consulta"), "Linha consulta", 3);

  const campo1 = document.getElementById("campo1");
  if (campo1) campo1.addEventListener("input", () => setCampo1CorPorTamanho(campo1.value.trim()));
});

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
    qrCodeMessage => processarQRCode(qrCodeMessage)
  ).then(() => {
    scannerRunning = true;
    leituraProcessada = false;
    lastHandledAt = 0;
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

  consultarDados();
}

// -------------------- CONSULTA (Consolidado) --------------------
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
    return;
  }

  setCampo1CorPorTamanho(parte0);

  const urlI = `${ENDPOINT_CONSULTA}?mode=i_por_h&codigo=${encodeURIComponent(parte0)}`;
  logDebug("GET Resultado da consulta (H->I): " + urlI);
  fetch(urlI).then(r=>r.text()).then(raw=>{
    logDebug("Resposta (H->I) raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    if (j && j.ok) { const v=(j.resultado||"").trim(); if (elI) elI.value = v || "Não encontrado"; }
    else { if (elI) elI.value = "Não encontrado"; }
  }).catch(e=>{
    logDebug("Erro (H->I): " + e);
    if (elI) elI.value = "Não encontrado";
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
  }).catch(e=>{
    logDebug("Erro Gruas: " + e);
    document.getElementById("gruas-aplicaveis").value = "Não encontrado";
  });

  const urlExata = `${ENDPOINT_CONSULTA}?mode=exata&h=${encodeURIComponent(parte0)}&k=${encodeURIComponent(parte1)}`;
  logDebug("GET Correspondência exata (H&K->M): " + urlExata);
  fetch(urlExata).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Exata raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    document.getElementById("correspondencia-exata").value =
      (j && j.ok && (j.exata||"").trim()) ? (j.exata||"").trim() : "Não encontrado";
  }).catch(e=>{
    logDebug("Erro Exata: " + e);
    document.getElementById("correspondencia-exata").value = "Não encontrado";
  });

  const urlDescPT = `${ENDPOINT_CONSULTA}?mode=desc_pt&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Descrição Português: " + urlDescPT);
  fetch(urlDescPT).then(r=>r.text()).then(raw=>{
    logDebug("Resposta Descrição PT raw: " + raw);
    let j=null; try{ j=JSON.parse(raw); }catch{}
    document.getElementById("descricao-pt").value =
      (j && j.ok && (j.descricao||"").trim()) ? (j.descricao||"").trim() : "Não encontrado";
  }).catch(e=>{
    logDebug("Erro Desc PT: " + e);
    document.getElementById("descricao-pt").value = "Não encontrado";
  });
}

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

// -------------------- REGISTRO (Inventário) --------------------
async function registrarMovimentacaoUI() {
  const status = document.getElementById("status-msg");

  const campo1 = (document.getElementById("campo1")?.value || "").trim();
  let campo2 = (document.getElementById("campo2")?.value || "").trim();
  const loc   = (document.getElementById("loc-select")?.value || "").trim();
  const rua   = (document.getElementById("rua-input")?.value || "").trim();
  const andar = (document.getElementById("andar-input")?.value || "").trim();
  const numInv = (document.getElementById("numinv-input")?.value || "").trim();

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
    `&numInv=${encodeURIComponent(numInv)}`;

  logDebug("GET Registrar (log_mov): " + urlLog);

  try {
    const raw = await (await fetch(urlLog)).text();
    logDebug("Resposta Registrar raw: " + raw);

    let j = null;
    try { j = JSON.parse(raw); } catch {}

    if (j && j.ok && j.appended) {
      if (status) status.innerText = `Registrado com sucesso (linha ${j.row} em ${j.sheet} às ${j.dataHora}).`;
      logDebug(`Registro OK: row=${j.row} dataHora=${j.dataHora}`);
      limparCamposPosRegistroSucesso();
    } else {
      if (status) status.innerText = "Falha ao registrar (ver debug).";
      logDebug("Registrar: resposta inválida/sem ok.");
    }
  } catch (err) {
    if (status) status.innerText = "Erro de rede ao registrar (ver debug).";
    logDebug("Erro Registrar: " + err);
  }
}

// -------------------- NOVO: CONSULTAR LINHA (Inventário) --------------------
async function consultarLinhaInventarioUI() {
  const status = document.getElementById("status-msg");
  const txtLin = document.getElementById("txt_lin");
  const linStr = (document.getElementById("linha_consulta")?.value || "").trim();

  if (txtLin) txtLin.value = "";

  const row = parseInt(linStr, 10);
  if (!row || row < 2) {
    logDebug("Consultar linha: informe um número de linha válido (>=2).");
    if (status) status.innerText = "Informe uma linha válida (>=2).";
    if (txtLin) txtLin.value = "Linha inválida.";
    return;
  }

  if (status) status.innerText = "Consultando linha...";
  const url = `${ENDPOINT_REGISTRO}?mode=get_row&row=${encodeURIComponent(String(row))}&t=${Date.now()}`;
  logDebug("GET Consultar linha (get_row): " + url);

  try {
    const raw = await (await fetch(url)).text();
    logDebug("Resposta get_row raw: " + raw);

    let j = null;
    try { j = JSON.parse(raw); } catch {}

    if (j && j.ok && j.row) {
      const resumo =
        `Linha ${j.row}: ` +
        `Codigo 9: "${j.campo1 || ""}"; ` +
        `Num ind: "${j.campo2 || ""}"; ` +
        `Pátio: "${j.loc || ""}"; ` +
        `Rua: "${j.rua || ""}"; ` +
        `Andar: "${j.andar || ""}"; ` +
        `GPS: "${j.gpsString || ""}"; ` +
        `Data/Hora: "${j.dataHora || ""}"; ` +
        `NumInv: "${j.numInv || ""}"`;

      if (txtLin) txtLin.value = resumo;
      if (status) status.innerText = "Linha consultada.";
      logDebug("Linha consultada OK.");
    } else {
      if (txtLin) txtLin.value = "Não encontrado.";
      if (status) status.innerText = "Linha não encontrada (ver debug).";
      logDebug("Consultar linha: resposta inválida/sem ok.");
    }
  } catch (e) {
    if (txtLin) txtLin.value = "Erro ao consultar.";
    if (status) status.innerText = "Erro ao consultar (ver debug).";
    logDebug("Erro consultar linha: " + e);
  }
}

// -------------------- NOVO: DELETAR LINHA (Inventário) --------------------
async function deletarLinhaInventarioUI() {
  const status = document.getElementById("status-msg");
  const txtLin = document.getElementById("txt_lin");
  const linStr = (document.getElementById("linha_consulta")?.value || "").trim();

  const row = parseInt(linStr, 10);
  if (!row || row < 2) {
    logDebug("Deletar linha: informe um número de linha válido (>=2).");
    if (status) status.innerText = "Informe uma linha válida (>=2).";
    return;
  }

  // 1) Recupera conteúdo antes de deletar (para confirmar)
  const urlGet = `${ENDPOINT_REGISTRO}?mode=get_row&row=${encodeURIComponent(String(row))}&t=${Date.now()}`;
  logDebug("GET Pré-delete (get_row): " + urlGet);

  let jGet = null;
  try {
    const rawGet = await (await fetch(urlGet)).text();
    logDebug("Resposta pré-delete raw: " + rawGet);
    try { jGet = JSON.parse(rawGet); } catch {}
  } catch (e) {
    logDebug("Erro pré-delete (get_row): " + e);
  }

  if (!jGet || !jGet.ok) {
    if (status) status.innerText = "Não foi possível recuperar a linha para confirmação (ver debug).";
    return;
  }

  const resumo =
    `Linha ${jGet.row}: ` +
    `Codigo 9="${jGet.campo1 || ""}", ` +
    `Num ind="${jGet.campo2 || ""}", ` +
    `Pátio="${jGet.loc || ""}", Rua="${jGet.rua || ""}", Andar="${jGet.andar || ""}", ` +
    `Data/Hora="${jGet.dataHora || ""}", NumInv="${jGet.numInv || ""}"`;

  const ok = window.confirm(`Deseja deletar a linha ${row}?\n\n${resumo}`);
  if (!ok) {
    logDebug("Delete cancelado pelo usuário.");
    if (status) status.innerText = "Delete cancelado.";
    return;
  }

  // 2) Deleta
  if (status) status.innerText = "Deletando linha...";
  const urlDel = `${ENDPOINT_REGISTRO}?mode=del_row&row=${encodeURIComponent(String(row))}&t=${Date.now()}`;
  logDebug("GET Deletar (del_row): " + urlDel);

  try {
    const rawDel = await (await fetch(urlDel)).text();
    logDebug("Resposta del_row raw: " + rawDel);

    let jDel = null;
    try { jDel = JSON.parse(rawDel); } catch {}

    if (jDel && jDel.ok && jDel.deleted) {
      if (status) status.innerText = `Linha ${row} deletada com sucesso.`;
      if (txtLin) txtLin.value = `Linha ${row} deletada.`;
      logDebug("Delete OK.");
    } else {
      if (status) status.innerText = "Falha ao deletar (ver debug).";
      logDebug("Delete: resposta inválida/sem ok.");
    }
  } catch (e) {
    if (status) status.innerText = "Erro ao deletar (ver debug).";
    logDebug("Erro delete: " + e);
  }
}
