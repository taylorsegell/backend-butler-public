// Preserve HA's surface/accent colors; derive readable ink for filled controls and
// tinted states. Cache source tokens so ordinary hass updates do not repeat canvas work.
type RGB = [number, number, number];
const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];
const sources = new WeakMap<HTMLElement, string>();
let context: CanvasRenderingContext2D | null | undefined;

const mix = (a: RGB, b: RGB, amount: number): RGB =>
  a.map((channel, i) => Math.round(channel * amount + b[i] * (1 - amount))) as RGB;
const css = (color: RGB) => `rgb(${color.join(', ')})`;
const luminance = (color: RGB) => color.map((channel) => {
  const value = channel / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
}).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
const contrast = (a: RGB, b: RGB) => {
  const light = luminance(a), dark = luminance(b);
  return (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05);
};
const minimumContrast = (ink: RGB, backgrounds: RGB[]) =>
  Math.min(...backgrounds.map((background) => contrast(ink, background)));

function bestInk(backgrounds: RGB[], preferred?: RGB): RGB {
  if (preferred && minimumContrast(preferred, backgrounds) >= 4.5) return preferred;
  return minimumContrast(BLACK, backgrounds) > minimumContrast(WHITE, backgrounds) ? BLACK : WHITE;
}

function readable(ink: RGB, backgrounds: RGB[]): RGB {
  if (minimumContrast(ink, backgrounds) >= 4.6) return ink;
  const target = bestInk(backgrounds);
  // Small hue-preserving steps, with headroom for browser color rounding.
  for (let step = 1; step <= 100; step++) {
    const candidate = mix(target, ink, step / 100);
    if (minimumContrast(candidate, backgrounds) >= 4.6) return candidate;
  }
  return target;
}

export function syncThemeContrast(host: HTMLElement): void {
  const style = getComputedStyle(host);
  const keys = ['--lk-surface', '--lk-elevated', '--lk-accent', '--lk-danger', '--text-primary-color', '--primary-text-color', '--secondary-text-color'];
  const values = keys.map((key) => style.getPropertyValue(key).trim());
  values.push(style.getPropertyValue('--primary-background-color').trim() || getComputedStyle(document.body).backgroundColor);
  const signature = values.join('|');
  if (sources.get(host) === signature) return;
  if (context === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    context = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!context) return;
  const read = (value: string, under: RGB = WHITE): RGB => {
    context!.clearRect(0, 0, 1, 1);
    context!.fillStyle = css(under);
    context!.fillStyle = value;
    context!.fillRect(0, 0, 1, 1);
    const [r, g, b, alpha] = context!.getImageData(0, 0, 1, 1).data;
    return mix([r, g, b], under, alpha / 255);
  };
  const surface = read(values[0], read(values[7]));
  const elevated = read(values[1], surface);
  const accent = read(values[2], surface);
  const danger = read(values[3], surface);
  const preferred = read(values[4] || '#ffffff');
  const backgrounds = [surface, elevated];
  const textBackgrounds = [...backgrounds, mix(accent, surface, .16), mix(danger, surface, .15)];
  const foreground = readable(read(values[5] || '#e9eaee'), textBackgrounds);
  const muted = readable(read(values[6] || '#9aa1ac'), [...textBackgrounds, mix(foreground, surface, .06)]);
  const derived: Record<string, RGB> = {
    '--lk-fg': foreground,
    '--lk-muted': muted,
    '--lk-on-accent': bestInk([accent], preferred),
    '--lk-on-danger': bestInk([danger], preferred),
    '--lk-accent-ink': readable(accent, [...backgrounds, mix(accent, surface, .16)]),
    '--lk-danger-ink': readable(danger, [...backgrounds, mix(danger, surface, .15)]),
    '--lk-focus': readable(accent, backgrounds),
  };
  sources.set(host, signature);
  for (const [key, value] of Object.entries(derived)) host.style.setProperty(key, css(value));
}
