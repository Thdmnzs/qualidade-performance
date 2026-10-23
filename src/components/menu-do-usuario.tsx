import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, CircleUserRound, Lock, LogOut, UserRound } from "lucide-react";
import { useState } from "react";

import { AlterarSenha } from "@/components/dados-pessoais/alterar-senha";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Menu do usuário, na barra fixa do topo: nome, e-mail de acesso, perfil, a
 * troca de área (para quem tem as duas), a troca de senha (23/10/2026) e o Sair.
 */
export function MenuDoUsuario({
  nome,
  email,
  perfil,
  troca,
  onSair,
}: {
  nome: string;
  email: string | null;
  /** Ex.: "Colaborador", ou "Avaliador · Área de avaliação". */
  perfil: string;
  troca: { para: string; rotulo: string } | null;
  onSair: () => void;
}) {
  // (23/10/2026) A troca de senha no menu da conta: o ADM não tem o Meu perfil, e não tinha onde trocar.
  const [trocandoASenha, setTrocandoASenha] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Menu do usuário: ${nome}`}
            className="relative flex size-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-secondary"
          >
            <CircleUserRound className="size-5" />
            {/* Conectado */}
            <span
              className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-[#0bd400]"
              aria-hidden="true"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-2 py-2">
            <p className="flex items-center gap-2 text-sm font-bold">
              <UserRound className="size-3.5 shrink-0" />
              <span className="truncate">{nome}</span>
            </p>
            {email && <p className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p>}
            <p className="mt-1 text-xs font-bold text-muted-foreground">{perfil}</p>
          </div>
          <DropdownMenuSeparator />
          {troca && (
            <DropdownMenuItem asChild className="font-bold text-primary focus:text-primary">
              <Link to={troca.para}>
                <ArrowLeftRight className="size-4" /> {troca.rotulo}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setTrocandoASenha(true)} className="font-bold">
            <Lock className="size-4" /> Alterar a senha
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onSair}
            className="font-bold text-destructive focus:text-destructive"
          >
            <LogOut className="size-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={trocandoASenha} onOpenChange={setTrocandoASenha}>
        <DialogContent>
          <DialogTitle className="sr-only">Alterar a senha</DialogTitle>
          {trocandoASenha && (
            <AlterarSenha inicialmenteAberto aoFechar={() => setTrocandoASenha(false)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
