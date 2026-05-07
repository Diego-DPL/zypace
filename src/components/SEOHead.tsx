import { Helmet } from 'react-helmet-async';

const SITE_NAME  = 'Zypace';
const BASE_URL   = 'https://www.zypace.com';
const OG_IMAGE   = `${BASE_URL}/og-image.png`;

interface SEOHeadProps {
  title?:       string;   // page-specific title (appended with " | Zypace")
  description?: string;
  canonical?:   string;   // path e.g. "/privacy"
  noindex?:     boolean;
  jsonLd?:      object | object[];
}

export default function SEOHead({
  title,
  description,
  canonical = '/',
  noindex   = false,
  jsonLd,
}: SEOHeadProps) {
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : `${SITE_NAME} | Planes de entrenamiento inteligentes para runners`;

  const desc = description ??
    'Zypace genera planes de entrenamiento personalizados con IA, sincroniza tus actividades de Strava y te ayuda a preparar tu próxima carrera con métricas claras y progreso visual.';

  const canonicalUrl = `${BASE_URL}${canonical}`;

  const schemas = jsonLd
    ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd])
    : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {noindex
        ? <meta name="robots" content="noindex,nofollow" />
        : <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />
      }
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:type"        content="website" />
      <meta property="og:site_name"   content={SITE_NAME} />
      <meta property="og:title"       content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url"         content={canonicalUrl} />
      <meta property="og:image"       content={OG_IMAGE} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt"   content="Panel de entrenamiento Zypace — planes con IA para runners" />
      <meta property="og:locale"      content="es_ES" />

      {/* Twitter */}
      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:site"        content="@zypace" />
      <meta name="twitter:title"       content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image"       content={OG_IMAGE} />
      <meta name="twitter:image:alt"   content="Panel de entrenamiento Zypace" />

      {/* Structured data */}
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </Helmet>
  );
}
