// Configurador do envio de grua: monta a lista de peças de uma configuração e distribui nos veículos.
// Funções puras (sem banco): usadas pela Edge Function "romaneio" (Deno) e pelos testes em Node
// (testes/configurador.test.js). Os dados chegam já lidos do schema "estoque".
//
// Lista de peças (montarLista):
//   1. RELAÇÃO (relacao_itens do modelo): linhas com quantidade na coluna da lança escolhida e GT vazio ou igual
//      ao GT. É o fixo da grua (lança, tirantes, contralança, contrapeso, cabine, plataformas, ponta…), igual à
//      tela Equipamento.
//   2. Regras (config_regras), só para o que varia: torre (altura + base + telescopagem), base (carro inferior OU
//      chumbador: só as regras da base escolhida) e lastro (toneladas escolhidas). Cabine só se não veio da RELAÇÃO.
//      Regras de lança e contrapeso da Base de Dados não entram (a RELAÇÃO já tem); delas só se aproveita o "pai".
//   Peça que já veio da RELAÇÃO não é somada de novo por uma regra (aviso).
//   Ajustes do GT (substituição/inclusão) não mudam a lista: valem na conferência por QR (peça aceita).
//
// Distribuição (distribuirVeiculos): ordem de montagem (base → torre → peças de veículo exigido → RELAÇÃO na ordem
// da aba); peça com veículo exigido (cabine/mecanismo → prancha) vai num veículo daquele tipo, só para elas;
// filha vai no veículo do pai sem ocupar comprimento; as demais no primeiro veículo com comprimento e peso livres;
// sem lugar → abre o veículo padrão, ou o menor que caiba se a peça for maior que ele. Por último o forro
// (lastro, contrapeso, "vai embaixo"): por baixo, nos veículos já abertos, limitado pelo comprimento do piso e
// pelo peso; o que sobrar abre veículo novo. Nada para a execução: o que não cabe vira aviso.

const EPS = 1e-6;
const norm = v => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
export const chaveCodigo = v => {
  const c = (String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").match(/^C\d{12}/) || [""])[0];
  return c || String(v ?? "").toUpperCase().replace(/\.0+$/, "").replace(/[^0-9A-Z]/g, "");
};
// "75m" / "36,7m" / 75 → número
export function numLanca(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/m$/i, "").replace(",", ".");
  return s && !isNaN(Number(s)) ? Number(s) : null;
}
const igual = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.01;
const ehForroGrupo = t => /contra.?peso|lastro/i.test(norm(t));

// Opções da tela para um modelo: bases, alturas (por base/telescopagem) e lastros
export function opcoesConfig(modelo, regras) {
  const doModelo = regras.filter(r => norm(r.modelo) === norm(modelo));
  const uniq = a => [...new Set(a.filter(v => v != null && v !== ""))];
  const torres = doModelo.filter(r => r.componente === "torre");
  return {
    bases: uniq(doModelo.filter(r => r.componente === "base" || r.componente === "torre").map(r => r.base)).sort(),
    alturas: (base, telescopagem) => uniq(torres
      .filter(r => (!r.base || norm(r.base) === norm(base)) && (r.telescopagem == null || telescopagem == null || r.telescopagem === telescopagem))
      .map(r => Number(r.altura_m))).sort((a, b) => a - b),
    lastros: base => uniq(doModelo.filter(r => r.componente === "lastro" && (!r.base || norm(r.base) === norm(base)))
      .map(r => Number(r.lastro_t))).sort((a, b) => a - b),
  };
}

