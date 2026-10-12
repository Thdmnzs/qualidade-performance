/**
 * As artes das capas (11/10/2026): desenhos vetoriais (SVG) montados por funções.
 *
 * SEGURANÇA: estes desenhos são inseridos na página como texto pronto. Isso só é seguro
 * porque TODO o conteúdo daqui é fixo, escrito neste arquivo: nenhum texto vem de uma
 * pessoa (nome, recado, etc.). Nunca acrescente aqui algo digitado por alguém.
 *
 * Cada desenho recebe um sufixo (`u`) para os identificadores dos degradês: a mesma capa
 * aparece várias vezes na tela, e identificadores repetidos misturam os desenhos.
 * As capas da Fluke usam os elementos do design system: o verde #0EF500, o quase-preto
 * #071407, os brilhos radiais, as faixas, as ondas de sinal e a pílula do logo.
 */
const PILULA = "/capas/fluke-pill-white.svg";
const APARELHOS = "/capas/aparelhos.webp";

const svg = (conteudo: string, fundo = "") =>
  `<svg viewBox="0 0 600 150" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${fundo}${conteudo}</svg>`;
const fundo = (cor: string) => `<rect width="600" height="150" fill="${cor}"/>`;
const ondas = (cx: number, cy: number, n: number, cor: string, base = 26) =>
  Array.from(
    { length: n },
    (_, i) =>
      `<circle cx="${cx}" cy="${cy}" r="${base * (i + 1)}" stroke="${cor}" stroke-opacity="${(0.55 - i * (0.45 / n)).toFixed(3)}" stroke-width="2" fill="none"/>`,
  ).join("");
export const ESTRELA = (x: number, y: number, r: number) =>
  `<path transform="translate(${x} ${y})" d="M0 ${-r} L${r * 0.3} ${-r * 0.3} L${r} 0 L${r * 0.3} ${r * 0.3} L0 ${r} L${-r * 0.3} ${r * 0.3} L${-r} 0 L${-r * 0.3} ${-r * 0.3}Z" fill="#FDE68A"/>`;
export const ABOBORA = (x: number, y: number, r: number) =>
  `<g transform="translate(${x} ${y})"><ellipse rx="${r}" ry="${r * 0.82}" fill="#F97316"/><ellipse rx="${r * 0.45}" ry="${r * 0.82}" fill="#EA580C"/><rect x="${-r * 0.12}" y="${-r * 1.15}" width="${r * 0.24}" height="${r * 0.42}" rx="${r * 0.08}" fill="#16A34A"/><path d="M${-r * 0.45} ${-r * 0.1} l${r * 0.18} ${-r * 0.22} l${r * 0.18} ${r * 0.22}z M${r * 0.1} ${-r * 0.1} l${r * 0.18} ${-r * 0.22} l${r * 0.18} ${r * 0.22}z" fill="#3B1A5C"/><path d="M${-r * 0.5} ${r * 0.25} q${r * 0.5} ${r * 0.45} ${r} 0" stroke="#3B1A5C" stroke-width="${r * 0.14}" fill="none" stroke-linecap="round"/></g>`;
const LACO = (x: number, y: number, cor: string) =>
  `<g transform="translate(${x} ${y})"><path d="M0 0 C-22 -30 -40 -6 -10 18 L-26 52 L-14 54 L0 26 L14 54 L26 52 L10 18 C40 -6 22 -30 0 0Z" fill="${cor}"/></g>`;
const CONFETE = (seed: number, cores: string[]) =>
  Array.from({ length: 46 }, (_, i) => {
    const x = (i * 131 + seed) % 600;
    const y = (i * 53 + seed * 3) % 150;
    const c = cores[i % cores.length];
    return i % 3
      ? `<circle cx="${x}" cy="${y}" r="${2 + (i % 3)}" fill="${c}"/>`
      : `<rect x="${x}" y="${y}" width="7" height="3" rx="1" fill="${c}" transform="rotate(${(i * 37) % 180} ${x} ${y})"/>`;
  }).join("");
