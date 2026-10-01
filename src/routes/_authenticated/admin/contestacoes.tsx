import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AjusteDaAvaliacao } from "@/components/ajuste-da-avaliacao";
import { AntesDepoisDaContestacao } from "@/components/antes-depois-da-contestacao";
import { DetalheDaAvaliacao } from "@/components/detalhe-da-avaliacao";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissoes } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  agruparPorPessoa,
  contestacaoEmAndamento,
  respostaDaContestacaoValida,
} from "@/lib/avaliacao";
import { dataHoraBR, rotuloStatusContestacao } from "@/lib/format";
import { fetchContestacoes } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/contestacoes")({
  head: () => ({
    meta: [
      { title: "Contestações do time · Qualidade & Performance" },
      { name: "description", content: "Contestações abertas pelos colaboradores." },
    ],
  }),
  component: ContestacoesDoTime,
});

type Contestacao = Awaited<ReturnType<typeof fetchContestacoes>>[number];
type Modo = "ver" | "aceitar" | "recusar";

const COR_STATUS: Record<string, string> = {
  aberta: "bg-warning/15 text-warning",
  em_analise: "bg-warning/15 text-warning",
  deferida: "bg-primary/15 text-primary",
  indeferida: "bg-destructive/15 text-destructive",
};

function ContestacoesDoTime() {
  const { podeAvaliar, isAdmin, employee, isLoading } = usePermissoes();

  // O banco já filtra o que cada perfil pode ver: o ADM vê todas, e o
  // avaliador vê as de colaboradores (nunca as de outros avaliadores).
  const { data: todas = [], isLoading: carregando } = useQuery({
    queryKey: ["contestacoes", "do-time"],
    queryFn: () => fetchContestacoes(),
    enabled: podeAvaliar,
  });
  // As próprias (o avaliador também é colaborador) ficam em "Minhas contestações".
  const doTime = todas.filter((c) => c.employee_id !== employee?.id);
  const emAberto = doTime.filter((c) => contestacaoEmAndamento(c.status));
  const respondidas = doTime.filter((c) => !contestacaoEmAndamento(c.status));

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!podeAvaliar) {
    return (
      <EmptyState
        titulo="Acesso restrito"
        texto="Área exclusiva de avaliadores e administradores."
      />
    );
  }

  return (
    <div>
      <PageHeader
        titulo="Contestações"
        descricao={
          isAdmin
            ? "Contestações abertas por colaboradores e avaliadores."
            : "Contestações abertas pelos colaboradores."
        }
      />

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : doTime.length === 0 ? (
        <EmptyState titulo="Nenhuma contestação" texto="Não há contestações do time registradas." />
      ) : (
        <div className="space-y-8">
          <Secao
            titulo="Em aberto"
            contestacoes={emAberto}
            vazio="Nenhuma contestação aguardando resposta."
            blocosAbertos
          />
          <Secao
            titulo="Respondidas"
            contestacoes={respondidas}
            vazio="Nenhuma contestação respondida ainda."
            blocosAbertos={false}
          />
        </div>
      )}
    </div>
  );
}

