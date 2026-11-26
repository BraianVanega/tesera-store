/**
 * Catálogo de EJEMPLO para desarrollo (Fase 2): 12 productos sin fotos (la tienda muestra la
 * silueta CSS de su categoría). Cubre todos los casos de disponibilidad:
 * local + SM, solo SM (en MdP: 5 a 10 días), consumibles, agotado, bajo stock, solo local.
 *
 *   pnpm db:seed
 *
 * Idempotente: se puede correr varias veces. Nunca corre contra producción.
 */
import { quantityFromMovements } from "../src/lib/domain/inventory";
import { scriptDb } from "../scripts/lib/db";

if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
  console.error("El seed de ejemplo no corre en producción.");
  process.exit(1);
}

type Demo = {
  slug: string;
  name: string;
  description: string;
  category: string;
  price: number;
  cost: number;
  isConsumable?: boolean;
  local: number; // unidades en Mar del Plata
  sm: number; // stock informado por SM (tope 20)
};

// Nombres y precios de los primeros 6 tomados del diseño aprobado (Tienda-Home).
const DEMO: Demo[] = [
  {
    slug: "succionador-brasa",
    name: "Succionador Brasa",
    description: "Recargable y silencioso",
    category: "succionadores",
    price: 54_900,
    cost: 29_000,
    local: 2,
    sm: 12,
  },
  {
    slug: "vibrador-nocturno",
    name: "Vibrador Nocturno",
    description: "Silicona suave, 3 velocidades",
    category: "vibradores",
    price: 42_500,
    cost: 22_500,
    local: 0,
    sm: 8,
  },
  {
    slug: "gel-base-agua",
    name: "Gel base agua",
    description: "Lubricante con aloe, 100 ml",
    category: "lubricantes",
    price: 11_900,
    cost: 5_900,
    isConsumable: true,
    local: 5,
    sm: 20,
  },
  {
    slug: "kit-primeros-pasos",
    name: "Kit Primeros pasos",
    description: "Todo en una caja neutra",
    category: "kits",
    price: 49_900,
    cost: 26_000,
    local: 1,
    sm: 6,
  },
  {
    slug: "aceite-de-masaje",
    name: "Aceite de masaje",
    description: "Tibio, notas de ámbar",
    category: "lubricantes",
    price: 18_900,
    cost: 9_400,
    isConsumable: true,
    local: 0,
    sm: 10,
  },
  {
    slug: "conjunto-de-encaje",
    name: "Conjunto de encaje",
    description: "Cómodo y lindo",
    category: "lenceria",
    price: 29_900,
    cost: 15_500,
    local: 0,
    sm: 3,
  },
  {
    slug: "succionador-ola",
    name: "Succionador Ola",
    description: "Diez intensidades, resistente al agua",
    category: "succionadores",
    price: 61_900,
    cost: 33_000,
    local: 0,
    sm: 0,
  },
  {
    slug: "bala-vibradora-mini",
    name: "Bala vibradora Mini",
    description: "Chiquita y discreta",
    category: "vibradores",
    price: 19_900,
    cost: 9_900,
    local: 3,
    sm: 15,
  },
  {
    slug: "plug-de-silicona-inicial",
    name: "Plug de silicona inicial",
    description: "Para empezar con calma",
    category: "anal",
    price: 16_900,
    cost: 8_200,
    local: 1,
    sm: 9,
  },
  {
    slug: "kit-anal-calma",
    name: "Kit anal Calma",
    description: "Tres tamaños, silicona suave",
    category: "anal",
    price: 34_900,
    cost: 18_000,
    local: 0,
    sm: 5,
  },
  {
    slug: "body-de-tul",
    name: "Body de tul",
    description: "Liviano, talle único",
    category: "lenceria",
    price: 25_900,
    cost: 13_000,
    local: 2,
    sm: 0,
  },
  {
    slug: "kit-noche-de-a-dos",
    name: "Kit Noche de a dos",
    description: "Para regalar o regalarse",
    category: "kits",
    price: 58_900,
    cost: 31_000,
    local: 0,
    sm: 11,
  },
];

const stockState = (n: number) => (n === 0 ? "agotado" : n <= 3 ? "bajo_stock" : "disponible");

async function main() {
  const db = scriptDb();
  const now = new Date();
  try {
    for (const [i, d] of DEMO.entries()) {
      const product = await db.product.upsert({
        where: { slug: d.slug },
        create: {
          slug: d.slug,
          name: d.name,
          description: d.description,
          category: d.category,
          price: d.price,
          isConsumable: d.isConsumable ?? false,
          published: true,
        },
        update: {},
      });

      const sku = `DEMO-${String(i + 1).padStart(3, "0")}`;
      for (const mode of ["DROPSHIP", "STOCK"] as const) {
        const data = { cost: d.cost, stock: d.sm, stockState: stockState(d.sm), syncedAt: now };
        await db.supplierOffer.upsert({
          where: { supplier_supplierSku_mode: { supplier: "SM", supplierSku: sku, mode } },
          create: { productId: product.id, supplier: "SM", supplierSku: sku, mode, ...data },
          update: data,
        });
      }

      // Stock local: solo la primera vez, con un IN para que quantity salga de los movimientos.
      const hasStock = await db.localStock.findUnique({ where: { productId: product.id } });
      if (!hasStock) {
        const movements = d.local > 0 ? [{ type: "IN" as const, quantity: d.local }] : [];
        await db.localStock.create({
          data: {
            productId: product.id,
            quantity: quantityFromMovements(movements),
            movements: {
              create: movements.map((m) => ({ ...m, unitCost: d.cost, note: "Seed de ejemplo" })),
            },
          },
        });
      }
    }
    console.log(`Seed listo: ${DEMO.length} productos de ejemplo.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
