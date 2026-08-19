import type { RasterImage } from '../raster';

/**
 * Renders a 1-bit raster as text, so a dithering result can be judged by eye.
 *
 * dumpESCPOS shows that a raster command was emitted and how large it is, but
 * not what it looks like — and with no thermal printer available, looking at
 * the image is the only way to catch a rasteriser that is wrong in a way the
 * byte assertions do not describe.
 */
export function toAscii(raster: RasterImage): string {
  const rowBytes = Math.ceil(raster.width / 8);
  const lines: string[] = [];
  for (let y = 0; y < raster.height; y++) {
    let line = '';
    for (let x = 0; x < raster.width; x++) {
      line += raster.data[y * rowBytes + (x >> 3)] & (0x80 >> (x & 7)) ? '#' : '.';
    }
    lines.push(line);
  }
  return lines.join('\n');
}
