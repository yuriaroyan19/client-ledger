-- Trigram matching for substring search (ILIKE '%term%'). Trusted extension: the database owner can create it.
-- Created here because Prisma only manages extensions behind a preview flag.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- DropIndex
DROP INDEX "audit_logs_created_at_idx";

-- DropIndex
DROP INDEX "clients_name_idx";

-- CreateIndex
CREATE INDEX "audit_logs_created_at_id_idx" ON "audit_logs"("created_at", "id");

-- CreateIndex
CREATE INDEX "clients_name_id_idx" ON "clients"("name", "id");

-- CreateIndex
CREATE INDEX "clients_name_trgm_idx" ON "clients" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_email_trgm_idx" ON "clients" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_phone_trgm_idx" ON "clients" USING GIN ("phone" gin_trgm_ops);
