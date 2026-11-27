import { expect, test } from "@playwright/test";

/**
 * Flujos de la tienda (Fase 4). Necesitan la base con el catálogo de ejemplo: `pnpm db:seed`.
 * Cada test arranca con cookies limpias (contexto nuevo).
 */

test("elegir CP de Mar del Plata muestra disponibilidad local", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "¿Estás en Mar del Plata?" })).toBeVisible();
  await page.getByRole("main").getByLabel("Código postal").fill("7600");
  await page.getByRole("main").getByRole("button", { name: "ver" }).click();
  await expect(page.getByRole("main").getByText("Hoy en Mar del Plata").first()).toBeVisible();
  const cookies = await page.context().cookies();
  expect(decodeURIComponent(cookies.find((c) => c.name === "tsr_zona")?.value ?? "")).toBe(
    "MDP:7600",
  );
});

test("CP inválido muestra un error claro", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByLabel("Código postal").fill("12");
  await page.getByRole("main").getByRole("button", { name: "ver" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "código postal" })).toContainText(
    "4 números",
  );
});

test("consumible fuera de MdP: no disponible y sin botón de compra", async ({ page, context }) => {
  await context.addCookies([
    { name: "tsr_zona", value: "AMBA:1425", url: test.info().project.use.baseURL! },
  ]);
  await page.goto("/producto/gel-base-agua");
  await expect(page.getByText("Este producto no se vende en tu zona.")).toBeVisible();
  await expect(page.getByRole("button", { name: "agregar al carrito" })).toHaveCount(0);
});

test("agregar al carrito desde la ficha y cambiar cantidad", async ({ page, context }) => {
  await context.addCookies([
    { name: "tsr_zona", value: "MDP:7600", url: test.info().project.use.baseURL! },
  ]);
  await page.goto("/producto/succionador-brasa");
  await expect(page.getByText("Lo recibís hoy con cadete")).toBeVisible();
  await page.getByRole("button", { name: "agregar al carrito" }).click();
  await expect(page.getByText("Listo, está en tu pedido.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Carrito, 1 producto" })).toBeVisible();

  await page.goto("/carrito");
  await expect(page).toHaveTitle("Mi pedido");
  await expect(page.getByRole("heading", { name: "Llega hoy" })).toBeVisible();
  await page.getByRole("button", { name: "Agregar una unidad" }).click();
  await expect(
    page.getByRole("group", { name: "Cantidad de Succionador Brasa" }).locator("output"),
  ).toHaveText("2");
  await expect(page.getByText(/encargo/i)).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("carrito mixto en MdP: dos tandas y 'todo junto'", async ({ page, context }) => {
  const base = test.info().project.use.baseURL!;
  await context.addCookies([{ name: "tsr_zona", value: "MDP:7600", url: base }]);
  for (const slug of ["gel-base-agua", "vibrador-nocturno"]) {
    await page.goto(`/producto/${slug}`);
    await page.getByRole("button", { name: "agregar al carrito" }).click();
    await expect(page.getByText("Listo, está en tu pedido.")).toBeVisible();
  }
  await page.goto("/carrito");
  await expect(page.getByRole("heading", { name: "Tanda 1 · Hoy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tanda 2 · Llega después" })).toBeVisible();
  await page.getByRole("switch", { name: "Prefiero recibir todo junto" }).click();
  await expect(page.getByRole("heading", { name: "Todo junto" })).toBeVisible();
});

test("modo discreto: persiste, título neutro y 'Salir ya' limpia y se va", async ({ page }) => {
  await page.route("https://www.smn.gob.ar/**", (r) =>
    r.fulfill({ body: "<title>Clima</title>ok", contentType: "text/html" }),
  );
  await page.goto("/sex-shop");
  await page.getByRole("switch", { name: "Modo discreto" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "discreto");
  await expect(page).toHaveTitle("Mi pedido");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "discreto");
  await expect(page).toHaveTitle("Mi pedido");
  await page.getByRole("link", { name: "Lubricantes" }).first().click();
  await expect(page).toHaveURL(/lubricantes/);
  await expect(page).toHaveTitle("Mi pedido");

  await page.getByRole("button", { name: "Salir ya" }).click();
  await expect(page).toHaveURL(/smn\.gob\.ar/);
  const names = (await page.context().cookies()).map((c) => c.name);
  expect(names).not.toContain("tsr_carrito");
  expect(names).not.toContain("tsr_zona");
});

test("apagar el modo discreto restaura el título real", async ({ page }) => {
  await page.goto("/sex-shop");
  const real = await page.title();
  const toggle = page.getByRole("switch", { name: "Modo discreto" });
  await toggle.click();
  await expect(page).toHaveTitle("Mi pedido");
  await toggle.click();
  await expect(page).toHaveTitle(real);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "claro");
});
