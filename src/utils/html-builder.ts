import type {
  PrintContent,
  TextContent,
  LineContent,
  TableContent,
  FeedContent,
  BarcodeContent,
  QRCodeContent,
  PaperWidth,
  TextStyle,
} from '../types';
import { DEFAULTS } from '../types';
import { createLine, getCharsPerLine } from './format';

/**
 * CSS styles for thermal printer output
 */
function getBaseStyles(paperWidth: PaperWidth): string {
  const width = paperWidth === 58 ? '48mm' : '72mm';
  const fontSize = paperWidth === 58 ? '11px' : '12px';

  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${fontSize};
      line-height: 1.2;
      width: ${width};
      padding: 2mm;
      background: white;
      color: black;
    }
    .text { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
    .text-left { text-align: left; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-bold { font-weight: bold; }
    .text-underline { text-decoration: underline; }
    .text-invert { background: black; color: white; padding: 1px 3px; }
    .text-double-height { font-size: 1.5em; }
    .text-double-width { letter-spacing: 0.5em; }
    .text-double { font-size: 1.5em; letter-spacing: 0.3em; }
    .line { border-bottom: 1px dashed black; margin: 3px 0; }
    .table { width: 100%; border-collapse: collapse; }
    .table td { vertical-align: top; padding: 1px 0; }
    .feed { height: 1em; }
    .barcode { text-align: center; margin: 5px 0; }
    .barcode img { max-width: 100%; }
    .qrcode { text-align: center; margin: 5px 0; }
    .qrcode svg, .qrcode img { max-width: 60%; }
    @media print {
      body { width: 100%; padding: 0; }
      @page { margin: 0; size: ${width} auto; }
    }
  `;
}

/**
 * Build CSS classes for text style
 */
function getTextClasses(style?: TextStyle): string {
  const classes = ['text'];

  if (style) {
    if (style.align) classes.push(`text-${style.align}`);
    if (style.bold) classes.push('text-bold');
    if (style.underline) classes.push('text-underline');
    if (style.invert) classes.push('text-invert');
    if (style.size === 'double-height') classes.push('text-double-height');
    if (style.size === 'double-width') classes.push('text-double-width');
    if (style.size === 'double') classes.push('text-double');
  }

  return classes.join(' ');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * Render text content
 */
function renderText(content: TextContent): string {
  const classes = getTextClasses(content.style);
  const text = escapeHtml(content.value);
  return `<p class="${classes}">${text}</p>`;
}

/**
 * Render line separator
 */
function renderLine(content: LineContent, charsPerLine: number): string {
  const char = content.character || DEFAULTS.LINE_CHARACTER;
  const line = createLine(charsPerLine, char);
  return `<div class="line" aria-hidden="true">${escapeHtml(line)}</div>`;
}

/**
 * Render table content
 */
function renderTable(content: TableContent, _charsPerLine: number): string {
  const rows = content.rows
    .map((row) => {
      const cells = row
        .map((col) => {
          const align = col.align || 'left';
          const bold = col.bold ? 'font-weight:bold;' : '';
          const width = col.width ? `width:${typeof col.width === 'number' ? col.width + 'ch' : col.width};` : '';
          return `<td style="text-align:${align};${bold}${width}">${escapeHtml(col.text)}</td>`;
        })
        .join('');

      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table class="table"><tbody>${rows}</tbody></table>`;
}

/**
 * Render feed (empty lines)
 */
function renderFeed(content: FeedContent): string {
  const lines = content.lines || DEFAULTS.FEED_LINES;
  return `<div class="feed" style="height:${lines}em"></div>`;
}

/**
 * Render barcode (placeholder - needs external library)
 */
function renderBarcode(content: BarcodeContent): string {
  const align = content.options.align || 'center';
  // For actual barcode generation, you'd need a library like JsBarcode
  // This is a placeholder that shows the barcode value
  return `
    <div class="barcode" style="text-align:${align}">
      <div style="font-family:monospace;letter-spacing:3px;font-size:14px">
        ||| ${escapeHtml(content.value)} |||
      </div>
      ${content.options.showText !== false ? `<div style="font-size:10px">${escapeHtml(content.value)}</div>` : ''}
    </div>
  `;
}

/**
 * Render QR code (placeholder - needs external library)
 */
function renderQRCode(content: QRCodeContent): string {
  const align = content.options?.align || 'center';
  const size = (content.options?.size || DEFAULTS.QR_SIZE) * 20;
  // For actual QR generation, you'd need a library like qrcode
  // This is a placeholder
  return `
    <div class="qrcode" style="text-align:${align}">
      <div style="width:${size}px;height:${size}px;border:2px solid black;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:10px">
        QR: ${escapeHtml(content.value.substring(0, 20))}${content.value.length > 20 ? '...' : ''}
      </div>
    </div>
  `;
}

/**
 * Render single content item
 */
function renderContent(content: PrintContent, charsPerLine: number): string {
  switch (content.type) {
    case 'text':
      return renderText(content);
    case 'line':
      return renderLine(content, charsPerLine);
    case 'table':
      return renderTable(content, charsPerLine);
    case 'feed':
      return renderFeed(content);
    case 'barcode':
      return renderBarcode(content);
    case 'qrcode':
      return renderQRCode(content);
    case 'image':
      // Image rendering would require base64 handling
      return `<div class="image" style="text-align:${content.options?.align || 'center'}"><img src="${content.source}" style="max-width:100%"/></div>`;
    case 'cut':
      // Cut command is handled by printer, add visual separator in preview
      return '<div style="border-top:1px dashed #ccc;margin:10px 0"></div>';
    default:
      return '';
  }
}

/**
 * Build complete HTML document for printing
 */
export function buildHTML(
  contents: PrintContent[],
  paperWidth: PaperWidth = DEFAULTS.PAPER_WIDTH
): string {
  const charsPerLine = getCharsPerLine(paperWidth);
  const styles = getBaseStyles(paperWidth);

  const body = contents.map((c) => renderContent(c, charsPerLine)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${styles}</style>
</head>
<body>
${body}
</body>
</html>`;
}
