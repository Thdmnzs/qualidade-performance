import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { dataDoDia, HORA_INICIAL, hojeIso, segundaDaSemana, type Sigla } from "@/lib/escala";
import { lerFerias, lerPedidos, lerSemana, lerSiglas } from "@/lib/escala-api";

const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const ddmm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
const SITUACAO: Record<string, [string, string]> = {
  aguardando: ["em análise", "#FFF1C2"],
  aprovado: ["aprovado", "#E7F5EC"],
  recusado: ["recusado", "#FDE4E2"],
  cancelado: ["cancelado", "#E4E7E4"],
};

/** As datas em sequências ("22/11 a 29/11"): as férias marcadas na escala, agrupadas. */
function sequencias(datas: string[]): { de: string; ate: string; dias: number }[] {
  const ord = [...datas].sort();
  const saida: { de: string; ate: string; dias: number }[] = [];
  for (const d of ord) {
    const ultima = saida.at(-1);
    const ontem = new Date(`${d}T12:00:00Z`);
    ontem.setUTCDate(ontem.getUTCDate() - 1);
    if (ultima && ultima.ate === ontem.toISOString().slice(0, 10)) {
      ultima.ate = d;
      ultima.dias++;
    } else saida.push({ de: d, ate: d, dias: 1 });
  }
  return saida;
}

/** A minha semana (21/10/2026): a escala publicada da semana, um cartão por dia; e as minhas férias. */
export function MinhaSemanaEFerias({
  employeeId,
  folgaFixa,
}: {
  employeeId: string;
  folgaFixa: number[];
}) {
  const hoje = hojeIso();
  const inicio = segundaDaSemana(hoje);
  const { data: semana } = useQuery({
    queryKey: ["escala-semana", inicio],
    queryFn: () => lerSemana(inicio),
  });
  const { data: siglas = [] } = useQuery({ queryKey: ["escala-siglas"], queryFn: lerSiglas });
  const ano = Number(hoje.slice(0, 4));
  const { data: ferias } = useQuery({
    queryKey: ["ferias-do-ano", ano],
    queryFn: () => lerFerias(ano),
  });
  const { data: pedidos = [] } = useQuery({ queryKey: ["pedidos-de-ferias"], queryFn: lerPedidos });
  const porId = new Map<string, Sigla>(siglas.map((s) => [s.id, s]));
  const publicada = semana?.situacao === "publicada";
  const minhasFerias = sequencias(
    [...(ferias?.porDia.entries() ?? [])]
      .filter(([d, ps]) => d >= hoje && ps.some((p) => p.employee_id === employeeId))
      .map(([d]) => d),
  );
  const meusPedidos = pedidos.filter((p) => p.employee_id === employeeId).slice(0, 5);
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5" aria-label="A minha semana">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
            📅 A minha semana{" "}
            <span className="font-medium normal-case tracking-normal">
              · {ddmm(inicio)} a {ddmm(dataDoDia(inicio, 6))}
            </span>
          </p>
          <Link to="/escala" className="text-xs font-bold text-primary hover:underline">
            Ver a escala completa →
          </Link>
        </div>
        {!semana ? (
          <p className="mt-3 text-sm text-muted-foreground">Carregando a escala...</p>
        ) : !publicada ? (
          <p className="mt-3 text-sm text-muted-foreground">
            A escala desta semana ainda não foi publicada.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {SEMANA.map((nome, i) => {
              const dia = dataDoDia(inicio, i);
              const linha = semana.dias[i]?.find((l) => l.employee_id === semana.eu);
              const horas = linha?.horas ?? [];
              const ini = horas.findIndex(Boolean);
              const fim = horas.reduce((u, h, k) => (h ? k : u), -1);
              const siglasDoDia = horas
                .filter(Boolean)
                .map((id) => porId.get(id!)?.sigla.toLowerCase());
              const so = (s: string) => siglasDoDia.length > 0 && siglasDoDia.every((x) => x === s);
              const eHoje = dia === hoje;
              return (
                <div
                  key={dia}
                  className={`rounded-xl border p-3 text-center ${eHoje ? "border-primary shadow-[0_0_0_2px_rgb(19_164_3/15%)]" : "border-border"}`}
                >
                  <p className="text-xs font-bold">
                    {nome} {ddmm(dia)}
                    {eHoje && (
                      <span className="ml-1 rounded-full bg-[#FFF1C2] px-1.5 text-[10px] font-extrabold text-[#7A5410]">
                        hoje
                      </span>
                    )}
                  </p>
                  {ini < 0 ? (
                    <p className="mt-2 text-sm font-bold text-muted-foreground">
                      {folgaFixa.includes(i) ? "folga fixa" : "—"}
                    </p>
                  ) : so("folga") ? (
                    <p className="mt-2 text-sm font-bold text-muted-foreground">folga</p>
                  ) : so("férias") || so("ferias") ? (
                    <p className="mt-2 text-sm font-bold text-[#2B5FC9]">férias</p>
                  ) : (
                    <>
                      <p className="mt-2 text-sm font-bold">
                        {String(HORA_INICIAL + ini).padStart(2, "0")}:00 –{" "}
                        {String(HORA_INICIAL + fim + 1).padStart(2, "0")}:00
                      </p>
                      <div className="mt-2 flex h-2 overflow-hidden rounded-full" aria-hidden>
                        {horas.slice(ini, fim + 1).map((id, k) => (
                          <span
                            key={k}
                            className="flex-1"
                            style={{
                              background: id ? (porId.get(id)?.cor ?? "#E4E7E4") : "transparent",
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section
        className="rounded-2xl border border-border bg-card p-5"
        aria-label="As minhas férias"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
            🏖️ As minhas férias
          </p>
          <Link to="/escala" className="text-xs font-bold text-primary hover:underline">
            Pedir férias →
          </Link>
        </div>
        {minhasFerias.length ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            {minhasFerias.map((f) => (
              <li
                key={f.de}
                className="rounded-xl bg-[#E6EEFC] px-3 py-2 font-bold text-[#111311] dark:bg-[#16213A] dark:text-[#E6EEFC]"
              >
                {ddmm(f.de)} a {ddmm(f.ate)}{" "}
                <span className="font-medium">
                  · {f.dias} {f.dias === 1 ? "dia" : "dias"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm font-bold">Nenhuma férias marcada.</p>
        )}
        {meusPedidos.length > 0 && (
          <ul className="mt-2 space-y-1.5 text-sm" aria-label="Os meus pedidos">
            {meusPedidos.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2"
              >
                <span>
                  {ddmm(p.de)} a {ddmm(p.ate)}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-extrabold text-[#111311]"
                  style={{ background: SITUACAO[p.situacao]?.[1] }}
                >
                  {SITUACAO[p.situacao]?.[0] ?? p.situacao}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
