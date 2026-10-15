import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { inicioDoPerfil } from "@/lib/areas";
import { lerCodigoDoLink, type TipoDoLink } from "@/lib/link-de-acesso";
import { REGRAS_SENHA, senhaAtendeRegras } from "@/lib/senha";
import { conferirPrefixoDeSenhaFn } from "@/lib/senha.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  apareceEmVazamentos,
  prefixoESufixo,
  TEXTO_DA_SITUACAO,
  type SituacaoDaSenha,
} from "@/lib/senha-vazada";

export const Route = createFileRoute("/definir-senha")({
  // A sessão vem no fragmento da URL (#access_token=...), que só existe no navegador.
  ssr: false,
  head: () => ({
    meta: [{ title: "Definir senha · CX Hub" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DefinirSenha,
});

type Estado =
  | { fase: "verificando" }
  | { fase: "confirmar"; codigo: string; tipo: TipoDoLink }
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
      ? "Este link expirou ou já foi usado. Peça um novo link a um administrador."
      : "Este link é inválido. Peça um novo link a um administrador.";
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
      return "Sua sessão expirou. Peça um novo link a um administrador.";
    default:
      return "Não foi possível salvar a senha. Tente novamente.";
  }
}

function DefinirSenha() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" });
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  // A conferência de senhas vazadas (a senha nunca sai do navegador; só 5 caracteres do código).
  const [vazamento, setVazamento] = useState<SituacaoDaSenha | null>(null);
  const conferirPrefixo = useServerFn(conferirPrefixoDeSenhaFn);
  const [salvando, setSalvando] = useState(false);

  const [continuando, setContinuando] = useState(false);

  useEffect(() => {
    // Link novo: o código está no fragmento e só é usado no clique em "Continuar".
    const novo = lerCodigoDoLink(window.location.hash);
    if (novo) {
      setEstado({ fase: "confirmar", ...novo });
      return;
    }
    // Link antigo (gerado antes de 07/10/2026): a sessão já vem no fragmento.
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
          mensagem: "Este link é inválido ou já foi usado. Peça um novo link a um administrador.",
        });
        return;
      }
      setEstado({ fase: "pronto", email, tipo });
    });
  }, []);

  async function continuar() {
    if (estado.fase !== "confirmar") return;
    setContinuando(true);
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: estado.codigo,
      type: estado.tipo,
    });
    // O código não fica no endereço depois de usado (nem no histórico do navegador).
    window.history.replaceState(null, "", window.location.pathname);
    setContinuando(false);
    const email = data.session?.user.email;
    if (error || !email) {
      setEstado({
        fase: "invalido",
        mensagem: "Este link expirou ou já foi usado. Peça um novo link a um administrador.",
      });
      return;
    }
    setEstado({ fase: "pronto", email, tipo: estado.tipo === "invite" ? "convite" : "senha" });
  }

  const regrasOk = senhaAtendeRegras(senha);
  useEffect(() => {
    if (!regrasOk) {
      setVazamento(null);
      return;
    }
    setVazamento("conferindo");
    let valendo = true; // a pessoa continuou digitando? A resposta atrasada não vale para a senha nova.
    const espera = setTimeout(async () => {
      try {
        const { prefixo, sufixo } = await prefixoESufixo(senha);
        const { resposta } = await conferirPrefixo({ data: { prefixo } });
        if (!valendo) return;
        setVazamento(
          resposta === null
            ? "indisponivel"
            : apareceEmVazamentos(sufixo, resposta)
              ? "vazada"
              : "segura",
        );
      } catch {
        if (valendo) setVazamento("indisponivel");
      }
    }, 500);
    return () => {
      valendo = false;
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconfere só quando a senha muda
  }, [senha, regrasOk]);
  // Só salva com as regras cumpridas e a senha fora dos vazamentos (ou com o serviço fora do ar).
  const senhaValida = regrasOk && (vazamento === "segura" || vazamento === "indisponivel");
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
    // Primeiro acesso entra pela área do colaborador (o ADM vai direto para a gestão).
    navigate({
      to: perfil ? inicioDoPerfil(perfil) : "/painel",
      replace: true,
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-primary">CX Hub</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-glow">
          {estado.fase === "verificando" && (
            <p className="text-center text-sm text-muted-foreground">Verificando o link...</p>
          )}

          {estado.fase === "confirmar" && (
            <div className="space-y-4 text-center">
              <h2 className="font-display text-xl font-semibold">
                {estado.tipo === "invite"
                  ? "Você foi convidado(a) para o CX Hub"
                  : "Definir uma nova senha"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {estado.tipo === "invite"
                  ? "Clique em continuar para criar a sua senha de acesso."
                  : "Clique em continuar para escolher a sua nova senha."}{" "}
                Este link pode ser usado uma vez só, e por poucos minutos.
              </p>
              <Button type="button" className="w-full" disabled={continuando} onClick={continuar}>
                {continuando ? "Verificando..." : "Continuar"}
              </Button>
            </div>
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
                {vazamento && (
                  <li
                    className={`flex items-center gap-2 ${
                      vazamento === "segura"
                        ? "text-primary"
                        : vazamento === "vazada"
                          ? "font-medium text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {vazamento === "segura" ? (
                      <Check className="size-3.5" />
                    ) : vazamento === "vazada" ? (
                      <X className="size-3.5" />
                    ) : (
                      <span className="size-3.5" />
                    )}
                    {TEXTO_DA_SITUACAO[vazamento]}
                  </li>
                )}
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
