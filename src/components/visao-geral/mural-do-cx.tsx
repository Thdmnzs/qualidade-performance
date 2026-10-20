import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lerComunicado, linhasDe, type Linha } from "@/lib/mural";
import { atualizarMuralFn } from "@/lib/mural.functions";

type Resposta = { ts: string; autor_nome: string | null; texto: string };
export type Comunicado = {
  ts: string;
  autor_nome: string | null;
  texto: string;
  respostas: Resposta[];
  qtd_respostas: number;
  reacoes_ok: number;
  criado_em: string;
  editado_em: string | null;
};

const CANAL = "C02FDSRANCD";
const DIAS = 15;
const linkDoSlack = (ts?: string, canal = CANAL) =>
  `https://slack.com/app_redirect?channel=${canal}${ts ? `&message_ts=${ts}` : ""}`;
const CORES: Record<string, string> = {
  alta: "bg-[#FDE4E2] text-[#9B1C1C] dark:bg-[#3A1C1A] dark:text-[#F6C9C4]",
  média: "bg-[#FFF1C2] text-[#7A5410] dark:bg-[#3A2A12] dark:text-[#E8C27A]",
  media: "bg-[#FFF1C2] text-[#7A5410] dark:bg-[#3A2A12] dark:text-[#E8C27A]",
  baixa: "bg-[#E7F5EC] text-[#0F5A2B] dark:bg-[#12301F] dark:text-[#9EE3B4]",
};
export const quando = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const hora = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  });
  const dia = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Fortaleza",
  });
  const diaDeHoje = hoje.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Fortaleza",
  });
  if (dia === diaDeHoje) return `hoje, ${hora}`;
  const semana = d
    .toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Fortaleza" })
    .replace(".", "");
  return `${semana} ${dia}, ${hora}`;
};

/** O texto do Slack desenhado como elementos (nunca como HTML). */
export function TextoDoSlack({ linhas }: { linhas: Linha[] }) {
  const blocos: React.ReactNode[] = [];
  let lista: Linha[] = [];
  const parte = (l: Linha, k: number) =>
    l.partes.map((p, i) => {
      const chave = `${k}-${i}`;
      if (p.t === "link")
        return (
          <a
            key={chave}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary underline"
          >
            {p.v}
          </a>
        );
      if (p.t === "negrito") return <b key={chave}>{p.v}</b>;
      if (p.t === "italico") return <i key={chave}>{p.v}</i>;
      if (p.t === "riscado") return <s key={chave}>{p.v}</s>;
      if (p.t === "codigo")
        return (
          <code key={chave} className="rounded bg-secondary px-1 text-[0.9em]">
            {p.v}
          </code>
        );
      return <span key={chave}>{p.v}</span>;
    });
  const fecharLista = (k: number) => {
    if (!lista.length) return;
    blocos.push(
      <ul key={`l${k}`} className="my-1 ml-5 list-disc space-y-0.5">
        {lista.map((l, i) => (
          <li key={i}>{parte(l, k * 1000 + i)}</li>
        ))}
      </ul>,
    );
    lista = [];
  };
  linhas.forEach((l, k) => {
    if (l.lista) return void lista.push(l);
    fecharLista(k);
    blocos.push(l.partes.length ? <p key={k}>{parte(l, k)}</p> : <div key={k} className="h-2" />);
  });
  fecharLista(linhas.length);
  return <div className="space-y-1 text-sm leading-relaxed">{blocos}</div>;
}

