import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PWA Compliance & Performance Audit (Step 9.3)', () => {
  const frontendDir = path.resolve(process.cwd(), '..', 'frontend');
  const manifestPath = path.join(frontendDir, 'public', 'manifest.json');
  const swPath = path.join(frontendDir, 'public', 'sw.js');
  const layoutPath = path.join(frontendDir, 'src', 'app', 'layout.tsx');
  const globalsCssPath = path.join(frontendDir, 'src', 'app', 'globals.css');
  const offlineStoragePath = path.join(frontendDir, 'src', 'lib', 'idb.ts');

  // 1. Audit Manifest PWA (W3C Web App Manifest standard)
  describe('1. W3C Web App Manifest Compliance', () => {
    it('Harus memiliki file manifest.json yang valid dan terdefinisi dengan lengkap', () => {
      expect(fs.existsSync(manifestPath)).toBe(true);
      const content = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      expect(manifest.name).toBe('SplitBill - Smart Fair Split');
      expect(manifest.short_name).toBe('SplitBill');
      expect(manifest.start_url).toBe('/');
      expect(manifest.display).toBe('standalone');
      expect(manifest.orientation).toBe('portrait');
      expect(manifest.theme_color).toBe('#2563eb');
      expect(manifest.background_color).toBe('#ffffff');
    });

    it('Harus memuat ikon PWA minimal resolusi 192x192 dan 512x512 maskable', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

      const has192 = manifest.icons.some(
        (icon: any) => icon.sizes === '192x192' && icon.type === 'image/png'
      );
      const has512 = manifest.icons.some(
        (icon: any) => icon.sizes === '512x512' && icon.type === 'image/png'
      );
      const hasMaskable = manifest.icons.some(
        (icon: any) => icon.purpose === 'maskable'
      );

      expect(has192).toBe(true);
      expect(has512).toBe(true);
      expect(hasMaskable).toBe(true);

      // Pastikan berkas fisik ikon benar-benar ada di direktori public/icons
      for (const icon of manifest.icons) {
        const iconFile = path.join(frontendDir, 'public', icon.src.replace(/^\//, ''));
        expect(fs.existsSync(iconFile)).toBe(true);
      }
    });
  });

  // 2. Audit Service Worker & Strategi Caching Offline (Serwist)
  describe('2. Service Worker & Offline Caching Strategy', () => {
    it('Harus memiliki Service Worker yang terkompilasi (sw.js)', () => {
      expect(fs.existsSync(swPath)).toBe(true);
      const swContent = fs.readFileSync(swPath, 'utf-8');
      expect(swContent.length).toBeGreaterThan(1000);
      // Service worker harus memuat runtime routing / precache
      expect(swContent).toMatch(/addEventListener\(['"]install['"]|addEventListener\(['"]activate['"]|self\.skipWaiting/);
    });

    it('Harus mendukung penyimpanan offline draft transaksi menggunakan IndexedDB', () => {
      expect(fs.existsSync(offlineStoragePath)).toBe(true);
      const offlineCode = fs.readFileSync(offlineStoragePath, 'utf-8');
      expect(offlineCode).toContain('indexedDB');
      expect(offlineCode).toContain('saveDraftToIDB');
      expect(offlineCode).toContain('getDraftFromIDB');
      expect(offlineCode).toContain('listDraftsFromIDB');
    });
  });

  // 3. Ergonomi Mobile & Safe Area Insets (iOS & Android notched screens)
  describe('3. Mobile Ergonomics & Safe Area Insets', () => {
    it('Layout root harus mendefinisikan viewportFit cover dan Safe Area Insets', () => {
      expect(fs.existsSync(layoutPath)).toBe(true);
      const layoutCode = fs.readFileSync(layoutPath, 'utf-8');

      expect(layoutCode).toContain('viewportFit: "cover"');
      expect(layoutCode).toContain('appleWebApp');
      expect(layoutCode).toContain('safe-top');
      expect(layoutCode).toContain('safe-bottom');
    });

    it('globals.css harus mengonfigurasi padding env(safe-area-inset)', () => {
      expect(fs.existsSync(globalsCssPath)).toBe(true);
      const css = fs.readFileSync(globalsCssPath, 'utf-8');

      expect(css).toContain('env(safe-area-inset-top');
      expect(css).toContain('env(safe-area-inset-bottom');
    });
  });

  // 4. Accessibility & Touch Targets (WCAG AAA Touch Target Standard >= 48px)
  describe('4. Accessibility & Mobile Touch Targets', () => {
    it('Komponen Item Tagging Workspace harus mematuhi target sentuh 48px', () => {
      const itemTaggingPath = path.join(frontendDir, 'src', 'components', 'item-tagging.tsx');
      expect(fs.existsSync(itemTaggingPath)).toBe(true);
      const code = fs.readFileSync(itemTaggingPath, 'utf-8');

      // Memeriksa keberadaan class minimum height/width 48px (min-h-[48px], min-w-[48px], p-3, h-12)
      expect(code).toMatch(/min-h-\[48px\]|min-w-\[48px\]|h-12|p-3/);
    });
  });
});
