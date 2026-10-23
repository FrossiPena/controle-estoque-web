// v4.1 - Consolidado WebApp
// Login: toda chamada (exceto diag) exige user + pass válidos na propriedade USUARIOS
//        (Configurações do projeto > Propriedades do script), formato: nome:senha, um por linha
// FIX: adiciona mode=h_por_l (L->H) com formatação Código C e respostas com version
// Modos: diag, login, gruas, exata, i_por_h, desc_pt, h_por_l

const SCRIPT_VERSION = "v4.1";
const RELACAO_SHEET_ID = "14uJ__SLFIYDiPx2NwcgKG0oLY6i_2Bn3gT5PG6qXR-g";

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const mode = String(params.mode || "").trim();

  // diag sempre responde, mesmo se a planilha estiver errada
  if (mode === "diag") {
    return json({ ok: true, version: SCRIPT_VERSION, mode });
  }

  const usuario = auth_(params.user, params.pass);
  if (!usuario) return json({ ok:false, auth:false, version: SCRIPT_VERSION, error:"acesso negado" });

  if (mode === "login") {
    return json({ ok:true, version: SCRIPT_VERSION, user: usuario });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const machineSheet = ss.getSheetByName("MachineCards Consolidado");
  if (!machineSheet) {
    return json({ ok:false, version: SCRIPT_VERSION, error:"Aba 'MachineCards Consolidado' não encontrada" });
  }

  const data = machineSheet.getDataRange().getValues();

  // Índices 0-based
  const C = 2, H = 7, I = 8, K = 10, L = 11, M = 12;

  function normNumberish(v){
    const s = String(v).trim();
    return /^\d+(\.0+)?$/.test(s) ? s.replace(/\.0+$/,'') : s;
  }

  // Formata para: C123.456-789.ABC
  function formatCodigoC(raw) {
    let s = String(raw || "").trim().toUpperCase();

    // remove tudo que não seja A-Z0-9
    s = s.replace(/[^A-Z0-9]/g, "");

    // remove C inicial se existir (vamos recolocar)
    if (s.startsWith("C")) s = s.substring(1);

    if (!s) return "";

    // 3-3-3-resto
    const p1 = s.substring(0, 3);
    const p2 = s.substring(3, 6);
    const p3 = s.substring(6, 9);
    const p4 = s.substring(9);

    if (s.length < 4) return "C" + s; // muito curto
    if (s.length < 7) return "C" + p1 + "." + s.substring(3);
    if (s.length < 10) return "C" + p1 + "." + p2 + "-" + s.substring(6);

    if (!p4) return "C" + p1 + "." + p2 + "-" + p3;
    return "C" + p1 + "." + p2 + "-" + p3 + "." + p4;
  }

  // mode=h_por_l (L -> H)
  if (mode === "h_por_l") {
    const lParam = String(params.l || "").trim();
    if (!lParam) return json({ ok:false, version: SCRIPT_VERSION, error:"Parâmetro 'l' ausente" });

    const alvoL = formatCodigoC(lParam);
    if (!alvoL) return json({ ok:false, version: SCRIPT_VERSION, error:"Parâmetro 'l' inválido após normalização" });

    for (let r = 1; r < data.length; r++) {
      const lVal = String(data[r][L] || "").trim();
      if (lVal === alvoL || lVal.startsWith(alvoL)) {
        const hVal = String(data[r][H] || "").trim();
        return json({ ok:true, version: SCRIPT_VERSION, mode, l_in:lParam, l_fmt:alvoL, h:hVal, row:r+1, matchedL:lVal });
      }
    }
    return json({ ok:true, version: SCRIPT_VERSION, mode, l_in:lParam, l_fmt:alvoL, h:"" });
  }

  // mode=gruas (H->C/M)
  if (mode === "gruas") {
    const codigoH = String((params.h || params.codigo || "")).trim();
    if (!codigoH) return json({ ok:false, version: SCRIPT_VERSION, error:"Parâmetro 'h' (ou 'codigo') ausente" });

    const alvoH = normNumberish(codigoH);
    const listaC = [], listaM = [];

    for (let i1 = 1; i1 < data.length; i1++) {
      if (normNumberish(data[i1][H]) === alvoH) {
        const valC = String(data[i1][C] || "").trim();
        const valM = String(data[i1][M] || "").trim();
        if (valC) listaC.push(valC);
        if (valM) listaM.push(valM);
      }
    }

    const seenC = Object.create(null), seenM = Object.create(null);
    const unicosC = listaC.filter(x => seenC[x] ? false : (seenC[x]=true));
    const unicosM = listaM.filter(x => seenM[x] ? false : (seenM[x]=true));

    return json({ ok:true, version: SCRIPT_VERSION, gruasC: unicosC, gruasM: unicosM });
  }

  // mode=exata (H&K->M)
  if (mode === "exata") {
    const codigoH = String((params.h || params.codigo || "")).trim();
    const codigoK = String((params.k || "")).trim();
    if (!codigoH || !codigoK) return json({ ok:false, version: SCRIPT_VERSION, error:"Parâmetros 'h' e 'k' são necessários" });

    const alvoH2 = normNumberish(codigoH);
    const alvoK2 = normNumberish(codigoK);

    const encontrados = [];
    for (let j1 = 1; j1 < data.length; j1++) {
      if (normNumberish(data[j1][H]) === alvoH2 && normNumberish(data[j1][K]) === alvoK2) {
        const valM2 = String(data[j1][M] || "").trim();
        if (valM2) encontrados.push(valM2);
      }
    }
    return json({ ok:true, version: SCRIPT_VERSION, exata:(encontrados[0]||""), exatas: encontrados });
  }

  // mode=i_por_h (H->I)
  if (mode === "i_por_h") {
    const codigoH = String((params.codigo || params.h || "")).trim();
    if (!codigoH) return json({ ok:false, version: SCRIPT_VERSION, error:"Parâmetro 'codigo' ausente" });

    const alvo = normNumberish(codigoH);
    for (let k1 = 1; k1 < data.length; k1++) {
      if (normNumberish(data[k1][H]) === alvo) {
        return json({ ok:true, version: SCRIPT_VERSION, resultado: String(data[k1][I] || "").trim() });
      }
    }
    return json({ ok:true, version: SCRIPT_VERSION, resultado:"" });
  }

  // mode=desc_pt (H->L[16]->Relacao[H]->B)
  if (mode === "desc_pt") {
    const codigoH = String((params.h || params.codigo || "")).trim();
    if (!codigoH) return json({ ok:false, version: SCRIPT_VERSION, error:"Parâmetro 'h' (ou 'codigo') ausente" });

    const alvo3 = normNumberish(codigoH);
    let lRaw = "";
    for (let r2 = 1; r2 < data.length; r2++) {
      if (normNumberish(data[r2][H]) === alvo3) {
        lRaw = String(data[r2][L] || "").trim();
        break;
      }
    }

    const key16 = lRaw ? lRaw.substring(0, 16).trim() : "";
    if (!key16) return json({ ok:true, version: SCRIPT_VERSION, key16, descricao:"", msg:"Sem valor na coluna L para esse H" });

    let relSS;
    try { relSS = SpreadsheetApp.openById(RELACAO_SHEET_ID); }
    catch (errOpen) {
      return json({ ok:false, version: SCRIPT_VERSION, error:"Falha ao abrir planilha de relação por ID", detail:String(errOpen) });
    }

    const sheets = relSS.getSheets();
    for (let s = 0; s < sheets.length; s++) {
      const sh = sheets[s];
      const rng = sh.getDataRange().getValues();
      for (let i2 = 1; i2 < rng.length; i2++) {
        const colH = String(rng[i2][7] || "").trim();
        if (colH === key16 || colH.startsWith(key16)) {
          const descricaoPT = String(rng[i2][1] || "").trim();
          return json({ ok:true, version: SCRIPT_VERSION, key16, sheet: sh.getName(), row: i2+1, descricao: descricaoPT, matchedH: colH });
        }
      }
    }

    return json({ ok:true, version: SCRIPT_VERSION, key16, descricao:"" });
  }

  return json({ ok:false, version: SCRIPT_VERSION, error:"mode inválido ou ausente" });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Valida user/pass contra a propriedade USUARIOS ("nome:senha" por linha).
// Retorna o nome do usuário (minúsculo) ou "" se inválido. Sem USUARIOS => ninguém entra.
function auth_(user, pass) {
  const u = String(user || "").trim().toLowerCase();
  const s = String(pass || "");
  if (!u || !s) return "";

  const lista = PropertiesService.getScriptProperties().getProperty("USUARIOS") || "";
  const linhas = lista.split(/[\n,;]+/);
  for (let i = 0; i < linhas.length; i++) {
    const idx = linhas[i].indexOf(":");
    if (idx < 1) continue;
    const nome  = linhas[i].substring(0, idx).trim().toLowerCase();
    const senha = linhas[i].substring(idx + 1).trim();
    if (nome === u && senha === s) return nome;
  }
  return "";
}
