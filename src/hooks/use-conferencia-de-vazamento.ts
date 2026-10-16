import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { senhaAtendeRegras } from "@/lib/senha";
import { conferirPrefixoDeSenhaFn } from "@/lib/senha.functions";
import { apareceEmVazamentos, prefixoESufixo, type SituacaoDaSenha } from "@/lib/senha-vazada";

/**
 * A conferência de senhas vazadas (16/10/2026, a peça da primeira senha, agora compartilhada com a troca
 * de senha). A senha nunca sai do navegador: só os 5 primeiros caracteres do código dela são consultados.
 * A conferência começa quando as regras estão cumpridas, meio segundo depois de a pessoa parar de digitar.
 */
export function useConferenciaDeVazamento(senha: string) {
  const [vazamento, setVazamento] = useState<SituacaoDaSenha | null>(null);
  const conferirPrefixo = useServerFn(conferirPrefixoDeSenhaFn);
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
  // Só vale com as regras cumpridas e a senha fora dos vazamentos (ou com o serviço fora do ar).
  return {
    vazamento,
    regrasOk,
    senhaValida: regrasOk && (vazamento === "segura" || vazamento === "indisponivel"),
  };
}
