import type { Metadata } from "next";
import { CatalogPage } from "@/components/tienda/catalog";

export const metadata: Metadata = {
  title: "Sex Shop online: catálogo completo",
  description:
    "Catálogo del sex shop: succionadores, vibradores, lubricantes, lencería y kits. Envío discreto en caja neutra y 10% OFF por transferencia.",
  alternates: { canonical: "/sex-shop" },
};

export default function SexShop({ searchParams }: PageProps<"/sex-shop">) {
  return <CatalogPage searchParams={searchParams} />;
}
