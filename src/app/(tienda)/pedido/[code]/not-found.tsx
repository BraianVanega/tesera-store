import Link from "next/link";

/**
 * Mismo mensaje si el código no existe o si falta/no coincide el token: no confirma que exista.
 * Con PPR el estado HTTP queda en 200 (el shell ya salió); la página es noindex igual.
 */
export default function OrderNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-5 pt-10 pb-16">
      <h1 className="m-h2">no encontramos ese pedido</h1>
      <p className="m-p">
        Abrí el link completo que te mandamos por email al confirmar la compra: es el único acceso a
        tu pedido.
      </p>
      <Link href="/sex-shop" className="m-pill self-start">
        Ir al catálogo
      </Link>
    </div>
  );
}
