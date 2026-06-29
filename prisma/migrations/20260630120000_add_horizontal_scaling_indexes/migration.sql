-- CreateIndex
CREATE INDEX "ad_accounts_token_source_status_token_expires_at_idx" ON "ad_accounts"("token_source", "status", "token_expires_at");

-- CreateIndex
CREATE INDEX "ad_accounts_status_last_synced_at_idx" ON "ad_accounts"("status", "last_synced_at");
