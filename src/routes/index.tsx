import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, LineChart, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plataforma de Qualidade & Performance" },
      {
        name: "description",
        content:
          "Acompanhe qualidade, produtividade, CSAT, elegibilidade à premiação e ranking do time de CX por quinzena.",
      },
      { property: "og:title", content: "Plataforma de Qualidade & Performance" },
      {
        property: "og:description",
        content:
          "Acompanhe qualidade, produtividade, CSAT, elegibilidade à premiação e ranking do time de CX por quinzena.",
      },
    ],
  }),
  component: Landing,
});

const DESTAQUES = [
  {
    icon: LineChart,
    titulo: "Indicadores por quinzena",
    texto: "Qualidade, produtividade, CSAT, SLA e horas online em um só lugar.",
  },
  {
    icon: ShieldCheck,
    titulo: "Avaliações e contestações",
    texto: "Ficha de avaliação com critérios e pesos, e canal de contestação com prazo.",
  },
  {
    icon: Award,
    titulo: "Ranking e premiação",
    texto: "Elegibilidade transparente, ranking da quinzena e pódio com premiação.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Uso interno · CX</p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">
          Plataforma de Qualidade &amp; Performance
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Centraliza os resultados do time de atendimento por quinzena: indicadores, avaliações de
          qualidade, contestações, elegibilidade à premiação e ranking.
        </p>
        <Link
          to="/auth"
          className="mt-8 inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-colors hover:bg-primary/90"
        >
          Entrar na plataforma
        </Link>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {DESTAQUES.map((d) => (
            <div key={d.titulo} className="rounded-2xl border border-border bg-card p-6">
              <d.icon className="size-6 text-primary" />
              <h2 className="mt-4 font-display text-lg font-semibold">{d.titulo}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{d.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
