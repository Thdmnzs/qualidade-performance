import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { CalendarioDeFerias, LegendaDasFerias } from "@/components/escala/calendario-de-ferias";
import { MontarFerias } from "@/components/escala/montar-ferias";
import { MontarSemana } from "@/components/escala/montar-semana";
import { SemanaDoTime } from "@/components/escala/semana-do-time";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { usePermissoes } from "@/hooks/useAuth";
import {
  hojeIso,
  periodoDaSemana,
  periodosDasDatas,
  segundaDaSemana,
  textoDoPeriodo,
} from "@/lib/escala";
import { lerFerias, lerSemana, lerSemanas, lerSiglas } from "@/lib/escala-api";
import { fetchColaboradores } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/escala")({
  head: () => ({
    meta: [
      { title: "Escala · QualityHUB" },
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
  const [aba, setAba] = useState<"semana" | "ferias">("semana");
  const { data: cadastros = [] } = useQuery({
    queryKey: ["colaboradores"],
    queryFn: fetchColaboradores,
  });
  const pessoas = useMemo(
    () =>
      cadastros
        .filter((c) => c.status === "ativo" && c.perfil !== "adm")
        .map((c) => ({ id: c.id, nome: c.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [cadastros],
  );
  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Escala"
        descricao="Monte a escala da semana e lance as férias do time. Só o que for publicado aparece para o time."
      />
      <Abas
        abas={[
          ["semana", "Montar a semana"],
          ["ferias", "Férias"],
        ]}
        atual={aba}
        aoTrocar={setAba}
      />
      {pessoas.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum colaborador ativo no cadastro ainda.</p>
      )}
      {aba === "semana" ? <MontarSemana pessoas={pessoas} /> : <MontarFerias pessoas={pessoas} />}
    </div>
  );
}

// ---------- O time: vê a semana publicada e as férias ----------
function EscalaDoTime() {
  const [aba, setAba] = useState<"semana" | "ferias">("semana");
  return (
    <div className="space-y-5">
      <Abas
        abas={[
          ["semana", "Semana"],
          ["ferias", "Férias"],
        ]}
        atual={aba}
        aoTrocar={setAba}
      />
      {aba === "semana" ? <SemanaPublicada /> : <FeriasDoTime />}
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
  const ano = Number(hojeIso().slice(0, 4));
  const [destacar, setDestacar] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["escala-ferias", ano],
    queryFn: () => lerFerias(ano),
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
  return (
    <div className="space-y-4">
      <PageHeader
        titulo={`Férias ${ano}`}
        descricao="Os dias de férias de cada pessoa e os feriados. Veja os dias livres antes de pedir os seus."
      />
      <div className="flex flex-wrap items-end gap-3">
        <section className="min-w-[260px] flex-1 rounded-2xl border border-border bg-card p-4">
          {data.eu ? (
            <>
              <p className="text-sm font-bold">
                Suas férias em {ano} · {minhas.length} {minhas.length === 1 ? "dia" : "dias"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {periodos.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhum dia marcado ainda.</span>
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
        <label className="text-sm font-bold">
          Destacar uma pessoa
          <Input
            value={destacar}
            onChange={(e) => setDestacar(e.target.value)}
            placeholder="Por exemplo: Carol"
            className="mt-1 w-56"
            maxLength={40}
          />
        </label>
      </div>
      <section className="rounded-2xl border border-border bg-card p-4">
        <CalendarioDeFerias dados={data} destacar={destacar} />
      </section>
      <LegendaDasFerias comMinhas={!!data.eu} />
    </div>
  );
}
