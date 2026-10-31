import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The single-file build (tools/singlefile.mjs): everything (code, models, textures, sounds) inlined
 * into one page, for hosts that serve one HTML file. The page's own fonts are left out here: that
 * page takes them from Google Fonts instead.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'no-local-fonts',
      enforce: 'pre',
      resolveId(id) {
        return id.endsWith('fonts.css') ? '\0empty-fonts.css' : null;
      },
      load(id) {
        return id === '\0empty-fonts.css' ? '' : null;
      },
    },
  ],
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 20000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
