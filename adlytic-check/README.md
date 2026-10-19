# Adlytic Check — افحص إعلانك قبل الترويج

خدمة ويب عربية مستقلة: صاحب متجر صغير يرفع صورة إعلانه أو نصّه، فيحصل على
ملاحظات مرتبطة بإعلانه نفسه، وخطوات تحسين مرتّبة، ونص محسّن جاهز للنسخ —
قبل أن ينفق على الترويج. المدخل المجاني لمنظومة Adlytic.

- **الواجهة:** React + Vite + TypeScript، عربية RTL، تُقدَّم كـ Static Assets.
- **الخادم:** Hono على Cloudflare Workers (`worker/`).
- **البيانات:** Cloudflare D1 (`migrations/`) — تقارير، حصص، أحداث.
- **الحماية:** Turnstile (تحقق من الخادم، فشل مغلق في الإنتاج)، كوكي جلسة HttpOnly، فحص Origin، CSP.
- **التحليل:** مزوّد رؤية واحد (Anthropic، النموذج من متغير `VISION_MODEL`)، مخرجات مُتحقق منها بـ Zod، وحواجز حتمية على الخادم.

## التشغيل المحلي

```bash
npm ci
cp .dev.vars.example .dev.vars      # ضع مفتاحك الخاص — لا تلتزم بهذا الملف أبداً
npm run db:migrate:local
npm run build
npx wrangler dev                    # http://localhost:8787
```

## الأوامر

| الأمر | ما يفعله |
|---|---|
| `npm run typecheck` | فحص الأنواع للواجهة والخادم والاختبارات |
| `npm test` | اختبارات وحدات + تكامل ضد 4 نسخ `wrangler dev` حقيقية مع D1 محلي ومزوّد وهمي خارجي |
| `npm run test:browser` | فحص Chromium حقيقي على 390 و768 و1440 بكسل (لقطات في `tests/browser/out/`) |
| `npm run build` | فحص الأنواع ثم بناء الواجهة إلى `dist/` |
| `npm run deploy:dry` | بناء حزمة الـWorker كاملة بدون نشر |
| `npm run deploy` | تطبيق الهجرات عن بُعد ثم النشر (يتطلب مصادقة Cloudflare) |
| `npm run cf:types` | توليد أنواع `Env` من `wrangler.jsonc` |

الاختبارات لا تحتاج إنترنت ولا مفاتيح: المزوّد وTurnstile يُستبدلان بخادم وهمي
خارج الكود (`tests/support/mock-provider.ts`) عبر متغيرات **لا يقبلها الخادم في
الإنتاج**. لا يوجد أي فرع mock داخل كود الإنتاج.

## البنية

```
shared/      عقد البيانات (Zod) والثوابت المشتركة
worker/      index.ts · lib.ts · services/{analysis,session,quota,reports,events,guards,turnstile}
             providers/vision.ts · prompts/ad-review.ts · validation/image.ts · routes/share-page.ts
src/         app/ · features/check/ · i18n/ar.ts · styles/
migrations/  مخطط D1
tests/       unit/ · integration/ · browser/ · support/
docs/        PRODUCT_BRIEF · DEPLOYMENT · ROADMAP · VALIDATION · SOURCE_REUSE · METRICS
```

ابدأ من [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) للنشر، و[`docs/VALIDATION.md`](docs/VALIDATION.md) لما ثبت وما لم يثبت بعد.
