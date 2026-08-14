/**
 * DTCG 2025.10 color value: object form with colorSpace + components,
 * hex included as a fallback for tools that don't parse the object form.
 */
export interface DtcgColorValue {
  colorSpace: "srgb";
  components: [number, number, number];
  alpha: number;
  hex: string;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function channelToHex(c: number): string {
  return Math.round(Math.max(0, Math.min(1, c)) * 255)
    .toString(16)
    .padStart(2, "0");
}

export function rgbaToDtcgColor(r: number, g: number, b: number, a: number): DtcgColorValue {
  return {
    colorSpace: "srgb",
    components: [round(r, 4), round(g, 4), round(b, 4)],
    alpha: round(a, 4),
    hex: `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`
  };
}
