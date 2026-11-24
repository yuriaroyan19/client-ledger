-- Defense in depth: invariants enforced by the database even if application validation is bypassed.
-- (Prisma does not model CHECK constraints; they live in migrations only.)
ALTER TABLE "movements" ADD CONSTRAINT "movements_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "movements" ADD CONSTRAINT "movements_description_not_blank" CHECK (length(btrim("description")) > 0);
ALTER TABLE "clients" ADD CONSTRAINT "clients_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "clients" ADD CONSTRAINT "clients_email_lowercase" CHECK ("email" IS NULL OR "email" = lower("email"));
ALTER TABLE "admins" ADD CONSTRAINT "admins_email_lowercase" CHECK ("email" = lower("email"));
