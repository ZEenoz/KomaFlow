import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8').toLowerCase();

const indexCss = readSource('../index.css');
const contentCss = readSource('../content/content.css');
const appTsx = readSource('../App.tsx');
const canvasFurniture = readSource('../studio/canvas/CanvasFurniture.ts');

const BRAND_TOKENS = ['#005a9c', '#1b365d', '#60c1e5', '#a0e0ef'];
const LEGACY_ROSE_TOKENS = ['#b82a52', '#d23360', '#e85c82', '#bb2952', '#f0819e', '#f4446d', '#ff2d75'];

describe('Ocean & Ice Navy palette', () => {
  it('defines every brand token across the theme and content styles', () => {
    const styles = indexCss + contentCss + appTsx;
    for (const token of BRAND_TOKENS) {
      expect(styles).toContain(token);
    }
  });

  it('keeps legacy rose accents out of theme and content CSS', () => {
    for (const legacy of LEGACY_ROSE_TOKENS) {
      expect(indexCss).not.toContain(legacy);
      expect(contentCss).not.toContain(legacy);
    }
    expect(indexCss).not.toContain('rgba(244, 68, 109');
  });

  it('draws selection and crop handles with a dual-tone contrast treatment', () => {
    expect(contentCss).toContain('border: 2px dashed #1b365d');
    expect(contentCss).toContain('outline: 1px dashed #60c1e5');
    expect(contentCss).toContain('border: 1px solid rgba(160, 224, 239, 0.55)');
    expect(canvasFurniture).toContain("bordercolor: string = '#1b365d'");
    expect(canvasFurniture).toContain('rgba(96, 193, 229, 0.95)');
  });
});
