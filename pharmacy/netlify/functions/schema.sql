-- ============================================================
-- Learning Analytics — جدول الأحداث المجهولة (Supabase / Postgres)
-- نفّذه مرة واحدة في Supabase → SQL Editor
-- لا يحتوي أي بيانات شخصية.
-- ============================================================
create table if not exists public.consult_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  session_id  text not null,          -- معرّف مجهول عشوائي (anon_...)
  event_type  text not null,          -- advisor_start | advisor_answer | advisor_results | advisor_product_click | advisor_to_whatsapp
  payload     jsonb not null default '{}'::jsonb
);

create index if not exists idx_consult_events_type on public.consult_events (event_type);
create index if not exists idx_consult_events_created on public.consult_events (created_at);

-- الكتابة تتم عبر service_role من دالة Netlify فقط (تتجاوز RLS).
-- نفعّل RLS ونمنع أي وصول عام للقراءة/الكتابة من المتصفح.
alter table public.consult_events enable row level security;
-- (لا سياسات عامة = لا وصول من anon key؛ التقارير تُقرأ من SQL Editor أو خدمة داخلية)

-- ============================================================
-- استعلامات جاهزة للوحة التحسّن (شغّلها في SQL Editor):
-- ============================================================
-- أكثر الأهداف طلباً:
--   select jsonb_array_elements_text(payload->'goals') goal, count(*)
--   from consult_events where event_type='advisor_results'
--   group by goal order by count desc;
--
-- أكثر السؤال الذي ينسحب عنده المستخدمون (بدء بلا نتيجة):
--   select payload->>'q' q, count(*) from consult_events
--   where event_type='advisor_answer' group by q order by count desc;
--
-- أكثر المغذّيات توصية:
--   select jsonb_array_elements_text(payload->'nutrients') n, count(*)
--   from consult_events where event_type='advisor_results'
--   group by n order by count desc;
--
-- أكثر المنتجات ضغطاً:
--   select payload->>'product' p, count(*) from consult_events
--   where event_type='advisor_product_click' group by p order by count desc;
--
-- معدّل التحوّل إلى واتساب:
--   select
--     count(*) filter (where event_type='advisor_to_whatsapp')::float
--     / nullif(count(*) filter (where event_type='advisor_results'),0) as wa_conversion
--   from consult_events;
