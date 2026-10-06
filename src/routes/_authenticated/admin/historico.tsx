import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AvaliacoesPorColaborador } from "@/components/avaliacoes-por-colaborador";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Label } from "@/components/ui/label";
import { usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { dataBR, dataHoraBR, nomeQuinzena } from "@/lib/format";
import { resumoDosSorteios } from "@/lib/historico";
import { linkSeguroDoIntercom } from "@/lib/intercom";
import { fetchAvaliacoesGestao, fetchQuinzenas } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/historico")({
  head: () => ({
    meta: [
      { title: "Histórico · QualityHUB" },
      { name: "description", content: "Avaliações de quinzenas fechadas e sorteios descartados." },
    ],
  }),
  component: Historico,
});

type Aba = "avaliacoes" | "sorteios";
const TODAS = "todas";

function Historico() {
  const { isAdmin, isLoading } = usePermissoes();
  const [aba, setAba] = useState<Aba>("avaliacoes");

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!isAdmin)
    return (
      <EmptyState titulo="Acesso restrito" texto="Esta área é exclusiva de administradores." />
    );

  return (
    <div>
      <PageHeader
        titulo="Histórico"
        descricao="Consulta das quinzenas fechadas e dos sorteios descartados. Somente leitura."
      />
      <div
        className="mb-5 inline-flex rounded-lg bg-secondary p-1"
        role="tablist"
        aria-label="Histórico"
      >
        {(
          [
            ["avaliacoes", "Avaliações de quinzenas fechadas"],
            ["sorteios", "Sorteios descartados"],
          ] as [Aba, string][]
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            role="tab"
            aria-selected={aba === chave}
            onClick={() => setAba(chave)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${aba === chave ? "bg-card text-foreground" : "text-muted-foreground"}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {aba === "avaliacoes" ? <AvaliacoesFechadas /> : <SorteiosDescartados />}
    </div>
  );
}

function AvaliacoesFechadas() {
  const { data: quinzenas = [] } = useQuery({ queryKey: ["quinzenas"], queryFn: fetchQuinzenas });
  const fechadas = useMemo(() => quinzenas.filter((q) => q.status === "fechada"), [quinzenas]);
  const [quinzenaId, setQuinzenaId] = useState("");
  useEffect(() => {
    if (!quinzenaId && fechadas[0]) setQuinzenaId(fechadas[0].id);
  }, [fechadas, quinzenaId]);

  const { data: avaliacoes = [] } = useQuery({
    queryKey: ["avaliacoes-gestao"],
    queryFn: () => fetchAvaliacoesGestao(),
  });
  const idsFechadas = useMemo(() => new Set(fechadas.map((q) => q.id)), [fechadas]);
  const dasFechadas = useMemo(
    () => avaliacoes.filter((a) => idsFechadas.has(a.fortnight_id)),
    [avaliacoes, idsFechadas],
  );

  if (fechadas.length === 0) {
    return (
      <EmptyState
        titulo="Nenhuma quinzena fechada"
        texto="As quinzenas aparecem aqui depois de fechadas."
      />
    );
  }
  const escolhida = fechadas.find((q) => q.id === quinzenaId);
  const naEscolhida = dasFechadas.filter((a) => a.fortnight_id === quinzenaId);
  const pessoas = new Set(naEscolhida.map((a) => a.employee_id)).size;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="hist-quinzena" className="text-xs text-muted-foreground">
          Quinzena fechada
        </Label>
        <select
          id="hist-quinzena"
          value={quinzenaId}
          onChange={(e) => setQuinzenaId(e.target.value)}
          className="block h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {fechadas.map((q) => (
            <option key={q.id} value={q.id}>
              {nomeQuinzena(q)}
            </option>
          ))}
        </select>
      </div>
      {escolhida && (
        <p className="text-xs text-muted-foreground">
          {escolhida.fechado_em ? `Fechada em ${dataBR(escolhida.fechado_em)} · ` : ""}
          {naEscolhida.length} {naEscolhida.length === 1 ? "avaliação" : "avaliações"} de {pessoas}{" "}
          {pessoas === 1 ? "colaborador" : "colaboradores"}. Uma quinzena fechada não aceita
          exclusão nem alteração.
        </p>
      )}
      {/* O mesmo componente de "Avaliações registradas"; numa quinzena fechada, ninguém pode excluir. */}
      <AvaliacoesPorColaborador
        key={quinzenaId}
        avaliacoes={dasFechadas}
        quinzenas={fechadas}
        quinzenaPadrao={quinzenaId}
      />
    </div>
  );
}

