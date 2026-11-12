// Teste do configurador do envio de grua (supabase/functions/_shared/configurador.mjs):
//   node testes/configurador.test.js
// Dados inventados: um modelo com lança na RELAÇÃO, regras de torre/base/lastro e uma frota.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

(async () => {
  const { montarLista, distribuirVeiculos, opcoesConfig, numLanca } =
    await import(pathToFileURL(path.join(__dirname, "..", "supabase", "functions", "_shared", "configurador.mjs")).href);

  const M = "Grua X 10";
  const relacaoItens = [
    { codigo: "C051.023-611.111", descricao: "LANÇA 1 - PÉ", grupo: "LANÇA", linha: 5, gt: "", qtd: { "50m": 1, "45m": 1 } },
    { codigo: "C051.001-621.111", descricao: "LANÇA 2", grupo: "LANÇA", linha: 6, gt: "", qtd: { "50m": 2, "45m": 1 } },
    { codigo: "C051.001-641.111", descricao: "LANÇA PONTA", grupo: "LANÇA", linha: 7, gt: "", qtd: { "50m": 1, "45m": 1 } },
    { codigo: "C051.001-812.111", descricao: "TIRANTE DA LANÇA", grupo: "TIRANTES DA LANÇA", linha: 9, gt: "", qtd: { "50m": 2 } },
    { codigo: "C051.045-411.000", descricao: "CABINE", grupo: "MESA DE GIRO", linha: 12, gt: "", qtd: { "50m": 1, "45m": 1 } },
    { codigo: "WIW280MZ401", descricao: "MECANISMO DE ELEVAÇÃO", grupo: "MESA DE GIRO", linha: 13, gt: "", qtd: { "50m": 1, "45m": 1 } },
    { codigo: "C051.005-541.111", descricao: "PONTA DA TORRE", grupo: "PONTA DA TORRE", linha: 15, gt: "", qtd: { "50m": 1, "45m": 1 } },
    { codigo: "C064.002-965.111", descricao: "PLATAFORMA DE MONTAGEM", grupo: "PLATAFORMA", linha: 16, gt: "GT-99", qtd: { "50m": 2 } },
    { codigo: "C028.006-718.320", descricao: "CONTRA-PESO A", grupo: "CONTRA-PESO", linha: 20, gt: "", qtd: { "50m": 3 } },
  ];
  const regra = (componente, codigo, quantidade, extra = {}) => ({ modelo: M, componente, codigo, quantidade, ordem: 0, ...extra });
  const regras = [
    regra("lanca", "C051001812111", 2, { lanca_m: 50, pai: "C051.001-621.111" }),   // só o pai é aproveitado
    regra("lanca", "C051023611111", 1, { lanca_m: 50 }),                               // lança da Base de Dados: ignorada
    regra("contrapeso", "C028006718320", 7, { lanca_m: 50 }),                          // contrapeso: vem da RELAÇÃO
    regra("torre", "C028047337111", 1, { altura_m: 20.7, base: "CHUMBADOR X", telescopagem: false, ordem: 2 }),
    regra("torre", "C028047332111", 4, { altura_m: 20.7, base: "CHUMBADOR X", telescopagem: false, ordem: 3 }),
    regra("torre", "C028047332111", 5, { altura_m: 24.8, base: "CHUMBADOR X", telescopagem: false, ordem: 4 }),
    regra("torre", "C028047337111", 1, { altura_m: 20.7, base: "CARRO INFERIOR X", telescopagem: false, ordem: 5 }),
    regra("torre", "C028047332111", 3, { altura_m: 20.7, base: "CARRO INFERIOR X", telescopagem: false, ordem: 6 }),
    regra("base", "C028001372111", 4, { base: "CHUMBADOR X" }),
    regra("base", "C028047311111", 1, { base: "CARRO INFERIOR X" }),
    regra("base", "C028001313111", 4, { base: "CARRO INFERIOR X" }),
    regra("lastro", "C028058318411", 2, { lastro_t: 10.8, base: "CARRO INFERIOR X" }),
    regra("lastro", "C028058318411", 4, { lastro_t: 21.6, base: "CARRO INFERIOR X" }),
    regra("cabine", "C051045411000", 1),                                                // já vem da RELAÇÃO
    regra("torre", "C999000000001", 1, { altura_m: 20.7, base: "CHUMBADOR X", modelo: "Outra grua" }),
  ];
  const peca = (descricao, peso_kg, comp_m, extra = {}) => ({ descricao, peso_kg, comp_m, ...extra });
  const pecas = {
    C051023611111: peca("LANÇA 1 - PÉ", 3100, 12), C051001621111: peca("LANÇA 2", 2000, 10),
    C051001641111: peca("LANÇA PONTA", 270, 1.2), C051001812111: peca("TIRANTE DA LANÇA", 300, 3),
    C051045411000: peca("CABINE", 10120, 5.49, { veiculo_exigido: "Prancha" }),
    WIW280MZ401: peca("MECANISMO DE ELEVAÇÃO", 4000, 1.5, { veiculo_exigido: "Prancha" }),
    C051005541111: peca("PONTA DA TORRE", 2800, 9.05), C064002965111: peca("PLATAFORMA", 150, 3),
    C028006718320: peca("CONTRA-PESO A", 2250, 2.55),
    C028047337111: peca("TORRE BASE 12,42", 7940, 12.42), C028047332111: peca("TORRE 4,14", 2300, 4.14),
    C028001372111: peca("CHUMBADOR", 200, 1), C028047311111: peca("VIGA CARRO INFERIOR", 1650, 9.1),
    C028001313111: peca("TIRANTE MÃO FRANCESA", 320, 4.14),
    C028058318411: peca("LASTRO A", 6940, 5.8, { vai_embaixo: true }),
  };
  const frota = [
    { nome: "Bitruck", comp_util_m: 7, carga_max_kg: 14000 },
    { nome: "Carreta 12 m", comp_util_m: 12, carga_max_kg: 27000, padrao: true },
    { nome: "Carreta 15 m", comp_util_m: 15, carga_max_kg: 30000 },
    { nome: "Prancha", comp_util_m: 10, carga_max_kg: 30000 },
  ];

  assert.strictEqual(numLanca("36,7m"), 36.7); assert.strictEqual(numLanca("75m"), 75);

  // ---------- Opções da tela ----------
  const op = opcoesConfig(M, regras);
  assert.deepStrictEqual(op.bases, ["CARRO INFERIOR X", "CHUMBADOR X"]);
  assert.deepStrictEqual(op.alturas("CHUMBADOR X", false), [20.7, 24.8]);
  assert.deepStrictEqual(op.lastros("CARRO INFERIOR X"), [10.8, 21.6]);
  console.log("ok - opções: bases, alturas por base e lastros do modelo");

  // ---------- Lista: chumbador ----------
  const cfgCh = { modelo: M, gt: "GT-10", lanca_m: 50, altura_m: 20.7, base: "CHUMBADOR X", telescopagem: false, lastro_t: null };
  const { itens: li, avisos: av } = montarLista(cfgCh, { relacaoItens, regras, pecas });
  const q = (lista, c) => (lista.find(i => i.codigo === c) || {}).qtd;
  assert.strictEqual(q(li, "C051001621111"), 2, "lança 2: quantidade da coluna 50m");
  assert.strictEqual(q(li, "C051023611111"), 1, "regra de lança da Base de Dados não soma");
  assert.strictEqual(q(li, "C028006718320"), 3, "contrapeso só da RELAÇÃO");
  assert.strictEqual(q(li, "C064002965111"), undefined, "linha de outro GT fica fora");
  assert.strictEqual(q(li, "C051045411000"), 1, "cabine da RELAÇÃO; regra de cabine não duplica");
  assert.strictEqual(q(li, "C028047337111"), 1); assert.strictEqual(q(li, "C028047332111"), 4, "torre pela altura e base");
  assert.strictEqual(q(li, "C028001372111"), 4, "chumbador");
  assert.strictEqual(q(li, "C028047311111"), undefined, "carro inferior não entra com chumbador");
  assert.strictEqual(q(li, "C999000000001"), undefined, "regra de outro modelo fica fora");
  assert.strictEqual(li.find(i => i.codigo === "C051001812111").pai, "C051001621111", "pai vem das regras");
  assert.ok(!av.some(a => /sem cadastro/.test(a)), av.join("\n"));
  console.log("ok - lista com chumbador: RELAÇÃO pela lança + torre + base; nada duplicado");

  // ---------- Lista: carro inferior + lastro escolhido ----------
  const cfgCi = { ...cfgCh, base: "CARRO INFERIOR X", lastro_t: 21.6 };
  const { itens: lc } = montarLista(cfgCi, { relacaoItens, regras, pecas });
  assert.strictEqual(q(lc, "C028001372111"), undefined, "chumbador não entra com carro inferior");
  assert.strictEqual(q(lc, "C028047311111"), 1); assert.strictEqual(q(lc, "C028001313111"), 4);
  assert.strictEqual(q(lc, "C028047332111"), 3, "torre do carro inferior");
  assert.strictEqual(q(lc, "C028058318411"), 4, "lastro de 21,6 t");
  const { avisos: av2 } = montarLista({ ...cfgCi, altura_m: 99 }, { relacaoItens, regras, pecas });
  assert.ok(av2.some(a => /Sem regra de torre para 99/.test(a)));
  console.log("ok - lista com carro inferior: base exclusiva, lastro escolhido, aviso de altura sem regra");

  // ---------- Distribuição ----------
  const { veiculos, avisos: avd } = distribuirVeiculos(lc, pecas, frota);
  const onde = c => veiculos.filter(v => v.itens.some(i => i.codigo === c)).map(v => v.n);
  const v1 = veiculos[0];
  assert.ok(v1.itens.some(i => i.codigo === "C028047311111"), "base primeiro (ordem de montagem)");
  const prancha = veiculos.filter(v => v.tipo === "Prancha");
  assert.strictEqual(prancha.length, 1);
  assert.deepStrictEqual(prancha[0].itens.map(i => i.codigo).sort(), ["C051045411000", "WIW280MZ401"], "prancha só com cabine e mecanismo");
  const torre1242 = veiculos.find(v => v.itens.some(i => i.codigo === "C028047337111"));
  assert.strictEqual(torre1242.tipo, "Carreta 15 m", "peça de 12,42 m vai no menor veículo onde cabe");
  const tir = veiculos.find(v => v.itens.some(i => i.codigo === "C051001812111"));
  assert.ok(tir.itens.some(i => i.codigo === "C051001621111"), "tirante no mesmo veículo da lança 2 (pai)");
  assert.ok(tir.itens.find(i => i.codigo === "C051001812111").filha);
  for (const v of veiculos) {
    if (v.comp_util_m != null) assert.ok(v.comp_usado <= v.comp_util_m + 1e-6, `veículo ${v.n}: ${v.comp_usado} m > ${v.comp_util_m}`);
    if (v.comp_util_m != null) assert.ok(v.forro_usado <= v.comp_util_m + 1e-6, `veículo ${v.n}: forro ${v.forro_usado} m`);
    if (v.carga_max_kg != null) assert.ok(v.peso_kg <= v.carga_max_kg + 1e-6, `veículo ${v.n}: ${v.peso_kg} kg > ${v.carga_max_kg}`);
  }
  const forro = veiculos.flatMap(v => v.itens.filter(i => i.forro).map(i => [v.n, i.codigo, i.qtd]));
  assert.ok(forro.some(([, c]) => c === "C028058318411"), "lastro vai como forro");
  assert.ok(forro.some(([, c]) => c === "C028006718320"), "contrapeso vai como forro");
  assert.ok(onde("C028058318411").every(n => veiculos[n - 1].tipo !== "Prancha"), "forro não vai na prancha da cabine");
  const total = c => veiculos.reduce((s, v) => s + v.itens.filter(i => i.codigo === c).reduce((a, i) => a + i.qtd, 0), 0);
  lc.forEach(it => assert.strictEqual(total(it.codigo), it.qtd, `${it.codigo}: todas as unidades distribuídas`));
  assert.deepStrictEqual(avd, []);
  if (process.env.MOSTRAR) veiculos.forEach(v => console.log(v.n, v.tipo, v.comp_usado + "m", "forro " + v.forro_usado + "m", v.peso_kg + "kg", v.itens.map(i => `${i.descricao}${i.forro ? "(forro)" : ""}${i.filha ? "(filha)" : ""} x${i.qtd}`).join(", ")));
  console.log(`ok - distribuição: ${veiculos.length} veículos; base primeiro, prancha, 15 m, filha com o pai, forro, limites`);

  // Peso: o limite abre outro veículo
  const pesadas = [{ codigo: "C028047332111", codigoExib: "TORRE", descricao: "TORRE 4,14", origem: "torre", qtd: 2, ordem: 1 }];
  const leve = [{ nome: "Carreta 12 m", comp_util_m: 12, carga_max_kg: 3000, padrao: true }];
  assert.strictEqual(distribuirVeiculos(pesadas, pecas, leve).veiculos.length, 2, "2 × 2300 kg não cabem em 3000 kg");
  // Sem carga máxima cadastrada: só o comprimento limita
  assert.strictEqual(distribuirVeiculos(pesadas, pecas, [{ nome: "Carreta 12 m", comp_util_m: 12, padrao: true }]).veiculos.length, 1);
  // Peça maior que todos os veículos: não trava, avisa
  const r = distribuirVeiculos([{ codigo: "X", codigoExib: "X", descricao: "LONGA", origem: "relacao", qtd: 1 }],
                               { X: peca("LONGA", 100, 20) }, [{ nome: "Carreta 12 m", comp_util_m: 12, padrao: true }]);
  assert.strictEqual(r.veiculos.length, 1); assert.ok(r.avisos.some(a => /não cabe em nenhum veículo/.test(a)));
  console.log("ok - limite de peso abre veículo; sem carga cadastrada só o comprimento conta; peça longa avisa sem travar");

  console.log("\nconfigurador OK");
})().catch(e => { console.error(e); process.exit(1); });
