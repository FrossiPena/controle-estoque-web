-- Envio de grua, operação: envios (grupo cliente – GT), romaneios (um por veículo), itens previstos, leituras por
-- QR, fotos e histórico. Só a Edge Function "romaneio" acessa (schema fora da Data API, RLS sem policies).

create table estoque.envios (
  id bigint generated always as identity primary key,
  cliente_id bigint references estoque.clientes (id),
  cliente text not null,                    -- nome como digitado/escolhido (o cadastro pode mudar depois)
  endereco_envio text,
  obra text,
  gt text not null,
  modelo text not null,
  lanca_m numeric,
  altura_m numeric,
  base text,
  telescopagem boolean,
  lastro_t numeric,
  status text not null default 'aberto' check (status in ('aberto', 'concluido', 'cancelado')),
  obs text,
  criado_por text not null,
  criado_em timestamptz not null default now()
);
create index envios_status_idx on estoque.envios (status, criado_em desc);
create index envios_cliente_idx on estoque.envios (cliente_id);

create table estoque.romaneios (
  id bigint generated always as identity primary key,
  envio_id bigint not null references estoque.envios (id) on delete cascade,
  numero int not null,
  veiculo text references estoque.veiculos (nome) on update cascade,
  comp_util_m numeric,                      -- cópia do cadastro do veículo na hora (pode ser editada)
  carga_max_kg numeric,
  transportadora text,
  motorista text,
  cpf_motorista text,
  placa_cavalo text,
  placa_carreta1 text,
  placa_carreta2 text,
  nota_fiscal text,
  responsavel text,
  obs text,
  status text not null default 'planejado'
    check (status in ('planejado', 'carregando', 'confirmado', 'nf_solicitada')),
  justificativa text,                       -- confirmado com peça faltando/sobrando
  confirmado_por text,
  confirmado_em timestamptz,
  unique (envio_id, numero)
);

-- Previsto: uma linha por peça (Código C) e romaneio
create table estoque.romaneio_itens (
  id bigint generated always as identity primary key,
  romaneio_id bigint not null references estoque.romaneios (id) on delete cascade,
  codigo text not null,
  codigo_exibicao text,
  descricao text,
  qtd numeric not null check (qtd >= 0),
  forro boolean not null default false,
  filha boolean not null default false,
  origem text not null default 'plano' check (origem in ('plano', 'manual', 'movido')),
  unique (romaneio_id, codigo)
);

-- Peça física conferida (QR ou digitada). A mesma peça não entra duas vezes no mesmo envio.
create table estoque.romaneio_leituras (
  id bigint generated always as identity primary key,
  envio_id bigint not null references estoque.envios (id) on delete cascade,
  romaneio_id bigint not null references estoque.romaneios (id) on delete cascade,
  codigo9 text not null,
  id_individual text not null,
  codigo text,                              -- Código C da peça (MachineCards/AJUSTE)
  manual boolean not null default false,
  fora_do_plano boolean not null default false,
  obs text,
  usuario text not null,
  criado_em timestamptz not null default now(),
  unique (envio_id, codigo9, id_individual)
);
create index romaneio_leituras_romaneio_idx on estoque.romaneio_leituras (romaneio_id);

create table estoque.romaneio_fotos (
  id bigint generated always as identity primary key,
  romaneio_id bigint not null references estoque.romaneios (id) on delete cascade,
  caminho text not null,                    -- objeto no bucket "romaneios"
  usuario text not null,
  criado_em timestamptz not null default now()
);
create index romaneio_fotos_romaneio_idx on estoque.romaneio_fotos (romaneio_id);

create table estoque.romaneio_log (
  id bigint generated always as identity primary key,
  envio_id bigint references estoque.envios (id) on delete cascade,
  romaneio_id bigint references estoque.romaneios (id) on delete cascade,
  usuario text not null,
  acao text not null,
  detalhe jsonb not null default '{}',
  criado_em timestamptz not null default now()
);
create index romaneio_log_envio_idx on estoque.romaneio_log (envio_id, criado_em desc);
create index romaneio_log_romaneio_idx on estoque.romaneio_log (romaneio_id);

alter table estoque.envios enable row level security;
alter table estoque.romaneios enable row level security;
alter table estoque.romaneio_itens enable row level security;
alter table estoque.romaneio_leituras enable row level security;
alter table estoque.romaneio_fotos enable row level security;
alter table estoque.romaneio_log enable row level security;

-- Fotos dos romaneios: bucket privado (a função gera links assinados para enviar e ver)
insert into storage.buckets (id, name, public) values ('romaneios', 'romaneios', false) on conflict (id) do nothing;
