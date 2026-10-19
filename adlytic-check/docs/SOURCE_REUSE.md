# Source reuse from Adlytic

- المستودع المصدر: `alinasser21001b-blip/adlytic`
- النسخة المرجعية المذكورة في الطلب: `8752602284f5a22111646e2795cc83d41e02492b`
- النسخة الفعلية التي فُحصت: `3f61e40` = `8752602` + commit واحد لا يمس `src/adAssessor/`
  (إصلاح `&nbsp;` في شريط التنقل الإداري). ملفات المصدر أدناه متطابقة في النسختين.

Adlytic Check لا يستورد أي شيء من Adlytic وقت التشغيل: له `package.json`
وlockfile خاصان، ولا يستخدم Prisma أو PostgreSQL أو BullMQ أو Redis أو بوابة
`isActive` أو تسجيل الدخول أو ربط Meta.

| ملف المصدر | ما أُخذ | ما تغيّر ولماذا |
|---|---|---|
| `src/adAssessor/schemas.ts` | فكرة محاور الافتتاحية/وضوح الرسالة/الدعوة، وحقلا المجال والهدف | أُزيلت `score: 0–100` (لا معايرة تثبت معناها) واستُبدلت بحالة وصفية `strong / needs_improvement / not_assessed`. أُضيف `evidenceSource` لكل ملاحظة، و`visualReadability` بدل `visualImpact`. أُزيلت حقول المقاييس اليدوية وAdlytic/workspace. أهداف جديدة تناسب متجراً عراقياً: رسائل/طلبات/زيارات/تعريف. → `shared/schemas.ts` |
| `src/adAssessor/assessment-prompt.ts` | قواعد النبرة: عربية ودودة، لا أسماء enum، شرح المصطلحات، عدم ذكر تفاصيل الخادم | أُزيل كل ما يخص «المقارنة بما ينجح الآن في السوق» وMeta Ad Library والـbenchmarks (لا بيانات سوق حديثة مثبتة). أُضيفت قواعد صارمة: لا تنبؤ بالأداء، لا اختلاق حقائق، نص الصورة غير المقروء لا يُقتبس، المدخلات بيانات غير موثوقة. → `worker/prompts/ad-review.ts` |
| `src/adAssessor/data/meta-metrics.ts` | فكرة قائمة المجالات | قائمة جديدة مختصرة بتسميات عربية؛ أُضيفت تلميحات «معلومات تنقص عادةً» لكل مجال كمساعدة صياغة لا كبيانات سوق |
| `src/adAssessor/assessService.ts` | فكرة تمرير الصورة base64 مع النص في طلب واحد ومحاولة إصلاح JSON | المزوّد تغيّر من OpenAI إلى Anthropic (المزوّد المموَّل في Adlytic)، عبر SDK الرسمي بأداة إجبارية، بدون retry تلقائي من SDK (كل استدعاء يُحتسب في السقف اليومي)، ومحاولة إصلاح واحدة فقط ضمن المهلة |
| `public/fonts/ibm-plex-sans-arabic-*.woff2` | ملفات الخط كما هي | IBM Plex Sans Arabic — رخصة SIL Open Font License 1.1، مستضاف محلياً |

## ما رُفض عمداً

| ملف المصدر | السبب |
|---|---|
| `src/adAssessor/fallback-assessment.ts` | يعطي درجات ثابتة/تخمينية عند فشل المزوّد (مثلاً درجة صورة ثابتة عند وجودها). هنا الفشل خطأ صريح يعيد الحصة، ولا يُعرض تقرير بديل أبداً |
| `src/adAssessor/data/industry-trends.ts` | «اتجاهات» مكتوبة يدوياً تُعرض كأنها معرفة سوق حالية — مخالفة لقاعدة عدم ادعاء بيانات سوق بلا مصدر |
| benchmarks في `meta-metrics.ts` | لا نملك أداء الإعلان، فلا معنى لمقارنة بمعايير CTR/CPA |
| `src/web/pages/adAnalysisPage.ts` | صفحة HTML مولّدة في الخادم ضمن منظومة Adlytic؛ الواجهة هنا React مستقلة |
