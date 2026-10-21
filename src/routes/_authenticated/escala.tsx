import { pessoasDaEscala } from "@/lib/escala";
import { createFileRoute } from "@tanstack/react-router";
import { FolgasFixas } from "@/components/escala/folgas-fixas";
import { ImportarEscala } from "@/components/escala/importar-escala";
import { NucleosDoTime } from "@/components/escala/nucleos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TrocasDoTime, TrocasParaAprovar } from "@/components/escala/trocas";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { CalendarioDeFerias, LegendaDasFerias } from "@/components/escala/calendario-de-ferias";
import { Flutuante } from "@/components/escala/comum";
import {
  AvisosDoPeriodo,
  JanelaDePedirFerias,
  MeusPedidos,
} from "@/components/escala/pedido-de-ferias";
import { periodoDoPedido, problemaDoPedido } from "@/lib/pedidos-de-ferias";
import { Button } from "@/components/ui/button";
import { MontarFerias } from "@/components/escala/montar-ferias";
import { MontarSemana } from "@/components/escala/montar-semana";
import { SemanaDoTime } from "@/components/escala/semana-do-time";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { usePermissoes } from "@/hooks/useAuth";
import {
  anosDasFerias,
  hojeIso,
  periodoDaSemana,
  periodosDasDatas,
  segundaDaSemana,
  textoDoPeriodo,
} from "@/lib/escala";
import {
  cancelarPedido,
  lerFerias,
  lerPedidos,
  lerSemana,
  lerSemanas,
  lerSiglas,
  pedirFerias,
  type PedidoDeFerias,
} from "@/lib/escala-api";
import { fetchColaboradores } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/escala")({
  head: () => ({
    meta: [
      { title: "Escala · CX Hub" },
      { name: "description", content: "A escala da semana e as férias do time." },
    ],
  }),
  component: Escala,
});

