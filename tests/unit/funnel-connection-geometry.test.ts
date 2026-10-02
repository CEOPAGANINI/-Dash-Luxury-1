import { describe, expect, it } from "vitest";
import {
  anchorPoint,
  connectionControls,
  connectionMidpoint,
  connectionPath,
  moveConnectionControls,
  perimeterAnchor,
  SOURCE_ANCHOR,
  TARGET_ANCHOR,
} from "@/features/funnel/connection-geometry";
import {
  cloneFunnelGraph,
  parseFunnelClipboard,
} from "@/features/funnel/funnel-graph";
import {
  funilSemArquivosTemporarios,
  validarFunnelData,
} from "@/features/funnel/funnel-validation";
import type { EstiloLinha, FunnelData } from "@/features/funnel/funnel-model";

const bounds = { x: -130, y: 210, w: 280, h: 200 };
const start = { x: 10, y: 30 };
const end = { x: 400, y: 200 };
const style: EstiloLinha = {
  forma: "livre",
  pontos: [
    { x: 210, y: -40 },
    { x: 290, y: 260 },
  ],
  sourceAnchor: { side: "top", offset: 0.17 },
  targetAnchor: { side: "bottom", offset: 0.83 },
  cor: "#123abc",
  espessura: 3,
  fluxo: false,
};
function fixture(): FunnelData {
  return {
    id: "funnel",
    nome: "Funil",
    projeto: "",
    nodes: [
      {
        id: "source",
        type: "redirect",
        title: "Origem",
        x: 10,
        y: 20,
        redir: {
          regras: [
            {
              id: "rule",
              tipo: "regiao",
              paises: ["BR"],
              dispositivos: [],
              percentual: 100,
              destino: "",
              destinoNoId: "target",
              ativo: true,
              estilo: structuredClone(style),
            },
          ],
        },
      },
      { id: "target", type: "sales", title: "Destino", x: 400, y: 200 },
    ],
    edges: [
      {
        id: "edge",
        source: "source",
        target: "target",
        estilo: structuredClone(style),
      },
    ],
  };
}

describe("connection geometry", () => {
  it.each(["top", "right", "bottom", "left"] as const)(
    "preserves any position along the entire %s side, including both corners",
    (side) => {
      for (const offset of [0, 0.17, 0.53, 0.83, 1]) {
        const anchor = { side, offset };
        const point = anchorPoint(bounds, anchor);
        expect(perimeterAnchor(bounds, point, side).side).toBe(side);
        expect(perimeterAnchor(bounds, point, side).offset).toBeCloseTo(offset);
        const resized = { ...bounds, w: 700, h: 90 };
        expect(
          perimeterAnchor(resized, anchorPoint(resized, anchor), side).offset,
        ).toBeCloseTo(offset);
      }
    },
  );

  it("projects outside pointer positions onto the closest side without exceeding its corners", () => {
    expect(
      perimeterAnchor(bounds, { x: bounds.x + 60, y: bounds.y - 25 }),
    ).toEqual({ side: "top", offset: 60 / 280 });
    expect(perimeterAnchor(bounds, { x: 1000, y: bounds.y + 150 })).toEqual({
      side: "right",
      offset: 0.75,
    });
    expect(perimeterAnchor(bounds, { x: -1000, y: -1000 }, "left")).toEqual({
      side: "left",
      offset: 0,
    });
  });

  it("retains legacy right/left center anchors and the exact original default curve", () => {
    expect(anchorPoint(bounds, SOURCE_ANCHOR)).toEqual({ x: 150, y: 310 });
    expect(anchorPoint(bounds, TARGET_ANCHOR)).toEqual({ x: -130, y: 310 });
    expect(connectionPath(start, end, undefined, 8000)).toBe(
      "M 8010 8030 C 8205 8030, 8205 8200, 8400 8200",
    );
  });

  it("curves outward from the chosen top and bottom anchors", () => {
    const controls = connectionControls(start, end, {
      sourceAnchor: style.sourceAnchor,
      targetAnchor: style.targetAnchor,
    });
    expect(controls[0].x).toBe(start.x);
    expect(controls[0].y).toBeLessThan(start.y);
    expect(controls[1].x).toBe(end.x);
    expect(controls[1].y).toBeGreaterThan(end.y);
  });

  it.each([1, 2])(
    "moves the visible midpoint by the exact pointer delta with %i control points",
    (count) => {
      const before: EstiloLinha = {
        forma: "livre",
        pontos: style.pontos!.slice(0, count),
      };
      const midpoint = connectionMidpoint(start, end, before);
      const delta = { x: -53.5, y: 87.25 };
      const after = {
        ...before,
        pontos: moveConnectionControls(before.pontos!, delta),
      };
      const moved = connectionMidpoint(start, end, after);
      expect(moved.x).toBeCloseTo(midpoint.x + delta.x);
      expect(moved.y).toBeCloseTo(midpoint.y + delta.y);
      expect(before.pontos).toEqual(style.pontos!.slice(0, count));
    },
  );

  it("supports a vertical orthogonal path and uses world coordinates only once", () => {
    expect(
      connectionPath(
        start,
        end,
        { forma: "cotovelo", sourceAnchor: { side: "bottom", offset: 0.5 } },
        8000,
      ),
    ).toBe("M 8010 8030 V 8115 H 8400 V 8200");
    expect(connectionPath(start, end, { forma: "reta" }, 8000)).toBe(
      "M 8010 8030 L 8400 8200",
    );
  });
});

describe("connection persistence", () => {
  it("retains manual and redirect-rule anchors, controls, color, thickness and disabled flow across JSON validation/reload", () => {
    const restored = funilSemArquivosTemporarios(
      JSON.parse(JSON.stringify(fixture())),
    );
    expect(restored.edges[0].estilo).toEqual(style);
    expect(restored.nodes[0].redir?.regras[0].estilo).toEqual(style);
    expect(restored.nodes[0].redir?.regras[0].destinoNoId).toBe("target");
  });

  it("retains normalized anchors when copying both kinds of connection and translates only world control points", () => {
    const data = fixture();
    const clipboard = parseFunnelClipboard(data)!;
    const copy = cloneFunnelGraph({
      ...clipboard,
      offset: { x: 100, y: -40 },
      createId: (kind, id) => `${kind}-${id}`,
    });
    for (const copied of [
      copy.edges[0].estilo,
      copy.nodes[0].redir?.regras[0].estilo,
    ]) {
      expect(copied?.sourceAnchor).toEqual(style.sourceAnchor);
      expect(copied?.targetAnchor).toEqual(style.targetAnchor);
      expect(copied?.pontos).toEqual([
        { x: 310, y: -80 },
        { x: 390, y: 220 },
      ]);
      expect(copied?.cor).toBe(style.cor);
      expect(copied?.fluxo).toBe(false);
    }
    expect(copy.nodes[0].redir?.regras[0].destinoNoId).toBe("node-target");
    expect(data.edges[0].estilo).toEqual(style);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid anchor offset %s before it enters the graph",
    (offset) => {
      const data = fixture();
      data.edges[0].estilo!.sourceAnchor!.offset = offset;
      expect(() => validarFunnelData(data)).toThrow();
    },
  );
});
