import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { feriasDoAnoFn, escalaDaSemanaFn } from "@/lib/escala.functions";
import {
  corDoTexto,
  emAtendimento,
  horasDeTrabalho,
  normalizar,
  significado,
  type DiaDaSemana,
  type HoraDaPessoa,
} from "@/lib/escala";

export const Route = createFileRoute("/_authenticated/escala")({
  head: () => ({
    meta: [
      { title: "Escala · QualityHUB" },
      {
        name: "description",
        content: "A escala da semana e as férias do time, direto da planilha.",
      },
    ],
  }),
  component: Escala,
});

const NOMES_DOS_DIAS: Record<string, string> = {
  segunda: "SEG",
  terca: "TER",
  quarta: "QUA",
  quinta: "QUI",
  sexta: "SEX",
  sabado: "SÁB",
  domingo: "DOM",
};
const hora = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Fortaleza",
      })
    : "";
const hojeIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
const dataCurta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

function Escala() {
  const [aba, setAba] = useState<"semana" | "ferias">("semana");
  return (
    <div className="space-y-5">
      <div
        className="inline-flex rounded-lg bg-secondary p-1 text-sm"
        role="tablist"
        aria-label="Escala"
      >
        {(
          [
            ["semana", "Semana"],
            ["ferias", "Férias"],
          ] as const
        ).map(([a, rotulo]) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={aba === a}
            onClick={() => setAba(a)}
            className={`rounded-md px-4 py-1.5 ${aba === a ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {aba === "semana" ? <Semana /> : <FeriasDoAno />}
    </div>
  );
}

// ======================================================================
// A semana
// ======================================================================
function Semana() {
  const qc = useQueryClient();
  const ler = useServerFn(escalaDaSemanaFn);
  const [abaEscolhida, setAbaEscolhida] = useState<string | undefined>(undefined);
  const [diaEscolhido, setDiaEscolhido] = useState<number | null>(null);
  const [visao, setVisao] = useState<"time" | "meu">("time");
  const [atualizando, setAtualizando] = useState(false);
  const chave = ["escala-semana", abaEscolhida ?? "atual"];
  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    queryFn: () => ler({ data: { aba: abaEscolhida } }),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000, // a supervisora pode mudar no dia: a aba se atualiza sozinha
  });

  async function atualizar() {
    setAtualizando(true);
    try {
      qc.setQueryData(chave, await ler({ data: { aba: abaEscolhida, forcar: true } }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAtualizando(false);
    }
  }

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Lendo a escala da planilha...</p>;
  if (error) return <AvisoDeErro mensagem={(error as Error).message} />;
  if (!data?.semana || !data.titulo) {
    return (
      <AvisoDeErro mensagem="Nenhuma aba de semana foi encontrada na planilha (o nome precisa ter o período, como “05 a 11/10”)." />
    );
  }

  const dias = data.semana.dias;
  const indiceDeHoje = Math.max(
    0,
    dias.findIndex((d) => d.data === hojeIso()),
  );
  const iDia = Math.min(diaEscolhido ?? indiceDeHoje, Math.max(0, dias.length - 1));
  const dia = dias[iDia];
  const temMeuDia = !!data.eu;
  const visaoAtual = temMeuDia ? visao : "time";

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Escala"
        descricao="A escala do time, direto da planilha. Mudanças feitas no dia aparecem em poucos minutos."
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          aria-label="Semana"
          value={data.titulo}
          onChange={(e) => {
            setAbaEscolhida(e.target.value);
            setDiaEscolhido(null);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm font-semibold"
        >
          {data.abas.map((a) => (
            <option key={a.titulo} value={a.titulo}>
              {a.titulo}
              {a.inicio <= hojeIso() && hojeIso() <= a.fim ? " (esta)" : ""}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">
          lida da planilha às {hora(data.lidaEm)} · atualiza sozinha a cada 5 minutos
        </span>
        <Button variant="outline" size="sm" onClick={atualizar} disabled={atualizando}>
          <RefreshCw className={`size-3.5 ${atualizando ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Dia">
        {dias.map((d, i) => (
          <button
            key={`${d.nome}-${i}`}
            type="button"
            role="tab"
            aria-selected={i === iDia}
            onClick={() => setDiaEscolhido(i)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${i === iDia ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
          >
            <b>{NOMES_DOS_DIAS[d.nome] ?? d.nome}</b> {dataCurta(d.data)}
            {d.data === hojeIso() && <span className="ml-1 text-[10px]">· hoje</span>}
          </button>
        ))}
      </div>
      {dia && /\d/.test(dia.titulo) && (
        <p className="text-sm font-medium text-warning">{dia.titulo}</p>
      )}

      {temMeuDia && (
        <div
          className="inline-flex rounded-lg bg-secondary p-1 text-sm"
          role="tablist"
          aria-label="Visão"
        >
          {(
            [
              ["time", "Time"],
              ["meu", "Meu dia"],
            ] as const
          ).map(([v, rotulo]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={visaoAtual === v}
              onClick={() => setVisao(v)}
              className={`rounded-md px-3 py-1.5 ${visaoAtual === v ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        {!dia || dia.pessoas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém do time está escalado neste dia.</p>
        ) : visaoAtual === "meu" ? (
          <MeuDia dia={dia} horas={data.semana.horas} eu={data.eu!} />
        ) : (
          <GradeDoTime dia={dia} horas={data.semana.horas} eu={data.eu} comOnline={data.ehAdm} />
        )}
      </section>
      {dia && <Legenda dia={dia} />}
      {data.leitura && (
        <QuadroDaLeitura leitura={data.leitura} titulo={data.titulo} lidaEm={data.lidaEm} />
      )}
    </div>
  );
}

/** As células de uma pessoa: as faixas mescladas (folga, férias) numa célula só, como na planilha. */
function celulasDa(horas: HoraDaPessoa[]): { h: HoraDaPessoa; colunas: number }[] {
  const saida: { h: HoraDaPessoa; colunas: number }[] = [];
  for (let i = 0; i < horas.length; i++) {
    const h = horas[i] ?? null;
    let j = i;
    while (h && h.mescla !== null && j + 1 < horas.length && horas[j + 1]?.mescla === h.mescla) j++;
    saida.push({ h, colunas: j - i + 1 });
    i = j;
  }
  return saida;
}

function Chip({ h, longo }: { h: NonNullable<HoraDaPessoa>; longo: boolean }) {
  const fundo = h.cor ?? "#F3F4F6";
  return (
    <div
      className={`flex h-8 items-center justify-center overflow-hidden whitespace-nowrap rounded-[7px] px-0.5 font-bold ${longo ? "text-[10px] tracking-tight" : "text-[11px]"} ${h.cor ? "" : "border border-dashed border-muted-foreground/50"}`}
      style={{ background: fundo, color: corDoTexto(fundo) }}
    >
      {h.texto}
    </div>
  );
}

function GradeDoTime({
  dia,
  horas,
  eu,
  comOnline,
}: {
  dia: DiaDaSemana;
  horas: number[];
  eu: string | null;
  comOnline: boolean;
}) {
  return (
    <table className="w-full table-fixed border-separate border-spacing-0">
      <colgroup>
        <col style={{ width: 92 }} />
        <col style={{ width: 28 }} />
        {horas.map((h) => (
          <col key={h} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="pb-1 text-left text-xs font-medium">Analista</th>
          <th className="pb-1 text-xs font-medium">h</th>
          {horas.map((h) => (
            <th key={h} className="pb-1 text-[11px] font-bold">
              {h}h
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dia.pessoas.map((p, i) => {
          const minha = p.nome === eu;
          const fundo = i % 2 ? "bg-secondary/70" : "";
          return (
            <tr key={`${p.nome}-${i}`}>
              <td
                className={`truncate rounded-l-[10px] py-[7px] pl-2.5 text-sm font-bold ${fundo} ${minha ? "text-primary" : ""}`}
              >
                {p.nome}
                {minha && <span className="ml-1 text-[10px]">(você)</span>}
              </td>
              <td className={`py-[7px] text-center text-xs ${fundo}`}>
                {horasDeTrabalho(p.horas) || "–"}
              </td>
              {celulasDa(p.horas).map(({ h, colunas }, k, todas) => (
                <td
                  key={k}
                  colSpan={colunas}
                  title={h ? (significado(h.texto) ?? h.texto) : "fora do horário"}
                  className={`px-px py-[7px] ${fundo} ${k === todas.length - 1 ? "rounded-r-[10px]" : ""}`}
                >
                  {h && (
                    <div
                      className={
                        minha ? "rounded-[7px] shadow-[inset_0_0_0_2px] shadow-primary" : ""
                      }
                    >
                      <Chip h={h} longo={h.texto.length >= 6 && colunas === 1} />
                    </div>
                  )}
                </td>
              ))}
            </tr>
          );
        })}
        {comOnline && (
          <tr>
            <td
              className="border-t-2 border-border pt-3 pl-2.5 text-xs font-bold"
              title="Quantas pessoas estão em atendimento (Intercom) em cada hora"
            >
              Online
            </td>
            <td className="border-t-2 border-border pt-3" />
            {horas.map((h, k) => (
              <td key={h} className="border-t-2 border-border px-px pt-3">
                <div className="flex h-[26px] items-center justify-center rounded-[7px] bg-primary/10 text-xs font-bold text-primary">
                  {dia.pessoas.filter((p) => emAtendimento(p.horas[k] ?? null)).length}
                </div>
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

function MeuDia({ dia, horas, eu }: { dia: DiaDaSemana; horas: number[]; eu: string }) {
  const minha = dia.pessoas.find((p) => p.nome === eu);
  if (!minha)
    return <p className="text-sm text-muted-foreground">Você não está escalado(a) neste dia.</p>;
  const blocos: { h: NonNullable<HoraDaPessoa>; ini: number; fim: number }[] = [];
  minha.horas.forEach((h, i) => {
    if (!h) return;
    const ult = blocos[blocos.length - 1];
    if (ult && normalizar(ult.h.texto) === normalizar(h.texto) && ult.fim === horas[i])
      ult.fim = horas[i]! + 1;
    else blocos.push({ h, ini: horas[i]!, fim: horas[i]! + 1 });
  });
  return (
    <div>
      <p className="text-sm font-bold">Seu dia: {horasDeTrabalho(minha.horas)} horas de trabalho</p>
      <ul className="mt-4 space-y-3">
        {blocos.map((b, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="w-24 text-sm font-bold">
              {b.ini}h às {b.fim}h
            </span>
            <span
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: b.h.cor ?? "#F3F4F6", color: corDoTexto(b.h.cor ?? "#F3F4F6") }}
            >
              {b.h.texto}
            </span>
            <span className="text-sm">{significado(b.h.texto) ?? ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legenda({ dia }: { dia: DiaDaSemana }) {
  const presentes = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of dia.pessoas)
      for (const h of p.horas)
        if (h && !m.has(normalizar(h.texto))) m.set(normalizar(h.texto), h.cor);
    return [...m.entries()].map(([k, cor]) => ({
      sigla: dia.pessoas.flatMap((p) => p.horas).find((h) => h && normalizar(h.texto) === k)!.texto,
      cor,
    }));
  }, [dia]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-bold">Neste dia:</span>
      {presentes.map(({ sigla, cor }) => (
        <span
          key={sigla}
          className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-3"
        >
          <span
            className="rounded-full px-2 py-0.5 font-bold"
            style={{ background: cor ?? "#F3F4F6", color: corDoTexto(cor ?? "#F3F4F6") }}
          >
            {sigla}
          </span>
          {significado(sigla) ?? ""}
        </span>
      ))}
      <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
        vazio: fora do horário
      </span>
    </div>
  );
}

function QuadroDaLeitura({
  leitura,
  titulo,
  lidaEm,
}: {
  leitura: {
    planilha: string;
    semCadastro: string[];
    encontrados: { planilha: string; cadastro: string }[];
  };
  titulo: string;
  lidaEm: number | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">Leitura da planilha</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lida às {hora(lidaEm)}, da aba <b>“{titulo}”</b>. A aba da semana é escolhida pelo
            período no nome dela.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={leitura.planilha} target="_blank" rel="noopener noreferrer">
            Abrir a planilha <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>
      {leitura.semCadastro.length > 0 ? (
        <div className="mt-4 rounded-xl bg-warning/15 px-4 py-3 text-sm">
          <p className="font-bold">
            {leitura.semCadastro.length}{" "}
            {leitura.semCadastro.length === 1
              ? "nome da planilha não encontrou"
              : "nomes da planilha não encontraram"}{" "}
            um cadastro no QualityHUB
          </p>
          <p className="mt-1 text-xs">
            Essas pessoas aparecem na escala normalmente, mas não veem o “(você)” na própria linha.
            Confira se o nome na planilha é o mesmo do cadastro (o primeiro nome, ou o começo dele).
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
            {leitura.semCadastro.map((n) => (
              <span key={n} className="rounded-full bg-card px-2.5 py-0.5">
                {n}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-primary">
          Todos os nomes da planilha encontraram um cadastro.
        </p>
      )}
      {leitura.encontrados.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Encontrados:{" "}
          {leitura.encontrados
            .map((e) =>
              e.planilha === e.cadastro.split(" ")[0]
                ? e.cadastro
                : `${e.planilha} → ${e.cadastro}`,
            )
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

function AvisoDeErro({ mensagem }: { mensagem: string }) {
  return (
    <div className="space-y-4">
      <PageHeader titulo="Escala" descricao="A escala do time, direto da planilha." />
      <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        {mensagem}
      </p>
    </div>
  );
}

// ======================================================================
// As férias
// ======================================================================
const MESES_POR_EXTENSO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function FeriasDoAno() {
  const qc = useQueryClient();
  const ler = useServerFn(feriasDoAnoFn);
  const [destacar, setDestacar] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["escala-ferias"],
    queryFn: () => ler({ data: {} }),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  async function atualizar() {
    setAtualizando(true);
    try {
      qc.setQueryData(["escala-ferias"], await ler({ data: { forcar: true } }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAtualizando(false);
    }
  }
  if (isLoading)
    return <p className="text-sm text-muted-foreground">Lendo as férias da planilha...</p>;
  if (error) return <AvisoDeErro mensagem={(error as Error).message} />;
  if (!data?.ferias)
    return (
      <AvisoDeErro mensagem="A aba de férias não foi encontrada na planilha (o nome precisa começar com “férias”)." />
    );

  const { ferias, eu } = data;
  const ano = ferias.ano ?? new Date().getFullYear();
  const hoje = hojeIso();
  const busca = normalizar(destacar);
  const meus: [number, number][] = [];
  for (let m = 0; m < 12; m++)
    for (let d = 1; d <= 31; d++)
      if (eu && ferias.dias[`${m}-${d}`]?.pessoas.includes(eu)) meus.push([m, d]);
  const periodos: { m: number; ini: number; fim: number }[] = [];
  for (const [m, d] of meus) {
    const ult = periodos[periodos.length - 1];
    if (ult && ult.m === m && ult.fim === d - 1) ult.fim = d;
    else periodos.push({ m, ini: d, fim: d });
  }
  const todas = Object.values(ferias.dias);

  return (
    <div className="space-y-4">
      <PageHeader
        titulo={`Férias ${ano}`}
        descricao="Os dias de férias de cada pessoa e os feriados, direto da planilha. Veja os dias livres antes de pedir os seus."
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">lida da planilha às {hora(data.lidaEm)}</span>
        <Button variant="outline" size="sm" onClick={atualizar} disabled={atualizando}>
          <RefreshCw className={`size-3.5 ${atualizando ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <section className="min-w-[260px] flex-1 rounded-2xl border border-border bg-card p-4">
          {eu ? (
            <>
              <p className="text-sm font-bold">
                Suas férias em {ano} · {meus.length} {meus.length === 1 ? "dia" : "dias"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {periodos.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhum dia marcado ainda.</span>
                )}
                {periodos.map((p) => (
                  <span
                    key={`${p.m}-${p.ini}`}
                    className="rounded-full px-3 py-1 text-xs font-bold text-[#0D0F0D] shadow-[inset_0_0_0_2px] shadow-primary"
                    style={{ background: "#F4B6B6" }}
                  >
                    {p.ini === p.fim ? p.ini : `${p.ini} a ${p.fim}`} de {MESES_POR_EXTENSO[p.m]}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-bold">O time em {ano}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Set(todas.flatMap((d) => d.pessoas)).size} pessoas com férias marcadas, e{" "}
                {todas.filter((d) => d.feriado).length} feriados.
              </p>
            </>
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
        <table className="w-full table-fixed border-separate [border-spacing:3px]">
          <colgroup>
            <col style={{ width: 34 }} />
            {ferias.meses.map((m) => (
              <col key={m} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="text-xs font-medium">dia</th>
              {ferias.meses.map((m) => (
                <th key={m} className="text-xs font-bold">
                  {m}/{String(ano).slice(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <tr key={d}>
                <td className="text-center text-xs font-bold">{d}</td>
                {ferias.meses.map((_, m) => {
                  if (new Date(ano, m, d).getMonth() !== m) {
                    return (
                      <td
                        key={m}
                        className="rounded-md bg-[repeating-linear-gradient(45deg,transparent_0_4px,var(--border)_4px_5px)]"
                      />
                    );
                  }
                  const dia = ferias.dias[`${m}-${d}`];
                  const pessoas = dia?.pessoas ?? [];
                  const linhas = dia?.feriado ? ["feriado", ...pessoas] : pessoas;
                  const meu = !!eu && pessoas.includes(eu);
                  const achado = !!busca && pessoas.some((p) => normalizar(p).startsWith(busca));
                  const ehHoje =
                    `${ano}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` ===
                    hoje;
                  const fundo = dia?.feriado ? "#00E000" : pessoas.length ? "#F4B6B6" : undefined;
                  const titulo = [
                    dia?.feriado ? "Feriado" : "",
                    pessoas.length ? `Férias: ${pessoas.join(" e ")}` : "",
                    !dia ? "Livre" : "",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <td key={m}>
                      <div
                        title={`${d}/${m + 1}: ${titulo}`}
                        className={[
                          "flex flex-col items-center justify-center overflow-hidden rounded-md px-0.5 text-center text-[10px] font-bold leading-tight",
                          linhas.length >= 2 ? "min-h-9 py-0.5" : "h-[22px]",
                          fundo ? "text-[#0D0F0D]" : "bg-secondary",
                          meu ? "shadow-[inset_0_0_0_2px] shadow-primary" : "",
                          achado ? "shadow-[inset_0_0_0_2px] shadow-[#2563EB]" : "",
                          busca && !achado ? "opacity-35" : "",
                          ehHoje
                            ? "outline-dashed outline-2 outline-offset-1 outline-[#2563EB]"
                            : "",
                        ].join(" ")}
                        style={fundo ? { background: fundo } : undefined}
                      >
                        {linhas.map((x, k) => (
                          <span key={k} className="max-w-full truncate">
                            {x}
                          </span>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="flex flex-wrap gap-2 text-xs">
        <span
          className="rounded-full px-2.5 py-1 font-bold text-[#0D0F0D]"
          style={{ background: "#F4B6B6" }}
        >
          Férias
        </span>
        <span
          className="rounded-full px-2.5 py-1 font-bold text-[#0D0F0D]"
          style={{ background: "#00E000" }}
        >
          Feriado
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
          Livre (ninguém escolheu)
        </span>
        {eu && (
          <span className="rounded-full px-2.5 py-1 font-bold shadow-[inset_0_0_0_2px] shadow-primary">
            Suas férias
          </span>
        )}
        <span className="rounded-full px-2.5 py-1 outline-dashed outline-2 -outline-offset-2 outline-[#2563EB]">
          Hoje
        </span>
      </div>
    </div>
  );
}
