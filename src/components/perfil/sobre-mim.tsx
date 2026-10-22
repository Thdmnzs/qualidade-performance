import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { hojeIso } from "@/lib/escala";
import { diasComHumor, NIVEIS_DO_HUMOR, nivelDoHumor } from "@/lib/humor";
import {
  lerMeuHorario,
  lerMeusHumores,
  lerMeusNucleos,
  lerMinhaFolgaFixa,
  registrarHumor,
} from "@/lib/perfil-api";

const NOMES_DOS_NUCLEOS: Record<string, [string, string]> = {
  rede: ["Rede", "#C9DEFF"],
  cxtech: ["CX Tech", "#D9CCFF"],
  quali: ["Qualidade", "#FFC7DA"],
  log: ["Logística", "#BCEBEB"],
  "F&R": ["Fraude e Risco", "#F5C2C2"],
  "cob B2B": ["Cobrança B2B", "#D8F0A8"],
  auto: ["Automação", "#FFE38A"],
};
const DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const hora = (h: number | null | undefined) =>
  h == null ? "" : `${String(h).padStart(2, "0")}:00`;
const lista = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`;

/**
 * O "Sobre mim" (21/10/2026): os núcleos, o horário de trabalho e a folga fixa da própria pessoa; e o termômetro do
 * humor (só a pessoa e a supervisão veem).
 */
export function SobreMim({ employeeId }: { employeeId: string }) {
  const { data: nucleos = [] } = useQuery({ queryKey: ["meus-nucleos"], queryFn: lerMeusNucleos });
  const { data: horario = null } = useQuery({ queryKey: ["meu-horario"], queryFn: lerMeuHorario });
  const { data: folga = [] } = useQuery({
    queryKey: ["minha-folga-fixa", employeeId],
    queryFn: () => lerMinhaFolgaFixa(employeeId),
  });
  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="Sobre mim">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
        👤 Sobre mim
      </p>
      <dl className="mt-3 space-y-4 text-sm">
        <div>
          <dt className="text-xs font-bold text-muted-foreground">Os meus núcleos</dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {nucleos.length ? (
              nucleos.map((n) => (
                <span
                  key={n}
                  className="rounded-full px-2.5 py-1 text-xs font-extrabold text-[#111311]"
                  style={{ background: NOMES_DOS_NUCLEOS[n]?.[1] ?? "#E4E7E4" }}
                >
                  {n} · {NOMES_DOS_NUCLEOS[n]?.[0] ?? n}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">a supervisão ainda não marcou</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-muted-foreground">O meu horário de trabalho</dt>
          <dd className="mt-0.5 font-bold">
            {horario?.entrada != null ? (
              <>
                {hora(horario.entrada)} às {hora(horario.saida)}
                {horario.pausa != null && (
                  <span className="font-medium text-muted-foreground">
                    {" "}
                    · pausa às {hora(horario.pausa)}
                  </span>
                )}
              </>
            ) : (
              <span className="font-medium text-muted-foreground">
                a supervisão ainda não definiu
              </span>
            )}
          </dd>
          {horario?.fds_dias?.length ? (
            <dd className="mt-0.5 text-xs text-muted-foreground">
              No fim de semana ({lista(horario.fds_dias.map((d) => DIAS[d]!))}):{" "}
              {hora(horario.fds_entrada)} às {hora(horario.fds_saida)}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-xs font-bold text-muted-foreground">A minha folga fixa</dt>
          <dd className="mt-0.5 font-bold">
            {folga.length ? (
              lista([...folga].sort().map((d) => DIAS[d]!))
            ) : (
              <span className="font-medium text-muted-foreground">nenhuma</span>
            )}
          </dd>
        </div>
      </dl>
      <Termometro />
    </section>
  );
}

/** O termômetro do humor: uma marca por dia (que pode ser trocada até o fim do dia), e o comentário opcional. */
function Termometro() {
  const qc = useQueryClient();
  const hoje = hojeIso();
  const { data: registros = [] } = useQuery({
    queryKey: ["meus-humores"],
    queryFn: () => lerMeusHumores(7),
  });
  const deHoje = registros.find((r) => r.dia === hoje);
  const [nivel, setNivel] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (deHoje) {
      setNivel(deHoje.nivel);
      setComentario(deHoje.comentario ?? "");
    }
  }, [deHoje?.nivel, deHoje?.comentario]); // eslint-disable-line react-hooks/exhaustive-deps -- só quando o registro de hoje chega
  async function registrar() {
    if (nivel == null) return;
    setSalvando(true);
    try {
      await registrarHumor(nivel, comentario);
      toast.success(
        `Registrado: ${nivelDoHumor(nivel)!.emoji} ${nivelDoHumor(nivel)!.nome}. Dá para trocar até o fim do dia.`,
      );
      await qc.invalidateQueries({ queryKey: ["meus-humores"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }
  return (
    <div className="mt-5 border-t border-border pt-4" aria-label="Como você está hoje">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
        🌡️ Como você está hoje?
      </p>
      <div
        className="mt-3 grid grid-cols-5 gap-1.5"
        role="radiogroup"
        aria-label="Como você está hoje"
      >
        {NIVEIS_DO_HUMOR.map((n) => (
          <button
            key={n.nivel}
            type="button"
            role="radio"
            aria-checked={nivel === n.nivel}
            aria-label={n.nome}
            onClick={() => setNivel(n.nivel)}
            className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 text-[10px] font-bold ${nivel === n.nivel ? "border-primary text-[#111311]" : "border-border"}`}
            style={nivel === n.nivel ? { background: n.cor } : undefined}
          >
            <span className="text-2xl" aria-hidden>
              {n.emoji}
            </span>
            {n.nome}
          </button>
        ))}
      </div>
      <textarea
        aria-label="Quer contar mais? (opcional)"
        maxLength={280}
        rows={2}
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Quer contar mais? (opcional)"
        className="mt-3 w-full rounded-xl border border-input bg-background p-2.5 text-sm"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>🔒 Só você e a supervisão veem.</span>
        <span>{comentario.length}/280</span>
      </div>
      <Button className="mt-2 w-full" disabled={nivel == null || salvando} onClick={registrar}>
        {salvando ? "Registrando..." : deHoje ? "Atualizar o de hoje" : "Registrar"}
      </Button>
      <p className="mt-4 text-xs font-bold text-muted-foreground">Os seus últimos 7 dias</p>
      <div className="mt-1.5 flex gap-1.5" aria-label="Os seus últimos 7 dias">
        {diasComHumor(hoje, 7, registros).map((d) => (
          <span
            key={d.dia}
            title={`${d.dia.slice(8)}/${d.dia.slice(5, 7)}`}
            className="flex size-9 items-center justify-center rounded-lg bg-secondary text-xl"
          >
            {nivelDoHumor(d.nivel)?.emoji ?? (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
