-- Status do romaneio: planejado → iniciado (1ª leitura) → conferido (Confirmar) → aguardando_nota (pedido à
-- contabilidade) → concluido (nota emitida). Fora do fluxo: sinistrado (com motivo) e excluido (com motivo; o
-- histórico fica). Envio: aberto, concluido (todos concluídos/sinistrados) ou excluido.

alter table estoque.romaneios drop constraint romaneios_status_check;
update estoque.romaneios set status = case status
  when 'carregando' then 'iniciado' when 'confirmado' then 'conferido' when 'nf_solicitada' then 'aguardando_nota' else status end;
alter table estoque.romaneios add constraint romaneios_status_check
  check (status in ('planejado', 'iniciado', 'conferido', 'aguardando_nota', 'concluido', 'sinistrado', 'excluido'));
alter table estoque.romaneios
  add column status_motivo text,          -- sinistro/exclusão
  add column status_por text,
  add column status_em timestamptz;

alter table estoque.envios drop constraint envios_status_check;
alter table estoque.envios add constraint envios_status_check check (status in ('aberto', 'concluido', 'excluido'));