// cfg: { modelo, gt, lanca_m, altura_m, base, telescopagem, lastro_t }
// dados: { relacaoItens: [{codigo, descricao, grupo, linha, gt, qtd:{"75m":1}}], regras: [...config_regras],
//          pecas: { [codigo]: {descricao, peso_kg, comp_m, veiculo_exigido, vai_embaixo} } }
// → { itens: [{codigo, codigoExib, descricao, grupo, origem, qtd, ordem, pai}], avisos: [texto] }
export function montarLista(cfg, { relacaoItens = [], regras = [], pecas = {} }) {
  const avisos = [];
  const itens = new Map();   // codigo → item
  const doModelo = regras.filter(r => norm(r.modelo) === norm(cfg.modelo));

  // Pai de cada peça: qualquer regra do modelo que diga com quem ela viaja (Lanças, Altura…)
  const paiDe = new Map();
  doModelo.forEach(r => { if (r.pai && !paiDe.has(r.codigo)) paiDe.set(r.codigo, chaveCodigo(r.pai)); });

  // 1. RELAÇÃO pela lança
  relacaoItens.forEach(it => {
    if (it.gt && norm(it.gt) !== norm(cfg.gt)) return;
    const col = Object.keys(it.qtd || {}).find(k => igual(numLanca(k), cfg.lanca_m));
    const q = col ? Number(it.qtd[col]) : 0;
    if (!(q > 0)) return;
    const codigo = chaveCodigo(it.codigo);
    if (!codigo) return;
    const ja = itens.get(codigo);
    if (ja) { ja.qtd += q; avisos.push(`${it.codigo}: aparece mais de uma vez na RELAÇÃO (quantidades somadas)`); return; }
    itens.set(codigo, { codigo, codigoExib: String(it.codigo).trim(), descricao: it.descricao, grupo: it.grupo || "",
                        origem: "relacao", qtd: q, ordem: Number(it.linha) || 0, pai: paiDe.get(codigo) || null });
  });
  if (!itens.size) avisos.push(`Nenhuma peça da RELAÇÃO para ${cfg.modelo} com lança de ${cfg.lanca_m} m`);

  // 2. Regras do que varia
  const vale = r => {
    if (r.componente === "torre")
      return igual(r.altura_m, cfg.altura_m) && (!r.base || norm(r.base) === norm(cfg.base)) &&
             (r.telescopagem == null || r.telescopagem === !!cfg.telescopagem);
    if (r.componente === "base") return norm(r.base) === norm(cfg.base);
    if (r.componente === "lastro") return igual(r.lastro_t, cfg.lastro_t) && (!r.base || norm(r.base) === norm(cfg.base));
    if (r.componente === "cabine") return true;
    return false;   // lança e contrapeso: vêm da RELAÇÃO
  };
  const porComponente = {};
  doModelo.filter(vale).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).forEach(r => {
    const ja = itens.get(r.codigo);
    if (ja && ja.origem === "relacao") {
      if (r.componente !== "cabine") avisos.push(`${r.codigo}: já vem da RELAÇÃO; a regra de ${r.componente} não somou`);
      return;
    }
    porComponente[r.componente] = (porComponente[r.componente] || 0) + 1;
    if (ja) { ja.qtd += Number(r.quantidade); return; }
    const p = pecas[r.codigo] || {};
    itens.set(r.codigo, { codigo: r.codigo, codigoExib: p.codigo_exibicao || r.codigo, descricao: p.descricao || "",
                          grupo: r.componente.toUpperCase(), origem: r.componente, qtd: Number(r.quantidade),
                          ordem: r.ordem || 0, pai: r.pai ? chaveCodigo(r.pai) : (paiDe.get(r.codigo) || null) });
  });
  if (cfg.altura_m != null && !porComponente.torre) avisos.push(`Sem regra de torre para ${cfg.altura_m} m / ${cfg.base}`);
  if (cfg.base && !porComponente.base) avisos.push(`Sem regra para a base "${cfg.base}"`);
  if (cfg.lastro_t != null && !porComponente.lastro) avisos.push(`Sem regra de lastro para ${cfg.lastro_t} t`);

  // Cadastro de produto
  for (const it of itens.values()) {
    const p = pecas[it.codigo];
    if (!p) { avisos.push(`${it.codigoExib}: sem cadastro de produto`); continue; }
    if (!it.descricao) it.descricao = p.descricao || "";
    if (p.comp_m == null) avisos.push(`${it.codigoExib}: sem comprimento (não ocupa espaço na distribuição)`);
    if (p.peso_kg == null) avisos.push(`${it.codigoExib}: sem peso`);
  }
  return { itens: [...itens.values()], avisos };
}

