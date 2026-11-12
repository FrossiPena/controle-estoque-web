-- Envio de grua, etapa 1: cadastros do configurador e controle de acesso.
-- Nasce no Supabase (não há aba no Google nem espelho). Mesmo padrão da fase 1: schema "estoque" fora da Data API,
-- RLS ligada sem policies, só as Edge Functions (conexão direta) leem e gravam.
-- Carga das planilhas (só atualiza, nunca apaga o que foi digitado no app): node migracao/envio.mjs … → importar os
-- CSVs nas tabelas carga_* (Table Editor) → select estoque.aplicar_carga_envio();
-- As tabelas da operação (envios, romaneios, leituras, fotos) vêm numa migration seguinte, depois de a
-- distribuição ser conferida com envios reais.

-- ---------- Controle de acesso ----------
-- usuario = parte do e-mail do Supabase Auth antes do @ (como no "espelho"). Um usuário pode ter vários papéis.
-- O primeiro admin entra pelo SQL Editor: insert into estoque.usuario_papeis (usuario, papel) values ('nome', 'admin');
create table estoque.usuario_papeis (
  usuario text not null,
  papel text not null check (papel in ('admin', 'cadastro', 'expedicao', 'operacional', 'consulta')),
  criado_em timestamptz not null default now(),
  criado_por text,
  primary key (usuario, papel)
);

-- Histórico de toda alteração feita pela tela Cadastros (quem, quando, antes/depois)
create table estoque.cadastro_log (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  usuario text not null,
  tabela text not null,
  chave text not null,
  antes jsonb,
  depois jsonb
);
create index cadastro_log_tabela_idx on estoque.cadastro_log (tabela, chave, criado_em desc);

-- ---------- Modelos e veículos ----------
-- Modelo = nome da aba de modelo da RELAÇÃO (ex.: "280 EC-H 12 Litronic", "85 EC-B 5 FR.tronic - GT-17")
create table estoque.modelos (
  nome text primary key,
  preco_kg numeric,                       -- "PREÇO ESTRUT. METÁLICA - R$/KG" da aba
  na_relacao boolean not null default true, -- false = só aparece na Base de Dados Grua
  extra jsonb not null default '{}'
);

-- Tipos de veículo (bitruck, carreta 12 m, carreta 15 m, prancha). Capacidades preenchidas pelo usuário.
create table estoque.veiculos (
  nome text primary key,
  comp_util_m numeric check (comp_util_m > 0),
  carga_max_kg numeric check (carga_max_kg > 0),
  padrao boolean not null default false,  -- veículo aberto quando nada mais cabe
  ordem int not null default 0,
  ativo boolean not null default true,
  obs text
);
create unique index veiculos_um_padrao_idx on estoque.veiculos (padrao) where padrao;

insert into estoque.veiculos (nome, comp_util_m, padrao, ordem, obs) values
  ('Bitruck', null, false, 1, 'capacidade a preencher'),
  ('Carreta 12 m', 12, true, 2, 'carga máxima a preencher'),
  ('Carreta 15 m', 15, false, 3, 'carga máxima a preencher'),
  ('Prancha', null, false, 4, 'capacidade a preencher');

