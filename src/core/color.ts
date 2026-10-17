/** Utilitários de cor para os Núcleos da Alma. */
export interface RGB { r: number; g: number; b: number }

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function normalizeHex(input: string): string | null {
  let v = input.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) v = '#' + v.slice(1).split('').map((c) => c + c).join('');
  return HEX_RE.test(v) ? v.toUpperCase() : null;
}

export function hexToRgb(hex: string): RGB {
  const v = normalizeHex(hex) ?? '#7FB4FF';
  return { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) };
}

export function rgba(c: RGB, a: number): string {
  return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

export const WHITE: RGB = { r: 255, g: 255, b: 255 };
export const BLACK: RGB = { r: 0, g: 0, b: 0 };

/** Garante luminosidade mínima para que cores muito escuras ainda brilhem no fundo preto. */
export function luminous(c: RGB): RGB {
  const max = Math.max(c.r, c.g, c.b);
  if (max >= 120) return c;
  if (max === 0) return { r: 120, g: 120, b: 130 };
  const k = 120 / max;
  return { r: c.r * k, g: c.g * k, b: c.b * k };
}

export const CORE_PRESETS: { name: string; hex: string }[] = [
  { name: 'Glacial', hex: '#8FD3FF' },
  { name: 'Cobalto', hex: '#5B7CFF' },
  { name: 'Ametista', hex: '#C38BFF' },
  { name: 'Orquídea', hex: '#F2A7C3' },
  { name: 'Carmesim', hex: '#FF5D5D' },
  { name: 'Âmbar', hex: '#E8C27A' },
  { name: 'Jade', hex: '#7FFFD4' },
  { name: 'Esmeralda', hex: '#4ADE80' },
  { name: 'Lunar', hex: '#E8ECF5' },
];
