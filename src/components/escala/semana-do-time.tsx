import { useMemo, useState } from "react";

import { AvisoDeFeriado, Chip, Legenda } from "@/components/escala/comum";
import {
  blocosDoDia,
  celulasDaLinha,
  dataCurta,
  dataDoDia,
  DIAS_DA_SEMANA,
  DIAS_POR_EXTENSO,
  HORAS,
  hojeIso,
  horasDeTrabalho,
  nomeCurto,
  type DiasDaSemana,
  type LinhaDoDia,
  type Sigla,
} from "@/lib/escala";

/** A semana como o time vê: o "Time" (a grade de todos) e o "Meu dia" (só a própria escala). */
/** Uma lista vazia FIXA: `?? []` criaria uma nova a cada desenho, e o React recalcularia à toa. */
const SEM_LINHAS: LinhaDoDia[] = [];

export function SemanaDoTime({
  inicio,
  dias,
  feriados,
  eu,
  siglas,
  diaInicial,
}: {
  inicio: string;
  dias: DiasDaSemana;
  feriados: string[];
  eu: string | null;
  siglas: Map<string, Sigla>;
  diaInicial?: number;
}) {
  const hoje = hojeIso();
  const indiceDeHoje = Array.from({ length: 7 }, (_, i) => dataDoDia(inicio, i)).indexOf(hoje);
  const [dia, setDia] = useState(diaInicial ?? Math.max(0, indiceDeHoje));
  const [visao, setVisao] = useState<"time" | "meu">("time");
  const linhas = dias[dia] ?? SEM_LINHAS;
  const todos = useMemo(() => [...new Set(dias.flat().map((l) => l.nome))], [dias]);
  const data = dataDoDia(inicio, dia);
  const feriado = feriados.includes(data);
  const estouNaSemana = !!eu && dias.some((d) => d.some((l) => l.employee_id === eu));
  const visaoAtual = estouNaSemana ? visao : "time";
  const presentes = useMemo(() => {
    const ids = new Set(linhas.flatMap((l) => l.horas).filter(Boolean) as string[]);
    return [...siglas.values()].filter((s) => ids.has(s.id));
  }, [linhas, siglas]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Dia">
        {DIAS_DA_SEMANA.map((d, i) => {
          const dt = dataDoDia(inicio, i);
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={i === dia}
              onClick={() => setDia(i)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${i === dia ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
            >
              <b>{d}</b> {dataCurta(dt)}
              {dt === hoje && <span className="ml-1 text-[10px]">· hoje</span>}
              {feriados.includes(dt) && (
                <span className="ml-1 rounded-full bg-warning/25 px-1.5 py-0.5 text-[10px] font-bold">
                  🎉 feriado
                </span>
              )}
            </button>
          );
        })}
      </div>

      {feriado && (
        <AvisoDeFeriado>
          <b>
            🎉 {DIAS_POR_EXTENSO[dia]}, {dataCurta(data)}, é feriado.
          </b>{" "}
          A escala é de equipe reduzida: trabalha só quem está listado. Se você não está na lista,
          bom descanso!
        </AvisoDeFeriado>
      )}

      {estouNaSemana && (
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
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém do time está escalado neste dia.</p>
        ) : visaoAtual === "meu" ? (
          <MeuDia
            linha={linhas.find((l) => l.employee_id === eu)}
            siglas={siglas}
            feriado={feriado}
          />
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-0">
            <colgroup>
              <col style={{ width: 92 }} />
              <col style={{ width: 28 }} />
              {HORAS.map((h) => (
                <col key={h} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="pb-1 text-left text-xs font-medium">Analista</th>
                <th className="pb-1 text-xs font-medium">h</th>
                {HORAS.map((h) => (
                  <th key={h} className="pb-1 text-[11px] font-bold">
                    {h}h
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const minha = l.employee_id === eu;
                const fundo = i % 2 ? "bg-secondary/70" : "";
                const celulas = celulasDaLinha(l.horas, siglas);
                return (
                  <tr key={l.employee_id}>
                    <td
                      className={`truncate rounded-l-[10px] py-[7px] pl-2.5 text-sm font-bold ${fundo} ${minha ? "text-primary" : ""}`}
                      title={l.nome}
                    >
                      {nomeCurto(l.nome, todos)}
                      {minha && <span className="ml-1 text-[10px]">(você)</span>}
                    </td>
                    <td className={`py-[7px] text-center text-xs ${fundo}`}>
                      {horasDeTrabalho(l.horas, siglas) || "–"}
                    </td>
                    {celulas.map((c, k) => {
                      const s = c.sigla ? siglas.get(c.sigla) : undefined;
                      return (
                        <td
                          key={k}
                          colSpan={c.colunas}
                          title={s ? s.significado : "fora do horário"}
                          className={`px-px py-[7px] ${fundo} ${k === celulas.length - 1 ? "rounded-r-[10px]" : ""}`}
                        >
                          {s && (
                            <Chip
                              sigla={s}
                              longo={s.sigla.length >= 6 && c.colunas === 1}
                              destaque={minha}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <Legenda siglas={presentes} />
    </div>
  );
}

/** O dia da própria pessoa (as horas e os blocos). A Visão geral também usa esta peça (20/10/2026). */
export function MeuDia({
  linha,
  siglas,
  feriado,
}: {
  linha: { horas: (string | null)[] } | undefined;
  siglas: Map<string, Sigla>;
  feriado: boolean;
}) {
  if (!linha || !linha.horas.some(Boolean)) {
    return (
      <p className="text-sm text-muted-foreground">
        Você não está escalado(a) neste {feriado ? "feriado" : "dia"}.
      </p>
    );
  }
  return (
    <div>
      <p className="text-sm font-bold">
        Seu dia: {horasDeTrabalho(linha.horas, siglas)} horas de trabalho
      </p>
      <ul className="mt-4 space-y-3">
        {blocosDoDia(linha.horas).map((b, i) => {
          const s = siglas.get(b.sigla);
          if (!s) return null;
          return (
            <li key={i} className="flex items-center gap-3">
              <span className="w-24 text-sm font-bold">
                {b.de}h às {b.ate}h
              </span>
              <span className="w-16">
                <Chip sigla={s} />
              </span>
              <span className="text-sm">{s.significado}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
