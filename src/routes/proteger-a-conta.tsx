import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { destinoSeguro, MolduraDaVerificacao } from "@/components/verificacao/moldura";
import { supabase } from "@/integrations/supabase/client";
import { destinoDaVerificacao } from "@/lib/verificacao";
import { gerarCodigosDeRecuperacaoFn } from "@/lib/verificacao.functions";

export const Route = createFileRoute("/proteger-a-conta")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ para: destinoSeguro(s["para"]) }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (destinoDaVerificacao(nivel) === "verificar")
      throw redirect({ to: "/verificar", search: { para: search.para } });
    // "ok" também fica aqui: logo depois de confirmar o código, a sessão já é "aal2", e ainda faltam os códigos.
  },
  head: () => ({ meta: [{ title: "Proteja a sua conta · CX Hub" }] }),
  component: Proteger,
});

type Cadastro = { id: string; qr: string; chave: string };

/**
 * O cadastro obrigatório da verificação em duas etapas (21/10/2026): o QR code (ou a chave em texto), o primeiro
 * código, e os 10 códigos de recuperação, mostrados uma vez só. Sem isso, a pessoa não entra no CX Hub.
 */
function Proteger() {
  const { para } = Route.useSearch();
  const gerar = useServerFn(gerarCodigosDeRecuperacaoFn);
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [guardei, setGuardei] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Um cadastro que ficou pela metade (sem o primeiro código) é desfeito antes, para começar limpo.
      const { data: fatores } = await supabase.auth.mfa.listFactors();
      for (const f of fatores?.all ?? [])
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "CX Hub",
        issuer: "CX Hub",
      });
      if (!vivo) return;
      if (error || !data)
        return setFalhou("Não foi possível começar o cadastro agora. Recarregue a página.");
      setCadastro({ id: data.id, qr: data.totp.qr_code, chave: data.totp.secret });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function ativar(e: React.FormEvent) {
    e.preventDefault();
    if (!cadastro) return;
    setErro(null);
    setEnviando(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: cadastro.id,
        code: codigo,
      });
      if (error) {
        setErro(
          "O código não confere. Confira o horário do celular e digite o código que está aparecendo agora.",
        );
        setCodigo("");
        return;
      }
      setCodigos(await gerar());
    } catch (e) {
      setErro((e as Error).message || "Não foi possível concluir agora.");
    } finally {
      setEnviando(false);
    }
  }

  const texto = () =>
    `CX Hub · os códigos de recuperação\nCada código vale uma vez só.\n\n${codigos!.join("\n")}\n`;
  function baixar() {
    const url = URL.createObjectURL(new Blob([texto()], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "cx-hub-codigos-de-recuperacao.txt",
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (codigos)
    return (
      <MolduraDaVerificacao>
        <p className="text-3xl">🗝️</p>
        <h2 className="mt-2 font-display text-2xl font-bold">
          Guarde os seus códigos de recuperação
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Se você perder ou trocar o celular, um destes códigos deixa você entrar e cadastrar o
          novo. Cada um vale <b>uma vez só</b>. Eles aparecem <b>só agora</b>: guarde num lugar
          seguro (anotado, impresso ou num cofre de senhas).
        </p>
        <ul
          className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-secondary p-4 font-mono text-base font-bold"
          aria-label="Os códigos de recuperação"
        >
          {codigos.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigator.clipboard.writeText(texto()).then(() => toast.success("Copiados."))
            }
          >
            📋 Copiar
          </Button>
          <Button variant="outline" size="sm" onClick={baixar}>
            ⬇️ Baixar (.txt)
          </Button>
        </div>
        <label className="mt-5 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[#00700A]"
            checked={guardei}
            onChange={(e) => setGuardei(e.target.checked)}
          />
          Guardei os códigos num lugar seguro.
        </label>
        <div className="mt-5 flex justify-end">
          <Button disabled={!guardei} onClick={() => window.location.assign(para)}>
            Entrar no CX Hub
          </Button>
        </div>
      </MolduraDaVerificacao>
    );

  return (
    <MolduraDaVerificacao>
      <p className="text-3xl">🔐</p>
      <h2 className="mt-2 font-display text-2xl font-bold">Proteja a sua conta</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        O CX Hub pede a verificação em duas etapas: além da senha, um código do seu celular. É uma
        vez só, e leva 2 minutos.
      </p>
      {falhou ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {falhou}
        </p>
      ) : (
        <form onSubmit={ativar} className="mt-5 space-y-5 text-sm">
          <Passo n={1} titulo="Instale um aplicativo autenticador">
            O Google Authenticator, o Microsoft Authenticator ou o Authy (todos gratuitos). Se já
            tiver um, use o mesmo.
          </Passo>
          <Passo n={2} titulo="No aplicativo, adicione uma conta e escaneie o QR code">
            {cadastro ? (
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <img
                  src={cadastro.qr}
                  alt="O QR code do cadastro"
                  className="size-44 rounded-xl bg-white p-2"
                />
                <div className="text-xs text-muted-foreground">
                  Sem câmera? Digite esta chave no aplicativo:
                  <p className="mt-1 break-all rounded-lg bg-secondary px-2 py-1 font-mono text-sm font-bold text-foreground">
                    {cadastro.chave}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-muted-foreground">Preparando o QR code...</p>
            )}
          </Passo>
          <Passo n={3} titulo="Digite o código de 6 dígitos que aparece no aplicativo">
            <Input
              aria-label="O código de 6 dígitos"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              className="mt-2 h-12 text-center text-2xl font-bold tracking-[0.5em]"
            />
          </Passo>
          {erro && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {erro}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={!cadastro || codigo.length !== 6 || enviando}>
              {enviando ? "Ativando..." : "Ativar"}
            </Button>
          </div>
        </form>
      )}
    </MolduraDaVerificacao>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{titulo}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