function Abas<T extends string>({
  abas,
  atual,
  aoTrocar,
}: {
  abas: [T, string][];
  atual: T;
  aoTrocar: (a: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-secondary p-1 text-sm" role="tablist">
      {abas.map(([a, rotulo]) => (
        <button
          key={a}
          type="button"
          role="tab"
          aria-selected={atual === a}
          onClick={() => aoTrocar(a)}
          className={`rounded-md px-4 py-1.5 ${atual === a ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}

function Escala() {
  const { isAdmin, isLoading } = usePermissoes();
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  return isAdmin ? <MontagemDoAdm /> : <EscalaDoTime />;
}

// ---------- O ADM: monta a semana e lança as férias ----------
function MontagemDoAdm() {
  const [aba, setAba] = useState<
    "semana" | "importar" | "ferias" | "trocas" | "folgas" | "nucleos"
  >("semana");
  const [ajuste, setAjuste] = useState<{ inicio: string; dia: number } | null>(null);
  const { data: cadastros = [] } = useQuery({
    queryKey: ["colaboradores"],
    queryFn: fetchColaboradores,
  });
  const pessoas = useMemo(() => pessoasDaEscala(cadastros), [cadastros]);
  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Escala"
        descricao="Monte a escala da semana e lance as férias do time. Só o que for publicado aparece para o time."
      />
      <Abas
        abas={[
          ["semana", "Montar a semana"],
          ["importar", "Importar a escala"],
          ["ferias", "Férias"],
          ["trocas", "Trocas"],
          ["folgas", "Folgas fixas"],
          ["nucleos", "Núcleos"],
        ]}
        atual={aba}
        aoTrocar={setAba}
      />
      {pessoas.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum colaborador ativo no cadastro ainda.</p>
      )}
      {aba === "semana" ? (
        <MontarSemana
          key={ajuste ? `${ajuste.inicio}-${ajuste.dia}` : "semana"}
          pessoas={pessoas}
          inicioInicial={ajuste?.inicio}
          diaInicial={ajuste?.dia}
        />
      ) : aba === "ferias" ? (
        <MontarFerias pessoas={pessoas} />
      ) : aba === "importar" ? (
        <ImportarEscala pessoas={pessoas} />
      ) : aba === "nucleos" ? (
        <NucleosDoTime pessoas={pessoas} />
      ) : aba === "folgas" ? (
        <FolgasFixas />
      ) : (
        <TrocasParaAprovar
          aoAjustar={(inicio, dia) => {
            setAjuste({ inicio, dia });
            setAba("semana");
          }}
        />
      )}
    </div>
  );
}

// ---------- O time: vê a semana publicada e as férias ----------
function EscalaDoTime() {
  const [aba, setAba] = useState<"semana" | "ferias" | "trocas">("semana");
  return (
    <div className="space-y-5">
      <Abas
        abas={[
          ["semana", "Semana"],
          ["ferias", "Férias"],
          ["trocas", "Trocas"],
        ]}
        atual={aba}
        aoTrocar={setAba}
      />
      {aba === "semana" ? (
        <SemanaPublicada />
      ) : aba === "ferias" ? (
        <FeriasDoTime />
      ) : (
        <TrocasDoTime />
      )}
    </div>
  );
}

function SemanaPublicada() {
  const { data: siglasLista = [] } = useQuery({ queryKey: ["escala-siglas"], queryFn: lerSiglas });
  const siglas = useMemo(() => new Map(siglasLista.map((s) => [s.id, s])), [siglasLista]);
  const { data: semanas = [], isLoading: carregandoSemanas } = useQuery({
    queryKey: ["escala-semanas"],
    queryFn: lerSemanas,
    refetchInterval: 5 * 60_000,
  });
  const estaSemana = segundaDaSemana(hojeIso());
  const [escolhida, setEscolhida] = useState<string | null>(null);
  // A semana de hoje, se publicada; senão, a publicada mais recente.
  const inicio =
    escolhida ?? semanas.find((s) => s.inicio === estaSemana)?.inicio ?? semanas[0]?.inicio ?? null;
  const { data: semana, isLoading } = useQuery({
    queryKey: ["escala-semana", inicio],
    queryFn: () => lerSemana(inicio!),
    enabled: !!inicio,
    refetchInterval: 5 * 60_000, // uma mudança da supervisão aparece em poucos minutos
  });
  return (
    <div className="space-y-4">
      <PageHeader titulo="Escala" descricao="A escala do time, publicada pela supervisão." />
      {carregandoSemanas || (inicio && isLoading) ? (
        <p className="text-sm text-muted-foreground">Carregando a escala...</p>
      ) : !inicio || !semana ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          A escala ainda não foi publicada pela supervisão.
        </p>
      ) : (
        <>
          <select
            aria-label="Semana"
            value={inicio}
            onChange={(e) => setEscolhida(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm font-semibold"
          >
            {semanas.map((s) => (
              <option key={s.inicio} value={s.inicio}>
                {periodoDaSemana(s.inicio)}
                {s.inicio === estaSemana ? " (esta)" : ""}
              </option>
            ))}
          </select>
          <SemanaDoTime
            key={inicio}
            inicio={inicio}
            dias={semana.dias}
            feriados={semana.feriados}
            eu={semana.eu}
            siglas={siglas}
          />
        </>
      )}
    </div>
  );
}

function FeriasDoTime() {
  const qc = useQueryClient();
  // O ano atual e os dois seguintes (em 2026, até 2028): para pedir férias no ano que vem.
  const [ano, setAno] = useState(Number(hojeIso().slice(0, 4)));
  const [destacar, setDestacar] = useState("");
  const [escolha, setEscolha] = useState<{ datas: string[]; ancora: DOMRect } | null>(null);
  const [janela, setJanela] = useState<{ de: string; ate: string } | null | "vazia">(null);
  const fecharEscolha = useCallback(() => setEscolha(null), []);
  const { data, isLoading, error } = useQuery({
    queryKey: ["escala-ferias", ano],
    queryFn: () => lerFerias(ano),
    refetchInterval: 5 * 60_000,
  });
  const { data: pedidos = [] } = useQuery({
    queryKey: ["escala-pedidos"],
    queryFn: lerPedidos,
    refetchInterval: 5 * 60_000,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando as férias...</p>;
  if (error || !data)
    return (
      <p className="text-sm text-destructive">
        {(error as Error)?.message ?? "Não foi possível carregar as férias."}
      </p>
    );
  const minhas = [...data.porDia.entries()]
    .filter(([, ps]) => ps.some((p) => p.employee_id === data.eu))
    .map(([d]) => d);
  const periodos = periodosDasDatas(minhas);
  const todas = [...data.porDia.values()];
  const meusPedidos = pedidos.filter((p) => p.employee_id === data.eu);
  const aguardando = meusPedidos.filter((p) => p.situacao === "aguardando");

  async function enviar(de: string, ate: string, observacao: string) {
    try {
      await pedirFerias(de, ate, observacao);
      toast.success(
        `Pedido enviado: ${periodoDoPedido({ de, ate })}. A supervisão vai aprovar ou recusar.`,
      );
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    } finally {
      await qc.invalidateQueries({ queryKey: ["escala-pedidos"] });
    }
  }
  async function cancelar(p: PedidoDeFerias) {
    if (!window.confirm(`Cancelar o pedido de ${periodoDoPedido(p)}?`)) return;
    try {
      await cancelarPedido(p.id);
      toast.success("Pedido cancelado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      await qc.invalidateQueries({ queryKey: ["escala-pedidos"] });
    }
  }

  const escolhaProblema = escolha ? problemaDoPedido(escolha.datas, data, pedidos, data.eu) : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          titulo={`Férias ${ano}`}
          descricao="Veja os dias livres e peça os seus: arraste no calendário, ou use o botão."
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Ano"
            value={ano}
            onChange={(e) => {
              setAno(Number(e.target.value));
              setEscolha(null);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm font-semibold"
          >
            {anosDasFerias().map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          {data.eu && <Button onClick={() => setJanela("vazia")}>+ Pedir férias</Button>}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1.3fr]">
        <section className="rounded-2xl border border-border bg-card p-4">
          {data.eu ? (
            <>
              <p className="text-sm font-bold">
                Suas férias aprovadas em {ano} · {minhas.length}{" "}
                {minhas.length === 1 ? "dia" : "dias"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {periodos.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhum dia aprovado ainda.</span>
                )}
                {periodos.map((p) => (
                  <span
                    key={p.de}
                    className="rounded-full bg-[#F4B6B6] px-3 py-1 text-xs font-bold text-[#0D0F0D] shadow-[inset_0_0_0_2px] shadow-primary"
                  >
                    {textoDoPeriodo(p)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm">
              {new Set(todas.flat().map((p) => p.employee_id)).size} pessoas com férias marcadas, e{" "}
              {data.feriados.size} feriados.
            </p>
          )}
        </section>
        {data.eu && <MeusPedidos pedidos={meusPedidos} aoCancelar={cancelar} />}
      </div>
      <label className="block text-sm font-bold">
        Destacar uma pessoa
        <Input
          value={destacar}
          onChange={(e) => setDestacar(e.target.value)}
          placeholder="Por exemplo: Carol"
          className="mt-1 w-56"
          maxLength={40}
        />
      </label>
      <section className="rounded-2xl border border-border bg-card p-4">
        <CalendarioDeFerias
          dados={data}
          destacar={destacar}
          pedidos={aguardando.map((p) => ({
            de: p.de,
            ate: p.ate,
            rotulo: "pedido",
            nome: "você",
          }))}
          aoEscolher={data.eu ? (datas, ancora) => setEscolha({ datas, ancora }) : undefined}
          selecionados={escolha?.datas ?? []}
        />
      </section>
      <LegendaDasFerias comMinhas={!!data.eu} pedidos={data.eu ? "meus" : undefined} />

      {escolha && (
        <Flutuante ancora={escolha.ancora} aoFechar={fecharEscolha} largura={270}>
          <div className="space-y-1.5 p-1 text-sm">
            <p className="text-xs font-bold text-muted-foreground">
              {periodoDoPedido({
                de: escolha.datas[0]!,
                ate: escolha.datas[escolha.datas.length - 1]!,
              })}{" "}
              · {escolha.datas.length} {escolha.datas.length === 1 ? "dia" : "dias"}
            </p>
            {escolhaProblema ? (
              <p className="font-medium text-destructive">{escolhaProblema}</p>
            ) : (
              <>
                <div className="text-xs">
                  <AvisosDoPeriodo datas={escolha.datas} dados={data} pessoa={data.eu} />
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setJanela({
                      de: escolha.datas[0]!,
                      ate: escolha.datas[escolha.datas.length - 1]!,
                    });
                    setEscolha(null);
                  }}
                >
                  Pedir férias nesses dias
                </Button>
              </>
            )}
          </div>
        </Flutuante>
      )}
      <JanelaDePedirFerias
        aberta={janela !== null}
        aoFechar={() => setJanela(null)}
        inicial={janela === "vazia" ? null : janela}
        dados={data}
        pedidos={pedidos}
        eu={data.eu}
        aoEnviar={enviar}
      />
    </div>
  );
}
