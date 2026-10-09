import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  apagarRegistros,
  lerRegistro,
  registrarAtividade,
  situacaoDaSessao,
  type MotivoDoFim,
} from "@/lib/expiracao-da-sessao";

const EVENTOS_DE_USO = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
const INTERVALO_DE_ESCRITA_MS = 15_000; // o uso é gravado no máximo a cada 15 s (sem pesar a tela)
const INTERVALO_DE_CONFERENCIA_MS = 5_000;

/**
 * O vigia da sessão (09/10/2026): registra o uso, confere o prazo (30 minutos sem
 * uso, ou 9 horas desde o login), avisa 1 minuto antes e encerra no prazo.
 * Encerra só a sessão DESTE navegador (as outras, como no celular, continuam).
 */
export function VigiaDaSessao({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [aviso, setAviso] = useState<MotivoDoFim | null>(null);
  const encerrando = useRef(false);

  useEffect(() => {
    let ultimaEscrita = 0;
    const usar = () => {
      const agora = Date.now();
      if (agora - ultimaEscrita < INTERVALO_DE_ESCRITA_MS) return;
      ultimaEscrita = agora;
      registrarAtividade(userId, agora);
    };
    const encerrar = async (motivo: MotivoDoFim) => {
      if (encerrando.current) return;
      encerrando.current = true;
      apagarRegistros();
      await supabase.auth.signOut({ scope: "local" });
      navigate({ to: "/auth", search: { motivo }, replace: true });
    };
    const conferir = () => {
      const s = situacaoDaSessao(Date.now(), lerRegistro(userId));
      if (s.estado === "expirada") void encerrar(s.motivo);
      else setAviso(s.estado === "aviso" ? s.motivo : null);
    };

    registrarAtividade(userId, Date.now()); // abrir a página conta como uso
    for (const e of EVENTOS_DE_USO)
      window.addEventListener(e, usar, { passive: true, capture: true });
    const relogio = window.setInterval(conferir, INTERVALO_DE_CONFERENCIA_MS);
    document.addEventListener("visibilitychange", conferir); // ao voltar para a aba
    conferir();
    return () => {
      for (const e of EVENTOS_DE_USO) window.removeEventListener(e, usar, { capture: true });
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", conferir);
    };
  }, [userId, navigate]);

  return (
    <Dialog open={aviso !== null} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {aviso === "limite" ? "Sua sessão está chegando ao limite" : "Você ainda está aí?"}
          </DialogTitle>
          <DialogDescription>
            {aviso === "limite"
              ? "A sessão dura no máximo 9 horas e vai ser encerrada em menos de 1 minuto. Salve o que estiver fazendo; depois, é só entrar de novo."
              : "Por segurança, a sessão vai ser encerrada em menos de 1 minuto, depois de 30 minutos sem uso."}
          </DialogDescription>
        </DialogHeader>
        <Button
          onClick={() => {
            if (aviso === "inatividade") registrarAtividade(userId, Date.now());
            setAviso(null);
          }}
        >
          {aviso === "limite" ? "Entendi" : "Continuar conectado"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
