import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dices, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dataBR, dataHoraBR } from "@/lib/format";
import { linkSeguroDoIntercom } from "@/lib/intercom";
import { buscarContatoFn, descartarContatoFn, sortearContatoFn } from "@/lib/intercom.functions";
import type { Contato } from "@/server/intercom.server";

const ROTULO: Record<string, string> = {
  cliente: "Cliente",
  atendente: "Colaborador",
  nota: "Nota interna",
  bot: "Bot",
};
/** Classe da bolha e do nome por autor (as cores ficam no tema, em styles.css). */
const ESTILO: Record<string, { bolha: string; autor: string; lado: string }> = {
  cliente: { bolha: "msg-cliente", autor: "msg-autor-cliente", lado: "mr-6" },
  atendente: { bolha: "msg-colaborador", autor: "msg-autor-colaborador", lado: "ml-6" },
  nota: { bolha: "msg-nota", autor: "msg-autor-nota", lado: "mx-3" },
  bot: { bolha: "msg-bot", autor: "msg-autor-bot", lado: "mr-6" },
};

/**
 * Traz a conversa do Intercom para a tela de avaliação. Sorteio (com descarte
 * justificado) ou link colado à mão. O texto chega do servidor já convertido
 * em texto puro e é desenhado como texto: a tela nunca interpreta HTML de fora.
 */
