import { useState } from "react";
import { toast } from "sonner";

import { Capa, ComMoldura } from "@/components/perfil/aparencia";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  aparenciaDeAgora,
  CAPAS,
  MESES,
  MOLDURAS,
  temporadaDoMes,
  type ItemDaAparencia,
  type MinhaAparencia,
} from "@/lib/aparencia";

type Mudanca = Partial<
  Pick<
    MinhaAparencia,
    "capa" | "moldura" | "capa_da_temporada" | "moldura_da_temporada" | "capa_temporada_preferida"
  >
>;

/** O selo de cada opção: liberada, bloqueada (com a regra), ou de outro mês. */
function rotulo(item: ItemDaAparencia, liberada: boolean, mes: number) {
  if (item.grupo === "sazonal")
    return item.mes === mes ? `🟢 agora, em ${MESES[mes]}` : `🗓 ${item.regra}`;
  return liberada ? item.regra || "\u00a0" : `🔒 ${item.regra}`;
}

export function JanelaDaCapa({
  aberta,
  aoFechar,
  aparencia,
  aoMudar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  aparencia: MinhaAparencia;
  aoMudar: (m: Mudanca) => void;
}) {
  const [emPrevia, setEmPrevia] = useState<string | null>(null);
  const agora = aparenciaDeAgora(aparencia);
  const temporada = temporadaDoMes(aparencia.mes);
  const fechar = () => {
    setEmPrevia(null);
    aoFechar();
  };
  function escolher(c: ItemDaAparencia) {
    const liberada = aparencia.capas_liberadas.includes(c.id);
    setEmPrevia(null);
    if (c.grupo === "sazonal" && c.mes !== aparencia.mes) {
      setEmPrevia(c.id);
      toast.info(`${c.nome}: disponível em ${MESES[c.mes!]}. Por enquanto, só a prévia.`);
      return;
    }
    if (!liberada) {
      toast.info(`Para desbloquear: ${c.regra}.`);
      return;
    }
    if (c.grupo === "sazonal") aoMudar({ capa_da_temporada: true, capa_temporada_preferida: c.id });
    else aoMudar({ capa: c.id, capa_da_temporada: false });
  }
  const opcao = (c: ItemDaAparencia) => {
    const liberada = aparencia.capas_liberadas.includes(c.id);
    const escolhida =
      c.grupo === "sazonal"
        ? aparencia.capa_da_temporada && agora.capa === c.id
        : !aparencia.capa_da_temporada || !temporada.capas.length
          ? aparencia.capa === c.id
          : false;
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => escolher(c)}
        aria-pressed={escolhida}
        className={`overflow-hidden rounded-2xl border text-left ${escolhida ? "border-primary ring-1 ring-primary" : "border-border"} ${liberada || c.grupo === "sazonal" ? "" : "cursor-not-allowed"}`}
      >
        <div className={liberada ? "" : "opacity-45 grayscale"}>
          <Capa id={c.id} sufixo={`mini-${c.id}`} className="max-h-16" />
        </div>
        <div className="p-2">
          <p className="text-xs font-bold">{c.nome}</p>
          <p className="text-[10px] text-muted-foreground">{rotulo(c, liberada, aparencia.mes)}</p>
        </div>
      </button>
    );
  };
  return (
    <Dialog open={aberta} onOpenChange={(a) => !a && fechar()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Mudar capa</DialogTitle>
          <DialogDescription>
            O fundo da sua janela de status. As capas da Fluke se desbloqueiam pelo nível e pelas
            conquistas; as sazonais ficam disponíveis no mês delas.
          </DialogDescription>
        </DialogHeader>
        <Capa id={emPrevia ?? agora.capa} sufixo="previa-da-janela" className="rounded-xl">
          {emPrevia && (
            <span className="absolute right-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs font-bold text-white">
              Só uma prévia: disponível em {MESES[CAPAS.find((c) => c.id === emPrevia)!.mes!]}
            </span>
          )}
        </Capa>
        {temporada.capas.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={aparencia.capa_da_temporada}
              onCheckedChange={(v) => aoMudar({ capa_da_temporada: v })}
            />
            Usar a capa da temporada{" "}
            <span className="text-xs text-muted-foreground">(em {MESES[aparencia.mes]})</span>
          </label>
        )}
        <p className="text-xs font-bold">Da Fluke</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CAPAS.filter((c) => c.grupo === "fluke").map(opcao)}
        </div>
        <p className="text-xs font-bold">
          Sazonais{" "}
          <span className="font-medium text-muted-foreground">
            · ao longo do ano (clique numa de outro mês para ver como fica)
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CAPAS.filter((c) => c.grupo === "sazonal").map(opcao)}
        </div>
        <div className="flex justify-end">
          <Button onClick={fechar}>Pronto</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function JanelaDaMoldura({
  aberta,
  aoFechar,
  aparencia,
  aoMudar,
  iniciais,
}: {
  aberta: boolean;
  aoFechar: () => void;
  aparencia: MinhaAparencia;
  aoMudar: (m: Mudanca) => void;
  iniciais: string;
}) {
  const agora = aparenciaDeAgora(aparencia);
  const temporada = temporadaDoMes(aparencia.mes);
  const lista = MOLDURAS.filter((m) => m.grupo === "fluke" || m.mes === aparencia.mes);
  function escolher(m: ItemDaAparencia) {
    if (m.grupo === "sazonal") {
      aoMudar({ moldura_da_temporada: true });
      return;
    }
    if (!aparencia.molduras_liberadas.includes(m.id)) {
      toast.info(`Para desbloquear: ${m.regra}.`);
      return;
    }
    aoMudar({ moldura: m.id, moldura_da_temporada: false });
  }
  return (
    <Dialog open={aberta} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Trocar moldura</DialogTitle>
          <DialogDescription>
            Ela aparece em volta da sua foto, aqui e no Ranking. As novas se desbloqueiam pelo nível
            e pelas conquistas.
          </DialogDescription>
        </DialogHeader>
        {temporada.moldura && (
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={aparencia.moldura_da_temporada}
              onCheckedChange={(v) => aoMudar({ moldura_da_temporada: v })}
            />
            Usar a moldura da temporada{" "}
            <span className="text-xs text-muted-foreground">(em {MESES[aparencia.mes]})</span>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {lista.map((m) => {
            const liberada = m.grupo === "sazonal" || aparencia.molduras_liberadas.includes(m.id);
            const escolhida = agora.moldura === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => escolher(m)}
                aria-pressed={escolhida}
                className={`flex flex-col items-center rounded-2xl border p-3 ${escolhida ? "border-primary ring-1 ring-primary" : "border-border"} ${liberada ? "" : "cursor-not-allowed"}`}
              >
                <div className={liberada ? "" : "opacity-45 grayscale"}>
                  <ComMoldura id={m.id} espessura={4}>
                    <span className="flex size-12 items-center justify-center rounded-full bg-secondary font-display text-sm font-bold">
                      {iniciais}
                    </span>
                  </ComMoldura>
                </div>
                <p className="mt-2 text-xs font-bold">{m.nome}</p>
                <p className="text-[10px] text-muted-foreground">
                  {rotulo(m, liberada, aparencia.mes)}
                </p>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button onClick={aoFechar}>Pronto</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
