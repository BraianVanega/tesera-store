-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Supplier" AS ENUM ('SM', 'BUTTMAN');

-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('DROPSHIP', 'STOCK');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('IN', 'SALE', 'ADJUST', 'RETURN');

-- CreateEnum
CREATE TYPE "EncargoStatus" AS ENUM ('PENDIENTE', 'PEDIDO_A_PROVEEDOR', 'RECIBIDO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "RestockStatus" AS ENUM ('BORRADOR', 'ENVIADO', 'RECIBIDO');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WEB', 'ML');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MP', 'TRANSFER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'FULFILLING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Zone" AS ENUM ('MDP', 'AMBA', 'INTERIOR');

-- CreateEnum
CREATE TYPE "FulfillmentSource" AS ENUM ('LOCAL', 'ENCARGO', 'DROPSHIP');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'OPERATOR');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT,
    "isConsumable" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOffer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplier" "Supplier" NOT NULL,
    "supplierSku" TEXT NOT NULL,
    "mode" "FulfillmentMode" NOT NULL,
    "cost" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "stockState" TEXT,
    "suggested" INTEGER,
    "campaign" JSONB,
    "weightGr" INTEGER,
    "dimensions" JSONB,
    "vatPct" DECIMAL(5,2),
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalStock" (
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LocalStock_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" INTEGER,
    "note" TEXT,
    "orderId" TEXT,
    "restockId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encargo" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "EncargoStatus" NOT NULL DEFAULT 'PENDIENTE',
    "restockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Encargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestockOrder" (
    "id" TEXT NOT NULL,
    "supplier" "Supplier" NOT NULL,
    "supplierRef" TEXT,
    "status" "RestockStatus" NOT NULL DEFAULT 'BORRADOR',
    "shippingCost" INTEGER,
    "total" INTEGER,
    "paymentTerms" TEXT,
    "paymentDueAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "issuedAt" TIMESTAMP(3),
    "cutoffAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "RestockOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestockLine" (
    "id" TEXT NOT NULL,
    "restockId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "productId" TEXT,
    "qtyOrdered" INTEGER NOT NULL,
    "qtyReceived" INTEGER,
    "listPrice" DECIMAL(12,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "netUnitCost" DECIMAL(12,2) NOT NULL,
    "warnings" JSONB,

    CONSTRAINT "RestockLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'WEB',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "zone" "Zone" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "shippingCharged" INTEGER NOT NULL DEFAULT 0,
    "shippingCost" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "paymentDueAt" TIMESTAMP(3),
    "paymentProofUrl" TEXT,
    "verifiedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "street" TEXT,
    "streetNumber" TEXT,
    "floor" TEXT,
    "locality" TEXT,
    "postalCode" TEXT NOT NULL,
    "provinceId" INTEGER,
    "province" TEXT,
    "deliverTogether" BOOLEAN NOT NULL DEFAULT false,
    "anonymizedAt" TIMESTAMP(3),
    "shippingCode" TEXT,
    "quoteId" TEXT,
    "agencyId" TEXT,
    "supplierOrderId" INTEGER,
    "supplierStatus" TEXT,
    "supplierWarnings" JSONB,
    "trackingCode" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,
    "attentionNote" TEXT,
    "trackingToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "source" "FulfillmentSource" NOT NULL,
    "unitCost" INTEGER,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "orderCode" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_category_published_idx" ON "Product"("category", "published");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_sourceUrl_key" ON "ProductImage"("productId", "sourceUrl");

-- CreateIndex
CREATE INDEX "SupplierOffer_productId_idx" ON "SupplierOffer"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOffer_supplier_supplierSku_mode_key" ON "SupplierOffer"("supplier", "supplierSku", "mode");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestockOrder_supplier_supplierRef_key" ON "RestockOrder"("supplier", "supplierRef");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentDueAt_idx" ON "Order"("paymentDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_externalId_status_key" ON "PaymentEvent"("provider", "externalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "IntegrationLog_service_createdAt_idx" ON "IntegrationLog"("service", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOffer" ADD CONSTRAINT "SupplierOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalStock" ADD CONSTRAINT "LocalStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "LocalStock"("productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encargo" ADD CONSTRAINT "Encargo_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encargo" ADD CONSTRAINT "Encargo_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encargo" ADD CONSTRAINT "Encargo_restockId_fkey" FOREIGN KEY ("restockId") REFERENCES "RestockOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestockLine" ADD CONSTRAINT "RestockLine_restockId_fkey" FOREIGN KEY ("restockId") REFERENCES "RestockOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
