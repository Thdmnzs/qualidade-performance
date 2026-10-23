import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Cartao, quando, type Comunicado } from "@/components/visao-geral/mural-do-cx";
import { supabase } from "@/integrations/supabase/client";
import {
  minutosEntre,
  periodoInformado,
  quadroDeInstabilidades,
  type Gravidade,
  type Incidente,
} from "@/lib/instabilidades";

const CANAL = "C027Y8CP9U4"; // o #instabilidade
const DIAS = 30;
const GRAVIDADE: Record<Gravidade, { nome: string; cor: string; fundo: string }> = {
  major: { nome: "queda total", cor: "text-[#C62828]", fundo: "bg-[#FDE4E2] dark:bg-[#3A1C1A]" },
  partial: {
    nome: "queda parcial",
    cor: "text-[#C2410C]",
    fundo: "bg-[#FDE9DC] dark:bg-[#3A2417]",
  },
  degraded: { nome: "lentidão", cor: "text-[#B7791F]", fundo: "bg-[#FFF1C2] dark:bg-[#3A2A12]" },
  manutencao: {
    nome: "em manutenção",
    cor: "text-[#2B5FC9]",
    fundo: "bg-[#E6EEFC] dark:bg-[#16213A]",
  },
  ok: { nome: "normal", cor: "text-[#157A3A]", fundo: "bg-[#E7F5EC] dark:bg-[#12301F]" },
};
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  });
const ha = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 60
    ? `${min} min`
    : min < 1440
      ? `${Math.floor(min / 60)} h ${min % 60} min`
      : `${Math.floor(min / 1440)} dias`;
};
const duracao = (de: string, ate: string) => {
  const min = Math.max(1, Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 60_000));
  return min < 60
    ? `${min} min`
    : `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ""}`.trim();
};

/**
 * O período de um incidente resolvido (23/10/2026): o que o próprio aviso informa ("Entre 00:54 e 01:35"), quando
 * há; senão, do primeiro ao último aviso; e, com um aviso só, só o horário dele (e não "das 10:49 às 10:49").
 */
