const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ddmm = (s: string) => `${s.slice(8)}/${s.slice(5, 7)}`;
const diaDaSemana = (s: string) => SEMANA[new Date(`${s}T12:00:00Z`).getUTCDay()];

/** Um dia somado de n dias ("2026-10-18", -1 → "2026-10-17"). */
export const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * O filtro do dia (16/10/2026; compartilhado com a supervisão em 20/10/2026): as setas ‹ ›, o campo de
 * data (até ontem) e o atalho "Ontem". O colaborador e a supervisão usam esta mesma peça.
 */
export function FiltroDoDia({
  dia,
  ontem,
  aoMudar,
  semDados,
}: {
  dia: string;
  ontem: string;
  aoMudar: (d: string) => void;
  semDados?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="O dia dos indicadores">
      <span className="text-sm font-bold">O dia:</span>
      <button
        type="button"
        aria-label="O dia anterior"
        onClick={() => aoMudar(somarDias(dia, -1))}
        className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-lg font-bold"
      >
        ‹
      </button>
      <input
        type="date"
        aria-label="Escolher o dia"
        value={dia}
        max={ontem}
        onChange={(e) => e.target.value && aoMudar(e.target.value > ontem ? ontem : e.target.value)}
        className="h-9 rounded-lg border border-input bg-background px-2 text-sm font-bold"
      />
      <button
        type="button"
        aria-label="O dia seguinte"
        disabled={dia >= ontem}
        onClick={() => aoMudar(somarDias(dia, 1))}
        className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-lg font-bold disabled:opacity-40"
      >
        ›
      </button>
      {dia !== ontem && (
        <button
          type="button"
          onClick={() => aoMudar(ontem)}
          className="h-9 rounded-full border border-border bg-card px-3 text-sm font-bold"
        >
          Ontem
        </button>
      )}
      <span className="text-sm text-muted-foreground">
        {dia === ontem ? "ontem, " : ""}
        {diaDaSemana(dia)} {ddmm(dia)}
        {semDados ? " · sem dados neste dia" : ""}
      </span>
    </div>
  );
}
