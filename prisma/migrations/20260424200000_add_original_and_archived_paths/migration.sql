-- Migración reemplazada: se regenera con `prisma migrate dev`.
-- Este archivo queda aquí como placeholder por compatibilidad con resets previos.
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "originalPath" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "archivedPath" TEXT;
