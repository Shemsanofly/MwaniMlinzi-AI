-- Signed, revocable tokens that let an outside party (processor, buyer, NGO, programme)
-- read a cooperative's aggregated forecasts or adoption numbers without an interactive login.

CREATE TYPE "PublicAccessScope" AS ENUM ('FORECASTS', 'ADOPTION');

CREATE TABLE "public_access_tokens" (
    "id"             UUID NOT NULL,
    "token"          TEXT NOT NULL,
    "label"          TEXT NOT NULL,
    "scope"          "PublicAccessScope" NOT NULL,
    "cooperative_id" UUID,
    "created_by_id"  UUID NOT NULL,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"     TIMESTAMP(3),
    "revoked_at"     TIMESTAMP(3),
    "last_used_at"   TIMESTAMP(3),
    "request_count"  INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "public_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_access_tokens_token_key" ON "public_access_tokens"("token");
CREATE INDEX "public_access_tokens_cooperative_id_idx" ON "public_access_tokens"("cooperative_id");
CREATE INDEX "public_access_tokens_scope_idx" ON "public_access_tokens"("scope");

ALTER TABLE "public_access_tokens"
  ADD CONSTRAINT "public_access_tokens_cooperative_id_fkey"
  FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public_access_tokens"
  ADD CONSTRAINT "public_access_tokens_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
