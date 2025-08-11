// v0.2 - Remove zeros à esquerda de partes[1] e exibe no debug antes de buscar no Apps Script

let html5QrCode;
let scannerRunning = false;

function logDebug(msg) {
  const log = document.getElementById("debug-log");
  const now = new Date().toLocaleTimeString();
  log.value += `[${now}] ${msg}\n`;
  log.scrollTop = log.scrollHeight;
}

function limparDebug() {
  document.getElementById("debug-log").value = "";
}

function copiarDebug() {
  const log = document.getElementById("debug-log");
  log.select();
  document.execCommand("copy");
}

function iniciarLeitor() {
  if (scannerRunning) return;
  logDebug("Iniciando leitor...");
  html5QrCode = new Html5Qrcode("qr-reader");
  Html5Qrcode.getCameras().then(cameras => {
    if (cameras && cameras.length) {
      const cameraId = cameras[0].id;
      html5QrCode.start(
        cameraId,
        { fps: 10, qrbox: 250 },
        qrCodeMessage => {
          processarQRCode(qrCodeMessage);
        }
      ).then(() => {
        scannerRunning = true;
        logDebug("Leitor iniciado com sucesso.");
      }).catch(err => {
        logDebug("Erro ao iniciar leitor: " + err);
      });
    }
  }).catch(err => logDebug("Erro ao acessar câmeras: " + err));
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

  if (partes.length >= 4) {
    document.getElementById("codigo-lido").value = qrCodeMessage;
    document.getElementById("campo1").value = partes[0];
    document.getElementById("campo2").value = partes[1];
    document.getElementById("campo3").value = partes[2];
    document.getElementById("campo4").value = partes[3];

    const parte0 = partes[0];
    const parte1Limpo = partes[1].replace(/^0+/, ""); // remove zeros à esquerda
    logDebug(`Parte[1] limpa: ${parte1Limpo}`);
    partes[1].value = parte1Limpo
    
    buscarGruasAplicaveis(parte0);
    buscarCorrespondenciaExata(parte0, parte1Limpo);
  }
}

function buscarGruasAplicaveis(parte0) {
  const endpoint = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";
  const url = `${endpoint}?mode=gruas&h=${encodeURIComponent(parte0)}`;
  logDebug("GET Gruas aplicáveis: " + url);

  fetch(url)
    .then(resp => resp.text())
    .then(text => {
      logDebug("Resposta Gruas (raw): " + text);
      try {
        const json = JSON.parse(text);
        if (json.ok) {
          document.getElementById("gruas-aplicaveis").value = (json.gruas || []).join(", ");
        } else {
          document.getElementById("gruas-aplicaveis").value = "Não encontrado";
          logDebug("Gruas aplicáveis: resposta inválida/sem ok");
        }
      } catch (e) {
        document.getElementById("gruas-aplicaveis").value = "Erro ao processar";
        logDebug("Erro ao parsear resposta Gruas: " + e);
      }
    })
    .catch(err => logDebug("Erro fetch Gruas: " + err));
}

function buscarCorrespondenciaExata(parte0, parte1) {
  const endpoint = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";
  const url = `${endpoint}?mode=exata&h=${encodeURIComponent(parte0)}&k=${encodeURIComponent(parte1)}`;
  logDebug("GET Correspondência exata: " + url);

  fetch(url)
    .then(resp => resp.text())
    .then(text => {
      logDebug("Resposta Exata (raw): " + text);
      try {
        const json = JSON.parse(text);
        if (json.ok) {
          document.getElementById("correspondencia-exata").value = json.exata || "Não encontrado";
        } else {
          document.getElementById("correspondencia-exata").value = "Não encontrado";
          logDebug("Correspondência exata: resposta inválida/sem ok");
        }
      } catch (e) {
        document.getElementById("correspondencia-exata").value = "Erro ao processar";
        logDebug("Erro ao parsear resposta Exata: " + e);
      }
    })
    .catch(err => logDebug("Erro fetch Exata: " + err));
}

function registrarMovimentacao(tipo) {
  const codigoManual = document.getElementById("manual-input").value.trim();
  const codigoLido = document.getElementById("codigo-lido").value.trim();
  const codigo = codigoManual || codigoLido;

  if (!codigo) {
    document.getElementById("status-msg").innerText = "Informe ou leia um código.";
    return;
  }

  logDebug(`Registrando ${tipo} para o código: ${codigo}`);
  // Aqui entraria a lógica POST para registrar no Google Sheets ou backend
}