const BANDEIRINHAS = (y: number, cores: string[]) =>
  `<path d="M-10 ${y} Q300 ${y + 22} 610 ${y}" stroke="#FDE68A" stroke-width="1.5" fill="none"/>` +
  Array.from({ length: 17 }, (_, i) => {
    const x = i * 37 + 4;
    const yy = y + 22 * (1 - Math.pow((x - 300) / 310, 2));
    return `<path d="M${x} ${yy.toFixed(1)} L${x + 26} ${yy.toFixed(1)} L${x + 13} ${(yy + 22).toFixed(1)}Z" fill="${cores[i % cores.length]}"/>`;
  }).join("");
const FOGUEIRA = (x: number) =>
  `<g transform="translate(${x} 150)"><path d="M-30 0 L30 -8 M-30 -8 L30 0" stroke="#7C2D12" stroke-width="7" stroke-linecap="round"/><path d="M0 -12 C-22 -30 -6 -50 0 -64 C6 -48 24 -34 0 -12Z" fill="#F97316"/><path d="M0 -14 C-10 -26 -2 -38 0 -46 C3 -36 12 -28 0 -14Z" fill="#FDE047"/></g>`;
const LUZES = (y: number) =>
  `<path d="M-10 ${y} Q150 ${y + 26} 300 ${y} T610 ${y}" stroke="#14532D" stroke-width="2" fill="none"/>` +
  Array.from({ length: 22 }, (_, i) => {
    const x = i * 28 + 6;
    const yy = y + 13 - 13 * Math.cos((Math.PI * x) / 300);
    const cor = ["#0EF500", "#F43F5E", "#FDE047", "#38BDF8", "#F97316"][i % 5];
    return `<ellipse cx="${x}" cy="${(yy + 7).toFixed(1)}" rx="4" ry="6" fill="${cor}"/><circle cx="${x}" cy="${(yy + 7).toFixed(1)}" r="10" fill="${cor}" opacity=".18"/>`;
  }).join("");
