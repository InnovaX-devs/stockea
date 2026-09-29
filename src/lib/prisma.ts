import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    // Margen para las transacciones (ventas, cobros, cierres de caja). Por
    // defecto Prisma da 5 s y espera 2 s para conseguir conexión: con la
    // base lejos (Supabase en EE.UU.), una venta con varios productos y pagos
    // puede pasarse y falla con "Transaction not found".
    transactionOptions: {
      maxWait: 10_000,
      timeout: 20_000,
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
