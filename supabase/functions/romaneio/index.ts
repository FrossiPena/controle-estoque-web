// romaneio v1.2 - status planejado/iniciado/conferido/aguardando_nota/concluido/sinistrado/excluido; excluir envio
// romaneio v1.1 - clientes com CNPJ e obras (pai_id), motorista guarda as últimas placas, cad_excluir
// romaneio v1.0 - Envio de grua: configurador, romaneios por veículo, conferência por QR, fotos e cadastros.
// Só no Supabase (sem Google). POST JSON { modo, ... } com Authorization: Bearer <token do Supabase Auth>;
// GET ?modo=diag sem login. Permissão pelos papéis de estoque.usuario_papeis (usuário = e-mail antes do @):
//   leitura: qualquer papel · expedicao: monta/edita envios e veículos · operacional: confere (bipa, move, fotos,
//   dados da carreta, confirma) · cadastro: tela Cadastros · admin: tudo + papéis. "consulta" só lê.
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { montarLista, distribuirVeiculos, chaveCodigo } from "../_shared/configurador.mjs";

const VERSION = "romaneio-v1.2";
const TZ = "America/Sao_Paulo";
const BUCKET = "romaneios";
const ORIGENS = [/^https:\/\/frossipena\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const chavePublica = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default; } catch { return ""; }
})() || Deno.env.get("SUPABASE_ANON_KEY") || "";
const auth = createClient(Deno.env.get("SUPABASE_URL")!, chavePublica, { auth: { persistSession: false } });
const chaveServico = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; } catch { return ""; }
})() || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const storage = createClient(Deno.env.get("SUPABASE_URL")!, chaveServico, { auth: { persistSession: false } }).storage;

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("Origin") || "";
  return ORIGENS.some(r => r.test(o)) ? {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  } : {};
}
const json = (req: Request, obj: unknown, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" },
});

const txt = (v: unknown) => String(v ?? "").trim();
const normCod = (v: unknown) => txt(v).replace(/\.0+$/, "").replace(/^0+(?=.)/, "");
const normNome = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\s+/g, " ").trim().toLowerCase();
const num = (v: unknown) => { const s = txt(v).replace(",", "."); return s && !isNaN(Number(s)) ? Number(s) : null; };
const int = (v: unknown) => { const n = parseInt(txt(v), 10); if (!n) throw new Error("id inválido"); return n; };

class Recusa extends Error { extra: Record<string, unknown>; constructor(msg: string, extra = {}) { super(msg); this.extra = extra; } }

type Ctx = { usuario: string; papeis: string[] };
type Tx = postgres.TransactionSql;
const pode = (c: Ctx, ...papeis: string[]) => c.papeis.includes("admin") || papeis.some(p => c.papeis.includes(p));
function exigir(c: Ctx, ...papeis: string[]) {
  if (!pode(c, ...papeis)) throw new Recusa(`sem permissão (precisa de: ${papeis.join(" ou ")})`, { semPermissao: true });
}

async function log(tx: Tx, c: Ctx, acao: string, envio: number | null, romaneio: number | null, detalhe: unknown = {}) {
  await tx`insert into estoque.romaneio_log (envio_id, romaneio_id, usuario, acao, detalhe)
           values (${envio}, ${romaneio}, ${c.usuario}, ${acao}, ${tx.json(detalhe as postgres.JSONValue)})`;
}

// ---------- Dados do configurador ----------
async function abaDoModelo(tx: Tx, modelo: string) {
  const abas = await tx`select aba, lancas from estoque.relacao_abas`;
  return abas.find(a => normNome(a.aba) === normNome(modelo)) || null;
}

async function dadosConfigurador(tx: Tx, modelo: string) {
  const aba = await abaDoModelo(tx, modelo);
  const relacaoItens = aba ? (await tx`select codigo_lbr, descricao, grupo, linha_planilha, gt, qtd
                                       from estoque.relacao_itens where aba = ${aba.aba} order by linha_planilha`)
    .map(r => ({ codigo: r.codigo_lbr, descricao: r.descricao, grupo: r.grupo, linha: r.linha_planilha, gt: r.gt, qtd: r.qtd }))
    : [];
  const regras = (await tx`select modelo, componente, lanca_m, altura_m, base, telescopagem, lastro_t, codigo,
                                  quantidade, pai, ordem from estoque.config_regras`)
    .filter(r => normNome(r.modelo) === normNome(modelo))
    .map(r => ({ ...r, lanca_m: r.lanca_m == null ? null : Number(r.lanca_m), altura_m: r.altura_m == null ? null : Number(r.altura_m),
                 lastro_t: r.lastro_t == null ? null : Number(r.lastro_t), quantidade: Number(r.quantidade) }));
  return { aba, relacaoItens, regras };
}

async function pecasPorCodigo(tx: Tx, codigos: string[]) {
  if (!codigos.length) return {};
  const rows = await tx`select codigo, codigo_exibicao, descricao, peso_kg, comp_m, veiculo_exigido, vai_embaixo
                        from estoque.pecas where codigo = any(${codigos})`;
  return Object.fromEntries(rows.map(r => [r.codigo, { ...r, peso_kg: r.peso_kg == null ? null : Number(r.peso_kg),
                                                       comp_m: r.comp_m == null ? null : Number(r.comp_m) }]));
}

async function frota(tx: Tx) {
  return (await tx`select nome, comp_util_m, carga_max_kg, padrao from estoque.veiculos where ativo order by ordem, nome`)
    .map(v => ({ ...v, comp_util_m: v.comp_util_m == null ? null : Number(v.comp_util_m),
                 carga_max_kg: v.carga_max_kg == null ? null : Number(v.carga_max_kg) }));
}

