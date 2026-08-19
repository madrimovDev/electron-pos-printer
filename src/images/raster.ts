/**
 * Turns decoded pixels into the 1-bit raster an ESC/POS printer expects.
 *
 * The order matters and is not stylistic:
 *
 *   alpha over white -> luminance -> resize -> dither -> pack
 *
 * Resizing must precede dithering. Dithering first and resizing after would
 * average away the dot pattern that carries the tone, leaving mud — the same
 * shape of mistake as computing column widths before transliteration.
 */
import type { DecodedImage } from './png';

/** Rows are packed MSB first — bit 7 is the leftmost pixel. Black is 1. */
export interface RasterImage {
  width: number;
  height: number;
  /** `ceil(width / 8) * height` bytes. */
  data: Buffer;
}

export interface RasterizeOptions {
  /** Hard ceiling on output width, in printer dots. */
  maxWidth: number;
  /** Requested width. Clamped to maxWidth and to the source width. */
  width?: number;
  /** Defaults to 'threshold'. */
  dither?: 'threshold' | 'floyd-steinberg';
  /** Cutoff for 'threshold', 0-255. Defaults to 128. */
  threshold?: number;
}

/**
 * Rows per `GS v 0` command.
 *
 * Cheap printers have small buffers and drop a tall raster silently — the logo
 * simply never appears, with nothing to diagnose. Not configurable: a caller
 * has no information with which to choose a better value, and a wrong one
 * would only hide the problem.
 */
export const BAND_HEIGHT = 128;

interface Grayscale {
  gray: Float64Array;
  width: number;
  height: number;
}

/** Composites over white and converts to luminance in one pass. */
function toGrayscale({ width, height, pixels }: DecodedImage): Float64Array {
  const gray = new Float64Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const alpha = pixels[p + 3] / 255;
    const r = pixels[p] * alpha + 255 * (1 - alpha);
    const g = pixels[p + 1] * alpha + 255 * (1 - alpha);
    const b = pixels[p + 2] * alpha + 255 * (1 - alpha);
    // Luminance weights, not a channel average: an average renders pure green
    // as dark as pure blue, and a green logo would vanish.
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/** Box-average downscale. Returns the input untouched when no shrink is needed. */
function resize(gray: Float64Array, width: number, height: number, target: number): Grayscale {
  if (target >= width) return { gray, width, height };
  const outHeight = Math.max(1, Math.round(height / (width / target)));
  const out = new Float64Array(target * outHeight);
  for (let y = 0; y < outHeight; y++) {
    const y0 = Math.floor((y * height) / outHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / outHeight));
    for (let x = 0; x < target; x++) {
      const x0 = Math.floor((x * width) / target);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / target));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += gray[yy * width + xx];
          count++;
        }
      }
      out[y * target + x] = sum / count;
    }
  }
  return { gray: out, width: target, height: outHeight };
}

function ditherToBits(
  gray: Float64Array,
  width: number,
  height: number,
  mode: 'threshold' | 'floyd-steinberg',
  threshold: number
): Uint8Array {
  const bits = new Uint8Array(width * height);
  if (mode !== 'floyd-steinberg') {
    for (let i = 0; i < bits.length; i++) bits[i] = gray[i] < threshold ? 1 : 0;
    return bits;
  }
  const buffer = Float64Array.from(gray);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = buffer[i];
      const next = old < threshold ? 0 : 255;
      bits[i] = next === 0 ? 1 : 0;
      const error = old - next;
      const spread = (dx: number, dy: number, factor: number): void => {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < width && yy < height) buffer[yy * width + xx] += error * factor;
      };
      spread(1, 0, 7 / 16);
      spread(-1, 1, 3 / 16);
      spread(0, 1, 5 / 16);
      spread(1, 1, 1 / 16);
    }
  }
  return bits;
}

function pack(bits: Uint8Array, width: number, height: number): RasterImage {
  const rowBytes = Math.ceil(width / 8);
  const data = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x]) data[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height, data };
}

/** Converts decoded pixels into a 1-bit raster no wider than `maxWidth`. */
export function rasterize(image: DecodedImage, options: RasterizeOptions): RasterImage {
  const { maxWidth, dither = 'threshold', threshold = 128 } = options;
  // Never upscales: stretching a small logo to the paper width only makes it
  // blocky. The source width is part of the minimum for exactly that reason.
  const target = Math.min(options.width ?? image.width, maxWidth, image.width);
  const { gray, width, height } = resize(toGrayscale(image), image.width, image.height, target);
  return pack(ditherToBits(gray, width, height, dither, threshold), width, height);
}

/**
 * Splits a raster into bands of at most BAND_HEIGHT rows.
 *
 * Each band's `data` is a `subarray` view aliasing the parent raster's
 * buffer, not a copy — mutating one in place would mutate the source.
 */
export function toBands(raster: RasterImage): RasterImage[] {
  const rowBytes = Math.ceil(raster.width / 8);
  const bands: RasterImage[] = [];
  for (let y = 0; y < raster.height; y += BAND_HEIGHT) {
    const height = Math.min(BAND_HEIGHT, raster.height - y);
    bands.push({
      width: raster.width,
      height,
      data: raster.data.subarray(y * rowBytes, (y + height) * rowBytes),
    });
  }
  return bands;
}
