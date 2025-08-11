// v1.1 - Prioriza câmera traseira: tenta facingMode 'environment'; fallback escolhe câmera 'back/rear/traseira'

let html5QrCode;
let scannerRunning = false;

function logDebug(msg) {
  const log = document.getElementById("debug-log");
  const now = new Date().toLocaleTimeString();
  if (log) {
    log.value += `[${now}] ${msg}\n`;
    log.scrollTop = log.scrollHeight;
  }
}

function limparDebug() {
  const log = document.getElementById("debug-log");
  if (log) log.value = "";
}

function copiarDebug() {
  const log = document.getElementById("debug-log");
  if (!log) return;
  log.select();
  document.execCommand("copy");
}

function iniciarLeitor() {
  if (scannerRunning) return;
  logDebug("Iniciando leitor...");
  html5QrCode = new Html5Qrcode("qr-reader");

  const config = { fps: 10, qrbox: 250 };

  // 1) Tenta usar facingMode 'environment' (traseira) — melhor para iOS/Safari
  html5QrCode.start(
    { facingMode: { exact: "environment" } },
    config,
    qrCodeMessage => processarQRCode(qrCodeMessage)
  ).then(() => {
    scannerRunning = true;
    logDebug("Leitor iniciado com facingMode=environment.");
  }).catch(async (err) => {
    logDebug("Falhou facingMode=environment, tentando listar câmeras... " + err);

    try {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || !cameras.length) {
        logDebug("Nenhuma câmera encontrada.");
        return;
      }

      // 2) Procura explicitamente por 'back', 'rear', 'traseira', 'environment' no label
      const preferidas = cameras.filter(c =>
        /back|rear|traseira|environment/i.test(c.label || "")
      );

      // Se não achar por nome, tenta a última (muitos devices listam traseira por último)
      const escolhida = (preferidas[0] || cameras[cameras.length - 1]);
      logDebug("Câmera escolhida: " + (escolhida.label || escolhida.id));

      html5QrCode.start(
        escolhida.id,
        config,
        qrCodeMessage => processarQRCode(qrCodeMessage)
      ).then(() => {
        scannerRunning = true;
        logDebug("Leitor iniciado com cameraId selecionada.");
      }).catch(e2 => {
        logDebug("Erro ao iniciar com cameraId: " + e2);
      });

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

  document.getElementById("codigo-lido").value = qrCodeMessage;
  document.getElementById("campo1").value = parte0;
  document.getElementById("campo2").value = parte1Limpo; // mostra já limpo
  document.getElementById("campo3").value = partes[2];
  document.getElementById("campo4").value = partes[3];

  // Atualiza o array (evita usar valor antigo por engano)
  partes[1] = parte1Limpo;

  logDebug(`Parte[1] original: ${parte1Original} | limpa: ${parte1Limpo}`);

  // Limpa campos de resultado antes de buscar
  const gruasEl = document.getElementById("gruas-aplicaveis");
  const exataEl = document.getElementById("correspondencia-exata");
  if (gruasEl) gruasEl.value = "";
  if (exataEl) exataEl.value = "";

  buscarGruasAplicaveis(parte0);
  buscarCorrespondenciaExata(parte0, parte1Limpo);
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
          const lista = Array.isArray(json.gruas) ? json.gruas : [];
          document.getElementById("gruas-aplicaveis").value = lista.length ? lista.join("\n") : "Não encontrado";
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

function buscarCorrespondenciaExata(parte0, parte1Limpo) {
  const endpoint = "https://script.google.com/macros/s/AKfycbyJG6k8tLiwSo7wQuWEsS03ASb3TYToR-HBMjOGmUja6b6lJ9rhDNNjcOwWcwvb1MfD/exec";
  const url = `${endpoint}?mode=exata&h=${encodeURIComponent(parte0)}&k=${encodeURIComponent(parte1Limpo)}`;
  logDebug("GET Correspondência exata: " + url);

  fetch(url)
    .then(resp => resp.text())
    .then(text => {
      logDebug("Resposta Exata (raw): " + text);
      try {
        const json = JSON.parse(text);
        if (json.ok) {
          document.getElementById("correspondencia-exata").value = (json.exata || "").trim() || "Não encontrado";
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
  // POST de registro (desativado por enquanto)
}
