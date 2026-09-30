import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { REGRAS_SENHA, senhaAtendeRegras } from "@/lib/senha";

export const Route = createFileRoute("/definir-senha")({
  // A sessão vem no fragmento da URL (#access_token=...), que só existe no navegador.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Definir senha · Qualidade & Performance" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DefinirSenha,
});

type Estado =
  | { fase: "verificando" }
  | { fase: "invalido"; mensagem: string }
  | { fase: "pronto"; email: string; tipo: "convite" | "senha" };

/**
 * O Supabase devolve erros do link na própria URL (ex.: error_code=otp_expired).
 * Lemos antes de inicializar a sessão, para dar uma mensagem específica.
 */
function lerLinkDaUrl() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const busca = new URLSearchParams(window.location.search);
  const codigoErro = hash.get("error_code") ?? busca.get("error_code");
  const temErro = codigoErro || hash.get("error") || busca.get("error");
  const tipo: "convite" | "senha" = hash.get("type") === "invite" ? "convite" : "senha";

  if (!temErro) return { erro: null, tipo };
  const erro =
    codigoErro === "otp_expired"
      ? "Este link expirou ou já foi usado. Peça um novo link ao seu gestor."
      : "Este link é inválido. Peça um novo link ao seu gestor.";
  return { erro, tipo };
}

function traduzirErroDeSenha(error: { code?: string | undefined }): string {
  switch (error.code) {
    case "weak_password":
      return "A senha não atende à política de segurança. Confira os requisitos abaixo.";
    case "same_password":
      return "A nova senha precisa ser diferente da anterior.";
    case "session_expired":
    case "session_not_found":
      return "Sua sessão expirou. Peça um novo link ao seu gestor.";
    default:
      return "Não foi possível salvar a senha. Tente novamente.";
  }
}

function DefinirSenha() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" });
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const { erro, tipo } = lerLinkDaUrl();
    if (erro) {
      setEstado({ fase: "invalido", mensagem: erro });
      return;
    }
    // getSession() aguarda o cliente processar o token do link (detectSessionInUrl).
    supabase.auth.getSession().then(({ data, error }) => {
      const email = data.session?.user.email;
      if (error || !email) {
        setEstado({
          fase: "invalido",
          mensagem: "Este link é inválido ou já foi usado. Peça um novo link ao seu gestor.",
        });
        return;
      }
      setEstado({ fase: "pronto", email, tipo });
    });
  }, []);

  const senhaValida = senhaAtendeRegras(senha);
  const confere = senha.length > 0 && senha === confirmacao;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!senhaValida || !confere) return;
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setSalvando(false);
      toast.error(traduzirErroDeSenha(error));
      return;
    }
    toast.success("Senha definida. Bem-vindo(a)!");
    const { data: perfil } = await supabase.rpc("meu_perfil");
    navigate({ to: perfil === "adm" || perfil === "gestor" ? "/admin" : "/painel", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-primary">
            Qualidade &amp; Performance
          </h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-glow">
          {estado.fase === "verificando" && (
            <p className="text-center text-sm text-muted-foreground">Verificando o link...</p>
          )}

          {estado.fase === "invalido" && (
            <div className="space-y-4 text-center">
              <h2 className="font-display text-xl font-semibold">Link indisponível</h2>
              <p className="text-sm text-muted-foreground">{estado.mensagem}</p>
              <Link to="/auth" className="inline-block text-sm text-primary hover:underline">
                Ir para o login
              </Link>
            </div>
          )}

          {estado.fase === "pronto" && (
            <form onSubmit={salvar} className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  {estado.tipo === "convite" ? "Crie sua senha" : "Defina uma nova senha"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Acesso de <span className="text-foreground">{estado.email}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha">Nova senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  aria-describedby="regras-senha"
                  required
                />
              </div>

              <ul id="regras-senha" className="space-y-1 text-xs" aria-live="polite">
                {REGRAS_SENHA.map((regra) => {
                  const ok = regra.atende(senha);
                  return (
                    <li
                      key={regra.id}
                      className={`flex items-center gap-2 ${ok ? "text-primary" : "text-muted-foreground"}`}
                    >
                      {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      {regra.texto}
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-2">
                <Label htmlFor="confirmacao">Confirme a senha</Label>
                <Input
                  id="confirmacao"
                  type="password"
                  autoComplete="new-password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  required
                />
                {confirmacao.length > 0 && !confere && (
                  <p className="text-xs text-destructive">As senhas não conferem.</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={!senhaValida || !confere || salvando}
              >
                {salvando ? "Salvando..." : "Salvar senha e entrar"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
