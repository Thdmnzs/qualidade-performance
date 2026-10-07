import { Copy, Download } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { nomeDoArquivo, paraCsv, type Coluna } from "@/lib/exportar";

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Um cartão do Painel com "Baixar CSV" (os dados do gráfico ou da tabela) e,
 * nos gráficos, "Copiar imagem" (o cartão inteiro, com o título e a legenda, para
 * colar no PowerPoint). Os botões ficam de fora da imagem.
 */
export function CartaoDoGrafico<T>({
  titulo,
  descricao,
  linhas,
  colunas,
  imagem = true,
  className = "",
  children,
}: {
  titulo: string;
  descricao?: string;
  linhas: T[];
  colunas: Coluna<T>[];
  /** Tabelas: só o CSV. */
  imagem?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [copiando, setCopiando] = useState(false);

  const gerarImagem = async (): Promise<Blob> => {
    const { toBlob } = await import("html-to-image"); // carregada só quando alguém copia
    const no = ref.current!;
    const blob = await toBlob(no, {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(no).backgroundColor,
      filter: (n) => !(n instanceof HTMLElement && n.dataset["semImagem"] !== undefined),
    });
    if (!blob) throw new Error("A imagem saiu vazia.");
    return blob;
  };

  const copiar = async () => {
    if (!ref.current) return;
    setCopiando(true);
    try {
      // A cópia começa DENTRO do clique (o Safari exige): a imagem vai como promessa.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": gerarImagem() })]);
          toast.success("Gráfico copiado. Cole no PowerPoint com Ctrl+V.");
          return;
        } catch {
          // Sem permissão para imagens na área de transferência: baixa o PNG.
        }
      }
      baixar(await gerarImagem(), `${nomeDoArquivo(titulo)}.png`);
      toast.info("O navegador não permitiu copiar a imagem; ela foi baixada em PNG.");
    } catch {
      toast.error("Não foi possível gerar a imagem do gráfico.");
    } finally {
      setCopiando(false);
    }
  };

  return (
    <section ref={ref} className={`rounded-2xl border border-border bg-card p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">{titulo}</h2>
          {descricao && <p className="text-xs">{descricao}</p>}
        </div>
        <div className="flex gap-1" data-sem-imagem="">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!linhas.length}
            onClick={() =>
              baixar(
                new Blob([paraCsv(linhas, colunas)], { type: "text/csv;charset=utf-8" }),
                `${nomeDoArquivo(titulo)}.csv`,
              )
            }
          >
            <Download className="size-3.5" /> CSV
          </Button>
          {imagem && (
            <Button type="button" size="sm" variant="ghost" disabled={copiando} onClick={copiar}>
              <Copy className="size-3.5" /> {copiando ? "Copiando..." : "Copiar imagem"}
            </Button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
