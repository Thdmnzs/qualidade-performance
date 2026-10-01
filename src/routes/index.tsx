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
    // Mesma identidade da tela de login: imagem de fundo, cartão branco e o verde da fluke.
    // Cor escura FIXA por baixo enquanto a imagem carrega: esta tela não usa o tema da área logada.
    <div className="min-h-screen bg-[oklch(0.16_0.008_250)] bg-[url('/login-fundo.jpg')] bg-cover bg-fixed bg-center px-4 py-12 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-2xl bg-white px-8 py-10 text-slate-900 shadow-2xl shadow-black/40 sm:px-12 sm:py-14">
          <img src="/logo-fluke.png" alt="fluke" width={180} height={48} className="h-10 w-auto" />
          <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-green-700">
            Uso interno · CX
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-5xl">
            Plataforma de Qualidade &amp; Performance
          </h1>
          <p className="mt-4 max-w-2xl text-slate-600">
            Centraliza os resultados do time de atendimento por quinzena: indicadores, avaliações de
            qualidade, contestações, elegibilidade à premiação e ranking.
          </p>
          <Link
            to="/auth"
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-green-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-700/30 transition-colors hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
          >
            Entrar na plataforma
          </Link>
        </section>

        {/* Destaques translúcidos: o cartão branco continua sendo o foco. */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {DESTAQUES.map((d) => (
            <div
              key={d.titulo}
              className="rounded-2xl border border-white/15 bg-white/10 p-6 text-white backdrop-blur-md"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-white">
                <d.icon className="size-5 text-green-700" aria-hidden="true" />
              </span>
              <h2 className="mt-4 font-display text-lg font-semibold">{d.titulo}</h2>
              <p className="mt-2 text-sm text-white/75">{d.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
