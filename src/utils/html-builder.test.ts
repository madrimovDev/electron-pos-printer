import { describe, it, expect } from 'vitest';
import { buildHTML } from './html-builder';
import type { PrintContent } from '../types';

describe('buildHTML text and structure', () => {
  it('renders text content inside the body', () => {
    const html = buildHTML([{ type: 'text', value: 'Hello' }]);
    expect(html).toContain('<body>');
    expect(html).toContain('Hello');
  });

  it('escapes HTML special characters in text', () => {
    const html = buildHTML([{ type: 'text', value: '<script>alert(1)</script> & "quoted"' }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;quoted&quot;');
  });
});

describe('buildHTML image content', () => {
  const BASE64_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  it('renders bare base64 as a data URL, not a relative path', () => {
    const html = buildHTML([{ type: 'image', source: BASE64_PNG }]);
    expect(html).toContain(`<img src="data:image/png;base64,${BASE64_PNG}"`);
  });

  it('does not double-prefix a source that is already a data URL', () => {
    const dataUrl = `data:image/png;base64,${BASE64_PNG}`;
    const html = buildHTML([{ type: 'image', source: dataUrl }]);
    expect(html).toContain(`<img src="${dataUrl}"`);
    expect(html).not.toContain('data:image/png;base64,data:image/png;base64,');
  });

  it('honours the alignment option', () => {
    const html = buildHTML([{ type: 'image', source: BASE64_PNG, options: { align: 'right' } }]);
    expect(html).toContain('text-align:right');
  });
});

describe('buildHTML cashdraw and beep', () => {
  it('renders cashdraw as empty output', () => {
    const html = buildHTML([
      { type: 'text', value: 'before' },
      { type: 'cashdraw' },
      { type: 'text', value: 'after' },
    ]);
    // Nothing but the join separators between the two rendered text lines —
    // the cashdraw item contributed an empty string.
    expect(html).toContain('<p class="text">before</p>\n\n<p class="text">after</p>');
  });

  it('renders beep as empty output', () => {
    const html = buildHTML([{ type: 'beep' }]);
    const bodyMatch = html.match(/<body>\n([\s\S]*?)\n<\/body>/);
    expect(bodyMatch?.[1]).toBe('');
  });
});

describe('buildHTML exhaustiveness', () => {
  it('throws rather than silently dropping an unrecognised content type', () => {
    const bogus = { type: 'nonsense' } as unknown as PrintContent;
    expect(() => buildHTML([bogus])).toThrow(/Unhandled print content/);
  });
});
