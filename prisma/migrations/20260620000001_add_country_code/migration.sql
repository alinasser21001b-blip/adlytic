-- Add country_code to ad_accounts.
-- Nullable VARCHAR(2) — ISO 3166-1 alpha-2 (e.g. 'IQ', 'SA', 'AE').
-- Derived from timezone_name at account connection time; never entered by the user.
ALTER TABLE "ad_accounts" ADD COLUMN "country_code" VARCHAR(2);

-- Back-fill existing rows from timezone using the same mapping applied in code.
-- Covers the top Meta ad markets in MENA + major global timezones.
UPDATE "ad_accounts" SET "country_code" = CASE "timezone"
  WHEN 'Asia/Baghdad'         THEN 'IQ'
  WHEN 'Asia/Riyadh'          THEN 'SA'
  WHEN 'Asia/Dubai'           THEN 'AE'
  WHEN 'Africa/Cairo'         THEN 'EG'
  WHEN 'Asia/Amman'           THEN 'JO'
  WHEN 'Asia/Beirut'          THEN 'LB'
  WHEN 'Asia/Kuwait'          THEN 'KW'
  WHEN 'Asia/Qatar'           THEN 'QA'
  WHEN 'Africa/Casablanca'    THEN 'MA'
  WHEN 'Africa/Tunis'         THEN 'TN'
  WHEN 'Africa/Tripoli'       THEN 'LY'
  WHEN 'Asia/Muscat'          THEN 'OM'
  WHEN 'Asia/Aden'            THEN 'YE'
  WHEN 'Africa/Khartoum'      THEN 'SD'
  WHEN 'Asia/Tehran'          THEN 'IR'
  WHEN 'Europe/Istanbul'      THEN 'TR'
  WHEN 'Asia/Karachi'         THEN 'PK'
  WHEN 'Asia/Kolkata'         THEN 'IN'
  WHEN 'America/New_York'     THEN 'US'
  WHEN 'America/Chicago'      THEN 'US'
  WHEN 'America/Denver'       THEN 'US'
  WHEN 'America/Los_Angeles'  THEN 'US'
  WHEN 'Europe/London'        THEN 'GB'
  WHEN 'Europe/Paris'         THEN 'FR'
  WHEN 'Europe/Berlin'        THEN 'DE'
  WHEN 'Asia/Singapore'       THEN 'SG'
  WHEN 'Australia/Sydney'     THEN 'AU'
  ELSE NULL
END
WHERE "country_code" IS NULL;