function SorteiosDescartados() {
  const [quinzenaId, setQuinzenaId] = useState(TODAS);
  const [avaliador, setAvaliador] = useState(TODAS);
  const { data: quinzenas = [] } = useQuery({ queryKey: ["quinzenas"], queryFn: fetchQuinzenas });
  const { data: cadastros = [] } = useQuery({
    queryKey: ["cadastros-nomes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, nome, user_id");
      if (error) throw error;
      return data;
    },
  });
  const { data: sorteios = [] } = useQuery({
    queryKey: ["sorteios-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sorteios_contato")
        .select(
          "id, sorteado_por, employee_id, fortnight_id, link, criado_em, descartado_em, motivo_descarte",
        )
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const nomeDoUsuario = (userId: string | null) =>
    cadastros.find((c) => c.user_id && c.user_id === userId)?.nome ?? "Avaliador removido";
  const nomeDoColaborador = (id: string) =>
    cadastros.find((c) => c.id === id)?.nome ?? "Colaborador removido";

  const filtrados = sorteios.filter(
    (s) =>
      (quinzenaId === TODAS || s.fortnight_id === quinzenaId) &&
      (avaliador === TODAS || s.sorteado_por === avaliador),
  );
  const resumo = resumoDosSorteios(filtrados, nomeDoUsuario);
  const descartes = filtrados.filter((s) => s.descartado_em);
  const avaliadores = [
    ...new Set(sorteios.map((s) => s.sorteado_por).filter((x): x is string => !!x)),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label htmlFor="sort-quinzena" className="text-xs text-muted-foreground">
            Quinzena
          </Label>
          <select
            id="sort-quinzena"
            value={quinzenaId}
            onChange={(e) => setQuinzenaId(e.target.value)}
            className="block h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={TODAS}>Todas</option>
            {quinzenas.map((q) => (
              <option key={q.id} value={q.id}>
                {nomeQuinzena(q)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sort-avaliador" className="text-xs text-muted-foreground">
            Avaliador
          </Label>
          <select
            id="sort-avaliador"
            value={avaliador}
            onChange={(e) => setAvaliador(e.target.value)}
            className="block h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={TODAS}>Todos</option>
            {avaliadores.map((u) => (
              <option key={u} value={u}>
                {nomeDoUsuario(u)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {resumo.length === 0 ? (
        <EmptyState
          titulo="Nenhum sorteio"
          texto="Os contatos sorteados na tela de Avaliações aparecem aqui."
        />
      ) : (
        <>
          <section className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Avaliador</th>
                  <th className="px-4 py-3">Sorteados</th>
                  <th className="px-4 py-3">Descartados</th>
                  <th className="px-4 py-3">Proporção de descartes</th>
                </tr>
              </thead>
              <tbody>
                {resumo.map((r) => {
                  const pct = Math.round(r.proporcao * 100);
                  return (
                    <tr key={r.avaliador} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{r.avaliador}</td>
                      <td className="px-4 py-3">{r.sorteados}</td>
                      <td className="px-4 py-3">{r.descartados}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-28 overflow-hidden rounded-full bg-secondary"
                            aria-hidden="true"
                          >
                            <div
                              className={`h-full ${r.alerta ? "bg-warning" : "bg-primary"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={r.alerta ? "text-warning" : ""}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Em amarelo, proporções acima de 30%: vale olhar os motivos. Descartes frequentes podem
              indicar novos sorteios até cair um contato mais fácil.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display font-semibold">Descartes</h2>
            {descartes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum descarte com estes filtros.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {descartes.map((d) => {
                  const link = linkSeguroDoIntercom(d.link);
                  return (
                    <li key={d.id} className="rounded-xl bg-secondary px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <b>{nomeDoUsuario(d.sorteado_por)}</b> descartou um contato de{" "}
                          <b>{nomeDoColaborador(d.employee_id)}</b> · {dataHoraBR(d.descartado_em!)}
                        </span>
                        {link && (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Abrir no Intercom <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      <p className="mt-1 text-muted-foreground">Motivo: {d.motivo_descarte}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
