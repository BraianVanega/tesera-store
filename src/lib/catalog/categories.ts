/**
 * Categorías de la tienda (las del diseño aprobado, design/reference/Tienda-Home).
 * El slug va en la URL literal para SEO: /sex-shop/[categoria] (docs/01, docs/09).
 * `silhouette`: forma CSS que se muestra mientras el producto no tiene fotos reales (docs/02).
 */
export const CATEGORIES = [
  { slug: "succionadores", name: "Succionadores", silhouette: "sh-glow" },
  { slug: "vibradores", name: "Vibradores", silhouette: "sh-night" },
  { slug: "anal", name: "Anal", silhouette: "sh-skin" },
  { slug: "lubricantes", name: "Lubricantes", silhouette: "sh-bottle" },
  { slug: "lenceria", name: "Lencería", silhouette: "sh-lace" },
  { slug: "kits", name: "Kits", silhouette: "sh-kit" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

/** Categoría de los borradores importados de SM (la API no trae categoría). Nunca se publica. */
export const UNCATEGORIZED = "sin-categoria";

export function isCategory(slug: string): slug is CategorySlug {
  return CATEGORIES.some((c) => c.slug === slug);
}

export function categoryBySlug(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug);
}

/** Silueta por categoría; las desconocidas usan la genérica del diseño. */
export function silhouetteFor(category: string): string {
  return categoryBySlug(category)?.silhouette ?? "sh-x";
}
