// v1.2 - Prioriza câmera traseira + restaura preenchimento de #resultado-google (H->I via mode=i_por_h) + mantém Gruas (H->C) e Exata (H&K->M)

let html5QrCode;
let scannerRunning = false;

function logDebug(msg) {
  const el = document.getElementById("debug-log");
  const ts = new Date().toLocaleTimeString();
  if (el) { el.value += `[${ts}] ${msg}\n`; el.scrollTop = el.scrollHeight; }
}

function limparDebug() {
  const el = document.getElementById("debug-log");
  if (el) el.value = "";
}

function copiarDebug() {
  const el = document.getElementById("debug-log");
  if (!el) return;
  el.select();
  document.execCommand("copy");
}

function iniciarLeitor() {
  if (scannerRunning) return;
  logDebug("Iniciando leitor...");
  html5QrCode = new Html5Qrcode("qr-reader");

  const config = { fps: 10, qrbox: 250 };

  // Tenta câmera traseira por facingMode
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
  logDebug("QR bruto lido: " + qrCodeMessage);

  const partes = qrCodeMessage.split("|").filter(Boolean);
  logDebug("Partes após split('|'): " + JSON.stringify(partes));

  if (partes.length < 4) {
    logDebug("Formato inválido: esperado 4 partes.");
    return;
  }

  const parte0 = String(partes[0]).trim();
  const parte1Original = String(partes[1]).trim();
  let parte1Limpo = parte1Original.replace(/^0+/, "");
  if (parte1Limpo === "") parte1Limpo = "0";
  partes[1] = parte1Limpo; // sobrescreve para evitar confusão

  // Preenche UI
  document.getElementById("codigo-lido").value = qrCodeMessage;
  document.getElementById("campo1").value = parte0;
  document.getElementById("campo2").value = parte1Limpo;
  document.getElementById("campo3").value = partes[2];
  document.getElementById("campo4").value = partes[3];

  // Limpa resultados antes de buscar
  const elI = document.getElementById("resultado-google");
  const elGruas = document.getElementById("gruas-aplicaveis");
  const elExata = document.getElementById("correspondencia-exata");
  if (elI) elI.value = "";
  if (elGruas) elGruas.value = "";
  if (elExata) elExata.value = "";

  logDebug(`Parte[1] original: ${parte1Original} | limpa: ${parte1Limpo}`);

  // End-point único
  const endpoint = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";

  // (A) Resultado da consulta (H -> I) — preenche #resultado-google
  const urlI = `${endpoint}?mode=i_por_h&codigo=${encodeURIComponent(parte0)}`;
  logDebug("GET Resultado da consulta (H->I): " + urlI);
  fetch(urlI)
    .then(r => r.text())
    .then(raw => {
      logDebug("Resposta (H->I) raw: " + raw);
      let j = null; try { j = JSON.parse(raw); } catch {}
      if (j && j.ok) {
        const valor = (j.resultado || "").trim();
        if (elI) elI.value = valor || "Não encontrado";
      } else {
        if (elI) elI.value = "Não encontrado";
        logDebug("H->I: resposta inválida/sem ok");
      }
    })
    .catch(err => { if (elI) elI.value = "Erro na consulta"; logDebug("Erro H->I:", err); });

  // (B) Gruas aplicáveis (H -> C[])
  const urlGruas = `${endpoint}?mode=gruas&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Gruas aplicáveis (H->C[]): " + urlGruas);
  fetch(urlGruas)
    .then(r => r.text())
    .then(raw => {
      logDebug("Resposta Gruas raw: " + raw);
      let j = null; try { j = JSON.parse(raw); } catch {}
      if (j && j.ok) {
        const lista = Array.isArray(j.gruas) ? j.gruas : [];
        if (elGruas) elGruas.value = lista.length ? lista.join("\n") : "Não encontrado";
      } else {
        if (elGruas) elGruas.value = "Não encontrado";
        logDebug("Gruas: resposta inválida/sem ok");
      }
    })
    .catch(err => { if (elGruas) elGruas.value = "Erro na consulta"; logDebug("Erro Gruas:", err); });

  // (C) Correspondência exata (H & K -> M)
  const urlExata = `${endpoint}?mode=exata&h=${encodeURIComponent(parte0)}&k=${encodeURIComponent(parte1Limpo)}`;
  logDebug("GET Correspondência exata (H&K->M): " + urlExata);
  fetch(urlExata)
    .then(r => r.text())
    .then(raw => {
      logDebug("Resposta Exata raw: " + raw);
      let j = null; try { j = JSON.parse(raw); } catch {}
      if (j && j.ok) {
        const valor = (j.exata || "").trim();
        if (elExata) elExata.value = valor || "Não encontrado";
      } else {
        if (elExata) elExata.value = "Não encontrado";
        logDebug("Exata: resposta inválida/sem ok");
      }
    })
    .catch(err => { if (elExata) elExata.value = "Erro na consulta"; logDebug("Erro Exata:", err); });
}

function registrarMovimentacao(tipo) {
  const manual = document.getElementById("manual-input").value.trim();
  const lido = document.getElementById("codigo-lido").value.trim();
  const codigo = manual || lido;
  if (!codigo) { document.getElementById("status-msg").innerText = "Informe ou leia um código."; return; }
  logDebug(`Registrando ${tipo}: ${codigo}`);
  // POST (se necessário)...
}
