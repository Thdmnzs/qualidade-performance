import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { destinoAposLogin, type AbaDeLogin } from "@/lib/areas";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar · Qualidade & Performance" },
      {
        name: "description",
        content: "Acesso à plataforma interna de qualidade e performance do time de CX.",
      },
      { property: "og:title", content: "Entrar · Qualidade & Performance" },
      {
        property: "og:description",
        content: "Acesso à plataforma interna de qualidade e performance do time de CX.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [aba, setAba] = useState<AbaDeLogin>("colaborador");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  // Já logado: vai para a área padrão do perfil.
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: perfil } = await supabase.rpc("meu_perfil");
      if (perfil) navigate({ to: destinoAposLogin(perfil, "colaborador").para, replace: true });
    });
  }, [navigate]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    });
    if (error) {
      setCarregando(false);
      toast.error(mensagemDeLogin(error.code));
      return;
    }
    // A aba escolhe a área de entrada; o perfil decide se ela está disponível.
    const { data: perfil, error: erroPerfil } = await supabase.rpc("meu_perfil");
    setCarregando(false);
    if (erroPerfil || !perfil) {
      toast.error("Não foi possível carregar o seu perfil. Tente novamente.");
      return;
    }
    const destino = destinoAposLogin(perfil, aba);
    if (destino.aviso) toast.info(destino.aviso);
    navigate({ to: destino.para, replace: true });
  }

  return (
    // Visual inspirado no login da fluke: cartão claro sobre o fundo escuro da plataforma.
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative w-full max-w-[420px] rounded-2xl bg-white px-8 pb-8 pt-10 text-slate-900 shadow-2xl shadow-black/40">
        <img
          src="/logo-fluke.png"
          alt="fluke"
          width={180}
          height={48}
          className="mx-auto h-12 w-auto"
        />
        <p className="mt-3 text-center text-sm text-slate-500">Qualidade &amp; Performance</p>

        {/* A aba decide a área de entrada (multiacesso do avaliador). */}
        <div
          role="tablist"
          aria-label="Área de entrada"
          className="mt-8 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
        >
          {(["colaborador", "avaliador"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={aba === t}
              onClick={() => setAba(t)}
              className={cn(
                "rounded-md py-1.5 text-sm font-medium capitalize transition-colors",
                aba === t
                  ? "bg-white text-green-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={entrar} className="mt-6 space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-slate-800">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={campo}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="senha" className="block text-sm font-medium text-slate-800">
              Senha
            </label>
            <div className="relative">
              <input
                id="senha"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                className={cn(campo, "pr-11")}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={mostrarSenha}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800"
              >
                {mostrarSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-lg bg-green-700 py-3 text-sm font-semibold text-white shadow-lg shadow-green-700/30 transition-colors hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          ou
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Não há redefinição automática: só o ADM gera links de senha (regra da etapa 2). */}
        <button
          type="button"
          onClick={() =>
            toast.info(
              "Peça a um administrador um link de redefinição de senha. Ele gera o link na tela de Colaboradores.",
            )
          }
          className="mx-auto block text-sm font-medium text-green-700 hover:underline"
        >
          Esqueci minha senha
        </button>
      </div>
    </div>
  );
}

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-green-700/20";

/**
 * Mensagem por motivo. Para credenciais erradas, a mensagem é propositalmente
 * genérica: dizer "e-mail não existe" ajudaria alguém a descobrir contas válidas.
 */
function mensagemDeLogin(codigo: string | undefined): string {
  switch (codigo) {
    case "user_banned":
      return "Seu acesso está desativado. Procure um administrador.";
    case "email_not_confirmed":
      return "Seu acesso ainda não foi ativado. Use o link de convite enviado pela administração.";
    case "over_request_rate_limit":
      return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
    default:
      return "Não foi possível entrar. Verifique e-mail e senha.";
  }
}
