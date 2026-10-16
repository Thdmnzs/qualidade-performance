import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { RegrasDaSenha } from "@/components/senha/regras-da-senha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConferenciaDeVazamento } from "@/hooks/use-conferencia-de-vazamento";
import { supabase } from "@/integrations/supabase/client";
import { problemaDaTroca } from "@/lib/senha";
import { alterarMinhaSenhaFn } from "@/lib/senha.functions";

/**
 * Alterar a senha (16/10/2026), no Editar perfil: a senha atual, a nova (com as mesmas regras e a mesma
 * conferência de vazamento da primeira senha) e a confirmação. A troca é feita no servidor, que confere
 * a senha atual. Depois dela, as outras sessões da pessoa (outros aparelhos) são encerradas.
 */
export function AlterarSenha() {
  const alterar = useServerFn(alterarMinhaSenhaFn);
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [alterando, setAlterando] = useState(false);
  const { vazamento, senhaValida } = useConferenciaDeVazamento(nova);
  const problema = problemaDaTroca({ atual, nova, confirmacao });
  const confirmacaoErrada = confirmacao.length > 0 && confirmacao !== nova;
  const pode = !problema && senhaValida && !alterando;

  function limpar() {
    setAtual("");
    setNova("");
    setConfirmacao("");
    setMostrar(false);
  }
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!pode) return;
    setAlterando(true);
    try {
      const r = await alterar({ data: { atual, nova } });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      // As outras sessões (outros aparelhos) saem; esta continua.
      await supabase.auth.signOut({ scope: "others" });
      toast.success(
        "Senha alterada. Os outros aparelhos em que você estava conectado(a) foram desconectados.",
      );
      limpar();
      setAberto(false);
    } catch (erro) {
      toast.error((erro as Error).message || "Não foi possível alterar a senha. Tente novamente.");
    } finally {
      setAlterando(false);
    }
  }

  const tipo = mostrar ? "text" : "password";
  return (
    <section className="mt-2 border-t border-border pt-4" aria-label="Alterar a senha">
      {!aberto ? (
        <Button variant="outline" onClick={() => setAberto(true)}>
          <Lock className="size-4" /> Alterar a senha
        </Button>
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold">🔒 Alterar a senha</p>
            <button
              type="button"
              onClick={() => setMostrar((m) => !m)}
              className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
              aria-pressed={mostrar}
            >
              {mostrar ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{" "}
              {mostrar ? "Esconder as senhas" : "Mostrar as senhas"}
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha-atual">Senha atual</Label>
            <Input
              id="senha-atual"
              type={tipo}
              autoComplete="current-password"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha-nova">Nova senha</Label>
            <Input
              id="senha-nova"
              type={tipo}
              autoComplete="new-password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              aria-describedby="regras-da-nova"
            />
          </div>
          <RegrasDaSenha id="regras-da-nova" senha={nova} vazamento={vazamento} />
          <div className="space-y-1.5">
            <Label htmlFor="senha-confirmacao">Confirme a nova senha</Label>
            <Input
              id="senha-confirmacao"
              type={tipo}
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              aria-invalid={confirmacaoErrada}
            />
            {confirmacaoErrada && (
              <p className="text-xs font-medium text-destructive">
                A confirmação não confere com a nova senha.
              </p>
            )}
            {atual && nova && nova === atual && (
              <p className="text-xs font-medium text-destructive">
                A nova senha precisa ser diferente da atual.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                limpar();
                setAberto(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!pode}>
              {alterando ? "Alterando..." : "Alterar senha"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
