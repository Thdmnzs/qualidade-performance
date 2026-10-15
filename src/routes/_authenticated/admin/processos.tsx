import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PlugZap, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/page-header";
import { ColunasDosProcessos } from "@/components/processos/colunas-dos-processos";
import { Button } from "@/components/ui/button";
import { usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { dataHoraBR } from "@/lib/format";
import {
  continuarSincronizacaoFn,
  iniciarSincronizacaoFn,
  testarNotionFn,
} from "@/lib/notion.functions";

export const Route = createFileRoute("/_authenticated/admin/processos")({
  head: () => ({
    meta: [
      { title: "Processos · CX Hub" },
      { name: "description", content: "Base de processos da Flukepédia, sincronizada do Notion." },
    ],
  }),
  component: Processos,
});

type Bases = Record<string, { processos: number; revisados: number } | { erro: string }>;
type Progresso = {
  id: string;
  status: string;
  total: number;
  processados: number;
  novos: number;
  alterados: number;
  semMudanca: number;
  erros: number;
};

function Processos() {
  const { isAdmin, isLoading } = usePermissoes();
  const qc = useQueryClient();
  const testar = useServerFn(testarNotionFn);
  const iniciar = useServerFn(iniciarSincronizacaoFn);
  const continuar = useServerFn(continuarSincronizacaoFn);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [rodando, setRodando] = useState(false);

  const { data: execucoes = [] } = useQuery({
    queryKey: ["processos-sincronizacoes"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processos_sincronizacoes")
        .select(
          "id, status, iniciada_em, concluida_em, total, processados, novos, alterados, sem_mudanca, resumo, erros",
        )
        .order("iniciada_em", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
  const { data: processos = [] } = useQuery({
    queryKey: ["processos"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processos")
        .select(
          "id, codigo, titulo, base, revisado, versao_atual, sincronizado_em, ativo, categoria, subcategoria, ordem, url",
        )
        .order("base")
        .order("ordem", { nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const ultimoTeste = execucoes.find(
    (e) => (e.resumo as { tipo?: string } | null)?.tipo === "teste_de_conexao",
  );
  const emAndamento = execucoes.find((e) => e.status === "em_andamento");
  const ultimaSinc = execucoes.find(
    (e) => (e.resumo as { tipo?: string } | null)?.tipo === "sincronizacao",
  );

  const teste = useMutation({
    mutationFn: () => testar(),
    onSuccess: () => {
      toast.success("Conexão com o Notion funcionando.");
      qc.invalidateQueries({ queryKey: ["processos-sincronizacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Inicia (ou retoma) e vai pedindo lotes até concluir. */
  async function sincronizar() {
    setRodando(true);
    try {
      let p = (await iniciar()) as Progresso;
      setProgresso(p);
      while (p.status === "em_andamento") {
        p = (await continuar({ data: { id: p.id } })) as Progresso;
        setProgresso(p);
      }
      toast.success(
        `Sincronização concluída: ${p.novos} novos, ${p.alterados} alterados, ${p.semMudanca} sem mudança.`,
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Falha na sincronização. Clique em Continuar para retomar.",
      );
    } finally {
      setRodando(false);
      qc.invalidateQueries({ queryKey: ["processos-sincronizacoes"] });
      qc.invalidateQueries({ queryKey: ["processos"] });
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!isAdmin)
    return (
      <EmptyState titulo="Acesso restrito" texto="Esta área é exclusiva de administradores." />
    );

  const bases = (ultimoTeste?.resumo as { bases?: Bases } | null)?.bases;
  const pct =
    progresso && progresso.total > 0
      ? Math.round((progresso.processados / progresso.total) * 100)
      : 0;
  const ativos = processos.filter((p) => p.ativo);

  return (
    <div>
      <PageHeader
        titulo="Processos"
        descricao="Cópia da Flukepédia (B2C e B2B) e do Guia de Clientes Atritados, com o histórico de versões de cada processo."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Conexão com o Notion
              </p>
              <p className="mt-1 text-sm">
                {ultimoTeste
                  ? `Testada em ${dataHoraBR(ultimoTeste.iniciada_em)}`
                  : "Ainda não testada."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => teste.mutate()}
              disabled={teste.isPending || rodando}
            >
              <PlugZap className="size-4" /> {teste.isPending ? "Testando..." : "Testar conexão"}
            </Button>
          </div>
          {bases && (
            <ul className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {Object.entries(bases).map(([base, b]) => (
                <li key={base}>
                  <p className="text-xs text-muted-foreground">{base}</p>
                  {"erro" in b ? (
                    <>
                      <p className="font-display text-xl text-destructive">sem acesso</p>
                      <p className="text-xs text-muted-foreground">{b.erro}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-display text-xl">{b.processos}</p>
                      {(base === "B2C" || base === "B2B") && (
                        <p className="text-xs text-muted-foreground">{b.revisados} revisados</p>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Sincronização</p>
              <p className="mt-1 text-sm">
                {ultimaSinc?.concluida_em
                  ? `Última concluída em ${dataHoraBR(ultimaSinc.concluida_em)}`
                  : emAndamento
                    ? "Há uma sincronização pela metade."
                    : "Nenhuma sincronização ainda."}
              </p>
            </div>
            <Button onClick={sincronizar} disabled={rodando || teste.isPending}>
              <RefreshCw className={`size-4 ${rodando ? "animate-spin" : ""}`} />
              {rodando ? "Sincronizando..." : emAndamento ? "Continuar" : "Sincronizar processos"}
            </Button>
          </div>
          {(rodando || progresso) && progresso && (
            <div className="mt-4">
              <div
                className="h-2 overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {progresso.processados} de {progresso.total} · {progresso.novos} novos ·{" "}
                {progresso.alterados} alterados · {progresso.semMudanca} sem mudança
                {progresso.erros > 0 ? ` · ${progresso.erros} com problema` : ""}
              </p>
              {rodando && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Mantenha esta tela aberta. Se fechar, a sincronização continua de onde parou ao
                  clicar em Continuar.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* As duas colunas, o B2C e o B2B (14/10/2026). */}
      <ColunasDosProcessos processos={ativos} />
    </div>
  );
}
