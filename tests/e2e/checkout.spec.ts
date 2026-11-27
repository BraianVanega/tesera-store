import { expect, type Page, test } from "@playwright/test";

/**
 * Checkout y pagos (Fase 5) contra SM y Mercado Pago FALSOS (tests/e2e/fakes.ts).
 * Los pedidos usan emails @tesera.test: el globalSetup los borra y devuelve el stock.
 */

async function addToCart(page: Page, slug: string) {
  await page.goto(`/producto/${slug}`);
  await page.getByRole("button", { name: "agregar al carrito" }).click();
  await expect(page.getByText("Listo, está en tu pedido.")).toBeVisible();
}

async function fillData(page: Page, opts: { province?: string } = {}) {
  await page.getByLabel("Nombre y apellido").fill("Prueba E2E");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@tesera.test`);
  await page.getByLabel("Teléfono").fill("2235550000");
  if (opts.province) {
    await page.getByLabel("Localidad").fill("Lanús");
    await page.getByLabel("Provincia").selectOption({ label: opts.province });
  }
  await page.getByLabel("Calle").fill("Colón");
  await page.getByRole("textbox", { name: /^Número/ }).fill("1234");
}

async function goToCheckout(page: Page) {
  await page.goto("/carrito");
  await page.getByRole("link", { name: "Continuar con tus datos" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
}

test("MdP con transferencia: cadete, 10 % OFF y datos para transferir", async ({
  page,
  context,
}) => {
  const base = test.info().project.use.baseURL!;
  await context.addCookies([{ name: "tsr_zona", value: "MDP:7600", url: base }]);
  await addToCart(page, "gel-base-agua");
  await goToCheckout(page);
  await expect(page).toHaveTitle("Mi pedido");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  // Sin datos no avanza: el servidor valida y explica.
  await page.getByRole("button", { name: "Continuar al envío" }).click();
  await expect(page.getByText("Escribí tu nombre y apellido.")).toBeVisible();

  await fillData(page);
  await page.getByRole("button", { name: "Continuar al envío" }).click();
  const courier = page.getByRole("radio", { name: /Cadete en Mar del Plata/ });
  await expect(courier).toHaveAttribute("aria-checked", "true");
  await expect(courier).toContainText("$ 2.500"); // 11.900 < 15.000
  await page.getByRole("button", { name: "Continuar al pago" }).click();

  const transfer = page.getByRole("radio", { name: /Transferencia/ });
  await expect(transfer).toContainText("$ 13.210"); // 11.900 − 10 % + 2.500
  await expect(page.getByRole("radio", { name: /Mercado Pago/ })).toContainText("$ 14.400");
  await page.getByRole("button", { name: "Confirmar y ver datos de transferencia" }).click();

  await expect(page).toHaveURL(/\/pedido\/TS-[A-Z0-9]{6}\?t=/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("falta tu transferencia");
  await expect(page.getByText("$ 13.210").first()).toBeVisible();
  await expect(page.getByText("Tiempo para pagar")).toBeVisible();
  await expect(page.getByText("tesera.prueba")).toBeVisible();
  const code = page.url().match(/TS-[A-Z0-9]{6}/)![0];
  const wa = await page.getByRole("link", { name: "Enviarlo por WhatsApp" }).getAttribute("href");
  expect(decodeURIComponent(wa!)).toContain(code);
  expect(decodeURIComponent(wa!)).not.toMatch(/gel/i); // nunca nombres de producto
  await expect(page).toHaveTitle("Mi pedido");
  await expect(page.getByText(/encargo/i)).toHaveCount(0);

  // El carrito quedó vacío.
  await page.goto("/carrito");
  await expect(page.getByText("Todavía no agregaste nada.")).toBeVisible();
});

test("Mercado Pago: redirect, webhook firmado y pedido pagado", async ({ page, context }) => {
  const base = test.info().project.use.baseURL!;
  await context.addCookies([{ name: "tsr_zona", value: "MDP:7600", url: base }]);
  await addToCart(page, "vibrador-nocturno"); // en MdP llega después (5 a 10 días)
  await goToCheckout(page);
  await fillData(page);
  await page.getByRole("button", { name: "Continuar al envío" }).click();
  await page.getByRole("button", { name: "Continuar al pago" }).click();
  await page.getByRole("radio", { name: /Mercado Pago/ }).click();
  await page.getByRole("button", { name: "Confirmar y pagar con Mercado Pago" }).click();

  await expect(page).toHaveTitle("MP falso");
  await page.getByRole("button", { name: "Pagar" }).click();

  await expect(page).toHaveURL(/\/pedido\/TS-/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("¡listo, recibimos tu pedido!");
  await expect(page.getByRole("heading", { name: "Llega después" })).toBeVisible();
  await expect(page.getByText("Confirmado")).toBeVisible();
});

test("GBA: opciones reales de SM, la más barata gratis y retiro en sucursal", async ({
  page,
  context,
}) => {
  const base = test.info().project.use.baseURL!;
  await context.addCookies([{ name: "tsr_zona", value: "AMBA:1824", url: base }]);
  await addToCart(page, "vibrador-nocturno"); // 42.500 ≥ 40.000 (envío gratis GBA)
  await goToCheckout(page);
  await fillData(page, { province: "Buenos Aires" });
  await page.getByRole("button", { name: "Continuar al envío" }).click();

  await expect(page.getByRole("radio", { name: /Envío rápido a domicilio/ })).toContainText(
    "Gratis",
  );
  const suc = page.getByRole("radio", { name: /Retiro en sucursal/ });
  await expect(suc).toContainText("$ 1.185"); // 8.270 − 7.085
  await suc.click();
  const continuar = page.getByRole("button", { name: "Continuar al pago" });
  await expect(continuar).toBeDisabled(); // falta elegir la sucursal
  await page.getByLabel("Sucursal donde retirás").selectOption({ index: 1 });
  await expect(continuar).toBeEnabled();
  await continuar.click();
  await page.getByRole("button", { name: "Confirmar y ver datos de transferencia" }).click();
  await expect(page).toHaveURL(/\/pedido\/TS-/);
  await expect(page.getByText("Retiro en sucursal de Correo")).toBeVisible();
});

test("el pedido sin el token del link no existe", async ({ page }) => {
  // Con PPR el 404 es "blando" (HTTP 200): se verifica el contenido y el noindex.
  for (const url of ["/pedido/TS-ABCDEF", "/pedido/TS-ABCDEF?t=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("no encontramos ese pedido");
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    await expect(page.getByText("Pedido TS-ABCDEF")).toHaveCount(0);
  }
});
