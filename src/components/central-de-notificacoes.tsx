import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePermissoes } from "@/hooks/useAuth";
import {
  contagemDaBolinha,
  iconeDaNotificacao,
  quandoFoi,
  rotaDaNotificacao,
  textoDaBolinha,
  type Novidade,
  type Pendencia,
} from "@/lib/notificacoes";
import { lerNotificacoes, marcarComoLidas } from "@/lib/notificacoes-api";

/**
 * A central de notificações (o sino, ao lado do modo escuro). "Para fazer" fica até a ação ser
 * feita; as "Novidades" contam até serem lidas. Confere a cada minuto, e ao voltar para a aba.
 */
export function CentralDeNotificacoes() {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const { perfil, employee } = usePermissoes();
  const [aberta, setAberta] = useState(false);
  const [aba, setAba] = useState<"todas" | "fazer">("todas");
  const { data } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: lerNotificacoes,
    enabled: !!employee,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const total = contagemDaBolinha(data);
  const pendencias = data?.pendencias ?? [];
  const novidades = data?.novidades ?? [];
  const naoLidas = novidades.filter((n) => !n.lida).length;

  async function abrirNotificacao(n: Pendencia | Novidade) {
    setAberta(false);
    if ("lida" in n && !n.lida) {
      // Mostra lida na hora; o banco confirma em seguida.
      qc.setQueryData(
        ["notificacoes"],
        (d: typeof data) =>
          d && {
            ...d,
            novidades: d.novidades.map((x) => (x.id === n.id ? { ...x, lida: true } : x)),
          },
      );
      void marcarComoLidas([n.id]).catch(() =>
        qc.invalidateQueries({ queryKey: ["notificacoes"] }),
      );
    }
    void navegar({ to: rotaDaNotificacao(n.tipo, perfil) });
  }
  async function marcarTodas() {
    qc.setQueryData(
      ["notificacoes"],
      (d: typeof data) => d && { ...d, novidades: d.novidades.map((x) => ({ ...x, lida: true })) },
    );
    try {
      await marcarComoLidas();
    } finally {
      await qc.invalidateQueries({ queryKey: ["notificacoes"] });
    }
  }
  if (!employee) return null;
  const Item = ({ n, pendente }: { n: Pendencia | Novidade; pendente: boolean }) => {
    const { icone, fundo } = iconeDaNotificacao(n.tipo);
    const naoLida = "lida" in n && !n.lida;
    return (
      <li>
        <button
          type="button"
          onClick={() => abrirNotificacao(n)}
          className={`flex w-full gap-2.5 border-t border-border px-4 py-2.5 text-left hover:bg-secondary ${naoLida ? "bg-primary/5" : ""}`}
        >
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-base ${fundo}`}
            aria-hidden="true"
          >
            {icone}
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-sm">{n.titulo}</b>
            {n.texto && <span className="block text-xs text-muted-foreground">{n.texto}</span>}
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {quandoFoi(n.quando)}
            </span>
          </span>
          {(pendente || naoLida) && (
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-[#E11D48]"
              aria-label={pendente ? "para fazer" : "não lida"}
            />
          )}
        </button>
      </li>
    );
  };
  return (
    <Popover open={aberta} onOpenChange={setAberta}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            total
              ? `Notificações: ${total} ${total === 1 ? "pendente" : "pendentes"}`
              : "Notificações"
          }
          title="Notificações"
          className="relative flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-secondary"
        >
          <Bell className="size-4" />
          {total > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-[#E11D48] px-1 text-[10px] font-bold text-white">
              {textoDaBolinha(total)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(78vh,600px)] w-[min(92vw,400px)] overflow-y-auto p-0"
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
          <p className="font-bold">Notificações</p>
          <button
            type="button"
            onClick={marcarTodas}
            disabled={!naoLidas}
            className="text-xs font-bold text-primary underline disabled:opacity-40"
          >
            Marcar as novidades como lidas
          </button>
        </div>
        <div className="mx-4 mb-2 inline-flex rounded-lg border border-border p-0.5 text-xs font-bold">
          {(["todas", "fazer"] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={aba === a}
              onClick={() => setAba(a)}
              className={`rounded-md px-3 py-1 ${aba === a ? "bg-primary text-primary-foreground" : ""}`}
            >
              {a === "todas" ? "Todas" : `Para fazer · ${pendencias.length}`}
            </button>
          ))}
        </div>
        {pendencias.length ? (
          <>
            <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Para fazer · {pendencias.length}
            </p>
            <ul>
              {pendencias.map((n) => (
                <Item key={`${n.tipo}-${n.id}`} n={n} pendente />
              ))}
            </ul>
          </>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">✓ Nada para fazer agora.</p>
        )}
        {aba === "todas" && novidades.length > 0 && (
          <>
            <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Novidades{naoLidas ? ` · ${naoLidas} não ${naoLidas === 1 ? "lida" : "lidas"}` : ""}
            </p>
            <ul>
              {novidades.map((n) => (
                <Item key={n.id} n={n} pendente={false} />
              ))}
            </ul>
          </>
        )}
        <p className="border-t border-border px-4 py-2.5 text-center text-[11px] text-muted-foreground">
          As novidades ficam aqui por 30 dias.
        </p>
      </PopoverContent>
    </Popover>
  );
}
