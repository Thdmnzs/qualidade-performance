import { describe, expect, it } from "vitest";

import { linhasDaNota, notasDoLead } from "../intercom";

// As notas reais do contato do print (MGA Serviços), como o Intercom as guarda (em HTML)
const B2B =
  '<p><b>B2B (43.180.755/0001-28)</b>: <a href="https://app-dash-fluke.vercel.app/clients/52a996a4-056d-477c-b9cf-9e57d6a8f320">https://app-dash-fluke.vercel.app/clients/52a996a4-056d-477c-b9cf-9e57d6a8f320</a></p><p>wave</p><p><a href="https://wave-telecall-admin.vercel.app/line-holders/916b919f?company=fluke">https://wave-telecall-admin.vercel.app/line-holders/916b919f?company=fluke</a></p>';
const B2C =
  '<p>B2C (Aline - CANCELED): <a href="https://sos-fluke.web.app/#/customers/kFNOTh6eCSPSHuhCnS93e9ySXeo2/show">link</a></p>';

describe("as notas do lead", () => {
  it("uma nota real: as linhas, com os links preservados", () => {
    expect(linhasDaNota(B2B)).toEqual([
      [
        { texto: "B2B (43.180.755/0001-28): " },
        {
          texto: "https://app-dash-fluke.vercel.app/clients/52a996a4-056d-477c-b9cf-9e57d6a8f320",
          url: "https://app-dash-fluke.vercel.app/clients/52a996a4-056d-477c-b9cf-9e57d6a8f320",
        },
      ],
      [{ texto: "wave" }],
      [
        {
          texto: "https://wave-telecall-admin.vercel.app/line-holders/916b919f?company=fluke",
          url: "https://wave-telecall-admin.vercel.app/line-holders/916b919f?company=fluke",
        },
      ],
    ]);
  });
  it("o texto do link quando ele é diferente do endereço", () => {
    expect(linhasDaNota(B2C)).toEqual([
      [
        { texto: "B2C (Aline - CANCELED): " },
        {
          texto: "link",
          url: "https://sos-fluke.web.app/#/customers/kFNOTh6eCSPSHuhCnS93e9ySXeo2/show",
        },
      ],
    ]);
  });
  it("a segurança: nenhum HTML vira código, e um link perigoso vira só texto", () => {
    const l = linhasDaNota(
      '<p>oi <script>alert(1)</script><img src=x onerror="alert(2)"> <a href="javascript:alert(3)">clique</a></p>',
    );
    expect(l).toEqual([[{ texto: "oi [imagem] clique" }]]);
  });
  it("as notas da mais nova para a mais antiga; as vazias (como a do ponto sozinho) saem", () => {
    const n = notasDoLead([
      { id: 1, body: B2C, created_at: 100, author: { name: "Amanda" } },
      { id: 2, body: "<p></p>", created_at: 300 },
      { id: 4, body: "<p>.</p>", created_at: 400 }, // a nota do ponto sozinho, como no print
      { id: 3, body: B2B, created_at: 200, author: { name: "Kaio" } },
    ]);
    expect(n.map((x) => [x.id, x.autor])).toEqual([
      ["3", "Kaio"],
      ["1", "Amanda"],
    ]);
  });
});