export function ContatoIntercom({
  employeeId,
  fortnightId,
  tipo,
  limparQuando,
  onContato,
}: {
  employeeId: string;
  fortnightId: string;
  tipo: "interacao" | "ticket_n2";
  /** Muda depois de registrar a avaliação, para o painel recomeçar. */
  limparQuando: number;
  onContato: (c: { assunto: string | null; dataContato: string | null; link: string }) => void;
}) {
  const sortear = useServerFn(sortearContatoFn);
  const buscar = useServerFn(buscarContatoFn);
  const descartar = useServerFn(descartarContatoFn);
  const [contato, setContato] = useState<Contato | null>(null);
  const [referencia, setReferencia] = useState("");
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");

  // Trocar de colaborador ou quinzena, ou registrar a avaliação, recomeça o painel.
  useEffect(() => {
    setContato(null);
    setReferencia("");
  }, [employeeId, fortnightId, limparQuando]);

  const usar = (c: Contato) => {
    setContato(c);
    onContato({ assunto: c.assunto, dataContato: c.dataContato, link: c.link });
  };

  const sorteio = useMutation({
    mutationFn: () => sortear({ data: { employeeId, fortnightId } }),
    onSuccess: (c) => {
      usar(c);
      toast.success(
        c.jaEmAberto ? "Este é o contato que você já tinha sorteado." : "Contato sorteado.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const busca = useMutation({
    mutationFn: () => buscar({ data: { employeeId, referencia } }),
    onSuccess: (c) => {
      usar(c);
      if (!c.atendenteEscreveu)
        toast.warning("Atenção: o colaborador não escreveu nesta conversa.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const descarte = useMutation({
    mutationFn: () => descartar({ data: { sorteioId: contato!.sorteioId!, motivo } }),
    onSuccess: () => {
      setDescartando(false);
      setMotivo("");
      setContato(null);
      toast.success("Contato descartado. Sorteando outro...");
      sorteio.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pronto = !!employeeId && !!fortnightId;
  const ocupado = sorteio.isPending || busca.isPending || descarte.isPending;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Contato do Intercom</p>

        {!contato ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Button
              type="button"
              onClick={() => sorteio.mutate()}
              disabled={!pronto || tipo !== "interacao" || ocupado}
              title={
                tipo !== "interacao"
                  ? "O sorteio de Tickets N2 entra numa próxima etapa"
                  : undefined
              }
            >
              <Dices className="size-4" /> {sorteio.isPending ? "Sorteando..." : "Sortear contato"}
            </Button>
            <div className="flex min-w-[260px] flex-1 items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="ref-intercom" className="text-xs text-muted-foreground">
                  Ou cole o link da conversa
                </Label>
                <Input
                  id="ref-intercom"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="https://app.intercom.com/a/inbox/.../conversation/..."
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => busca.mutate()}
                disabled={!pronto || !referencia.trim() || ocupado}
              >
                <Link2 className="size-4" /> {busca.isPending ? "Buscando..." : "Buscar"}
              </Button>
            </div>
            {!pronto && (
              <p className="w-full text-xs text-muted-foreground">
                Escolha a quinzena e o colaborador primeiro.
              </p>
            )}
            {pronto && tipo !== "interacao" && (
              <p className="w-full text-xs text-muted-foreground">
                Para Ticket N2, use o link por enquanto. O sorteio de tickets entra numa próxima
                etapa.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p>
                {contato.dataContato ? dataBR(contato.dataContato) : "—"}
                {contato.canal && <span className="text-muted-foreground"> · {contato.canal}</span>}
                {contato.sorteioId && <span className="text-muted-foreground"> · sorteado</span>}
              </p>
              <div className="flex items-center gap-3">
                {/* Só abre se for de fato um endereço do Intercom, numa aba nova e isolada. */}
                {linkSeguroDoIntercom(contato.link) && (
                  <a
                    href={linkSeguroDoIntercom(contato.link)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Abrir no Intercom <ExternalLink className="size-3.5" />
                  </a>
                )}
                {contato.sorteioId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDescartando(true)}
                    disabled={ocupado}
                  >
                    <RefreshCw className="size-3.5" /> Sortear outro
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setContato(null)}
                  >
                    Trocar
                  </Button>
                )}
              </div>
            </div>
            {!contato.atendenteEscreveu && (
              <p className="mt-2 text-sm text-warning">
                O colaborador não escreveu nesta conversa. Confira se é o contato certo.
              </p>
            )}
            {/* Legenda: a cor nunca é a única pista; cada bolha também diz quem escreveu. */}
            <ul
              className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
              aria-label="Legenda"
            >
              <li className="flex items-center gap-1.5">
                <span className="msg-cliente inline-block h-3 w-3 rounded-sm" />
                Cliente
              </li>
              <li className="flex items-center gap-1.5">
                <span className="msg-colaborador inline-block h-3 w-3 rounded-sm" />
                Colaborador
              </li>
              <li className="flex items-center gap-1.5">
                <span className="msg-nota inline-block h-3 w-3 rounded-sm" />
                Nota interna
              </li>
            </ul>
            <ol className="mt-3 max-h-[62vh] space-y-2 overflow-y-auto pr-1">
              {contato.mensagens.map((m, i) => (
                <li
                  key={i}
                  className={`rounded-lg px-3 py-2 text-sm ${ESTILO[m.autor]?.bolha ?? ""} ${ESTILO[m.autor]?.lado ?? ""}`}
                >
                  <p className={`mb-0.5 text-xs font-medium ${ESTILO[m.autor]?.autor ?? ""}`}>
                    {ROTULO[m.autor]}
                    {m.nome && ` · ${m.nome}`}
                    {m.quando && ` · ${dataHoraBR(new Date(m.quando * 1000).toISOString())}`}
                  </p>
                  {/* Texto puro: nada de HTML vindo do Intercom é interpretado aqui. */}
                  <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              Links dentro das mensagens não são clicáveis aqui. Para abrir qualquer link, use a
              conversa no Intercom.
            </p>
          </div>
        )}

        <Dialog open={descartando} onOpenChange={(aberto) => !aberto && setDescartando(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sortear outro contato</DialogTitle>
              <DialogDescription>
                O contato atual será descartado, e o motivo fica registrado na auditoria. A mesma
                conversa não volta a ser sorteada para este colaborador nesta quinzena.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="motivo-descarte">Por que descartar este contato?</Label>
              <Textarea
                id="motivo-descarte"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: conversa transferida logo no início, sem atendimento do colaborador."
              />
              <p className="text-xs text-muted-foreground">
                Obrigatório, com pelo menos 10 caracteres.
              </p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDescartando(false)}>
                Cancelar
              </Button>
              <Button
                disabled={motivo.trim().length < 10 || descarte.isPending}
                onClick={() => descarte.mutate()}
              >
                {descarte.isPending ? "Descartando..." : "Descartar e sortear outro"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      {contato && <ClassificacaoDoAtendimento atributos={contato.atributos} tags={contato.tags} />}
    </div>
  );
}

/**
 * Classificação do atendimento, como no painel do Intercom (critério 14 da ficha).
 * Os campos principais aparecem sempre; vazio fica em destaque como "não preenchido".
 */
function ClassificacaoDoAtendimento({
  atributos,
  tags,
}: {
  atributos: Contato["atributos"];
  tags: string[];
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-5"
      aria-label="Classificação do atendimento"
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Classificação do atendimento
      </p>
      <dl className="mt-3 divide-y divide-border text-sm">
        {atributos.map((a) => (
          <div key={a.nome} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2">
            <dt className="text-muted-foreground">{a.nome}</dt>
            {a.valor ? (
              <dd className="break-words font-medium">{a.valor}</dd>
            ) : (
              <dd className="font-medium text-warning">não preenchido</dd>
            )}
          </div>
        ))}
      </dl>
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">Tags</p>
        {tags.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Nenhuma tag.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <li key={t} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
