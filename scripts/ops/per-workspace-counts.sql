-- ════════════════════════════════════════════════════════════════════════
--  scripts/ops/per-workspace-counts.sql — one row of COUNTS per workspace, no id, no name, no customer value.
--
--    psql -q "postgresql://<user>@127.0.0.1:<port>/<db>" -X -A -t -F ' ' -f scripts/ops/per-workspace-counts.sql
--
--  Columns: ws_no (1..N by creation time, then id: a stable ORDINAL, not an id), ad_accounts, campaigns,
--           daily_stats (the workspace's account rows + campaign rows), period_insights, sync_jobs.
--  Use: run it before and after a one-workspace sync. Only the synced workspace's row may change.
--  Read-only: BEGIN READ ONLY ... ROLLBACK.
-- ════════════════════════════════════════════════════════════════════════
BEGIN READ ONLY;
SELECT
  row_number() OVER (ORDER BY w.created_at, w.id) AS ws_no,
  (SELECT count(*) FROM public.ad_accounts a WHERE a.workspace_id = w.id) AS ad_accounts,
  (SELECT count(*) FROM public.campaigns c JOIN public.ad_accounts a ON a.id = c.ad_account_id WHERE a.workspace_id = w.id) AS campaigns,
  (SELECT count(*) FROM public.daily_stats d WHERE d.entity_type = 'ACCOUNT'
     AND d.entity_id IN (SELECT a.id FROM public.ad_accounts a WHERE a.workspace_id = w.id))
  + (SELECT count(*) FROM public.daily_stats d WHERE d.entity_type = 'CAMPAIGN'
     AND d.entity_id IN (SELECT c.id FROM public.campaigns c JOIN public.ad_accounts a ON a.id = c.ad_account_id WHERE a.workspace_id = w.id)) AS daily_stats,
  (SELECT count(*) FROM public.period_insights p WHERE p.entity_type = 'CAMPAIGN'
     AND p.entity_id IN (SELECT c.id FROM public.campaigns c JOIN public.ad_accounts a ON a.id = c.ad_account_id WHERE a.workspace_id = w.id)) AS period_insights,
  (SELECT count(*) FROM public.sync_jobs s JOIN public.ad_accounts a ON a.id = s.ad_account_id WHERE a.workspace_id = w.id) AS sync_jobs
FROM public.workspaces w
ORDER BY 1;
ROLLBACK;
