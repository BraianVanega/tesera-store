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

  const payments = new Map<string, Record<string, unknown>>();
  const prefs = new Map<string, Record<string, unknown>>();
  let n = 0;
  const mp = createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x");
    const body = await readBody(req);
    if (req.method === "POST" && u.pathname === "/checkout/preferences") {
      if (req.headers.authorization !== `Bearer ${FAKE.mpToken}`)
        return json(res, 401, { message: "token" });
      const id = `pref_${++n}`;
      prefs.set(id, JSON.parse(body));
      return json(res, 201, { id, init_point: `http://127.0.0.1:${FAKE.mpPort}/pay/${id}` });
    }
    if (req.method === "GET" && u.pathname.startsWith("/pay/")) {
      const id = u.pathname.slice(5);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(
        `<title>MP falso</title><form method="post" action="/pay/${id}"><button>Pagar</button></form>`,
      );
    }
    if (req.method === "POST" && u.pathname.startsWith("/pay/")) {
      const pref = prefs.get(u.pathname.slice(5))!;
      const items = pref.items as { unit_price: number }[];
      const paymentId = String(9_000_000 + n);
      payments.set(paymentId, {
        id: Number(paymentId),
        status: "approved",
        status_detail: "accredited",
        external_reference: pref.external_reference,
        transaction_amount: items[0].unit_price,
        currency_id: "ARS",
        payment_type_id: "credit_card",
      });
      const requestId = `req-${paymentId}`;
      const ts = String(Math.floor(Date.now() / 1000));
      await fetch(`${appUrl}/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": requestId,
          "x-signature": signForTest({ dataId: paymentId, requestId, ts, secret: FAKE.mpSecret }),
        },
        body: JSON.stringify({
          type: "payment",
          action: "payment.created",
          data: { id: paymentId },
        }),
      });
      const back = (pref.back_urls as { success: string }).success;
      res.writeHead(303, { Location: `${back}&status=approved&payment_id=${paymentId}` });
      return res.end();
    }
    if (req.method === "GET" && u.pathname.startsWith("/v1/payments/")) {
      const p = payments.get(u.pathname.split("/").pop()!);
      return p ? json(res, 200, p) : json(res, 404, { message: "not found" });
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
