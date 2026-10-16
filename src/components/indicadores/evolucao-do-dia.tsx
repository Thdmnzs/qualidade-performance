/**
 * O dia a dia de um indicador na quinzena (15/10/2026): uma linha, com a meta tracejada, e cada dia em
 * verde (na meta) ou vermelho (fora). Passando o mouse num ponto, aparece o dia e o valor.
 */
export function EvolucaoDoDia({
  titulo,
  pontos,
  meta,
  menorMelhor,
  formatar,
}: {
  titulo: string;
  pontos: { dia: string; valor: number | null }[];
  meta: number | null;
  menorMelhor: boolean;
  formatar: (v: number) => string;
}) {
  const vals = pontos.filter((p): p is { dia: string; valor: number } => p.valor != null);
  if (!vals.length)
    return <p className="text-xs text-muted-foreground">{titulo}: sem dados ainda.</p>;
  const w = 260,
    h = 56,
    n = vals.length;
  const max = Math.max(...vals.map((p) => p.valor), meta ?? 0) * 1.1 || 1;
  const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 10) + 5);
  const y = (v: number) => h - 6 - (v / max) * (h - 12);
  const ok = (v: number) => meta == null || (menorMelhor ? v <= meta : v >= meta);
  return (
    <div>
      <p className="text-xs font-bold">{titulo}</p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label={`${titulo}: o dia a dia na quinzena`}
      >
        {meta != null && (
          <line
            x1={0}
            x2={w}
            y1={y(meta)}
            y2={y(meta)}
            stroke="#13A403"
            strokeDasharray="4 3"
            strokeWidth={1}
          />
        )}
        <polyline
          points={vals.map((p, i) => `${x(i)},${y(p.valor)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        />
        {vals.map((p, i) => (
          <circle
            key={p.dia}
            cx={x(i)}
            cy={y(p.valor)}
            r={3}
            fill={ok(p.valor) ? "#13A403" : "#DC2626"}
          >
            <title>{`${p.dia.slice(8)}/${p.dia.slice(5, 7)}: ${formatar(p.valor)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
