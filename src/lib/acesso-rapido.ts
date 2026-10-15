/**
 * O acesso rápido (14/10/2026): os links das ferramentas do time, na barra lateral, a partir dos
 * favoritos curados (13/10/2026). Fora ficaram as pastas pessoais, o desenvolvimento do sistema, o que
 * o CX Hub já substituiu, os repetidos, o CX Tech, a Fraude e risco, a Logística e a identidade visual.
 * Os links de um registro específico (um cliente, uma conversa) viraram o endereço geral da ferramenta.
 *
 * Os "restritos" (as planilhas de PIN/PUK) aparecem só para o ADM.
 */
export type Atalho = { nome: string; url: string; sub?: string; restrito?: boolean };
export type GrupoDeAtalhos = { nome: string; icone: string; links: Atalho[] };

export const GRUPOS: GrupoDeAtalhos[] = [
  {
    nome: "Atendimento",
    icone: "🎧",
    links: [
      { nome: "Intercom", url: "https://app.intercom.com/a/inbox/a3qubsb2/inbox" },
      { nome: "Dash B2C", url: "https://app-dash-fluke.vercel.app/b2c/clients" },
      { nome: "Dash B2B", url: "https://app-dash-21t9r2rr3-fluke.vercel.app/dashboard" },
      { nome: "Wave", url: "https://wave-telecall-admin.vercel.app/line-holders?company=fluke" },
      {
        nome: "Consulta de portabilidade (ABR Telecom)",
        url: "https://consultanumero.abrtelecom.com.br/consultanumero/consulta/consultaHistoricoRecenteCtg",
      },
      {
        nome: "Manuais de aparelhos",
        url: "https://ajuda.vodafone.pt/manuais/xiaomi/redmi-note-10-5g-android-11-0/conetividade/configure-o-telefone-para-internet",
      },
    ],
  },
  {
    nome: "Material de apoio",
    icone: "📚",
    links: [
      {
        nome: "Produto e cliente",
        url: "https://docs.google.com/presentation/d/1UrPiOGQU3ZkmQDaEqeScTpH508JvR-4NmgPnX0Tj6I8/edit",
        sub: "Slides",
      },
      {
        nome: "Jornada e Status",
        url: "https://docs.google.com/presentation/d/1yHsURsHeZ4xMfdm3zIb7NnsCFOwou5seojx4KRNAgW8/edit",
        sub: "Slides",
      },
      {
        nome: "Portabilidade",
        url: "https://docs.google.com/presentation/d/1ceRO9CllrD6zXvLDYZ5VjS0_QlhzK5KpK33Sw45Jv8M/edit",
        sub: "Slides",
      },
      {
        nome: "Logística",
        url: "https://docs.google.com/presentation/d/1OcTjbdXtlSqn6n0f9Gq9P7scF3CqwTCgKD2tGRkVNzU/edit",
        sub: "Slides",
      },
      {
        nome: "Redes",
        url: "https://docs.google.com/presentation/d/1CJqbIrXthD-TbEwthkvAAG_ubgR3y7npuonngYWamLE/edit",
        sub: "Slides",
      },
      {
        nome: "Ferramentas de Pagamento",
        url: "https://docs.google.com/presentation/d/16fXT0owPokeJIHHTgc9Qx_p4M2RCYvWgX2eOhZ6pg4g/edit",
        sub: "Slides",
      },
      {
        nome: "CxTech",
        url: "https://docs.google.com/presentation/d/1MdC1kjVdr8cbLrqAhmNuQ3889OsioiGXenwtaTStCEs/edit",
        sub: "Slides",
      },
      {
        nome: "Fraude e Risco",
        url: "https://docs.google.com/presentation/d/1KBMwcmIsLEyzKdeOEWE_c-7qfcL_uKD-x2StMP9aSaU/edit",
        sub: "Slides",
      },
      {
        nome: "Tags e Macros e Micros",
        url: "https://docs.google.com/presentation/d/19K9pY9hQtqgPC_dtpVFtDSb9xZatIbc73U7iuK5Lw6I/edit",
        sub: "Slides",
      },
      {
        nome: "Qualidade e Treinamento",
        url: "https://docs.google.com/presentation/d/1l0eiCe9eZNZSC3Ufj7IooKQULoSgTHVY2jQ5MU7_F4M/edit",
        sub: "Slides",
      },
      {
        nome: "Instabilidade",
        url: "https://docs.google.com/presentation/d/1SUNiNW9XrbmGtwe6cdjAmVIa2Psk5deRyJkcjQVCzVI/edit",
        sub: "Slides",
      },
      {
        nome: "Chip físico e eSIM",
        url: "https://docs.google.com/presentation/d/1_QhIESEd1_KS6BnNl6o4vXRuUwr-fERsTwGXa51qpfs/edit",
        sub: "Slides",
      },
      {
        nome: "Idwall e Paiwall",
        url: "https://docs.google.com/presentation/d/1-Vl349j-Ph8Df7EqkvbLn2fFS_rOdgQknSKHD-vnU58/edit",
        sub: "Slides",
      },
      {
        nome: "Reclame Aqui",
        url: "https://docs.google.com/presentation/d/1iZ5a-8u0wgPzFQrfez1tgOD0rTNfCs2tDctwQXUtX5Q/edit",
        sub: "Slides",
      },
      {
        nome: "Réguas automáticas (n8n, B2B)",
        url: "https://docs.google.com/presentation/d/1w5CLgfqVZHyabphEjiGUcxL4Uy73LM87BCSL8XJnzeo/edit",
        sub: "Slides",
      },
      {
        nome: "Número virtual: guia rápido",
        url: "https://docs.google.com/presentation/d/169u7yLY7Todvo_TiWUYQEEjPoFV0FY-pwTXY-TxQyWk/edit",
        sub: "Slides",
      },
      {
        nome: "Dicionário de tags",
        url: "https://www.notion.so/fluke-tmc/Dicion-rio-de-Tags-Assunto-e-Detalhe-1f4cc47b1d7c8091bbf6fc8f2e80aeec",
      },
      {
        nome: "Salva-vidas (site)",
        url: "https://sites.google.com/flukeoperadora.com.br/cx-infos/p%C3%A1gina-inicial",
      },
      {
        nome: "Notion da Fluke",
        url: "https://www.notion.so/fluke-tmc/Fluke-4db4262142d54224941b86605d5e0408",
      },
      {
        nome: "Salva-vidas (Notion)",
        url: "https://www.notion.so/fluke-tmc/salva-vidas-a978bc7e88d74862b114bc35569ab7c9",
      },
      { nome: "Miro: processos de atendimento", url: "https://miro.com/app/board/uXjVOALyHuk=/" },
      {
        nome: "Figma: fluxo do eSIM",
        url: "https://www.figma.com/design/Tf9jZZVIaQC9fkrlATiNcG/-APP--melhorias-fluxo-aquisi%C3%A7%C3%A3o?node-id=370-2142&p=f",
      },
      {
        nome: "Figma: plataforma B2B",
        url: "https://www.figma.com/design/DIokRgBmN0LBVpiAMxekw7/plataforma-b2b?node-id=2682-18168&p=f&t=YfuhP1xRPja4uPiE-0",
      },
    ],
  },
  {
    nome: "Financeiro",
    icone: "💳",
    links: [
      { nome: "Stripe", url: "https://dashboard.stripe.com/acct_1JNlp9EFYWOdGeHF/payments" },
      { nome: "Pagar.me", url: "https://id.pagar.me/signin" },
      { nome: "Leitor de QR Code (Pix)", url: "https://www.qrplus.com.br/decodificar-qr-code" },
      {
        nome: "Comprovantes de pagamento",
        url: "https://docs.google.com/spreadsheets/d/1o_ohvIXhH8P6helqQVi3gpPxopVM7XqIam_6IHj6YSQ/edit",
      },
    ],
  },
  {
    nome: "Comunicação",
    icone: "✉️",
    links: [
      { nome: "Gmail", url: "https://mail.google.com/mail/u/0/" },
      { nome: "Slack", url: "https://app.slack.com/client/T8LRQ6DU2" },
    ],
  },
  {
    nome: "A Fluke na web",
    icone: "🌐",
    links: [
      { nome: "Reclame Aqui", url: "https://www.reclameaqui.com.br/empresa/fluke-operadora/" },
      { nome: "Site: pessoa física", url: "https://flu.ke/" },
      { nome: "Site: empresas", url: "https://flu.ke/empresas" },
      { nome: "Site: agentes de voz", url: "https://flu.ke/empresas/produtos/agentes-de-voz" },
    ],
  },
  {
    nome: "Consultas",
    icone: "🔎",
    links: [
      {
        nome: "Jira: chamados",
        url: "https://telecall.atlassian.net/servicedesk/customer/user/login?destination=portals",
      },
      {
        nome: "Anatel: IMEI bloqueado",
        url: "https://www.gov.br/anatel/pt-br/assuntos/celular-legal/consulte-sua-situacao",
      },
      { nome: "Vivo: mapa de cobertura", url: "https://mapadecobertura.vivo.com.br/" },
      {
        nome: "Receita: consulta de CPF",
        url: "https://servicos.receita.fazenda.gov.br/servicos/cpf/consultasituacao/consultapublica.asp",
      },
      { nome: "Downdetector", url: "https://downdetector.com.br/" },
      {
        nome: "Receita: consulta de CNPJ",
        url: "https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp",
      },
      {
        nome: "Consulta de IMEI",
        url: "https://www.consultaserialaparelho.com.br/public-web/homeSiga",
      },
    ],
  },
  {
    nome: "Planilhas",
    icone: "📊",
    links: [
      {
        nome: "Onboarding",
        url: "https://docs.google.com/spreadsheets/d/1WaSGdQiJ3sKtCIQwgbZm95axHg8XCu5bHqteVQaImjY/edit",
      },
      {
        nome: "PIN/PUK (chips físicos)",
        url: "https://docs.google.com/spreadsheets/d/1kFLO9NABeTdvv6QlqlcN3gsG1W_OgYmr/edit",
        restrito: true,
      },
      {
        nome: "Modelo: histórico de consumo",
        url: "https://docs.google.com/spreadsheets/d/1-UQk2DWpdx8QqjPFeUeqayavcO9r-WI1JDS_A5XK9u0/edit",
      },
      {
        nome: "PIN/PUK (eSIM)",
        url: "https://docs.google.com/spreadsheets/d/1sBKXuuCIL07NulPNOYZIOFG8R_ZMlemw/edit",
        restrito: true,
      },
    ],
  },
];

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Os grupos que a pessoa vê (o restrito, só o ADM), sem os grupos que ficariam vazios. */
export function gruposVisiveis(
  perfil: string | null | undefined,
  grupos = GRUPOS,
): GrupoDeAtalhos[] {
  return grupos
    .map((g) => ({ ...g, links: g.links.filter((l) => !l.restrito || perfil === "adm") }))
    .filter((g) => g.links.length > 0);
}

/** A busca, sem acento, no nome do link, do grupo e do subgrupo. */
export function buscarAtalhos(
  grupos: GrupoDeAtalhos[],
  busca: string,
): (Atalho & { grupo: string })[] {
  const b = normal(busca.trim());
  if (!b) return [];
  return grupos.flatMap((g) =>
    g.links
      .filter((l) => normal(`${l.nome} ${g.nome} ${l.sub ?? ""}`).includes(b))
      .map((l) => ({ ...l, grupo: g.nome })),
  );
}

// ---------- Os "Meus atalhos": no navegador de cada pessoa (um por pessoa, no mesmo computador) ----------
const chave = (pessoa: string) => `cxhub-atalhos:${pessoa}`;
export function lerAtalhos(pessoa: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(chave(pessoa)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function salvarAtalhos(pessoa: string, urls: string[]) {
  try {
    localStorage.setItem(chave(pessoa), JSON.stringify(urls));
  } catch {
    // Sem o armazenamento do navegador (uma janela anônima, por exemplo): os atalhos valem só agora.
  }
}
