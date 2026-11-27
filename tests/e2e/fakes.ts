import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signForTest } from "../../src/lib/payments/webhook";

/**
 * SM y Mercado Pago falsos para el e2e (puertos 4555 y 4556). Responden con los ejemplos de la doc
 * oficial (tests/fixtures/sm) y simulan el pago: la página de "pago" de MP falso aprueba y manda el
 * webhook FIRMADO a la tienda, como hace MP con la URL configurada en "Tus integraciones".
 */

export const FAKE = {
  smPort: 4555,
  mpPort: 4556,
  smKey: "sm_fake",
  mpToken: "TEST-e2e",
  mpSecret: "e2e-webhook-secret",
};

const fixture = (n: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/sm", `${n}.json`), "utf8"));

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });
}

export function startFakes(appUrl: string): Promise<Server[]> {
  const sm = createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x");
    if (req.headers.authorization !== `Bearer ${FAKE.smKey}`)
      return json(res, 401, { ok: false, error: "key" });
    const body = await readBody(req);
    if (u.pathname === "/api/v1/provincias") return json(res, 200, fixture("provincias"));
    if (u.pathname === "/api/v1/shipping/agencies") return json(res, 200, fixture("agencies"));
    if (u.pathname === "/api/v1/shipping/quotes") {
      const cp: string = JSON.parse(body).destino.cp;
      // 18xx (GBA) trae moova-flex = AMBA; el resto, Correo (Interior).
      const q = fixture(cp.startsWith("18") ? "quote" : "quote-interior");
      q.data.quoteId ??= "q_interior_e2e";
      return json(res, 200, q);
    }
    json(res, 404, { ok: false, error: "no" });
  });

  // API de Orders: POST /v1/orders → checkout_url; GET /v1/orders/{id}; webhook tópico `order`.
  const orders = new Map<string, Record<string, unknown>>();
  let n = 0;
  const mp = createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x");
    const body = await readBody(req);
    if (req.method === "POST" && u.pathname === "/v1/orders") {
      if (req.headers.authorization !== `Bearer ${FAKE.mpToken}`)
        return json(res, 401, { message: "token" });
      if (!req.headers["x-idempotency-key"]) return json(res, 400, { message: "idempotency" });
      const id = `ORDTST${++n}`;
      orders.set(id, { ...JSON.parse(body), id, status: "created", status_detail: "created" });
      return json(res, 201, {
        id,
        status: "created",
        checkout_url: `http://127.0.0.1:${FAKE.mpPort}/pay/${id}`,
      });
    }
    if (req.method === "GET" && u.pathname.startsWith("/pay/")) {
      const id = u.pathname.slice(5);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(
        `<title>MP falso</title><form method="post" action="/pay/${id}"><button>Pagar</button></form>`,
      );
    }
    if (req.method === "POST" && u.pathname.startsWith("/pay/")) {
      const id = u.pathname.slice(5);
      const order = orders.get(id)!;
      Object.assign(order, {
        status: "processed",
        status_detail: "accredited",
        total_paid_amount: order.total_amount,
        currency: "ARS",
        transactions: {
          payments: [
            { status: "processed", payment_method: { id: "master", type: "credit_card" } },
          ],
        },
      });
      const requestId = `req-${id}`;
      const ts = String(Date.now());
      await fetch(`${appUrl}/api/webhooks/mercadopago?data.id=${id}&type=order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-signature": signForTest({ dataId: id, requestId, ts, secret: FAKE.mpSecret }),
        },
        body: JSON.stringify({ type: "order", action: "order.processed", data: { id } }),
      });
      const back = (order.config as { online: { success_url: string } }).online.success_url;
      res.writeHead(303, {
        Location: `${back}&status=approved&order_id=${id}&external_reference=${order.external_reference}`,
      });
      return res.end();
    }
    if (req.method === "GET" && u.pathname.startsWith("/v1/orders/")) {
      const o = orders.get(u.pathname.split("/").pop()!);
      return o ? json(res, 200, o) : json(res, 404, { message: "not found" });
    }
    json(res, 404, { message: "no" });
  });

  return Promise.all(
    [
      [sm, FAKE.smPort],
      [mp, FAKE.mpPort],
    ].map(
      ([s, port]) =>
        new Promise<Server>((resolve, reject) => {
          (s as Server).once("error", reject);
          (s as Server).listen(port as number, "127.0.0.1", () => resolve(s as Server));
        }),
    ),
  );
}