function lerCfg(p: Record<string, unknown>) {
  const c = (p.cfg || {}) as Record<string, unknown>;
  const cfg = {
    modelo: txt(c.modelo), gt: txt(c.gt), lanca_m: num(c.lanca_m), altura_m: num(c.altura_m), base: txt(c.base) || null,
    telescopagem: c.telescopagem === true || txt(c.telescopagem).toLowerCase() === "sim",
    lastro_t: num(c.lastro_t),
  };
  if (!cfg.modelo || !cfg.gt || cfg.lanca_m == null) throw new Recusa("informe GT, modelo e lança");
  return cfg;
}

// Peça física → Código C: AJUSTE (peça nova) vale mais que a MachineCards
async function identificarPeca(tx: Tx, c9: string, id: string) {
  const [aj] = await tx`select gt, posicao, codigo_c_novo, descricao from estoque.ajustes
                        where c9_novo = ${c9} and id_novo = ${id} order by id desc limit 1`;
  if (aj) return { codigo: chaveCodigo(aj.codigo_c_novo || aj.posicao), gt: txt(aj.gt), descricao: txt(aj.descricao), viaAjuste: true };
  const [mc] = await tx`select chave_c, codigo_c, gt, descricao from estoque.machinecards
                        where codigo9_norm = ${c9} and id_norm = ${id} limit 1`;
  if (mc) return { codigo: chaveCodigo(mc.chave_c || mc.codigo_c), gt: txt(mc.gt), descricao: txt(mc.descricao), viaAjuste: false };
  return null;
}

// Código lido → Código C previsto (o próprio ou a posição de que ele é compatível, na RELAÇÃO do modelo)
async function posicaoDoCodigo(tx: Tx, modelo: string, codigo: string) {
  const aba = await abaDoModelo(tx, modelo);
  if (!aba) return [codigo];
  const rows = await tx`select codigo_lbr, compat1, compat2, compat3, compat4 from estoque.relacao_itens where aba = ${aba.aba}`;
  const posicoes = rows.filter(r => [r.compat1, r.compat2, r.compat3, r.compat4].some(x => x && chaveCodigo(x) === codigo))
                       .map(r => chaveCodigo(r.codigo_lbr));
  return [codigo, ...posicoes];
}

async function lidosPorCodigo(tx: Tx, romaneioId: number) {
  const rows = await tx`select codigo, count(*)::int n from estoque.romaneio_leituras where romaneio_id = ${romaneioId} group by codigo`;
  return Object.fromEntries(rows.map(r => [r.codigo, r.n]));
}

// Romaneio em carregamento (planejado/iniciado): só nele se lê, move, fotografa, edita e confirma
const EM_CARGA = ["planejado", "iniciado"];
const ROTULO: Record<string, string> = { planejado: "planejado", iniciado: "iniciado", conferido: "conferido",
  aguardando_nota: "aguardando nota", concluido: "concluído", sinistrado: "sinistrado", excluido: "excluído" };
async function romaneioPorId(tx: Tx, id: number) {
  const [r] = await tx`select r.*, e.gt, e.modelo, e.status as envio_status from estoque.romaneios r
                       join estoque.envios e on e.id = r.envio_id where r.id = ${id} for update of r`;
  if (!r) throw new Recusa("romaneio não encontrado");
  return r;
}
async function romaneioAberto(tx: Tx, id: number) {
  const r = await romaneioPorId(tx, id);
  if (!EM_CARGA.includes(r.status)) throw new Recusa(`romaneio ${r.numero} está ${ROTULO[r.status] || r.status}`);
  return r;
}
// Envio: concluído quando todos os romaneios (fora os excluídos) estão concluídos/sinistrados; excluído se todos excluídos
async function atualizarEnvio(tx: Tx, envioId: number) {
  const rs = await tx`select status from estoque.romaneios where envio_id = ${envioId}`;
  const validos = rs.filter(r => r.status !== "excluido");
  const status = !validos.length && rs.length ? "excluido"
    : validos.length && validos.every(r => ["concluido", "sinistrado"].includes(r.status)) ? "concluido" : "aberto";
  await tx`update estoque.envios set status = ${status} where id = ${envioId}`;
  return status;
}
async function mudarStatus(tx: Tx, c: Ctx, r: Record<string, unknown>, novo: string, motivo: string | null, extra = {}) {
  await tx`update estoque.romaneios set ${tx({ status: novo, status_motivo: motivo, status_por: c.usuario,
           status_em: new Date(), ...extra })} where id = ${r.id as number}`;
  await log(tx, c, "romaneio " + (ROTULO[novo] || novo), r.envio_id as number, r.id as number, { de: r.status, motivo, ...extra });
  return await atualizarEnvio(tx, r.envio_id as number);
}

async function somarItem(tx: Tx, romaneioId: number, codigo: string, delta: number, base: Record<string, unknown>, origem: string) {
  await tx`insert into estoque.romaneio_itens (romaneio_id, codigo, codigo_exibicao, descricao, qtd, forro, filha, origem)
           values (${romaneioId}, ${codigo}, ${txt(base.codigo_exibicao) || codigo}, ${txt(base.descricao)}, ${Math.max(delta, 0)},
                   ${!!base.forro}, ${!!base.filha}, ${origem})
           on conflict (romaneio_id, codigo) do update set qtd = greatest(estoque.romaneio_itens.qtd + ${delta}, 0)`;
}