// itens: saída de montarLista (pode ter sido editada pelo usuário)
// frota: [{nome, comp_util_m, carga_max_kg, padrao}]
// → { veiculos: [{n, tipo, comp_util_m, carga_max_kg, comp_usado, forro_usado, peso_kg,
//                 itens: [{codigo, codigoExib, descricao, qtd, forro, filha}]}], avisos }
export function distribuirVeiculos(itens, pecas, frota) {
  const avisos = [];
  const padrao = frota.find(v => v.padrao) || frota[0];
  if (!padrao) throw new Error("Nenhum veículo cadastrado");
  const tipo = nome => frota.find(v => norm(v.nome) === norm(nome));

  // Unidades
  const presentes = new Set(itens.map(i => i.codigo));
  const unidades = [];
  itens.forEach(it => {
    const p = pecas[it.codigo] || {};
    const forro = !!p.vai_embaixo || it.origem === "lastro" || ehForroGrupo(it.grupo) || ehForroGrupo(it.descricao);
    let pai = it.pai && it.pai !== it.codigo ? it.pai : null;
    if (pai && !presentes.has(pai)) { avisos.push(`${it.codigoExib}: o pai ${pai} não está na lista; vai como peça solta`); pai = null; }
    const exigido = p.veiculo_exigido ? tipo(p.veiculo_exigido) : null;
    if (p.veiculo_exigido && !exigido) avisos.push(`${it.codigoExib}: veículo "${p.veiculo_exigido}" não cadastrado`);
    const rank = it.origem === "base" ? 0 : it.origem === "torre" ? 1 : exigido ? 2 : 3;
    for (let k = 0; k < it.qtd; k++) {
      unidades.push({ it, comp: Number(p.comp_m) || 0, peso: Number(p.peso_kg) || 0, forro: forro && !pai, pai,
                      exigido, rank, ordem: it.ordem || 0 });
    }
  });

  const veiculos = [];
  const abrir = (t, exclusivo) => {
    const v = { n: veiculos.length + 1, tipo: t.nome, comp_util_m: t.comp_util_m ?? null, carga_max_kg: t.carga_max_kg ?? null,
                exclusivo, comp_usado: 0, forro_usado: 0, peso_kg: 0, unidades: [] };
    veiculos.push(v);
    return v;
  };
  const cabe = (v, comp, peso, campo) =>
    (v.comp_util_m == null || v[campo] + comp <= v.comp_util_m + EPS) && (v.carga_max_kg == null || v.peso_kg + peso <= v.carga_max_kg + EPS);
  const por = (v, u, campo) => { v[campo] += u.comp; v.peso_kg += u.peso; v.unidades.push(u); u.veiculo = v; };
  // Veículo novo para uma peça solta: o padrão, ou o menor que comporte o comprimento
  const tipoPara = u => {
    if (padrao.comp_util_m == null || u.comp <= padrao.comp_util_m + EPS) return padrao;
    const maior = frota.filter(t => t.comp_util_m != null && t.comp_util_m + EPS >= u.comp)
                       .sort((a, b) => a.comp_util_m - b.comp_util_m)[0];
    if (!maior) avisos.push(`${u.it.codigoExib}: ${u.comp} m não cabe em nenhum veículo cadastrado (foi no ${padrao.nome})`);
    return maior || padrao;
  };

  // 1. Peças soltas (nem filha nem forro), na ordem de montagem
  const soltas = unidades.filter(u => !u.pai && !u.forro).sort((a, b) => a.rank - b.rank || a.ordem - b.ordem);
  for (const u of soltas) {
    const candidatos = veiculos.filter(v => u.exigido ? v.exclusivo && norm(v.tipo) === norm(u.exigido.nome) : !v.exclusivo);
    let v = candidatos.find(c => cabe(c, u.comp, u.peso, "comp_usado"));
    if (!v) v = u.exigido ? abrir(u.exigido, true) : abrir(tipoPara(u), false);
    if (!cabe(v, u.comp, u.peso, "comp_usado") && v.unidades.length === 0 && v.carga_max_kg != null && u.peso > v.carga_max_kg)
      avisos.push(`${u.it.codigoExib}: ${u.peso} kg passa da carga do ${v.tipo}`);
    por(v, u, "comp_usado");
  }

  // 2. Filhas: no veículo do pai, sem ocupar comprimento (o peso conta)
  for (const u of unidades.filter(x => x.pai)) {
    const v = veiculos.find(x => x.unidades.some(y => y.it.codigo === u.pai)) || veiculos[0] || abrir(padrao, false);
    u.comp = 0;
    if (v.carga_max_kg != null && v.peso_kg + u.peso > v.carga_max_kg + EPS)
      avisos.push(`Veículo ${v.n}: ${u.it.codigoExib} acompanha o pai e passa da carga máxima`);
    por(v, u, "comp_usado");
  }

  // 3. Forro: por baixo, nos veículos comuns já abertos (piso e peso); o resto abre veículo novo
  const forros = unidades.filter(u => u.forro).sort((a, b) => b.peso - a.peso || a.ordem - b.ordem);
  for (const u of forros) {
    let v = veiculos.find(c => !c.exclusivo && cabe(c, u.comp, u.peso, "forro_usado"));
    if (!v) v = abrir(tipoPara(u), false);
    por(v, u, "forro_usado");
  }

  // Saída agrupada por peça
  const saida = veiculos.map(v => {
    const ag = new Map();
    v.unidades.forEach(u => {
      const k = `${u.it.codigo}|${u.forro}|${!!u.pai}`;
      if (!ag.has(k)) ag.set(k, { codigo: u.it.codigo, codigoExib: u.it.codigoExib, descricao: u.it.descricao, qtd: 0,
                                  forro: u.forro, filha: !!u.pai });
      ag.get(k).qtd++;
    });
    const r = n => Math.round(n * 1000) / 1000;
    return { n: v.n, tipo: v.tipo, comp_util_m: v.comp_util_m, carga_max_kg: v.carga_max_kg,
             comp_usado: r(v.comp_usado), forro_usado: r(v.forro_usado), peso_kg: r(v.peso_kg), itens: [...ag.values()] };
  });
  return { veiculos: saida, avisos };
}