function Secao({
  titulo,
  contestacoes,
  vazio,
  blocosAbertos,
}: {
  titulo: string;
  contestacoes: Contestacao[];
  vazio: string;
  /** Em aberto: blocos abertos (pedem ação). Respondidas: recolhidos (histórico). */
  blocosAbertos: boolean;
}) {
  const blocos = agruparPorPessoa(
    contestacoes,
    (c) => c.employee_id,
    (c) => c.employees?.nome ?? "Colaborador",
  );
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold">
        {titulo}{" "}
        <span className="text-sm font-normal text-muted-foreground">({contestacoes.length})</span>
      </h2>
      {blocos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <div className="space-y-3">
          {blocos.map((b) => (
            <BlocoDoColaborador
              key={b.id}
              nome={b.nome}
              contestacoes={b.itens}
              abertoPorPadrao={blocosAbertos}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BlocoDoColaborador({
  nome,
  contestacoes,
  abertoPorPadrao,
}: {
  nome: string;
  contestacoes: Contestacao[];
  abertoPorPadrao: boolean;
}) {
  const [aberto, setAberto] = useState(abertoPorPadrao);
  return (
    <Collapsible
      open={aberto}
      onOpenChange={setAberto}
      className="rounded-2xl border border-border bg-card/50"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="font-display font-semibold">
          Contestações · {nome}{" "}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            ({contestacoes.length})
          </span>
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-3 pb-3">
        {contestacoes.map((c) => (
          <CartaoDeContestacao key={c.id} contestacao={c} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function CartaoDeContestacao({ contestacao: c }: { contestacao: Contestacao }) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("ver");
  const emAndamento = contestacaoEmAndamento(c.status);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => {
          setAberto(!aberto);
          setModo("ver");
        }}
        aria-expanded={aberto}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <span className="flex min-w-0 items-start gap-2">
          <ChevronRight
            className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-90" : ""}`}
          />
          <span>
            <span className="block font-medium">{c.assunto}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {c.employees?.nome} · aberta em {dataHoraBR(c.created_at)}
            </span>
          </span>
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs ${COR_STATUS[c.status] ?? "bg-secondary"}`}
        >
          {rotuloStatusContestacao[c.status]}
        </span>
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Motivo do colaborador
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.descricao}</p>
          </div>

          {!emAndamento && c.resolucao && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Resposta {c.respondida_em && `· ${dataHoraBR(c.respondida_em)}`}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.resolucao}</p>
              <AntesDepoisDaContestacao
                notaAnterior={c.nota_anterior}
                notaNova={c.nota_nova}
                alteracoes={c.alteracoes}
              />
            </div>
          )}

          {modo === "aceitar" && c.evaluation_id ? (
            <AjusteDaAvaliacao
              contestacaoId={c.id}
              avaliacaoId={c.evaluation_id}
              onConcluir={() => setModo("ver")}
              onCancelar={() => setModo("ver")}
            />
          ) : modo === "aceitar" || modo === "recusar" ? (
            <RespostaSimples
              contestacaoId={c.id}
              aceitar={modo === "aceitar"}
              onFechar={() => setModo("ver")}
            />
          ) : (
            <>
              {c.evaluation_id && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Avaliação contestada {emAndamento ? "(como está hoje)" : "(como ficou)"}
                  </p>
                  <DetalheDaAvaliacao avaliacaoId={c.evaluation_id} />
                </div>
              )}
              {emAndamento && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setModo("recusar")}>
                    <X className="size-4" /> Recusar
                  </Button>
                  <Button onClick={() => setModo("aceitar")}>
                    <Check className="size-4" /> Aceitar
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Recusar, ou aceitar contestação geral (sem avaliação para ajustar): só a resposta. */
function RespostaSimples({
  contestacaoId,
  aceitar,
  onFechar,
}: {
  contestacaoId: string;
  aceitar: boolean;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [resposta, setResposta] = useState("");

  const responder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("responder_contestacao", {
        _contestation_id: contestacaoId,
        _aceitar: aceitar,
        _resposta: resposta,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(aceitar ? "Contestação aceita." : "Contestação recusada.");
      qc.invalidateQueries({ queryKey: ["contestacoes"] });
      onFechar();
    },
    onError: (e: Error) => toast.error(`Não foi possível responder: ${e.message}`),
  });

  return (
    <div
      className={`space-y-3 rounded-xl border p-4 ${aceitar ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}
    >
      <Label htmlFor={`resposta-${contestacaoId}`}>
        {aceitar ? "Resposta ao colaborador (aceite)" : "Motivo da recusa (enviado ao colaborador)"}
      </Label>
      <Textarea
        id={`resposta-${contestacaoId}`}
        rows={3}
        maxLength={2000}
        value={resposta}
        onChange={(e) => setResposta(e.target.value)}
        placeholder={
          aceitar
            ? "Ex.: corrigimos o resultado na base."
            : "Ex.: na conversa, o histórico não foi consultado antes da resposta."
        }
      />
      <p className="text-xs text-muted-foreground">Obrigatória, com pelo menos 10 caracteres.</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onFechar} disabled={responder.isPending}>
          Cancelar
        </Button>
        <Button
          variant={aceitar ? "default" : "destructive"}
          disabled={!respostaDaContestacaoValida(resposta) || responder.isPending}
          onClick={() => responder.mutate()}
        >
          {responder.isPending
            ? "Enviando..."
            : aceitar
              ? "Aceitar contestação"
              : "Recusar contestação"}
        </Button>
      </div>
    </div>
  );
}
