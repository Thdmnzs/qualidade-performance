/**
 * O mural do CX (20/10/2026): o texto do Slack (o "mrkdwn") transformado no que a tela mostra. Puro, para
 * testes. A tela desenha o resultado como elementos (e nunca como HTML), então nada escrito no Slack vira
 * código no CX Hub.
 */
export type Parte =
  | { t: "texto" | "negrito" | "italico" | "riscado" | "codigo"; v: string }
  | { t: "link"; v: string; url: string };
export type Linha = { lista: boolean; partes: Parte[] };
export type Cabecalho = {
  tipo: string | null;
  titulo: string | null;
  criticidade: string | null;
  leitura: string | null;
  para: string | null;
};

const EMOJIS: Record<string, string> = {
  white_check_mark: "✅",
  heavy_check_mark: "✔️",
  check: "✔️",
  x: "❌",
  warning: "⚠️",
  rotating_light: "🚨",
  exclamation: "❗",
  bangbang: "‼️",
  green_heart: "💚",
  heart: "❤️",
  blue_heart: "💙",
  yellow_heart: "💛",
  purple_heart: "💜",
  point_down: "👇",
  point_right: "👉",
  point_up: "☝️",
  raised_hands: "🙌",
  clap: "👏",
  pray: "🙏",
  muscle: "💪",
  "+1": "👍",
  thumbsup: "👍",
  wave: "👋",
  large_yellow_circle: "🟡",
  large_green_circle: "🟢",
  large_blue_circle: "🔵",
  red_circle: "🔴",
  large_orange_circle: "🟠",
  white_circle: "⚪",
  black_circle: "⚫",
  tada: "🎉",
  rocket: "🚀",
  eyes: "👀",
  fire: "🔥",
  sparkles: "✨",
  star: "⭐",
  bulb: "💡",
  memo: "📝",
  pushpin: "📌",
  link: "🔗",
  calendar: "📅",
  bell: "🔔",
  mega: "📣",
  loudspeaker: "📢",
  arrow_right: "➡️",
  arrow_down: "⬇️",
  smile: "😄",
  joy: "😂",
  wink: "😉",
  slightly_smiling_face: "🙂",
  grinning: "😀",
  heart_eyes: "😍",
  sweat_smile: "😅",
  thinking_face: "🤔",
  partying_face: "🥳",
  phone: "📞",
  iphone: "📱",
  money_with_wings: "💸",
};
const desfazer = (t: string) =>
  t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** As menções especiais e os emojis (os desconhecidos, como os emojis próprios do Slack, somem). */
export function limpar(texto: string): string {
  return texto
    .replace(/<!here(\|[^>]*)?>/g, "@aqui")
    .replace(/<!channel(\|[^>]*)?>/g, "@canal")
    .replace(/<!everyone(\|[^>]*)?>/g, "@todos")
    .replace(/<!subteam\^[A-Z0-9]+\|@?([^>]+)>/g, "@$1")
    .replace(/<!subteam\^[A-Z0-9]+>/g, "@time")
    .replace(/<@[A-Z0-9]+(\|([^>]+))?>/g, (_, __, nome) => `@${nome ?? "alguém"}`)
    .replace(/:([a-z0-9_+-]+):/g, (_, nome: string) => EMOJIS[nome] ?? "")
    .replace(/[ \t]+\n/g, "\n");
}

const PROTOCOLO_SEGURO = /^(https?:\/\/|mailto:)/i;
/** Uma linha em partes: os links primeiro, e o negrito, o itálico, o riscado e o código no resto. */
function partesDe(linha: string): Parte[] {
  const saida: Parte[] = [];
  const formatar = (texto: string) => {
    const re = /(`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
    let ultimo = 0;
    for (const m of texto.matchAll(re)) {
      if (m.index! > ultimo) saida.push({ t: "texto", v: desfazer(texto.slice(ultimo, m.index)) });
      const s = m[0];
      const miolo = desfazer(s.slice(1, -1));
      saida.push({
        t:
          s[0] === "`" ? "codigo" : s[0] === "*" ? "negrito" : s[0] === "_" ? "italico" : "riscado",
        v: miolo,
      });
      ultimo = m.index! + s.length;
    }
    if (ultimo < texto.length) saida.push({ t: "texto", v: desfazer(texto.slice(ultimo)) });
  };
  let ultimo = 0;
  for (const m of linha.matchAll(/<([^>|]+)(\|([^>]+))?>/g)) {
    formatar(linha.slice(ultimo, m.index));
    const url = desfazer(m[1]!);
    const rotulo = desfazer(m[3] ?? m[1]!);
    if (PROTOCOLO_SEGURO.test(url)) saida.push({ t: "link", v: rotulo, url });
    else saida.push({ t: "texto", v: rotulo }); // um endereço que não é http(s) ou e-mail vira só texto
    ultimo = m.index! + m[0].length;
  }
  formatar(linha.slice(ultimo));
  return saida.filter((p) => p.v !== "");
}

/** O corpo em linhas (as listas com "•", "-" ou "◦" no começo viram itens). */
export function linhasDe(texto: string): Linha[] {
  return limpar(texto)
    .split("\n")
    .map((l) => {
      const lista = /^\s*[•◦▪-]\s+/.test(l);
      return { lista, partes: partesDe(lista ? l.replace(/^\s*[•◦▪-]\s+/, "") : l) };
    });
}

/**
 * O cabeçalho de um comunicado, pelo padrão do #cx_mural: "*[tipo] título*" na primeira linha, e as linhas
 * "criticidade: ..." e "tempo de leitura: ...". O corpo devolvido fica sem elas.
 */
export function lerComunicado(texto: string): Cabecalho & { corpo: string } {
  const linhas = texto.split("\n");
  let para: string | null = null;
  let tipo: string | null = null;
  let titulo: string | null = null;
  let criticidade: string | null = null;
  let leitura: string | null = null;
  const resto: string[] = [];
  linhas.forEach((l, i) => {
    const m = i === 0 ? l.match(/^\s*(<![^>]+>)?\s*\*\[([^\]]+)\]\s*([^*]+)\*\s*$/) : null;
    if (m) {
      para = m[1] ? limpar(m[1]) : null;
      tipo = m[2]!.trim().toLowerCase();
      const t = desfazer(limpar(m[3]!.trim()));
      titulo = t.charAt(0).toUpperCase() + t.slice(1);
      return;
    }
    const c = l.match(/^\s*criticidade\s*:\s*(.+?)\s*$/i);
    if (c) return void (criticidade = c[1]!.toLowerCase());
    const r = l.match(/^\s*tempo de leitura\s*:\s*(.+?)\s*$/i);
    if (r) return void (leitura = r[1]!);
    resto.push(l);
  });
  if (!titulo) {
    // Sem o padrão: a menção do começo vira o "para quem", e o texto inteiro é o corpo.
    const m = resto[0]?.match(/^\s*(<![^>]+>)\s*/);
    if (m) {
      para = limpar(m[1]!);
      resto[0] = resto[0]!.slice(m[0].length);
    }
  }
  return {
    tipo,
    titulo,
    criticidade,
    leitura,
    para,
    corpo: resto.join("\n").replace(/^\n+|\n+$/g, ""),
  };
}