// ---------- Cadastros (tela Cadastros) ----------
const CADASTROS: Record<string, { chave: string; colunas: string[]; papel: string[]; ordem: string; busca: string[] }> = {
  pecas: { chave: "codigo", colunas: ["codigo_exibicao", "descricao", "peso_kg", "comp_m", "larg_m", "alt_m", "preco_padrao",
           "valor_unitario", "sapiens_produto", "sapiens_derivacao", "veiculo_exigido", "vai_embaixo", "obs", "pendencias"],
           papel: ["cadastro"], ordem: "codigo", busca: ["codigo", "codigo_exibicao", "descricao"] },
  veiculos: { chave: "nome", colunas: ["comp_util_m", "carga_max_kg", "padrao", "ordem", "ativo", "obs"], papel: ["cadastro"],
              ordem: "ordem", busca: ["nome"] },
  clientes: { chave: "id", colunas: ["tipo", "pai_id", "cnpj", "razao_social", "nome_fantasia", "nome", "endereco_envio", "cidade",
              "uf", "cep", "obs", "ativo"], papel: ["cadastro", "expedicao"], ordem: "nome", busca: ["nome", "cnpj", "razao_social", "nome_fantasia"] },
  transportadoras: { chave: "id", colunas: ["nome", "cnpj", "ativo"], papel: ["cadastro", "expedicao"], ordem: "nome", busca: ["nome", "cnpj"] },
  motoristas: { chave: "id", colunas: ["nome", "cpf", "transportadora_id", "placa_cavalo", "placa_carreta1", "placa_carreta2", "ativo"], papel: ["cadastro", "expedicao"], ordem: "nome", busca: ["nome", "cpf"] },
  placas: { chave: "placa", colunas: ["tipo", "transportadora_id", "ativo"], papel: ["cadastro", "expedicao"], ordem: "placa", busca: ["placa"] },
  usuario_papeis: { chave: "usuario", colunas: ["papel"], papel: ["admin"], ordem: "usuario", busca: ["usuario"] },
};
const COLS_NUM = new Set(["peso_kg", "comp_m", "larg_m", "alt_m", "preco_padrao", "valor_unitario", "comp_util_m", "carga_max_kg", "ordem", "transportadora_id", "pai_id"]);
const COLS_BOOL = new Set(["vai_embaixo", "padrao", "ativo"]);
function valorCampo(col: string, v: unknown) {
  if (col === "cnpj" || col === "cpf") return txt(v).replace(/\D/g, "") || null;
  if (col.startsWith("placa")) return txt(v).toUpperCase().replace(/[^0-9A-Z]/g, "") || null;
  if (COLS_NUM.has(col)) return txt(v) === "" ? null : num(v);
  if (COLS_BOOL.has(col)) return v === true || ["true", "sim", "1"].includes(txt(v).toLowerCase());
  return txt(v) === "" ? null : txt(v);
}

