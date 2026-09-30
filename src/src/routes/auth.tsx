import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-primary">
            Qualidade &amp; Performance
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Plataforma interna do time de CX. Acesse com suas credenciais.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-glow">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
            {(["colaborador", "avaliador"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setAba(t)}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium capitalize transition-colors",
                  aba === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <form onSubmit={entrar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail corporativo</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={carregando}>
              {carregando ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Os acessos são criados pela administração. Em caso de problema, procure um
            administrador.
          </p>
        </div>
      </div>
    </div>
  );
}

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
