# Deployment — Cloudflare Workers + Static Assets + D1

## الموارد

| المورد | الحالة | المعرّف |
|---|---|---|
| D1 `adlytic-check-db` | **أُنشئ وطُبّقت عليه الهجرة 0001** (EEUR، النسخة الأساسية في FRA) | `28ec9cd8-ab1e-4ff4-9f2a-e81724642830` (في `wrangler.jsonc`) |
| Worker `adlytic-check` | **لم يُنشر بعد** — انظر «العائق» أدناه | — |
| Turnstile widget | **لم يُنشأ بعد** — يُنشأ من لوحة Cloudflare | — |

الهجرة طُبّقت عبر موصِّل Cloudflare، وسُجّلت في جدول `d1_migrations` بنفس صيغة
Wrangler، فتشغيل `npm run db:migrate:remote` لاحقاً لن يعيد تطبيقها.

## العائق الذي منع النشر من جلسة البناء
بيئة جلسة Claude التي بنت المشروع تحجب `api.cloudflare.com` في سياسة الشبكة،
ولا يوجد فيها `CLOUDFLARE_API_TOKEN`. موصِّل Cloudflare المتاح يستطيع إنشاء D1
وتنفيذ SQL لكنه لا يملك أداة لرفع Worker. لذلك النشر خطوة واحدة متبقية تتطلب
مصادقة صاحب الحساب.

## المتغيرات (غير سرية، في `wrangler.jsonc`)

| الاسم | الافتراضي | المعنى |
|---|---|---|
| `ENVIRONMENT` | `production` | أي قيمة أخرى تسمح بعناوين الاختبار البديلة — لا تغيّرها في الإنتاج |
| `VISION_MODEL` | `claude-haiku-4-5` | نموذج يدعم الصور؛ الأرخص افتراضياً، ويمكن رفعه دون تعديل الكود |
| `TURNSTILE_SITE_KEY` | فارغ | مفتاح الموقع العام لـ widget Turnstile — **مطلوب** |
| `ANALYSIS_ENABLED` | `true` | `false` يوقف التحليلات الجديدة فوراً (مفتاح طوارئ للتكلفة) |
| `FREE_WEEKLY_LIMIT` | `3` | فحوص ناجحة لكل متصفح كل 7 أيام |
| `MAX_PROVIDER_CALLS_PER_DAY` | `100` | سقف الخدمة اليومي لاستدعاءات المزوّد (تشمل الفاشلة ومحاولات الإصلاح) |
| `MAX_OUTPUT_TOKENS` | `3000` | حد مخرجات كل استدعاء |
| `REPORT_RETENTION_DAYS` | `7` | عمر التقرير الخاص |
| `PROVIDER_TIMEOUT_MS` | `45000` | المهلة الإجمالية للتحليل (الواجهة تنتظر 75 ثانية) |
| `RESERVATION_TTL_SECONDS` | `120` | عمر حجز الحصة قبل اعتباره معلّقاً |
| `MAX_NEW_SESSIONS_PER_DAY` | `3000` | سقف إنشاء جلسات مجهولة جديدة يومياً |
| `BUILD_ID` | `dev` | يُستبدل بـ commit عند `npm run deploy` ويظهر في `/api/health` |

## الأسرار (بـ `wrangler secret put` فقط — لا قيم في الملفات)

| الاسم | الغرض |
|---|---|
| `ANTHROPIC_API_KEY` | مفتاح مزوّد التحليل. يمكن نقل المفتاح المستخدم في Adlytic إن كان صاحب الحساب يوافق |
| `TURNSTILE_SECRET_KEY` | المفتاح السري لـ widget Turnstile |
| `IP_HASH_SECRET` | ملح HMAC لعدّ إنشاء الجلسات لكل شبكة بدون تخزين IP. ولّده بـ `openssl rand -hex 32` |

بدون أي من هذه الأسرار تعمل الصفحة لكن التحليل **مغلق** (فشل مغلق)، و`/api/health`
يُظهر `ready: false` مع السبب.

## خطوات النشر (من جهاز صاحب الحساب)

```bash
git fetch origin claude/save-for-reuse-djv4h8
git checkout claude/save-for-reuse-djv4h8
cd adlytic-check
npm ci
npx wrangler login                      # أو CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
npm test                                 # اختياري: 37 اختباراً محلياً
npm run deploy                           # migrations (no-op) + build + deploy
```

ثم:

1. **Turnstile:** لوحة Cloudflare ← Turnstile ← Add widget. Hostname:
   `adlytic-check.<subdomain>.workers.dev` (يظهر بعد النشر). Mode: Managed.
   ضع **site key** في `vars.TURNSTILE_SITE_KEY` في `wrangler.jsonc`، ثم:
   ```bash
   npx wrangler secret put TURNSTILE_SECRET_KEY
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put IP_HASH_SECRET
   npm run deploy                         # يعيد النشر مع site key
   ```
2. لا تستخدم مفاتيح Turnstile الاختبارية (`1x000…`) في الإنتاج.

### لنشر آلي من جلسة Claude لاحقاً
- أنشئ API token حسابياً (Account API tokens) بقالب **Edit Cloudflare Workers**
  مع صلاحية **D1 Edit**، ومقيّداً بهذا الحساب فقط. أول إنشاء لـ Worker جديد يتطلب
  صلاحية Workers على مستوى المنتج (Admin) حسب وثائق Cloudflare.
- أضف `CLOUDFLARE_API_TOKEN` و`CLOUDFLARE_ACCOUNT_ID` كأسرار في إعدادات البيئة،
  وأضف `api.cloudflare.com` إلى النطاقات المسموحة في سياسة الشبكة.

## التحقق بعد النشر

```bash
curl -s https://adlytic-check.<subdomain>.workers.dev/api/health
# المتوقع: status ok · build = commit الحالي · ready: true · readiness كلها true
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://…/api/not-found   # 404 application/json
curl -s -o /dev/null -w '%{http_code}\n' https://…/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # 404
```

ثم يدوياً (لأن Turnstile الحقيقي يحتاج إنساناً):
1. افتح الرابط على الهاتف، ارفع صورة إعلان حقيقية مملوكة لك، وانتظر التقرير.
2. تأكد أن التقرير يذكر عناصر من صورتك فعلاً، وأن النص المحسّن لا يضيف سعراً أو خصماً.
3. حدّث الصفحة — يجب أن يبقى التقرير (من الخادم، بلا تحليل جديد).
4. أنشئ رابط مشاركة وافتحه في نافذة خاصة — ملخص عام بدون صورتك أو نصك. ألغِه ← 404.
5. افتح رابط التقرير الخاص `/r/<id>` في نافذة خاصة ← «غير موجود».
6. نفّذ 3 فحوص ثم رابعاً ← رسالة الحصة.
7. `npx wrangler tail` أثناء ذلك: لا أخطاء bindings أو provider، ولا نصوص إعلانات في السجلات.

## الإيقاف الطارئ
`ANALYSIS_ENABLED="false"` ثم `npx wrangler deploy` — الصفحة تبقى، والتحليل يتوقف.
