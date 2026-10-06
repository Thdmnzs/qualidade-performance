import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { linkDaFoto } from "@/components/foto-de-perfil";
import { Button } from "@/components/ui/button";
import { iniciais } from "@/lib/foto";
import { arquivoDoPodio, degrausDoPodio, nomeNoPodio, type NoPodio } from "@/lib/ranking";

const LARGURA = 1600;
const ALTURA = 900; // 16:9

/** Carrega a foto para o canvas. "anonymous": sem isso, o canvas não poderia virar imagem. */
function carregarImagem(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolver) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = url;
  });
}

/**
 * Pódio da quinzena (especificação): 16:9, fundo verde vivo, três blocos pretos
 * arredondados (1º no centro e mais alto, 2º à esquerda, 3º à direita), foto num
 * círculo branco, coroa no 1º, medalhas nos demais, nome em minúsculas. O mesmo
 * desenho vira a imagem baixada. Nenhum valor de bônus aparece.
 */
export function Podio({
  titulo,
  pessoas,
  podeBaixar,
}: {
  titulo: string;
  pessoas: NoPodio[];
  podeBaixar: boolean;
}) {
  const tela = useRef<HTMLCanvasElement>(null);
  const [fotos, setFotos] = useState<Record<string, HTMLImageElement | null>>({});

  // Fotos de quem está no pódio (links temporários do armazenamento).
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const pares = await Promise.all(
        pessoas.map(async (p) => {
          const url = await linkDaFoto(p.employee_id);
          return [p.employee_id, url ? await carregarImagem(url) : null] as const;
        }),
      );
      if (vivo) setFotos(Object.fromEntries(pares));
    })();
    return () => {
      vivo = false;
    };
  }, [pessoas]);

  useEffect(() => {
    const ctx = tela.current?.getContext("2d");
    if (!ctx) return;
    void document.fonts
      .load('700 40px "Quicksand"')
      .finally(() => desenhar(ctx, titulo, pessoas, fotos));
  }, [titulo, pessoas, fotos]);

  function baixar() {
    const canvas = tela.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = arquivoDoPodio(titulo);
    a.click();
  }

  const descricao = degrausDoPodio(pessoas)
    .filter((d) => d.pessoas.length)
    .sort((a, b) => a.posicao - b.posicao)
    .map((d) => `${d.posicao}º ${d.pessoas.map((p) => p.nome).join(" e ")}`)
    .join(", ");

  return (
    <div>
      {podeBaixar && (
        <div className="mb-3 flex justify-end">
          <Button onClick={baixar} className="font-bold">
            <Download className="size-4" /> Baixar imagem
          </Button>
        </div>
      )}
      <canvas
        ref={tela}
        width={LARGURA}
        height={ALTURA}
        role="img"
        aria-label={`Pódio da ${titulo}: ${descricao}`}
        className="block aspect-video w-full rounded-2xl"
      />
      {podeBaixar && (
        <p className="mt-2 text-xs text-muted-foreground">
          A imagem é gerada em 1600 × 900 pixels, para compartilhar no Slack. Nenhum valor de bônus
          aparece.
        </p>
      )}
    </div>
  );
}

function desenhar(
  ctx: CanvasRenderingContext2D,
  titulo: string,
  pessoas: NoPodio[],
  fotos: Record<string, HTMLImageElement | null>,
) {
  ctx.clearRect(0, 0, LARGURA, ALTURA);
  ctx.fillStyle = "#0bd400";
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  ctx.fillStyle = "#06210f";
  ctx.textAlign = "left";
  ctx.font = '700 44px "Quicksand", sans-serif';
  ctx.fillText("fluke", 72, 96);
  ctx.textAlign = "center";
  ctx.font = '700 34px "Quicksand", sans-serif';
  ctx.fillText(`pódio · ${titulo.toLocaleLowerCase("pt-BR")}`, LARGURA / 2, 96);

  const lugar = {
    2: { cx: 400, h: 300, simbolo: "🥈" },
    1: { cx: 800, h: 420, simbolo: "👑" },
    3: { cx: 1200, h: 230, simbolo: "🥉" },
  };
  for (const { posicao, pessoas: doDegrau } of degrausDoPodio(pessoas)) {
    const { cx, h, simbolo } = lugar[posicao];
    const largura = 340;
    const y = ALTURA - h;
    ctx.fillStyle = "#0d0f0d";
    ctx.beginPath();
    ctx.roundRect(cx - largura / 2, y, largura, h + 40, 28);
    ctx.fill();

    // Fotos: uma no centro, ou lado a lado quando há empate.
    const n = Math.max(1, doDegrau.length);
    const r = n === 1 ? 92 : n === 2 ? 70 : 54;
    const passo = r * 2 + 24;
    const cy = y - 40;
    doDegrau.forEach((p, i) => {
      const x = cx + (i - (n - 1) / 2) * passo;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, cy, r + 10, 0, Math.PI * 2);
      ctx.fill();
      const foto = fotos[p.employee_id];
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.clip();
      if (foto) {
        ctx.drawImage(foto, x - r, cy - r, r * 2, r * 2);
      } else {
        ctx.fillStyle = "#e9ece9";
        ctx.fillRect(x - r, cy - r, r * 2, r * 2);
        ctx.fillStyle = "#0d0f0d";
        ctx.font = `700 ${Math.round(r * 0.7)}px "Quicksand", sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(iniciais(p.nome), x, cy + 2);
        ctx.textBaseline = "alphabetic";
      }
      ctx.restore();
    });
    if (doDegrau.length) {
      ctx.font = "64px serif";
      ctx.fillText(simbolo, cx, cy - r - 40);
    }

    // Nome(s) em minúsculas, reduzindo a fonte se não couber no bloco.
    const nomes = doDegrau.length ? doDegrau.map((p) => nomeNoPodio(p.nome)).join(" · ") : "—";
    let tamanho = 40;
    ctx.fillStyle = "#ffffff";
    do {
      ctx.font = `700 ${tamanho}px "Quicksand", sans-serif`;
      tamanho -= 2;
    } while (ctx.measureText(nomes).width > largura - 36 && tamanho > 18);
    ctx.fillText(nomes, cx, y + 120);
    ctx.fillStyle = "#0bd400";
    ctx.font = '700 76px "Quicksand", sans-serif';
    ctx.fillText(`${posicao}º`, cx, y + 220);
  }
}
