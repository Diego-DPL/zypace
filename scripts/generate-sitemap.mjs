#!/usr/bin/env node
import { writeFile } from 'fs/promises';

// Rutas públicas que queremos indexar
const baseUrl = 'https://www.zypace.com';
const routes = [
  '/',
  '/login',
  '/register',
  '/privacy',
  '/terms',
  '/security',
  '/cookies'
];

const now = new Date().toISOString();
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(r=>`  <url>\n    <loc>${baseUrl + r}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${r==='/'?'weekly':'monthly'}</changefreq>\n    <priority>${r==='/'?'1.0':'0.5'}</priority>\n  </url>`).join('\n')}\n</urlset>\n`;

await writeFile(new URL('../public/sitemap.xml', import.meta.url), xml, 'utf8');
console.log('Sitemap actualizado con', routes.length, 'rutas.');
