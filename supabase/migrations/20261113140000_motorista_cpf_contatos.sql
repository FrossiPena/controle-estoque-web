-- Motorista identificado pelo CPF (nome varia: "Elon S. Musk" × "Elon Silva Musk"); celulares.
-- Transportadora: contato operacional e e-mail para envio da nota fiscal (emissão do CT-e).

alter table estoque.motoristas
  add column celular text,
  add column celular2 text;
create unique index motoristas_cpf_idx on estoque.motoristas (cpf) where cpf is not null;

alter table estoque.transportadoras
  add column contato_nome text,
  add column contato_telefone text,
  add column email_nf text;          -- para onde vai a nota fiscal (emissão do CT-e)
