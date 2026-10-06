/**
 * Modo claro e escuro da dash. A escolha fica guardada NO NAVEGADOR
 * (localStorage): sem consulta ao banco, e aplicada antes de a página aparecer.
 * Sem escolha salva, a dash abre no claro.
 */
import { useSyncExternalStore } from "react";

export type Tema = "claro" | "escuro";
export const CHAVE_DO_TEMA = "qualityhub-tema";
const EVENTO = "qualityhub-tema";

export const proximoTema = (t: Tema): Tema => (t === "claro" ? "escuro" : "claro");

/** Interpreta o que está guardado; qualquer valor desconhecido vira "claro". */
export const temaGuardado = (valor: string | null): Tema =>
  valor === "escuro" ? "escuro" : "claro";

/**
 * Script que roda no <head>, ANTES de a página aparecer: aplica o escuro se
 * ele estiver guardado (evita o "clarão" branco ao abrir). Precisa ser pequeno
 * e não depender de nada do site, porque roda antes de tudo.
 */
export const SCRIPT_DO_TEMA = `try{if(localStorage.getItem(${JSON.stringify(CHAVE_DO_TEMA)})==="escuro"){document.documentElement.classList.add("dark")}}catch(e){}`;

function lerTema(): Tema {
  if (typeof document === "undefined") return "claro"; // no servidor, sempre claro
  return document.documentElement.classList.contains("dark") ? "escuro" : "claro";
}

export function definirTema(t: Tema) {
  document.documentElement.classList.toggle("dark", t === "escuro");
  try {
    localStorage.setItem(CHAVE_DO_TEMA, t);
  } catch {
    // Navegador sem armazenamento (ex.: modo privado restrito): o tema vale só nesta página.
  }
  window.dispatchEvent(new Event(EVENTO));
}

function inscrever(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  return () => window.removeEventListener(EVENTO, aviso);
}

/** O tema atual; as partes da tela que dependem dele se atualizam quando ele muda. */
export function useTema(): Tema {
  return useSyncExternalStore(inscrever, lerTema, () => "claro");
}
