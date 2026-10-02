/**
 * Cabeçalhos de segurança, aplicados a TODAS as respostas do servidor
 * (src/server.ts). ISO/IEC 27002:2022 8.9 e 8.26; OWASP: configuração insegura.
 *
 * O site não carrega nada de fora: só fala com o próprio domínio e com o Supabase.
 */
const SUPABASE = "zugwegvitdqkkeqttuez.supabase.co";

export const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' em scripts: o TanStack Start injeta o estado da página num script embutido.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://${SUPABASE} wss://${SUPABASE}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export const CABECALHOS_DE_SEGURANCA: Record<string, string> = {
  // Ninguém pode exibir a plataforma dentro de outro site (clickjacking).
  "X-Frame-Options": "DENY",
  // O navegador não "adivinha" o tipo de um arquivo (evita executar o que não é script).
  "X-Content-Type-Options": "nosniff",
  // Ao clicar num link para fora, o outro site não recebe o endereço completo da página.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // A plataforma não usa câmera, microfone, localização, pagamento nem USB.
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  // Só HTTPS por 2 anos, inclusive nos subdomínios.
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  // Fase 1: a CSP só OBSERVA (registra no console o que bloquearia, sem bloquear).
  // Depois de um ciclo sem alertas, troca-se para "Content-Security-Policy".
  "Content-Security-Policy-Report-Only": CSP,
};

/** Devolve a resposta com os cabeçalhos de segurança (cria uma cópia: os originais podem ser imutáveis). */
export function comCabecalhosDeSeguranca(resposta: Response): Response {
  const headers = new Headers(resposta.headers);
  for (const [nome, valor] of Object.entries(CABECALHOS_DE_SEGURANCA)) headers.set(nome, valor);
  return new Response(resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers,
  });
}