export function Cartao({
  c,
  novo,
  aberto,
  aoAbrir,
  canal = CANAL,
}: {
  c: Comunicado;
  novo: boolean;
  aberto: boolean;
  aoAbrir: () => void;
  /** O canal da mensagem (o padrão é o #cx_mural), para o "Abrir no Slack". */
  canal?: string;
}) {
  const cab = lerComunicado(c.texto);
  return (
    <article
      className={`rounded-2xl border bg-card p-4 ${novo ? "border-primary shadow-[0_0_0_2px_rgb(19_164_3/12%)]" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <b>{c.autor_nome ?? "alguém"}</b>
        <span className="text-muted-foreground">{quando(c.criado_em)}</span>
        {cab.para && <span className="text-muted-foreground">· para {cab.para}</span>}
        {novo && (
          <span className="rounded-full bg-[#FFF1C2] px-1.5 text-[10px] font-extrabold text-[#7A5410]">
            novo
          </span>
        )}
        {cab.tipo && (
          <span className="rounded-full bg-secondary px-2 py-0.5 font-bold">{cab.tipo}</span>
        )}
        {cab.criticidade && (
          <span
            className={`rounded-full px-2 py-0.5 font-bold ${CORES[cab.criticidade] ?? "bg-secondary"}`}
          >
            criticidade {cab.criticidade}
          </span>
        )}
        {cab.leitura && <span className="text-muted-foreground">⏱ {cab.leitura} de leitura</span>}
        {c.editado_em && <span className="text-muted-foreground">(editado)</span>}
      </div>
      {cab.titulo && <p className="mt-2 font-bold">{cab.titulo}</p>}
      {cab.corpo && (
        <div className="mt-2">
          <TextoDoSlack linhas={linhasDe(cab.corpo)} />
        </div>
      )}
      {aberto && c.respostas.length > 0 && (
        <div className="mt-3 space-y-3 rounded-xl bg-secondary/70 p-4" aria-label="A conversa">
          {c.respostas.map((r, i) => (
            <div key={r.ts} className={i ? "border-t border-border pt-3" : ""}>
              <p className="text-xs">
                <b>{r.autor_nome ?? "alguém"}</b>{" "}
                <span className="text-muted-foreground">
                  {quando(new Date(Number(r.ts.split(".")[0]) * 1000).toISOString())}
                </span>
              </p>
              <div className="mt-1">
                <TextoDoSlack linhas={linhasDe(r.texto)} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {c.reacoes_ok
            ? `✅ ${c.reacoes_ok} ${c.reacoes_ok === 1 ? "pessoa leu" : "pessoas leram"}`
            : ""}
        </span>
        <span className="flex items-center gap-3">
          {c.respostas.length > 0 && (
            <button
              type="button"
              onClick={aoAbrir}
              aria-expanded={aberto}
              className="rounded-full bg-primary px-3 py-1 font-bold text-primary-foreground"
            >
              {aberto
                ? "Fechar"
                : c.respostas.length === 1
                  ? "Ler aqui"
                  : `Ler aqui (${c.respostas.length} respostas)`}
            </button>
          )}
          <a
            href={linkDoSlack(c.ts, canal)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-muted-foreground hover:text-foreground"
          >
            Abrir no Slack ↗
          </a>
        </span>
      </div>
    </article>
  );
}

/**
 * O mural do CX (20/10/2026), na Visão geral: os comunicados do #cx_mural dos últimos 15 dias, ao vivo.
 * Um comunicado novo aparece no topo (com um aviso), sem recarregar a página e sem fechar a conversa aberta.
 */
export function MuralDoCx({ pessoa }: { pessoa: string }) {
  const qc = useQueryClient();
  const atualizar = useServerFn(atualizarMuralFn);
  const chaveDaVisita = `cxhub:mural:visita:${pessoa}`;
  // A última visita (antes desta): o que chegou depois dela é "novo". Fica no navegador.
  const [ultimaVisita] = useState(() => {
    try {
      return localStorage.getItem(chaveDaVisita);
    } catch {
      return null;
    }
  });
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const conhecidos = useRef<Set<string> | null>(null);
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["mural-do-cx"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mural_comunicados")
        .select(
          "ts, autor_nome, texto, respostas, qtd_respostas, reacoes_ok, criado_em, editado_em",
        )
        .eq("canal", CANAL) // só o #cx_mural (20/10/2026: a tabela guarda também o #instabilidade)
        .eq("apagado", false)
        .gte("criado_em", desde)
        .order("criado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Comunicado[];
    },
  });
  // O aviso de um comunicado novo que chegou com a tela aberta.
  useEffect(() => {
    if (isLoading) return;
    const atuais = new Set(lista.map((c) => c.ts));
    if (conhecidos.current) {
      const novo = lista.find((c) => !conhecidos.current!.has(c.ts));
      if (novo)
        toast(
          `📣 Novo no mural: ${lerComunicado(novo.texto).titulo ?? novo.autor_nome ?? "alguém"}`,
        );
    }
    conhecidos.current = atuais;
  }, [lista, isLoading]);
  // O tempo real: qualquer mudança na tabela relê a lista (as regras de leitura valem aqui também).
  useEffect(() => {
    const canal = supabase
      .channel("mural-do-cx")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mural_comunicados", filter: `canal=eq.${CANAL}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["mural-do-cx"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [qc]);
  // A rede de segurança: ao abrir, o servidor relê o canal se a última leitura tem mais de 5 minutos.
  useEffect(() => {
    atualizar()
      .then((r) => {
        if (r.leu) void qc.invalidateQueries({ queryKey: ["mural-do-cx"] });
      })
      .catch(() => {});
    try {
      localStorage.setItem(chaveDaVisita, new Date().toISOString());
    } catch {
      // sem o navegador guardar, nada é "novo"
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- uma vez, ao abrir a tela
  const ehNovo = (c: Comunicado) => !!ultimaVisita && c.criado_em > ultimaVisita;
  const novos = lista.filter(ehNovo).length;
  return (
    <section aria-label="O mural do CX">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          📣 O mural do CX{" "}
          <span className="font-medium normal-case tracking-normal">
            · do canal #cx_mural no Slack
          </span>
        </p>
        <span className="flex items-center gap-2 text-xs">
          <span className="inline-block size-2 animate-pulse rounded-full bg-primary" aria-hidden />
          <b>ao vivo</b>
          {novos > 0 && (
            <span className="text-muted-foreground">
              · {novos === 1 ? "1 novo" : `${novos} novos`} desde a sua última visita
            </span>
          )}
        </span>
      </div>
      <div className="mt-2 space-y-3">
        {isLoading ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Carregando o mural...
          </p>
        ) : lista.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum comunicado nos últimos {DIAS} dias.
          </p>
        ) : (
          lista.map((c) => (
            <Cartao
              key={c.ts}
              c={c}
              novo={ehNovo(c)}
              aberto={!!abertos[c.ts]}
              aoAbrir={() => setAbertos((a) => ({ ...a, [c.ts]: !a[c.ts] }))}
            />
          ))
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Os comunicados dos últimos {DIAS} dias ·{" "}
        <a
          href={linkDoSlack()}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-primary hover:underline"
        >
          Abrir o #cx_mural no Slack ↗
        </a>
      </p>
    </section>
  );
}