function periodoDoResolvido(r: Incidente): string {
  const informado = [...r.etapas]
    .reverse()
    .map((e) => periodoInformado(e.corpo))
    .find(Boolean);
  if (informado) {
    const min = minutosEntre(informado.de, informado.ate);
    return `das ${informado.de} às ${informado.ate} (${min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ""}`.trim()})`;
  }
  if (!r.fim || r.fim === r.inicio || r.etapas.length < 2) return `às ${hora(r.inicio)}`;
  return `das ${hora(r.inicio)} às ${hora(r.fim)} (${duracao(r.inicio, r.fim)})`;
}

/** A linha do tempo de um incidente (as etapas, com o texto de cada uma). */
function LinhaDoTempo({ i }: { i: Incidente }) {
  return (
    <ol className="mt-3 space-y-2 border-l-2 border-border pl-4" aria-label="As atualizações">
      {i.etapas.map((e, k) => (
        <li key={k}>
          <p className="text-xs">
            <b>{quando(e.quando)}</b> ·{" "}
            <b className={e.gravidade ? GRAVIDADE[e.gravidade].cor : ""}>{e.etapa}</b>
            {e.gravidade && (
              <span className="text-muted-foreground"> ({GRAVIDADE[e.gravidade].nome})</span>
            )}
          </p>
          {e.corpo && <p className="mt-0.5 whitespace-pre-line text-sm">{e.corpo}</p>}
        </li>
      ))}
    </ol>
  );
}

/**
 * As instabilidades (20/10/2026), na Visão geral: os avisos do #instabilidade, ao vivo. O que está acontecendo
 * agora fica em destaque; as manutenções que vêm por aí; os resolvidos dos últimos 7 dias, numa linha cada; e as
 * mensagens de pessoas, com a conversa.
 */
export function QuadroDeInstabilidades() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);
  const [conversas, setConversas] = useState<Record<string, boolean>>({});
  const ativosConhecidos = useRef<Set<string> | null>(null);
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["instabilidades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_comunicados")
        .select(
          "ts, autor_nome, texto, respostas, qtd_respostas, reacoes_ok, criado_em, editado_em",
        )
        .eq("canal", CANAL)
        .eq("apagado", false)
        .gte("criado_em", desde)
        .order("criado_em", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Comunicado[];
    },
  });
  const q = quadroDeInstabilidades(lista);
  // O aviso de um incidente que começou com a tela aberta.
  useEffect(() => {
    if (isLoading) return;
    const atuais = new Set(q.ativos.map((i) => i.chave));
    if (ativosConhecidos.current) {
      const novo = q.ativos.find((i) => !ativosConhecidos.current!.has(i.chave));
      if (novo)
        toast.error(
          `⚠️ Instabilidade agora: ${novo.sistema ?? novo.titulo}${novo.gravidade ? ` (${GRAVIDADE[novo.gravidade].nome})` : ""}`,
        );
    }
    ativosConhecidos.current = atuais;
  }, [lista, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps -- os ativos saem da lista
  useEffect(() => {
    const canal = supabase
      .channel("instabilidades")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mural_comunicados", filter: `canal=eq.${CANAL}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["instabilidades"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [qc]);

  return (
    <section
      className={`rounded-2xl border bg-card p-4 ${q.ativos.length ? "border-[#F4B4AE] shadow-[0_0_0_2px_rgb(198_40_40/10%)]" : "border-border"}`}
      aria-label="Instabilidades"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          ⚠️ Instabilidades
        </p>
        <span className="flex items-center gap-2 text-xs">
          <span className="inline-block size-2 animate-pulse rounded-full bg-primary" aria-hidden />
          <b>ao vivo</b>
        </span>
      </div>
      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Carregando...</p>
      ) : q.ativos.length === 0 ? (
        <p className="mt-2 text-sm font-bold text-[#157A3A] dark:text-[#3EE07A]">
          ✅ Nenhuma instabilidade agora
        </p>
      ) : (
        q.ativos.map((i) => {
          const g = GRAVIDADE[i.gravidade ?? "degraded"];
          return (
            <div key={i.chave} className={`mt-3 rounded-xl p-3 ${g.fundo}`} role="alert">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`inline-block size-2.5 animate-pulse rounded-full bg-current ${g.cor}`}
                  aria-hidden
                />
                <b className={g.cor}>AGORA · {g.nome}</b>
                {i.fonte && <span>{i.fonte}</span>}
                <span className="opacity-70">· começou há {ha(i.inicio)}</span>
                <span className="rounded-full bg-card px-2 py-0.5 font-bold">{i.etapaAtual}</span>
              </div>
              <p className="mt-1.5 font-bold">{i.sistema ?? i.titulo}</p>
              {i.etapas.at(-1)?.corpo && (
                <p className="mt-1 whitespace-pre-line text-sm">{i.etapas.at(-1)!.corpo}</p>
              )}
              {i.etapas.length > 1 && (
                <button
                  type="button"
                  onClick={() => setAberto(aberto === i.chave ? null : i.chave)}
                  className="mt-2 text-xs font-bold underline"
                >
                  {aberto === i.chave
                    ? "Fechar as atualizações"
                    : `Ver as atualizações (${i.etapas.length})`}
                </button>
              )}
              {aberto === i.chave && <LinhaDoTempo i={i} />}
            </div>
          );
        })
      )}
      {q.manutencoes.map((m) => (
        <div key={m.chave} className="mt-3 rounded-xl border border-border p-3 text-sm">
          <p className="text-xs">
            <b className="text-[#2B5FC9]">
              🔧 {m.emAndamento ? "MANUTENÇÃO EM ANDAMENTO" : "MANUTENÇÃO PROGRAMADA"}
            </b>
            {m.fonte && <span className="text-muted-foreground"> · {m.fonte}</span>}
          </p>
          <p className="mt-1 font-bold">
            {m.janela
              ? `${quando(m.janela.de).replace(/, \d\d:\d\d$/, "")}, das ${hora(m.janela.de)} às ${hora(m.janela.ate)}`
              : m.titulo}
          </p>
          <p className="text-xs text-muted-foreground">
            {m.sistema ? `${m.sistema} · ` : ""}
            {m.titulo}
          </p>
        </div>
      ))}
      {q.resolvidos.length > 0 && (
        <>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Resolvidos nos últimos 7 dias
          </p>
          {q.resolvidos.map((r) => (
            <div key={r.chave} className="mt-1.5 rounded-xl border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="text-[#157A3A]">✓</span> <b>{r.sistema ?? r.titulo}</b>{" "}
                  <span className="text-muted-foreground">
                    · {quando(r.inicio).replace(/, \d\d:\d\d$/, "")}, {periodoDoResolvido(r)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setAberto(aberto === r.chave ? null : r.chave)}
                  className="text-xs font-bold text-primary"
                >
                  {aberto === r.chave ? "Fechar" : `Ver as atualizações (${r.etapas.length})`}
                </button>
              </div>
              {aberto === r.chave && <LinhaDoTempo i={r} />}
            </div>
          ))}
        </>
      )}
      {q.pessoas.length > 0 && (
        <>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Do time, no canal
          </p>
          <div className="mt-1.5 space-y-2">
            {q.pessoas.map((m) => (
              <Cartao
                key={m.ts}
                c={m as unknown as Comunicado}
                novo={false}
                aberto={!!conversas[m.ts]}
                aoAbrir={() => setConversas((c) => ({ ...c, [m.ts]: !c[m.ts] }))}
                canal={CANAL}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
