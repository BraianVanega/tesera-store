import Image from "next/image";
import Link from "next/link";
import type { CatalogProduct } from "@/lib/catalog/queries";
import type { ProductBadge } from "@/lib/shop/view";
import { priceView } from "@/lib/shop/view";

const AMBIENT = new Set(["sh-glow", "sh-night", "sh-skin"]);

/** Las siluetas "de ambiente" son para categorías; un producto sin foto usa la forma genérica. */
export function productShape(silhouette: string): string {
  return AMBIENT.has(silhouette) ? "sh-x" : silhouette;
}

/** Foto a sangre sobre gris cálido; sin fotos reales, la silueta CSS del diseño. */
export function ProductMedia({
  product,
  image = 0,
  aspect = "aspect-[4/5]",
  sizes,
  priority = false,
  children,
}: {
  product: Pick<CatalogProduct, "name" | "images" | "silhouette">;
  image?: number;
  aspect?: string;
  sizes: string;
  priority?: boolean;
  children?: React.ReactNode;
}) {
  const img = product.images[image];
  return (
    <div className={img ? "m-ph-img" : productShape(product.silhouette)}>
      <div className={`m-ph ${aspect}`}>
        <div className="m-ph-in">
          {img && (
            <Image
              src={img.url}
              alt={product.name}
              data-product-img=""
              fill
              sizes={sizes}
              priority={priority}
            />
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Badge({ badge, className = "" }: { badge: ProductBadge; className?: string }) {
  return <span className={`b b-${badge.kind} ${className}`}>{badge.text}</span>;
}

/** Tarjeta "viva": foto 4:5 con badge y "ver opciones", nombre y doble precio centrados. */
export function ProductCard({
  product,
  badge,
  sizes = "(min-width: 1024px) 25vw, 276px",
  className = "",
}: {
  product: CatalogProduct;
  badge: ProductBadge;
  sizes?: string;
  className?: string;
}) {
  const price = priceView(product.price);
  return (
    <Link
      href={`/producto/${product.slug}`}
      className={`p-card flex flex-col gap-3 text-text no-underline lg:gap-3.5 ${badge.available ? "" : "opacity-70"} ${className}`}
    >
      <ProductMedia product={product} sizes={sizes}>
        <span className="absolute top-3 left-3 flex flex-col items-start gap-1.5 lg:top-3.5 lg:left-3.5">
          <Badge badge={badge} />
          {product.lowStock && badge.available && (
            <span className="b b-envio">Últimas unidades</span>
          )}
        </span>
        <span className="m-quick">ver opciones</span>
      </ProductMedia>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-base font-medium sm:text-[17px] lg:text-lg">{product.name}</span>
        {product.description && <span className="text-sm text-text-2">{product.description}</span>}
        {badge.available && (
          <>
            <span className="text-[17px] font-semibold">
              {price.transfer}{" "}
              <span className="text-[13px] font-medium whitespace-nowrap text-text-2">
                con transferencia
              </span>
            </span>
            <span className="pr-lista">{price.list} con Mercado Pago o tarjeta</span>
          </>
        )}
      </div>
    </Link>
  );
}

export function ProductGridSkeleton({
  count = 4,
  cols = "grid-cols-2 lg:grid-cols-4",
}: {
  count?: number;
  cols?: string;
}) {
  return (
    <div className={`grid gap-3 lg:gap-4 ${cols}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="m-ph aspect-[4/5] animate-pulse" />
          <div className="mx-auto h-4 w-2/3 rounded-full bg-surface" />
          <div className="mx-auto h-4 w-1/2 rounded-full bg-surface" />
        </div>
      ))}
    </div>
  );
}
