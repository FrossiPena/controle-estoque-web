-- Cadastros do envio: cliente com CNPJ (dados da Receita pela BrasilAPI, no app), obra como "sub-cliente" da
-- construtora (pai_id), motorista guarda as últimas placas usadas (a ligação de cada dia fica no romaneio).

alter table estoque.clientes
  add column tipo text not null default 'empresa' check (tipo in ('empresa', 'obra')),
  add column pai_id bigint references estoque.clientes (id),
  add column cnpj text,
  add column razao_social text,
  add column nome_fantasia text,
  add column cidade text,
  add column uf text,
  add column cep text;
create index clientes_pai_idx on estoque.clientes (pai_id);
-- Duas construtoras podem ter obras com o mesmo nome: único por (construtora, nome)
drop index estoque.clientes_nome_idx;
create unique index clientes_nome_idx on estoque.clientes (coalesce(pai_id, 0), lower(nome));
create unique index clientes_cnpj_idx on estoque.clientes (cnpj) where cnpj is not null and tipo = 'empresa';

alter table estoque.motoristas
  add column placa_cavalo text,
  add column placa_carreta1 text,
  add column placa_carreta2 text;
