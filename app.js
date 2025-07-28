let lastScannedCode = "";

// Inicializa o leitor de QR Code
function startScanner() {
  const qrRegion = document.getElementById("qr-reader");

  const html5QrCode = new Html5Qrcode("qr-reader");

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" }, // câmera traseira
    config,
    qrCodeMessage => {
      lastScannedCode = qrCodeMessage;
      document.getElementById("qr-result").innerText = `QR lido: ${qrCodeMessage}`;
    },
    error => {
      // silenciosamente ignora erros de leitura
    }
  ).catch(err => {
    document.getElementById("qr-result").innerText = `Erro ao acessar câmera: ${err}`;
  });
}

// Registrar entrada ou saída
function registrarMovimentacao(tipo) {
  const manualInput = document.getElementById("manual-input").value.trim();
  const codigo = manualInput || lastScannedCode;

  if (!codigo) {
    alert("Nenhum código informado ou lido.");
    return;
  }

  const data = {
    tipo,
    codigo,
    timestamp: new Date().toISOString()
  };

  // Aqui você conecta com o backend (Apps Script ou API)
  fetch("https://script.google.com/macros/s/SEU_ENDPOINT_AQUI/exec", {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" }
  })
  .then(response => response.text())
  .then(result => {
    document.getElementById("status-msg").innerText = `✅ ${tipo} registrada com sucesso`;
    document.getElementById("manual-input").value = "";
    lastScannedCode = "";
    document.getElementById("qr-result").innerText = "Aguardando leitura...";
  })
  .catch(error => {
    document.getElementById("status-msg").innerText = `❌ Erro ao registrar: ${error}`;
  });
}

// Iniciar scanner assim que a página carregar
window.onload = () => {
  startScanner();
};