-- ---------- Peças ----------
-- Uma linha por código de peça: mesmo Código C = mesma peça, com um só peso, comprimento, preço e Sapiens em
-- qualquer modelo (diferença entre abas da RELAÇÃO era erro de cadastro; o conversor lista no relatório).
-- Quais peças cada modelo usa, grupo e quantidade por lança continuam na relacao_itens (pelo chave_c).
-- codigo = chave do Código C ("C053040611111") ou, para os outros códigos (WIW…, FAW…, A 101…), letras e números
-- em maiúsculas. codigo_exibicao = como estava escrito na planilha.
-- atualizado_por preenchido = editado pela tela Cadastros: a carga das planilhas não sobrescreve mais.
create table estoque.pecas (
  codigo text primary key,
  codigo_exibicao text not null,
  descricao text,
  peso_kg numeric check (peso_kg >= 0),
  comp_m numeric check (comp_m >= 0),
  larg_m numeric check (larg_m >= 0),
  alt_m numeric check (alt_m >= 0),
  preco_padrao numeric check (preco_padrao >= 0),
  valor_unitario numeric check (valor_unitario >= 0),   -- valor para a NF de transporte
  sapiens_produto text,
  sapiens_derivacao text,
  veiculo_exigido text references estoque.veiculos (nome) on update cascade,
  vai_embaixo boolean not null default false,  -- forra o veículo; outras peças vão por cima
  obs text,
  pendencias text,                        -- erros de cadastro achados na carga (divergência entre abas, sem peso…)
  extra jsonb not null default '{}',
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index pecas_veiculo_idx on estoque.pecas (veiculo_exigido) where veiculo_exigido is not null;

-- ---------- Regras do configurador (Base de Dados Grua) ----------
create table estoque.bases (
  modelo text not null references estoque.modelos (nome) on update cascade on delete cascade,
  base text not null,
  primary key (modelo, base)
);

-- Uma linha por (modelo, componente, condição, peça). Condição vazia = vale para qualquer valor.
-- codigo não tem FK: pode ser um código 9 ainda não convertido (o conversor lista no relatório).
create table estoque.config_regras (
  id bigint generated always as identity primary key,
  modelo text not null references estoque.modelos (nome) on update cascade on delete cascade,
  componente text not null check (componente in ('lanca', 'torre', 'base', 'lastro', 'contrapeso', 'cabine')),
  lanca_m numeric,
  altura_m numeric,
  base text,
  telescopagem boolean,
  lastro_t numeric,
  codigo text not null,
  quantidade numeric not null check (quantidade > 0),
  pai text,                               -- código da peça com que esta viaja (não ocupa comprimento)
  ordem int not null default 0,           -- linha na aba de origem
  origem text,                            -- "Altura!123"
  extra jsonb not null default '{}',      -- colunas da planilha sem uso definido (ex.: "Nº 1 para o pai")
  atualizado_por text                     -- preenchido = criada/editada no app (a carga não mexe)
);
create index config_regras_busca_idx on estoque.config_regras (modelo, componente);
create index config_regras_codigo_idx on estoque.config_regras (codigo);
create index config_regras_origem_idx on estoque.config_regras (origem) where origem is not null;

-- ---------- Cadastros do romaneio (digitados) ----------
create table estoque.clientes (
  id bigint generated always as identity primary key,
  nome text not null,
  endereco_envio text,
  obs text,
  ativo boolean not null default true
);
create unique index clientes_nome_idx on estoque.clientes (lower(nome));

create table estoque.transportadoras (
  id bigint generated always as identity primary key,
  nome text not null,
  cnpj text,
  ativo boolean not null default true
);
create unique index transportadoras_nome_idx on estoque.transportadoras (lower(nome));

create table estoque.motoristas (
  id bigint generated always as identity primary key,
  nome text not null,
  cpf text,
  transportadora_id bigint references estoque.transportadoras (id),
  ativo boolean not null default true
);
create index motoristas_transportadora_idx on estoque.motoristas (transportadora_id);

create table estoque.placas (
  placa text primary key check (placa = upper(placa)),
  tipo text not null check (tipo in ('cavalo', 'carreta')),
  transportadora_id bigint references estoque.transportadoras (id),
  ativo boolean not null default true
);
create index placas_transportadora_idx on estoque.placas (transportadora_id);

-- RLS ligada sem policies (só as Edge Functions acessam)
alter table estoque.usuario_papeis enable row level security;
alter table estoque.cadastro_log enable row level security;
alter table estoque.modelos enable row level security;
alter table estoque.veiculos enable row level security;
alter table estoque.pecas enable row level security;
alter table estoque.bases enable row level security;
alter table estoque.config_regras enable row level security;
alter table estoque.clientes enable row level security;
alter table estoque.transportadoras enable row level security;
alter table estoque.motoristas enable row level security;
alter table estoque.placas enable row level security;

-- ---------- Carga das planilhas (só atualiza) ----------
-- Os CSVs do migracao/envio.mjs entram nestas tabelas (mesmos nomes de coluna); aplicar_carga_envio() passa para as
-- definitivas e as esvazia. Regra: peça editada no app (atualizado_por) não é sobrescrita; regras vindas da planilha
-- (origem preenchida, atualizado_por vazio) são trocadas pelas novas; regras criadas/editadas no app ficam.
create table estoque.carga_modelos (nome text, preco_kg numeric, na_relacao boolean);
create table estoque.carga_pecas (
  codigo text, codigo_exibicao text, descricao text, peso_kg numeric, comp_m numeric, preco_padrao numeric,
  valor_unitario numeric, sapiens_produto text, sapiens_derivacao text, veiculo_exigido text, vai_embaixo boolean,
  pendencias text
);
create table estoque.carga_bases (modelo text, base text);
create table estoque.carga_config_regras (
  modelo text, componente text, lanca_m numeric, altura_m numeric, base text, telescopagem boolean, lastro_t numeric,
  codigo text, quantidade numeric, pai text, ordem int, origem text, extra jsonb
);
alter table estoque.carga_modelos enable row level security;
alter table estoque.carga_pecas enable row level security;
alter table estoque.carga_bases enable row level security;
alter table estoque.carga_config_regras enable row level security;

create function estoque.aplicar_carga_envio()
returns text
language plpgsql
set search_path = ''
as $$
declare
  n_mod int; n_pec int; n_bas int; n_del int; n_reg int;
begin
  insert into estoque.modelos (nome, preco_kg, na_relacao)
    select nome, preco_kg, coalesce(na_relacao, true) from estoque.carga_modelos
  on conflict (nome) do update set preco_kg = excluded.preco_kg, na_relacao = excluded.na_relacao;
  get diagnostics n_mod = row_count;

  insert into estoque.pecas (codigo, codigo_exibicao, descricao, peso_kg, comp_m, preco_padrao, valor_unitario,
                             sapiens_produto, sapiens_derivacao, veiculo_exigido, vai_embaixo, pendencias)
    select codigo, codigo_exibicao, descricao, peso_kg, comp_m, preco_padrao, valor_unitario,
           sapiens_produto, sapiens_derivacao, veiculo_exigido, coalesce(vai_embaixo, false), nullif(pendencias, '')
    from estoque.carga_pecas
  on conflict (codigo) do update set
    codigo_exibicao = excluded.codigo_exibicao, descricao = excluded.descricao, peso_kg = excluded.peso_kg,
    comp_m = excluded.comp_m, preco_padrao = excluded.preco_padrao, valor_unitario = excluded.valor_unitario,
    sapiens_produto = excluded.sapiens_produto, sapiens_derivacao = excluded.sapiens_derivacao,
    veiculo_exigido = excluded.veiculo_exigido, vai_embaixo = excluded.vai_embaixo,
    pendencias = excluded.pendencias, atualizado_em = now()
  where estoque.pecas.atualizado_por is null;
  get diagnostics n_pec = row_count;

  insert into estoque.bases (modelo, base) select modelo, base from estoque.carga_bases on conflict do nothing;
  get diagnostics n_bas = row_count;

  delete from estoque.config_regras where origem is not null and atualizado_por is null;
  get diagnostics n_del = row_count;
  insert into estoque.config_regras (modelo, componente, lanca_m, altura_m, base, telescopagem, lastro_t, codigo,
                                     quantidade, pai, ordem, origem, extra)
    select c.modelo, c.componente, c.lanca_m, c.altura_m, c.base, c.telescopagem, c.lastro_t, c.codigo,
           c.quantidade, c.pai, coalesce(c.ordem, 0), c.origem, coalesce(c.extra, '{}')
    from estoque.carga_config_regras c
    where not exists (select 1 from estoque.config_regras r where r.origem = c.origem);  -- editada no app: fica a do app
  get diagnostics n_reg = row_count;

  truncate estoque.carga_modelos, estoque.carga_pecas, estoque.carga_bases, estoque.carga_config_regras;
  return format('modelos %s, peças %s (editadas no app ficaram), bases novas %s, regras %s trocadas por %s',
                n_mod, n_pec, n_bas, n_del, n_reg);
end;
$$;
revoke all on function estoque.aplicar_carga_envio() from public, anon, authenticated;
