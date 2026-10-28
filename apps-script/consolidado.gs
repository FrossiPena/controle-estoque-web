// v4.4 - Consolidado WebApp
// lancas_grua passa a ler a própria RELAÇÃO (aba do modelo): cabeçalho na linha 2, COMPATÍVEL 1..4 em C–F,
//            GT em K, comprimentos de lança ("75m"…) a partir de L; grupo = linha de seção (ex.: "LANÇA")
// v4.3 - Tela Equipamento: gruas_lista, gts_por_grua, lancas_grua, machinecards_por_gt
// v4.2
// patrimonio_por_h: mapa Código individual (K) -> Patrimônio (M) para um Código 9 (H)
// Login: toda chamada (exceto diag) exige user + pass válidos na propriedade USUARIOS
//        (Configurações do projeto > Propriedades do script), formato: nome:senha, um por linha
// FIX: adiciona mode=h_por_l (L->H) com formatação Código C e respostas com version
// Modos: diag, login, gruas, exata, patrimonio_por_h, i_por_h, desc_pt, h_por_l,
//        gruas_lista, gts_por_grua, lancas_grua, machinecards_por_gt

const SCRIPT_VERSION = "v4.4";
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

  // ---------- Tela Equipamento (não usam a MachineCards) ----------

  // mode=gruas_lista: modelos da aba "Gruas lista" (coluna D, a partir da linha 4)
  if (mode === "gruas_lista") {
    const sh = abaPorNome_(SpreadsheetApp.openById(RELACAO_SHEET_ID), "Gruas lista");
    if (!sh) return json({ ok:false, version: SCRIPT_VERSION, error:"Aba 'Gruas lista' não encontrada na RELAÇÃO" });
    const last = sh.getLastRow();
    const gruas = last < 4 ? [] : sh.getRange(4, 4, last - 3, 1).getValues()
      .map(r => String(r[0] || "").trim()).filter(Boolean);
    return json({ ok:true, version: SCRIPT_VERSION, gruas });
  }

  // mode=gts_por_grua: TAGs (coluna C) da aba "Validação" onde o Modelo (coluna D) = grua
  if (mode === "gts_por_grua") {
    const grua = String(params.grua || "").trim();
    if (!grua) return json({ ok:false, version: SCRIPT_VERSION, error:"Parâmetro 'grua' ausente" });
    const sh = abaPorNome_(SpreadsheetApp.openById(RELACAO_SHEET_ID), "Validação");
    if (!sh) return json({ ok:false, version: SCRIPT_VERSION, error:"Aba 'Validação' não encontrada na RELAÇÃO" });
    const last = sh.getLastRow();
    const alvo = normNome_(grua), gts = [];
    if (last >= 4) {
      sh.getRange(4, 3, last - 3, 2).getValues().forEach(r => {
        const gt = String(r[0] || "").trim();
        if (gt && normNome_(r[1]) === alvo && gts.indexOf(gt) < 0) gts.push(gt);
      });
    }
    return json({ ok:true, version: SCRIPT_VERSION, gts });
  }

  // mode=lancas_grua: aba do modelo na RELAÇÃO. Cabeçalho na linha 2; colunas achadas pelo nome:
  // DESCRIÇÃO, CÓDIGO LBR, COMPRIMENTO, GT, COMPATÍVEL n e comprimentos de lança ("75m" / "36,7m").
  // Célula de comprimento = quantidade. Linha sem código (ex.: "LANÇA") = título de grupo.
  if (mode === "lancas_grua") {
    const grua = String(params.grua || "").trim();
    if (!grua) return json({ ok:false, version: SCRIPT_VERSION, error:"Parâmetro 'grua' ausente" });
    const sh = abaPorNome_(SpreadsheetApp.openById(RELACAO_SHEET_ID), grua);
    if (!sh) return json({ ok:true, version: SCRIPT_VERSION, encontrado:false, lancas:[], itens:[] });

    const lastR = sh.getLastRow(), lastC = sh.getLastColumn();
    if (lastR < 3) return json({ ok:true, version: SCRIPT_VERSION, encontrado:true, aba: sh.getName(), lancas:[], itens:[] });
    const vals = sh.getRange(2, 1, lastR - 1, lastC).getValues();
    const cab = vals[0].map(v => String(v == null ? "" : v).trim());
    const col = nome => cab.findIndex(h => normNome_(h) === normNome_(nome));
    const cD = col("DESCRIÇÃO"), cC = col("CÓDIGO LBR"), cT = col("COMPRIMENTO"), cGT = col("GT");
    const cCompat = [], cLanca = [];
    cab.forEach((h, i) => {
      if (/^compat/i.test(normNome_(h))) cCompat.push(i);
      else if (/^\d+([.,]\d+)?\s*m$/i.test(h)) cLanca.push(i);
    });
    if (cC < 0 || cD < 0) return json({ ok:false, version: SCRIPT_VERSION, error:`Aba '${sh.getName()}': colunas DESCRIÇÃO/CÓDIGO LBR não encontradas na linha 2` });

    const txt = (r, i) => i < 0 ? "" : String(r[i] == null ? "" : r[i]).trim();
    const itens = [];
    let grupo = "";
    vals.slice(2).forEach(r => {            // linha 3 = a grua inteira; peças a partir da 4
      const codigo = txt(r, cC), descricao = txt(r, cD);
      if (!/[0-9a-z]/i.test(codigo)) { if (descricao) grupo = descricao; return; } // sem código (ou "-") = título de grupo
      const qtd = {};
      cLanca.forEach(i => { const q = Number(r[i]); if (q > 0) qtd[cab[i]] = q; });
      if (!Object.keys(qtd).length) return;  // a tela só usa peças com quantidade em algum comprimento
      const t = r[cT];
      itens.push({
        grupo, descricao, codigo,
        tamanho: (t === "" || t == null) ? "" : (typeof t === "number" ? String(t).replace(".", ",") + " m" : String(t).trim()),
        gt: txt(r, cGT), compat: cCompat.map(i => txt(r, i)).filter(Boolean), qtd
      });
    });
    return json({ ok:true, version: SCRIPT_VERSION, encontrado:true, aba: sh.getName(), lancas: cLanca.map(i => cab[i]), itens });
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

  // mode=patrimonio_por_h (H -> {K: M}) - uma chamada para a lista inteira
  if (mode === "patrimonio_por_h") {
    const codigoH = String((params.h || params.codigo || "")).trim();
    if (!codigoH) return json({ ok:false, version: SCRIPT_VERSION, error:"Parâmetro 'h' (ou 'codigo') ausente" });

    const alvoH3 = normNumberish(codigoH);
    const mapa = {};
    for (let p1 = 1; p1 < data.length; p1++) {
      if (normNumberish(data[p1][H]) !== alvoH3) continue;
      const k = normNumberish(data[p1][K]);
      const m = String(data[p1][M] || "").trim();
      if (k && m && !(k in mapa)) mapa[k] = m;
    }
    return json({ ok:true, version: SCRIPT_VERSION, mapa });
  }

  // mode=machinecards_por_gt: para um GT (coluna M), mapa Código C (coluna L, 12 dígitos) -> machine cards
  // (id = código individual da coluna K; codigo9 = coluna H). Uma chamada para a lista inteira.
  if (mode === "machinecards_por_gt") {
    const gt = normNome_(params.gt);
    if (!gt) return json({ ok:false, version: SCRIPT_VERSION, error:"Parâmetro 'gt' ausente" });
    const mapa = {};
    for (let m1 = 1; m1 < data.length; m1++) {
      if (normNome_(data[m1][M]) !== gt) continue;
      const chave = chaveCodigoC_(data[m1][L]);
      if (!chave) continue;
      (mapa[chave] = mapa[chave] || []).push({
        id: normNumberish(data[m1][K]), codigo9: normNumberish(data[m1][H]), codigoC: String(data[m1][L] || "").trim()
      });
    }
    return json({ ok:true, version: SCRIPT_VERSION, mapa });
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

// Compara nomes de abas/modelos/GT ignorando acentos, espaços extras e maiúsculas
function normNome_(v) {
  return String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

function abaPorNome_(ss, nome) {
  const alvo = normNome_(nome);
  return ss.getSheets().find(sh => normNome_(sh.getName()) === alvo) || null;
}

// Código C só com letras/dígitos: "C 051.001-621.111 002" -> "C051001621111" (ignora sufixo)
function chaveCodigoC_(v) {
  const d = String(v == null ? "" : v).toUpperCase().replace(/[^0-9A-Z]/g, "");
  const m = d.match(/^C\d{12}/);
  return m ? m[0] : "";
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
