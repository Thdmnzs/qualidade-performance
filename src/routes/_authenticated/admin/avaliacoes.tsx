import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useIsManager } from "@/hooks/useAuth";
import { fetchAvaliacoes, fetchColaboradores, fetchQuinzenas } from "@/lib/queries";
import { dataHoraBR, nomeQuinzena, numeroBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/avaliacoes")({
  head: () => ({
    meta: [
      { title: "Avaliações de qualidade · Qualidade & Performance" },
      { name: "description", content: "Formulário de qualidade com 14 critérios e registro de quiz por quinzena." },
    ],
  }),
  component: Avaliacoes,
});

type Resposta = "sim" | "medio" | "nao";

function Avaliacoes() {
  const { isManager } = useIsManager();
  const qc = useQueryClient();

  const [employeeId, setEmployeeId] = useState("");
  const [fortnightId, setFortnightId] = useState("");
  const [tipo, setTipo] = useState<"interacao" | "ticket_n2">("interacao");
  const [ticket, setTicket] = useState("");
  const [link, setLink] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({});
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});

  const { data: colaboradores = [] } = useQuery({ queryKey: ["colaboradores"], queryFn: fetchColaboradores, enabled: isManager });
  const { data: quinzenas = [] } = useQuery({ queryKey: ["quinzenas"], queryFn: fetchQuinzenas, enabled: isManager });
  const { data: criterios = [] } = useQuery({
    queryKey: ["criterios"],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase.from("evaluation_criteria").select("*").eq("ativo", true).order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: avaliacoes = [] } = useQuery({
    queryKey: ["avaliacoes", fortnightId],
    queryFn: () => fetchAvaliacoes(fortnightId || undefined),
    enabled: isManager,
  });
  const { data: quiz = [] } = useQuery({
    queryKey: ["quiz", fortnightId],
    enabled: isManager && !!fortnightId,
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_results").select("*").eq("fortnight_id", fortnightId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const versao = criterios[0]?.versao ?? 1;
  const descontoDe = (c: (typeof criterios)[number], r?: Resposta) =>
    r === "nao" ? Number(c.peso) : r === "medio" ? Number(c.peso_medio ?? 0) : 0;
  const nota = useMemo(
    () => Math.max(0, 100 - criterios.reduce((s, c) => s + descontoDe(c, respostas[c.id]), 0)),
    [criterios, respostas],
  );
  const completa = criterios.length > 0 && criterios.every((c) => respostas[c.id]);
  const ativos = colaboradores.filter((c) => c.status === "ativo" && c.perfil === "colaborador");

  const salvar = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const { data: ev, error } = await supabase
        .from("evaluations")
        .insert({
          employee_id: employeeId,
          fortnight_id: fortnightId,
          tipo,
          ticket: ticket || null,
          link_conversa: link || null,
          comentarios: comentarios || null,
          versao_ficha: versao,
          nota,
          avaliador_id: user.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const itens = criterios.map((c) => ({
        evaluation_id: ev.id,
        criterion_id: c.id,
        resposta: respostas[c.id] ?? "sim",
        desconto: descontoDe(c, respostas[c.id]),
        observacao: respostas[c.id] === "nao" ? (observacoes[c.id]?.trim() || null) : null,
      }));
      const { error: e2 } = await supabase.from("evaluation_items").insert(itens);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Avaliação registrada.");
      setRespostas({});
      setObservacoes({});
      setTicket("");
      setLink("");
      setComentarios("");
      qc.invalidateQueries({ queryKey: ["avaliacoes"] });
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });

  const marcarQuiz = useMutation({
    mutationFn: async ({ emp, entregue }: { emp: string; entregue: boolean }) => {
      const { data: user } = await supabase.auth.getUser();
      const existente = quiz.find((q) => q.employee_id === emp);
      const { error } = existente
        ? await supabase.from("quiz_results").update({ entregue, registrado_por: user.user?.id ?? null }).eq("id", existente.id)
        : await supabase
            .from("quiz_results")
            .insert({ employee_id: emp, fortnight_id: fortnightId, entregue, registrado_por: user.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz", fortnightId] }),
    onError: (e: Error) => toast.error(`Não foi possível registrar o quiz: ${e.message}`),
  });

  if (!isManager) return <EmptyState titulo="Acesso restrito" texto="Área exclusiva da gestão." />;

  const select = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div>
      <PageHeader titulo="Avaliações" descricao={`Ficha de qualidade versão ${versao} · nota = 100 − descontos`} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!completa) { toast.error("Responda todos os critérios. Fichas em branco não são válidas."); return; }
          const semFeedback = criterios.find((c) => respostas[c.id] === "nao" && !observacoes[c.id]?.trim());
          if (semFeedback) { toast.error(`Justifique o critério "${semFeedback.ordem}. ${semFeedback.descricao}" marcado como Não.`); return; }
          salvar.mutate();
        }}
        className="mb-8 space-y-5 rounded-2xl border border-border bg-card p-5"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="q">Quinzena</Label>
            <select id="q" required className={select} value={fortnightId} onChange={(e) => setFortnightId(e.target.value)}>
              <option value="">Selecione</option>
              {quinzenas.map((q) => (
                <option key={q.id} value={q.id} disabled={q.status === "fechada"}>
                  {nomeQuinzena(q)} {q.status === "fechada" ? "(fechada)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c">Colaborador</Label>
            <select id="c" required className={select} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Selecione</option>
              {ativos.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t">Tipo</Label>
            <select id="t" className={select} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              <option value="interacao">Interação</option>
              <option value="ticket_n2">Ticket N2</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tk">Ticket</Label>
            <Input id="tk" value={ticket} onChange={(e) => setTicket(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="lk">Link da conversa</Label>
            <Input id="lk" type="url" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
        </div>

        <div className="divide-y divide-border rounded-xl border border-border">
          {criterios.map((c) => (
            <div key={c.id} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {c.ordem}. {c.descricao}
                    {c.gravidade === "gravissimo" && (
                      <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive">gravíssimo</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.grupo} · peso {numeroBR(Number(c.peso), 0)}
                    {c.permite_medio ? ` · médio ${numeroBR(Number(c.peso_medio), 0)}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  {(["sim", ...(c.permite_medio ? ["medio"] : []), "nao"] as Resposta[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setRespostas({ ...respostas, [c.id]: r });
                        if (r !== "nao") {
                          const { [c.id]: _removida, ...resto } = observacoes;
                          setObservacoes(resto);
                        }
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        respostas[c.id] === r
                          ? r === "nao" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {r === "sim" ? "Sim" : r === "medio" ? "Médio" : "Não"}
                    </button>
                  ))}
                </div>
              </div>
              {respostas[c.id] === "nao" && (
                <div className="mt-3 space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <Label htmlFor={`obs-${c.id}`} className="text-xs">Feedback do avaliador (obrigatório)</Label>
                  <Textarea
                    id={`obs-${c.id}`}
                    rows={2}
                    placeholder="Explique o motivo da marcação “Não” neste item…"
                    value={observacoes[c.id] ?? ""}
                    onChange={(e) => setObservacoes({ ...observacoes, [c.id]: e.target.value })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cm">Comentários / feedback</Label>
          <Textarea id="cm" rows={3} value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
        </div>

        <div className="flex items-center justify-between">
          <p className="font-display text-2xl font-bold text-primary">Nota: {numeroBR(nota)}</p>
          <Button type="submit" disabled={salvar.isPending}>Registrar avaliação</Button>
        </div>
      </form>

      {fortnightId && (
        <>
          <h2 className="mb-3 font-display text-lg font-semibold">Quiz da quinzena</h2>
          <div className="mb-8 grid gap-2 md:grid-cols-2">
            {ativos.map((c) => {
              const entregue = quiz.find((q) => q.employee_id === c.id)?.entregue;
              return (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2">
                  <span className="text-sm">{c.nome}</span>
                  <div className="flex gap-1">
                    {[true, false].map((v) => (
                      <button
                        key={String(v)}
                        onClick={() => marcarQuiz.mutate({ emp: c.id, entregue: v })}
                        className={`rounded-md px-3 py-1 text-xs ${
                          entregue === v ? (v ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground") : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {v ? "Entregue" : "Não entregue"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h2 className="mb-3 font-display text-lg font-semibold">Avaliações registradas</h2>
      {avaliacoes.length === 0 ? (
        <EmptyState titulo="Nenhuma avaliação" texto="As avaliações registradas aparecem aqui." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Colaborador</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Ticket</th>
                <th className="px-4 py-3">Nota</th>
                <th className="px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {avaliacoes.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-3">{a.employees?.nome}</td>
                  <td className="px-4 py-3">{a.tipo === "interacao" ? "Interação" : "Ticket N2"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.ticket ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">{numeroBR(a.nota)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{dataHoraBR(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
