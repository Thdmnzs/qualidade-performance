-- =====================================================================
-- Histórico: a consulta da gestão passa a devolver a nota original (para mostrar
-- uma contestação aceita, "91 -> 100") e o processo usado (código e versão).
-- Partiu da definição que roda em produção (mesmo hash); as regras de quem vê o
-- quê não mudam. O tipo de retorno muda, então a função é recriada.
-- =====================================================================
drop function public.listar_avaliacoes_gestao(uuid);

CREATE OR REPLACE FUNCTION public.listar_avaliacoes_gestao(_fortnight_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, employee_id uuid, colaborador text, fortnight_id uuid, tipo evaluation_type, assunto text, data_contato date, link_conversa text, nota numeric, created_at timestamp with time zone, avaliado_por text, pode_excluir boolean, nota_original numeric, processo_codigo text, processo_versao integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ev.id, ev.employee_id, emp.nome, ev.fortnight_id, ev.tipo, ev.assunto, ev.data_contato,
         ev.link_conversa, ev.nota, ev.created_at,
         coalesce(av.nome, 'Avaliador removido'),
         public.quinzena_aceita_avaliacoes(ev.fortnight_id)
           and (public.is_admin(auth.uid()) or ev.avaliador_id = auth.uid()),
         ev.nota_original, pr.codigo, ev.processo_versao
    from public.evaluations ev
    join public.employees emp on emp.id = ev.employee_id
    left join public.employees av on av.user_id = ev.avaliador_id
    left join public.processos pr on pr.id = ev.processo_id
   where not ev.anulada
     and public.pode_atuar_sobre(auth.uid(), ev.employee_id)
     and (_fortnight_id is null or ev.fortnight_id = _fortnight_id)
   order by emp.nome, ev.created_at desc
$function$;

revoke all on function public.listar_avaliacoes_gestao(uuid) from public, anon;
grant execute on function public.listar_avaliacoes_gestao(uuid) to authenticated;
