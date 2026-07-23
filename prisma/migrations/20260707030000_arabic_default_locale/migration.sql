-- Arabic-first locale. The entire product UI is Arabic (html lang="ar"
-- dir="rtl"), but users.locale defaulted to EN, so the dashboard — the one
-- bilingual page — rendered English labels for everyone. New users now
-- default to AR, and existing rows still on the silent EN default are
-- flipped (there has never been a language picker, so EN was never a
-- deliberate user choice).
ALTER TABLE "users" ALTER COLUMN "locale" SET DEFAULT 'AR';
UPDATE "users" SET "locale" = 'AR' WHERE "locale" = 'EN';
