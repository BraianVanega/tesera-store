import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CatalogPage } from "@/components/tienda/catalog";
import { CATEGORIES, categoryBySlug } from "@/lib/catalog/categories";

// Las categorías son fijas (sin base): se prerenderizan todas.
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ categoria: c.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/sex-shop/[categoria]">): Promise<Metadata> {
  const cat = categoryBySlug((await params).categoria);
  if (!cat) return {};
  return {
    title: `${cat.name} · Sex Shop online`,
    description: `${cat.name} en nuestro sex shop online. Envío discreto en caja neutra a todo el país y 10% OFF pagando por transferencia.`,
    alternates: { canonical: `/sex-shop/${cat.slug}` },
  };
}

export default function Categoria({ params, searchParams }: PageProps<"/sex-shop/[categoria]">) {
  return (
    <Suspense>
      <Category params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Category({
  params,
  searchParams,
}: Pick<PageProps<"/sex-shop/[categoria]">, "params" | "searchParams">) {
  const { categoria } = await params;
  if (!categoryBySlug(categoria)) notFound();
  return <CatalogPage category={categoria} searchParams={searchParams} />;
}