const FOGO = (x: number, y: number, r: number, cor: string) =>
  Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<line x1="${(x + Math.cos(a) * r * 0.3).toFixed(1)}" y1="${(y + Math.sin(a) * r * 0.3).toFixed(1)}" x2="${(x + Math.cos(a) * r).toFixed(1)}" y2="${(y + Math.sin(a) * r).toFixed(1)}" stroke="${cor}" stroke-width="2" stroke-linecap="round"/>`;
  }).join("") + `<circle cx="${x}" cy="${y}" r="3" fill="${cor}"/>`;
const radial = (id: string, cor: string, opac: number, extra = "") =>
  `<radialGradient id="${id}" ${extra}><stop offset="0" stop-color="${cor}" stop-opacity="${opac}"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></radialGradient>`;

const BALAO = (x: number, y: number, cor: string, r = 16) =>
  `<g transform="translate(${x} ${y})"><path d="M0 ${r * 1.2} Q-4 ${r * 2.2} 6 ${r * 3.4}" stroke="#FDE68A" stroke-width="1.3" fill="none"/><ellipse rx="${r * 0.82}" ry="${r}" fill="${cor}"/><ellipse cx="${-r * 0.28}" cy="${-r * 0.35}" rx="${r * 0.18}" ry="${r * 0.28}" fill="#fff" opacity=".45"/><path d="M-3 ${r} L3 ${r} L0 ${r + 4}Z" fill="${cor}"/></g>`;
const BOLO = (x: number) =>
  `<g transform="translate(${x} 150)"><rect x="-44" y="-40" width="88" height="40" rx="8" fill="#F9A8D4"/><rect x="-44" y="-40" width="88" height="10" rx="5" fill="#FDF2F8"/><rect x="-32" y="-66" width="64" height="28" rx="7" fill="#FBCFE8"/>${[-16, 0, 16].map((d) => `<rect x="${d - 2}" y="-82" width="4" height="16" rx="2" fill="#38BDF8"/><path d="M${d} -92 q4 5 0 9 q-4 -4 0 -9Z" fill="#FDE047"/>`).join("")}</g>`;

const ARTES: Record<string, (u: string) => string> = {
  // A de festa: só no dia do aniversário (não aparece no "Mudar capa").
  festa: () =>
    svg(
      `${CONFETE(11, ["#F43F5E", "#FDE047", "#0EF500", "#38BDF8", "#A855F7"])}${BALAO(70, 40, "#F43F5E")}${BALAO(110, 30, "#FDE047", 13)}${BALAO(150, 48, "#0EF500", 15)}${BALAO(560, 34, "#38BDF8", 15)}${BALAO(520, 52, "#A855F7", 12)}${BOLO(330)}<text x="420" y="138" font-family="Quicksand, sans-serif" font-weight="700" font-size="22" fill="#FDF4FF">feliz aniversário!</text>`,
      fundo("#3B0764"),
    ),
  sinal: () =>
    svg(
      [0, 1, 2, 3, 4]
        .map(
          (i) =>
            `<path d="M0 ${110 - i * 14} Q150 ${70 - i * 14} 300 ${100 - i * 14} T600 ${80 - i * 14}" stroke="#0EF500" stroke-opacity="${0.15 + i * 0.12}" stroke-width="2" fill="none"/>`,
        )
        .join(""),
      fundo("#071407"),
    ),
  ondas: (u) =>
    svg(
      `<defs>${radial(`og${u}`, "#0EF500", 0.45)}</defs><circle cx="470" cy="75" r="150" fill="url(#og${u})"/>${ondas(470, 75, 7, "#0EF500")}<circle cx="470" cy="75" r="9" fill="#0EF500"/>`,
      fundo("#071407"),
    ),
  brilho: (u) =>
    svg(
      `<defs><radialGradient id="bg${u}" cx=".78" cy=".4" r=".6"><stop offset="0" stop-color="#0EF500" stop-opacity=".55"/><stop offset=".55" stop-color="#EDFFF0"/><stop offset="1" stop-color="#FFFFFF"/></radialGradient></defs><rect width="600" height="150" fill="url(#bg${u})"/>`,
    ),
  faixas: () =>
    svg(
      `${[0, 1, 2, 3, 4].map((i) => `<rect y="${i * 30}" width="600" height="30" fill="${i % 2 ? "#EDFFF0" : "#FFFFFF"}"/>`).join("")}<rect x="380" y="40" width="190" height="70" rx="35" fill="#0EF500"/><rect x="398" y="58" width="34" height="34" rx="17" fill="#071407"/>`,
    ),
  aurora: (u) =>
    svg(
      `<defs><linearGradient id="vv${u}" x1="0" x2="1"><stop offset="0" stop-color="#0EF500"/><stop offset="1" stop-color="#EDFFF0"/></linearGradient></defs><rect width="600" height="150" fill="url(#vv${u})"/><circle cx="80" cy="140" r="90" fill="#13A403" opacity=".25"/>`,
    ),
  pilula: (u) =>
    svg(
      `<defs>${radial(`pg${u}`, "#0EF500", 0.4)}</defs><circle cx="470" cy="75" r="170" fill="url(#pg${u})"/><image href="${PILULA}" x="330" y="-10" width="300" height="170" preserveAspectRatio="xMidYMid meet" opacity=".95"/>`,
      fundo("#071407"),
    ),
  fibra: () =>
    svg(
      `${Array.from({ length: 14 }, (_, i) => `<line x1="${i * 46 - 60}" y1="150" x2="${i * 46 + 90}" y2="0" stroke="${i % 3 ? "#0EF500" : "#38BDF8"}" stroke-opacity="${(0.12 + (i % 4) * 0.08).toFixed(2)}" stroke-width="${1 + (i % 3)}"/>`).join("")}${Array.from({ length: 10 }, (_, i) => `<circle cx="${40 + i * 58}" cy="${30 + ((i * 37) % 100)}" r="2" fill="#B9FFB0"/>`).join("")}`,
      fundo("#04120A"),
    ),
  torre: () =>
    svg(
      `<path d="M470 150 L490 40 L510 150 M478 110 H502 M483 80 H497" stroke="#C9D6E3" stroke-width="3" fill="none"/>${[1, 2, 3].map((r) => `<circle cx="490" cy="40" r="${r * 22}" stroke="#0EF500" stroke-opacity="${(0.5 - r * 0.12).toFixed(2)}" stroke-width="2" fill="none"/>`).join("")}<path d="M0 150 L0 120 L60 110 L120 125 L200 105 L280 120 L360 108 L440 122 L600 112 L600 150Z" fill="#071407"/>`,
      fundo("#0B1F2E"),
    ),
  aparelhos: (u) =>
    svg(
      `<defs><radialGradient id="ap${u}" cx=".75" cy=".5" r=".55"><stop offset="0" stop-color="#0EF500" stop-opacity=".35"/><stop offset="1" stop-color="#EDFFF0" stop-opacity="0"/></radialGradient></defs><rect width="600" height="150" fill="#EDFFF0"/><rect width="600" height="150" fill="url(#ap${u})"/><image href="${APARELHOS}" x="300" y="8" width="290" height="142" preserveAspectRatio="xMidYMid meet"/>`,
    ),
  chip: () =>
    svg(
      `<g transform="translate(440 25)"><rect width="100" height="100" rx="16" fill="none" stroke="#0EF500" stroke-width="3"/>${[25, 50, 75].map((p) => `<line x1="${p}" y1="0" x2="${p}" y2="100" stroke="#0EF500" stroke-opacity=".4"/><line x1="0" y1="${p}" x2="100" y2="${p}" stroke="#0EF500" stroke-opacity=".4"/>`).join("")}<rect x="30" y="30" width="40" height="40" rx="6" fill="#0EF500"/></g>${ondas(490, 75, 4, "#0EF500", 70)}`,
      fundo("#071407"),
    ),
  podio: () =>
    svg(
      `<rect x="240" y="60" width="60" height="90" rx="6" fill="#E8C547"/><rect x="180" y="85" width="60" height="65" rx="6" fill="#C9CED6"/><rect x="300" y="100" width="60" height="50" rx="6" fill="#B87333"/><circle cx="270" cy="38" r="12" fill="#0EF500"/>`,
      fundo("#1A1505"),
    ),
  fluker: (u) =>
    svg(
      `<defs>${radial(`fk${u}`, "#0EF500", 0.6)}</defs><circle cx="300" cy="75" r="180" fill="url(#fk${u})"/>${ondas(300, 75, 6, "#0EF500", 34)}<image href="${PILULA}" x="225" y="35" width="150" height="80" preserveAspectRatio="xMidYMid meet"/>`,
      fundo("#000"),
    ),
  carnaval: () =>
    svg(
      `${CONFETE(7, ["#0EF500", "#F43F5E", "#FDE047", "#38BDF8", "#A855F7", "#F97316"])}${[0, 1, 2].map((i) => `<path d="M${i * 220 - 20} ${30 + i * 30} q30 -30 60 0 t60 0 t60 0" stroke="${["#FDE047", "#F43F5E", "#0EF500"][i]}" stroke-width="3" fill="none"/>`).join("")}`,
      fundo("#3B0764"),
    ),
  junina: () =>
    svg(
      `${BANDEIRINHAS(10, ["#F43F5E", "#FDE047", "#0EF500", "#38BDF8", "#F97316"])}${BANDEIRINHAS(48, ["#FDE047", "#0EF500", "#F43F5E", "#F97316", "#38BDF8"])}${FOGUEIRA(470)}`,
      fundo("#1E293B"),
    ),
  cliente: () =>
    svg(
      `${[0, 1, 2, 3, 4].map((i) => `<path transform="translate(${330 + i * 50} 70) scale(1.1)" d="M0 -18 L5 -6 L18 -6 L8 2 L12 15 L0 7 L-12 15 L-8 2 L-18 -6 L-5 -6Z" fill="#FDE047" stroke="#C98A00" stroke-width="1.5"/>`).join("")}${CONFETE(3, ["#0EF500", "#13A403", "#FDE047"])}<text x="40" y="95" font-family="Quicksand, sans-serif" font-weight="700" font-size="34" fill="#071407">obrigado, cliente</text>`,
      fundo("#EDFFF0"),
    ),
  bruxas: (u) =>
    svg(
      `<defs><linearGradient id="nb${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E1035"/><stop offset=".7" stop-color="#4C1D95"/><stop offset="1" stop-color="#7C2D12"/></linearGradient></defs><rect width="600" height="150" fill="url(#nb${u})"/><circle cx="500" cy="42" r="26" fill="#FEF3C7"/><circle cx="512" cy="36" r="24" fill="#2A1546" opacity=".55"/>${[
        [60, 20, 3],
        [140, 45, 2.5],
        [230, 18, 3.2],
        [330, 40, 2.2],
        [420, 22, 2.8],
        [570, 70, 2.4],
      ]
        .map(([x, y, r]) => ESTRELA(x!, y!, r!))
        .join(
          "",
        )}<path d="M0 150 L0 125 Q80 105 160 125 T320 120 T480 128 T600 118 L600 150Z" fill="#14081F"/>${ABOBORA(90, 128, 16)}${ABOBORA(150, 134, 10)}${ABOBORA(520, 130, 14)}`,
    ),
  rosa: (u) =>
    svg(
      `<defs><radialGradient id="rs${u}" cx=".8" cy=".5"><stop offset="0" stop-color="#F9A8D4"/><stop offset="1" stop-color="#FDF2F8"/></radialGradient></defs><rect width="600" height="150" fill="url(#rs${u})"/>${LACO(480, 40, "#EC4899")}<text x="40" y="92" font-family="Quicksand, sans-serif" font-weight="700" font-size="30" fill="#9D174D">outubro rosa</text>`,
    ),
  azul: (u) =>
    svg(
      `<defs><radialGradient id="az${u}" cx=".8" cy=".5"><stop offset="0" stop-color="#93C5FD"/><stop offset="1" stop-color="#EFF6FF"/></radialGradient></defs><rect width="600" height="150" fill="url(#az${u})"/>${LACO(480, 40, "#2563EB")}<text x="40" y="92" font-family="Quicksand, sans-serif" font-weight="700" font-size="30" fill="#1E3A8A">novembro azul</text>`,
    ),
  black: () =>
    svg(
      `${ondas(500, 75, 5, "#0EF500", 22)}${[
        [120, 30],
        [220, 90],
        [330, 40],
      ]
        .map(
          ([x, y]) =>
            `<path transform="translate(${x} ${y})" d="M8 0 L-6 22 L4 22 L-4 44 L16 16 L6 16 L14 0Z" fill="#0EF500"/>`,
        )
        .join(
          "",
        )}<text x="40" y="135" font-family="Quicksand, sans-serif" font-weight="700" font-size="18" fill="#0EF500" opacity=".85">pico de atendimento · a gente segura</text>`,
      fundo("#000"),
    ),
  fimdeano: () =>
    svg(
      `${LUZES(8)}${FOGO(470, 80, 34, "#FDE047")}${FOGO(540, 60, 22, "#0EF500")}${FOGO(390, 100, 20, "#F43F5E")}${[
        [60, 110],
        [140, 90],
        [250, 120],
        [580, 130],
      ]
        .map(([x, y]) => ESTRELA(x!, y!, 2.6))
        .join("")}`,
      fundo("#0B1220"),
    ),
};

/** A arte de uma capa (a Sinal, se o código não existir). */
export function arteDaCapa(id: string, sufixo: string): string {
  return (ARTES[id] ?? ARTES["sinal"]!)(sufixo.replace(/[^a-zA-Z0-9]/g, ""));
}
export const CODIGOS_COM_ARTE = Object.keys(ARTES);

/** O enfeite da moldura da Noite das Bruxas (as abóboras e as estrelas em volta da foto). */
export const ENFEITE_DAS_BRUXAS = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ABOBORA(84, 84, 9)}${ABOBORA(14, 80, 6.5)}${ESTRELA(86, 16, 4.5)}${ESTRELA(10, 22, 3)}${ESTRELA(50, 3, 2.6)}</svg>`;
