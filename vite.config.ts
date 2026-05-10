import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-big-calendar') || id.includes('/moment/'))
            return 'calendar';
          if (id.includes('firebase/auth') || id.includes('@firebase/auth'))
            return 'firebase-auth';
          if (id.includes('firebase/firestore') || id.includes('@firebase/firestore'))
            return 'firebase-firestore';
          if (id.includes('firebase/functions') || id.includes('@firebase/functions'))
            return 'firebase-functions';
          if (id.includes('firebase/') || id.includes('@firebase/'))
            return 'firebase-core';
          if (id.includes('react-router') || id.includes('@remix-run'))
            return 'router';
          if (id.includes('react-helmet'))
            return 'helmet';
          if (id.includes('react-dom') || id.includes('/react/'))
            return 'react-vendor';
        },
      },
    },
  },
})