// ---------- Modos ----------
type Modo = (tx: Tx, p: Record<string, unknown>, c: Ctx) => Promise<Record<string, unknown>>;
const MODOS: Record<string, Modo> = {
  async opcoes(tx) {
    // Modelos das regras e das abas da RELAÇÃO (um modelo só na RELAÇÃO também aparece, com as lanças)
    const modelos = await tx`select coalesce(a.aba, m.nome) as nome, a.lancas from estoque.modelos m
                             full join estoque.relacao_abas a on lower(a.aba) = lower(m.nome) order by 1`;
    const gts = await tx`select gt, modelo from estoque.validacao where gt <> '' order by gt`;
    const torres = await tx`select distinct modelo, base, telescopagem, altura_m from estoque.config_regras
                            where componente = 'torre' and altura_m is not null order by altura_m`;
    const lastros = await tx`select distinct modelo, base, lastro_t from estoque.config_regras
                             where componente = 'lastro' and lastro_t is not null order by lastro_t`;
    const bases = await tx`select modelo, base from estoque.bases order by base`;
    return {
      modelos, gts, bases, frota: await frota(tx),
      torres: torres.map(t => ({ ...t, altura_m: Number(t.altura_m) })),
      lastros: lastros.map(l => ({ ...l, lastro_t: Number(l.lastro_t) })),
      clientes: await tx`select id, tipo, pai_id, nome, cnpj, endereco_envio, cidade, uf from estoque.clientes where ativo order by nome`,
      transportadoras: await tx`select id, nome from estoque.transportadoras where ativo order by nome`,
      motoristas: await tx`select id, nome, cpf, transportadora_id, placa_cavalo, placa_carreta1, placa_carreta2
                           from estoque.motoristas where ativo order by nome`,
      placas: await tx`select placa, tipo from estoque.placas where ativo order by placa`,
    };
  },

  // Lista de peças + distribuição, sem gravar. Com p.itens (lista editada na tela), só redistribui.
  async previa(tx, p) {
    const cfg = lerCfg(p);
    let itens = p.itens as Array<Record<string, unknown>> | undefined, avisos: string[] = [];
    if (!Array.isArray(itens)) {
      const dados = await dadosConfigurador(tx, cfg.modelo);
      if (!dados.aba) avisos.push(`Modelo ${cfg.modelo} sem aba na RELAÇÃO do Supabase (carga inicial feita?)`);
      const codigos = [...new Set([...dados.relacaoItens.map(i => chaveCodigo(i.codigo)), ...dados.regras.map(r => r.codigo)])];
      const r = montarLista(cfg, { ...dados, pecas: await pecasPorCodigo(tx, codigos) });
      itens = r.itens; avisos = avisos.concat(r.avisos);
    }
    itens = itens.map(i => ({ ...i, qtd: Number(i.qtd) || 0 })).filter(i => i.qtd > 0);
    const pecas = await pecasPorCodigo(tx, itens.map(i => txt(i.codigo)));
    const d = distribuirVeiculos(itens, pecas, await frota(tx));
    return { cfg, itens, avisos, veiculos: d.veiculos, avisosDistribuicao: d.avisos };
  },

  async salvar_envio(tx, p, c) {
    exigir(c, "expedicao");
    const cfg = lerCfg(p);
    const cliente = txt(p.cliente);
    if (!cliente) throw new Recusa("informe o cliente");
    const veiculos = p.veiculos as Array<Record<string, unknown>>;
    if (!Array.isArray(veiculos) || !veiculos.length) throw new Recusa("gere a prévia antes de salvar");
    const [cli] = p.cliente_id ? await tx`select id from estoque.clientes where id = ${int(p.cliente_id)}`
                               : await tx`select id from estoque.clientes where lower(nome) = lower(${cliente}) limit 1`;
    const [e] = await tx`insert into estoque.envios ${tx({
      cliente_id: cli?.id ?? null, cliente, endereco_envio: txt(p.endereco_envio) || null, obra: txt(p.obra) || null,
      gt: cfg.gt, modelo: cfg.modelo, lanca_m: cfg.lanca_m, altura_m: cfg.altura_m, base: cfg.base,
      telescopagem: cfg.telescopagem, lastro_t: cfg.lastro_t, obs: txt(p.obs) || null, criado_por: c.usuario,
    })} returning id`;
    const tipos = Object.fromEntries((await frota(tx)).map(v => [v.nome, v]));
    let n = 0;
    for (const v of veiculos) {
      const t = tipos[txt(v.tipo)] || {};
      const [r] = await tx`insert into estoque.romaneios ${tx({
        envio_id: e.id, numero: ++n, veiculo: tipos[txt(v.tipo)] ? txt(v.tipo) : null,
        comp_util_m: t.comp_util_m ?? null, carga_max_kg: t.carga_max_kg ?? null,
      })} returning id`;
      for (const it of (v.itens as Array<Record<string, unknown>>) || []) {
        await somarItem(tx, r.id, chaveCodigo(it.codigo), Number(it.qtd) || 0,
          { codigo_exibicao: it.codigoExib, descricao: it.descricao, forro: it.forro, filha: it.filha }, "plano");
      }
    }
    await log(tx, c, "envio criado", e.id, null, { cfg, veiculos: n });
    return { id: e.id, romaneios: n };
  },

  async envios(tx, p) {
    const todos = p.todos === true;
    const rows = await tx`
      select e.id, e.cliente, e.obra, e.gt, e.modelo, e.status, e.criado_em, e.criado_por,
             (select count(*)::int from estoque.romaneios r where r.envio_id = e.id) as romaneios,
             (select count(*)::int from estoque.romaneios r where r.envio_id = e.id and r.status <> 'excluido') as validos,
             (select count(*)::int from estoque.romaneios r where r.envio_id = e.id and r.status in ('conferido','aguardando_nota','concluido')) as confirmados,
             (select coalesce(sum(i.qtd), 0)::int from estoque.romaneio_itens i join estoque.romaneios r on r.id = i.romaneio_id
               where r.envio_id = e.id and r.status <> 'excluido') as previstas,
             (select count(*)::int from estoque.romaneio_leituras l where l.envio_id = e.id) as lidas
      from estoque.envios e where ${todos} or e.status = 'aberto' order by e.cliente, e.gt, e.criado_em desc`;
    return { envios: rows };
  },

  async envio(tx, p) {
    const id = int(p.id);
    const [e] = await tx`select * from estoque.envios where id = ${id}`;
    if (!e) throw new Recusa("envio não encontrado");
    const romaneios = await tx`
      select r.id, r.numero, r.veiculo, r.comp_util_m, r.carga_max_kg, r.status, r.placa_cavalo, r.motorista,
             (select coalesce(sum(i.qtd), 0)::int from estoque.romaneio_itens i where i.romaneio_id = r.id) as previstas,
             (select count(*)::int from estoque.romaneio_leituras l where l.romaneio_id = r.id) as lidas,
             (select coalesce(sum(i.qtd * coalesce(pc.peso_kg, 0)), 0) from estoque.romaneio_itens i
               left join estoque.pecas pc on pc.codigo = i.codigo where i.romaneio_id = r.id) as peso_kg,
             (select coalesce(sum(i.qtd * coalesce(pc.comp_m, 0)), 0) from estoque.romaneio_itens i
               left join estoque.pecas pc on pc.codigo = i.codigo where i.romaneio_id = r.id and not i.forro and not i.filha) as comp_m
      from estoque.romaneios r where r.envio_id = ${id} order by r.numero`;
    return { envio: e, romaneios: romaneios.map(r => ({ ...r, peso_kg: Number(r.peso_kg), comp_m: Number(r.comp_m) })) };
  },

  async romaneio(tx, p) {
    const id = int(p.id);
    const [r] = await tx`select r.*, e.cliente, e.obra, e.gt, e.modelo, e.endereco_envio, e.lanca_m, e.altura_m, e.base,
                                e.lastro_t from estoque.romaneios r join estoque.envios e on e.id = r.envio_id where r.id = ${id}`;
    if (!r) throw new Recusa("romaneio não encontrado");
    const lidos = await lidosPorCodigo(tx, id);
    const itens = (await tx`select i.*, pc.peso_kg, pc.comp_m from estoque.romaneio_itens i
                            left join estoque.pecas pc on pc.codigo = i.codigo where i.romaneio_id = ${id}
                            order by i.forro, i.filha, i.id`)
      .map(i => ({ ...i, qtd: Number(i.qtd), peso_kg: i.peso_kg == null ? null : Number(i.peso_kg),
                   comp_m: i.comp_m == null ? null : Number(i.comp_m), lidos: lidos[i.codigo] || 0 }));
    const leituras = await tx`select id, codigo9, id_individual, codigo, manual, fora_do_plano, usuario,
                                     to_char(criado_em at time zone ${TZ}, 'DD/MM HH24:MI') as quando
                              from estoque.romaneio_leituras where romaneio_id = ${id} order by id desc`;
    const fotosRows = await tx`select id, caminho, usuario from estoque.romaneio_fotos where romaneio_id = ${id} order by id`;
    const fotos = [];
    for (const f of fotosRows) {
      const { data } = await storage.from(BUCKET).createSignedUrl(f.caminho, 3600);
      fotos.push({ id: f.id, usuario: f.usuario, url: data?.signedUrl || "" });
    }
    const outros = await tx`select id, numero, veiculo, status from estoque.romaneios
                            where envio_id = ${r.envio_id} and id <> ${id} order by numero`;
    const historico = await tx`select acao, usuario, detalhe, to_char(criado_em at time zone ${TZ}, 'DD/MM HH24:MI') as quando
                               from estoque.romaneio_log where romaneio_id = ${id} order by id desc limit 50`;
    return { romaneio: r, itens, leituras, fotos, outros, historico };
  },

  // Conferência: código 9 + ID (QR ou digitado)
  async ler_peca(tx, p, c) {
    exigir(c, "operacional", "expedicao");
    const r = await romaneioAberto(tx, int(p.romaneio_id));
    const c9 = normCod(p.codigo9), id = normCod(p.id_individual);
    if (!c9 || !id) throw new Recusa("informe código 9 e ID");
    const [dup] = await tx`select l.romaneio_id, x.numero from estoque.romaneio_leituras l join estoque.romaneios x on x.id = l.romaneio_id
                           where l.envio_id = ${r.envio_id} and l.codigo9 = ${c9} and l.id_individual = ${id}`;
    if (dup) throw new Recusa(`esta peça já foi conferida no romaneio ${dup.numero}`, { duplicada: true, numero: dup.numero });

    const peca = await identificarPeca(tx, c9, id);
    if (!peca) throw new Recusa("peça não encontrada na MachineCards nem nos ajustes", { naoEncontrada: true, codigo9: c9, id_individual: id });
    const confirmo = txt(p.confirmo).toUpperCase() === "CONFIRMO";
    if (peca.gt && normNome(peca.gt) !== normNome(r.gt) && !confirmo) {
      throw new Recusa(`peça cadastrada no ${peca.gt}, não no ${r.gt}`, { outroGt: peca.gt, pedeConfirmo: true, descricao: peca.descricao });
    }

    // Posição prevista: o próprio código ou a posição de que é compatível
    const candidatos = await posicaoDoCodigo(tx, r.modelo, peca.codigo);
    const lidosAqui = await lidosPorCodigo(tx, r.id);
    const itensAqui = await tx`select codigo, qtd from estoque.romaneio_itens where romaneio_id = ${r.id} and codigo = any(${candidatos})`;
    const livreAqui = itensAqui.find(i => Number(i.qtd) > (lidosAqui[i.codigo] || 0));
    let codigoPrevisto = livreAqui?.codigo || null, fora = false, movidoDe: number | null = null;

    if (!livreAqui) {
      // Prevista em outro romaneio do envio com saldo?
      const outros = await tx`select i.romaneio_id, x.numero, i.codigo, i.qtd, i.descricao, i.codigo_exibicao, i.forro, i.filha,
                                     (select count(*)::int from estoque.romaneio_leituras l
                                       where l.romaneio_id = i.romaneio_id and l.codigo = i.codigo) as lidos
                              from estoque.romaneio_itens i join estoque.romaneios x on x.id = i.romaneio_id
                              where x.envio_id = ${r.envio_id} and x.id <> ${r.id} and x.status in ('planejado','iniciado')
                                and i.codigo = any(${candidatos}) order by x.numero`;
      const comSaldo = outros.find(o => Number(o.qtd) > o.lidos);
      if (comSaldo) {
        if (p.mover !== true) {
          throw new Recusa(`peça prevista no romaneio ${comSaldo.numero}`, { outroRomaneio: comSaldo.numero, pedeMover: true, descricao: comSaldo.descricao });
        }
        await somarItem(tx, comSaldo.romaneio_id, comSaldo.codigo, -1, comSaldo, "movido");
        await somarItem(tx, r.id, comSaldo.codigo, 1, comSaldo, "movido");
        codigoPrevisto = comSaldo.codigo; movidoDe = comSaldo.romaneio_id;
        await log(tx, c, "item movido na leitura", r.envio_id, r.id, { codigo: comSaldo.codigo, de: comSaldo.numero });
      } else {
        if (!confirmo) {
          throw new Recusa("peça fora do envio (ou além da quantidade prevista)", { foraDoEnvio: true, pedeConfirmo: true, descricao: peca.descricao });
        }
        const [pc] = await tx`select codigo_exibicao, descricao from estoque.pecas where codigo = ${peca.codigo}`;
        await somarItem(tx, r.id, peca.codigo, 1, { codigo_exibicao: pc?.codigo_exibicao, descricao: pc?.descricao || peca.descricao }, "manual");
        codigoPrevisto = peca.codigo; fora = true;
      }
    }
    await tx`insert into estoque.romaneio_leituras ${tx({
      envio_id: r.envio_id, romaneio_id: r.id, codigo9: c9, id_individual: id, codigo: codigoPrevisto,
      manual: p.manual === true, fora_do_plano: fora, usuario: c.usuario, obs: peca.viaAjuste ? "via AJUSTE" : null,
    })}`;
    if (r.status === "planejado") await tx`update estoque.romaneios set status = 'iniciado' where id = ${r.id}`;
    if (fora || peca.gt && normNome(peca.gt) !== normNome(r.gt)) {
      await log(tx, c, "leitura com CONFIRMO", r.envio_id, r.id, { codigo9: c9, id, codigo: peca.codigo, gt: peca.gt, fora });
    }
    return { codigo: codigoPrevisto, descricao: peca.descricao, fora, movidoDe };
  },

  async desfazer_leitura(tx, p, c) {
    exigir(c, "operacional", "expedicao");
    const [l] = await tx`select * from estoque.romaneio_leituras where id = ${int(p.leitura_id)}`;
    if (!l) throw new Recusa("leitura não encontrada");
    await romaneioAberto(tx, l.romaneio_id);
    await tx`delete from estoque.romaneio_leituras where id = ${l.id}`;
    await log(tx, c, "leitura desfeita", l.envio_id, l.romaneio_id, { codigo9: l.codigo9, id: l.id_individual });
    return {};
  },

  async mover_item(tx, p, c) {
    exigir(c, "operacional", "expedicao");
    const de = await romaneioAberto(tx, int(p.de)), para = await romaneioAberto(tx, int(p.para));
    if (de.envio_id !== para.envio_id) throw new Recusa("os romaneios são de envios diferentes");
    const codigo = txt(p.codigo), qtd = Number(p.qtd) || 0;
    const [it] = await tx`select * from estoque.romaneio_itens where romaneio_id = ${de.id} and codigo = ${codigo}`;
    if (!it) throw new Recusa("peça não está no romaneio de origem");
    const lidos = (await lidosPorCodigo(tx, de.id))[codigo] || 0;
    if (qtd <= 0 || qtd > Number(it.qtd) - lidos) throw new Recusa(`dá para mover até ${Number(it.qtd) - lidos} (o que já foi lido fica)`);
    await somarItem(tx, de.id, codigo, -qtd, it, "movido");
    await somarItem(tx, para.id, codigo, qtd, it, "movido");
    await log(tx, c, "item movido", de.envio_id, de.id, { codigo, qtd, para: para.numero });
    await log(tx, c, "item recebido", de.envio_id, para.id, { codigo, qtd, de: de.numero });
    return {};
  },

  async editar_romaneio(tx, p, c) {
    exigir(c, "operacional", "expedicao");
    const r = await romaneioAberto(tx, int(p.id));
    const campos = ["transportadora", "motorista", "cpf_motorista", "placa_cavalo", "placa_carreta1", "placa_carreta2",
                    "nota_fiscal", "responsavel", "obs"];
    const d: Record<string, unknown> = {};
    campos.forEach(k => { if (k in p) d[k] = txt(p[k]) ? (k.startsWith("placa") ? txt(p[k]).toUpperCase() : txt(p[k])) : null; });
    if ("veiculo" in p && txt(p.veiculo) !== txt(r.veiculo)) {
      exigir(c, "expedicao", "operacional");
      const [v] = await tx`select nome, comp_util_m, carga_max_kg from estoque.veiculos where nome = ${txt(p.veiculo)}`;
      if (!v) throw new Recusa("veículo não cadastrado");
      Object.assign(d, { veiculo: v.nome, comp_util_m: v.comp_util_m, carga_max_kg: v.carga_max_kg });
    }
    if (!Object.keys(d).length) return {};
    await tx`update estoque.romaneios set ${tx(d)} where id = ${r.id}`;
    await log(tx, c, "dados do romaneio", r.envio_id, r.id, d);
    // Motorista: cadastro reaproveitado com as últimas placas (a ligação do dia fica no romaneio)
    const nome = txt(d.motorista ?? r.motorista);
    if (nome) {
      const pl = { placa_cavalo: d.placa_cavalo ?? r.placa_cavalo ?? null, placa_carreta1: d.placa_carreta1 ?? r.placa_carreta1 ?? null,
                   placa_carreta2: d.placa_carreta2 ?? r.placa_carreta2 ?? null };
      const cpf = txt(d.cpf_motorista ?? r.cpf_motorista).replace(/\D/g, "") || null;
      const [m] = await tx`select id, cpf from estoque.motoristas where lower(nome) = lower(${nome}) limit 1`;
      if (m) await tx`update estoque.motoristas set ${tx({ ...pl, cpf: cpf || m.cpf })} where id = ${m.id}`;
      else await tx`insert into estoque.motoristas ${tx({ nome, cpf, ...pl })}`;
    }
    return {};
  },

  async novo_romaneio(tx, p, c) {
    exigir(c, "expedicao", "operacional");
    const envio = int(p.envio_id);
    const [v] = await tx`select nome, comp_util_m, carga_max_kg from estoque.veiculos where nome = ${txt(p.veiculo)}`;
    const [{ n }] = await tx`select coalesce(max(numero), 0) + 1 as n from estoque.romaneios where envio_id = ${envio}`;
    const [r] = await tx`insert into estoque.romaneios ${tx({ envio_id: envio, numero: n, veiculo: v?.nome ?? null,
      comp_util_m: v?.comp_util_m ?? null, carga_max_kg: v?.carga_max_kg ?? null })} returning id`;
    await log(tx, c, "veículo incluído", envio, r.id, { numero: n, veiculo: v?.nome });
    return { id: r.id, numero: n };
  },

  async foto_upload(tx, p, c) {
    exigir(c, "operacional", "expedicao");
    const r = await romaneioAberto(tx, int(p.romaneio_id));
    const caminho = `${r.envio_id}/${r.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    const { data, error } = await storage.from(BUCKET).createSignedUploadUrl(caminho);
    if (error || !data) throw new Error("storage: " + (error?.message || "sem URL"));
    return { caminho, url: data.signedUrl };
  },

  async foto_registrar(tx, p, c) {
    exigir(c, "operacional", "expedicao");
    const r = await romaneioAberto(tx, int(p.romaneio_id));
    const caminho = txt(p.caminho);
    if (!caminho.startsWith(`${r.envio_id}/${r.id}/`)) throw new Recusa("caminho de foto inválido");
    await tx`insert into estoque.romaneio_fotos (romaneio_id, caminho, usuario) values (${r.id}, ${caminho}, ${c.usuario})`;
    await log(tx, c, "foto", r.envio_id, r.id, { caminho });
    return {};
  },

  async confirmar(tx, p, c) {
    exigir(c, "operacional", "expedicao");
    const r = await romaneioAberto(tx, int(p.id));
    const lidos = await lidosPorCodigo(tx, r.id);
    const itens = await tx`select codigo, codigo_exibicao, descricao, qtd from estoque.romaneio_itens where romaneio_id = ${r.id}`;
    const faltas = itens.filter(i => (lidos[i.codigo] || 0) < Number(i.qtd))
                        .map(i => `${i.descricao || i.codigo_exibicao}: ${lidos[i.codigo] || 0}/${Number(i.qtd)}`);
    const justificativa = txt(p.justificativa);
    if (faltas.length && !justificativa) throw new Recusa("há peças não conferidas: justifique ou confira", { faltas });
    const pendentes = [];
    if (!txt(r.placa_cavalo)) pendentes.push("placa do cavalo");
    if (!txt(r.motorista)) pendentes.push("motorista");
    if (!txt(r.transportadora)) pendentes.push("transportadora");
    const [{ n }] = await tx`select count(*)::int n from estoque.romaneio_fotos where romaneio_id = ${r.id}`;
    if (!n) pendentes.push("ao menos uma foto");
    if (pendentes.length) throw new Recusa("falta preencher: " + pendentes.join(", "), { pendentes });
    await mudarStatus(tx, c, r, "conferido", justificativa || null,
      { confirmado_por: c.usuario, confirmado_em: new Date(), justificativa: justificativa || null });
    return { faltas };
  },

  // Conferido → aguardando nota (pedido à contabilidade; o e-mail vem depois)
  async solicitar_nota(tx, p, c) {
    exigir(c, "operacional", "expedicao");
    const r = await romaneioPorId(tx, int(p.id));
    if (r.status !== "conferido") throw new Recusa(`só um romaneio conferido pede nota (este está ${ROTULO[r.status]})`);
    await mudarStatus(tx, c, r, "aguardando_nota", null);
    return {};
  },

  // Aguardando nota → concluído, com o número da nota
  async concluir(tx, p, c) {
    exigir(c, "operacional", "expedicao");
    const r = await romaneioPorId(tx, int(p.id));
    if (r.status !== "aguardando_nota") throw new Recusa(`só conclui romaneio aguardando nota (este está ${ROTULO[r.status]})`);
    const nf = txt(p.nota_fiscal) || txt(r.nota_fiscal);
    if (!nf) throw new Recusa("informe o número da nota fiscal");
    const envio = await mudarStatus(tx, c, r, "concluido", null, { nota_fiscal: nf });
    return { envioConcluido: envio === "concluido" };
  },

  async sinistrar(tx, p, c) {
    exigir(c, "expedicao");
    const r = await romaneioPorId(tx, int(p.id));
    if (r.status === "excluido") throw new Recusa("romaneio excluído");
    const motivo = txt(p.motivo);
    if (!motivo) throw new Recusa("descreva o sinistro");
    await mudarStatus(tx, c, r, "sinistrado", motivo);
    return {};
  },

  // Volta para iniciado (admin): corrige confirmação, sinistro ou exclusão por engano
  async reabrir(tx, p, c) {
    exigir(c, "admin");
    const r = await romaneioPorId(tx, int(p.id));
    if (EM_CARGA.includes(r.status)) throw new Recusa("romaneio já está aberto");
    await mudarStatus(tx, c, r, "iniciado", txt(p.motivo) || "reaberto", { confirmado_por: null, confirmado_em: null });
    return {};
  },

  // Excluir envio: escopo "planejados" (só os que nem começaram) ou "geral" (todos, qualquer status; pede EXCLUIR).
  // Não apaga: marca excluído com motivo (leituras, fotos e histórico ficam).
  async excluir_envio(tx, p, c) {
    exigir(c, "expedicao");
    const envioId = int(p.envio_id), escopo = txt(p.escopo), motivo = txt(p.motivo);
    if (!["planejados", "geral"].includes(escopo)) throw new Recusa("escolha: só planejados ou exclusão geral");
    if (!motivo) throw new Recusa("informe o motivo da exclusão");
    if (escopo === "geral" && txt(p.confirmo).toUpperCase() !== "EXCLUIR") throw new Recusa("digite EXCLUIR para a exclusão geral", { pedeConfirmo: true });
    const alvo = await tx`select r.*, e.gt from estoque.romaneios r join estoque.envios e on e.id = r.envio_id
                          where r.envio_id = ${envioId} and r.status <> 'excluido'
                            and (${escopo} = 'geral' or r.status = 'planejado') for update of r`;
    if (!alvo.length) throw new Recusa(escopo === "planejados" ? "não há romaneio planejado neste envio" : "não há romaneio para excluir");
    let envio = "aberto";
    for (const r of alvo) envio = await mudarStatus(tx, c, r, "excluido", `${escopo === "geral" ? "exclusão geral" : "planejados"}: ${motivo}`);
    return { excluidos: alvo.length, envio };
  },

  async cad_listar(tx, p, c) {
    const def = CADASTROS[txt(p.tabela)];
    if (!def) throw new Recusa("cadastro inválido");
    if (txt(p.tabela) === "usuario_papeis") exigir(c, "admin");
    const busca = txt(p.busca).toLowerCase();
    const rows = await tx`select * from ${tx("estoque." + txt(p.tabela))} order by ${tx(def.ordem)} limit 2000`;
    const filtradas = busca ? rows.filter(r => def.busca.some(k => String(r[k] ?? "").toLowerCase().includes(busca))) : rows;
    return { linhas: filtradas.slice(0, 300), total: filtradas.length, colunas: [def.chave, ...def.colunas],
             podeEditar: pode(c, ...def.papel) };
  },

  // Exclui de verdade se ninguém usa; se já é usado (envio, romaneio, motorista…), só desativa
  async cad_excluir(tx, p, c) {
    const tabela = txt(p.tabela), def = CADASTROS[tabela];
    if (!def || tabela === "usuario_papeis") throw new Recusa("cadastro inválido");
    exigir(c, ...def.papel);
    const chave = txt(p.chave);
    if (!chave) throw new Recusa("informe o registro");
    const ident = tx("estoque." + tabela);
    const [antes] = await tx`select * from ${ident} where ${tx(def.chave)} = ${chave}`;
    if (!antes) throw new Recusa("registro não encontrado");
    let acao = "excluído";
    try {
      await tx.savepoint(sp => sp`delete from ${ident} where ${tx(def.chave)} = ${chave}`);
    } catch (e) {
      if ((e as { code?: string }).code !== "23503") throw e;
      if (!("ativo" in antes)) throw new Recusa("em uso (envio/regra/romaneio): não dá para excluir");
      await tx`update ${ident} set ativo = false where ${tx(def.chave)} = ${chave}`;
      acao = "desativado (já usado em envio/cadastro)";
    }
    await tx`insert into estoque.cadastro_log (usuario, tabela, chave, antes, depois)
             values (${c.usuario}, ${tabela}, ${chave}, ${tx.json(antes)}, ${tx.json({ acao })})`;
    return { acao };
  },

  async cad_salvar(tx, p, c) {
    const tabela = txt(p.tabela), def = CADASTROS[tabela];
    if (!def) throw new Recusa("cadastro inválido");
    exigir(c, ...def.papel);
    const dados = (p.dados || {}) as Record<string, unknown>;
    const d: Record<string, unknown> = {};
    def.colunas.forEach(k => { if (k in dados) d[k] = valorCampo(k, dados[k]); });
    const ident = tx("estoque." + tabela);
    if (tabela === "usuario_papeis") {
      const usuario = txt(dados.usuario).toLowerCase(), papel = txt(dados.papel);
      if (!usuario || !papel) throw new Recusa("informe usuário e papel");
      if (p.excluir === true) await tx`delete from estoque.usuario_papeis where usuario = ${usuario} and papel = ${papel}`;
      else await tx`insert into estoque.usuario_papeis (usuario, papel, criado_por) values (${usuario}, ${papel}, ${c.usuario}) on conflict do nothing`;
      await tx`insert into estoque.cadastro_log (usuario, tabela, chave, antes, depois)
               values (${c.usuario}, ${tabela}, ${usuario}, null, ${tx.json({ papel, excluir: p.excluir === true })})`;
      return {};
    }
    if (tabela === "pecas") Object.assign(d, { atualizado_por: c.usuario, atualizado_em: new Date() });
    if (tabela === "placas" && "placa" in dados) dados.placa = txt(dados.placa).toUpperCase();
    const chave = dados[def.chave];
    let antes = null, depois;
    if (txt(chave)) {
      [antes] = await tx`select * from ${ident} where ${tx(def.chave)} = ${chave as string}`;
    }
    if (antes) {
      if (tabela === "veiculos" && d.padrao === true) await tx`update estoque.veiculos set padrao = false where nome <> ${chave as string}`;
      [depois] = await tx`update ${ident} set ${tx(d)} where ${tx(def.chave)} = ${chave as string} returning *`;
    } else {
      if (def.chave !== "id") d[def.chave] = txt(chave);
      if (def.chave !== "id" && !txt(chave)) throw new Recusa(`informe ${def.chave}`);
      if (tabela === "pecas") d.codigo = chaveCodigo(chave), d.codigo_exibicao = d.codigo_exibicao || txt(chave);
      [depois] = await tx`insert into ${ident} ${tx(d)} returning *`;
    }
    await tx`insert into estoque.cadastro_log (usuario, tabela, chave, antes, depois)
             values (${c.usuario}, ${tabela}, ${String(depois[def.chave])}, ${antes ? tx.json(antes) : null}, ${tx.json(depois)})`;
    return { linha: depois };
  },
};

const MODOS_GRAVACAO = ["solicitar_nota", "concluir", "sinistrar", "excluir_envio", "cad_excluir", "salvar_envio", "ler_peca", "desfazer_leitura", "mover_item", "editar_romaneio", "novo_romaneio",
                        "foto_upload", "foto_registrar", "confirmar", "reabrir", "cad_salvar"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  let p: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { p = await req.json(); } catch { return json(req, { ok: false, version: VERSION, error: "JSON inválido" }, 400); }
  } else p = Object.fromEntries(new URL(req.url).searchParams);
  const modo = txt(p.modo);

  if (modo === "diag") {
    const [r] = await sql`select (select count(*)::int from estoque.envios where status = 'aberto') as envios_abertos,
                                 (select count(*)::int from estoque.pecas) as pecas,
                                 (select count(*)::int from estoque.config_regras) as regras,
                                 (select count(*)::int from estoque.relacao_itens) as relacao_itens`;
    return json(req, { ok: true, version: VERSION, mode: "diag", ...r });
  }

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data, error } = token ? await auth.auth.getUser(token) : { data: null, error: true };
  const user = data?.user;
  if (error || !user) return json(req, { ok: false, auth: false, version: VERSION, error: "acesso negado" });
  const usuario = String(user.email || "").split("@")[0].toLowerCase();
  const papeis = usuario === "consulta" ? ["consulta"]
    : (await sql`select papel from estoque.usuario_papeis where usuario = ${usuario}`).map(r => r.papel);
  const c: Ctx = { usuario, papeis };

  if (modo === "me") return json(req, { ok: true, version: VERSION, usuario, papeis });
  if (!MODOS[modo]) return json(req, { ok: false, version: VERSION, error: "modo inválido ou ausente" });
  if (!papeis.length) return json(req, { ok: false, semPermissao: true, version: VERSION, error: `usuário ${usuario} sem papel no envio de grua (peça a um admin)` });
  if (papeis.length === 1 && papeis[0] === "consulta" && MODOS_GRAVACAO.includes(modo)) {
    return json(req, { ok: false, semPermissao: true, version: VERSION, error: "usuário de consulta não pode gravar" });
  }
  try {
    const r = await sql.begin(tx => MODOS[modo](tx, p, c));
    return json(req, { ok: true, version: VERSION, modo, ...r });
  } catch (e) {
    if (e instanceof Recusa) return json(req, { ok: false, version: VERSION, modo, error: e.message, ...e.extra });
    console.error(modo, e);
    return json(req, { ok: false, version: VERSION, modo, error: String((e as Error)?.message || e) });
  }
});
