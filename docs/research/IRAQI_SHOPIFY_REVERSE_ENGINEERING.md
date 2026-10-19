# هندسة عكسية لـ Shopify وروزنامة، ومخطط بناء "شوبيفاي عراقي" يحمل Adlytic في داخله

**الحالة:** مسودة قيد البناء (الإصدار 0.1)  
**التاريخ:** 2026-10-19  
**المستودع:** `alinasser21001b-blip/adlytic`، فرع `claude/adlytic-code-usage-x2a5te`  
**المنهج:** هندسة عكسية من المصادر العامة فقط: وثائق Shopify الرسمية ومستودعاتها مفتوحة المصدر (Dawn، Liquid، shopify-app-js، Hydrogen، Polaris)، صفحات التسعير، قوائم المتاجر، المراجعات، المحادثات الهندسية المنشورة، إعلانات التمويل، وإعلانات التوظيف. لا وصول إلى كود خاص ولا تجاوز لأي مصادقة. تسعة وكلاء بحث متوازين، يتبعهم مدقق متشكك لكل موضوع بحثي يحاول نقض الادعاءات الحرجة بمصدر ثانٍ.

<!-- FILL:EXEC -->

---

## 1. تصحيح نقطة البداية: روزنامة ليست وحدها

قبل أي تحليل، نتيجة من المسح الأولي تغيّر الإطار: منصة **Rozenama (روزنامة)** على `rozenama.com` أُسست في بغداد على يد عباس مهيل ومحمد فوزي، وجمعت 150 ألف دولار في جولة ما قبل البذرة في آب 2026 من محمد حيدر (الجاسمي للعطور)، وتعلن نحو 900 تاجر نشط و13 ألف مستخدم مسجل، وأعلنت إطلاق نسخة معاد بناؤها في 25 آب 2026. لكنها ليست الوحيدة في الساحة العراقية: المسح أظهر **دُكاني** (dokani.iq)، **ميل IQ** (mel.iq)، **عرموطة** (armotah.com)، **فاتورة** (fatora.io، متجر مجاني)، **JoShop** و**ShoPlus** (منصات عربية تدعم الدينار وزين كاش وFastPay بأسعار سنوية نحو 100 دولار)، و**Dr Store IQ**. إقليمياً: سلة وزد (السعودية)، ExpandCart (مصر)، YouCan (المغرب، مبنية حول الدفع عند الاستلام)، وMatjarr. التفاصيل والمقارنة في القسم 4. ما يعنيه هذا للفكرة: التمايز لا يمكن أن يكون "منصة متاجر عراقية" وحدها، بل ما لا يملكه أحد منهم: ذكاء الإعلانات المدمج (Adlytic)، والتشغيل الكامل لدورة الدفع عند الاستلام مع شركات التوصيل، ودراسة جدوى حية لكل متجر من بياناته.

---

## 2. تشريح Shopify

### 2.1 المنتج كما يراه التاجر، والتسعير (تشرين الأول 2026)

ملاحظة منهجية: صفحات Shopify الرسمية (help.shopify.com وshopify.dev وshopify.com) محجوبة من بيئة التنفيذ، فجاءت الوقائع الرسمية من ملخصات البحث لتلك الصفحات ومن مستودعات Shopify مفتوحة المصدر التي تُقرأ مباشرة. ما عُلِّم "معرفة عامة" في الجداول التفصيلية هو قدرة قياسية معروفة لم يُعاد التحقق منها في هذه الجولة.

**سلّم الخطط (أسعار الولايات المتحدة بالدولار)**

| الخطة | شهرياً | شهرياً عند الدفع السنوي | رسوم البطاقات عبر Shopify Payments | رسوم Shopify الإضافية عند استخدام بوابة خارجية | حسابات الطاقم | ملاحظات | المصدر |
|---|---|---|---|---|---|---|---|
| Starter | 5 | لا ينطبق | 5% + 30 سنتاً (مُبلَّغ) | 5% (مُبلَّغ) | لا ينطبق | بيع عبر الروابط والرسائل بلا واجهة متجر كاملة؛ بلا Flow | [gelato](https://www.gelato.com/blog/shopify-pricing-plans) |
| Basic | 39 | 29 | 2.9% + 30 سنتاً | **2%** | صفر أو اثنان (متنازع عليه) | تقارير أساسية؛ Flow مشمول؛ 10,000 بريد شهرياً | [shopexperts](https://shopexperts.com/help/pricing/shopify-plans-pricing)، [taxomate](https://taxomate.com/blog/shopify-fees) |
| Grow (كانت "Shopify" حتى نيسان 2025) | 105 | 79 | 2.7% + 30 سنتاً | **1%** | 5 | رفع سعر مُبلَّغ في 15 تشرين الأول 2026 بنحو 13% (نحو 10 دولارات) | [demandsage](https://www.demandsage.com/shopify-pricing/)، [Benzinga](https://www.benzinga.com/analyst-stock-ratings/analyst-color/26/10/62421218/shopify-price-hikes-signal-pricing-power-as-jpmorgan-keeps-200-bullish-target) |
| Advanced | 399 | 299 | 2.5% + 30 سنتاً | **0.6%** | 15 | رفع مُبلَّغ 20% (نحو 60 دولاراً) في التاريخ نفسه؛ منشئ تقارير مخصص | [ecomposer](https://ecomposer.io/blogs/shopify-knowledge/shopify-pricing-plans) |
| Plus | 2,500 (عقد سنة) أو 2,300 (عقد 3 سنوات) ثم رسم منصة متغير عند الأحجام الكبيرة | لا ينطبق | 2.25% + 30 سنتاً | نحو 0.2% (شائع، غير مؤكد) | غير محدود | Checkout Components، B2B كامل، Audiences | [chargeflow](https://www.chargeflow.io/blog/shopify-plus-pricing) |
| Retail | 89 (أو 79) | لا ينطبق | 2.6% + 10 سنتات حضورياً | لا ينطبق | غير محدود لنقاط البيع | مصدر واحد يقول إنها لم تُعد تُباع للجدد | [blackbeltcommerce](https://www.blackbeltcommerce.com/discover-shopifys-pricing-plans-comprehensive-breakdown-of-features-in-each-option/) |

التجربة: 3 أيام مجانية ثم دولار واحد شهرياً لثلاثة أشهر. الخصم السنوي نحو 25%. نقطة البيع Pro تُباع إضافةً بـ 89 دولاراً لكل موقع شهرياً. البريد: 10,000 رسالة مجانية شهرياً ثم دولار لكل ألف.

**ما يهم العراق من هذا السلّم مباشرة** (مؤكَّد من مناقشات مجتمع Shopify ومن قوائم الدول):

- **Shopify Payments غير متاح في العراق**؛ يغطي نحو 38 إلى 40 دولة ولا دولة في الشرق الأوسط سوى الإمارات لعملاء Plus فقط ([app-compare](https://app-compare.com/blog/shopify-payments-countries/)، [letstalkshop](https://www.letstalkshop.com/blog/shopify-payment-gateways-comparison-by-country)).
- **PayPal غير متاح لتاجر مقيم في العراق**، وممثل Shopify قال إنه "لا توجد قائمة رسمية بالبوابات المؤهلة في العراق"؛ المقترحات في المجتمع: PayTabs عبر Amwal، Tap، 2Checkout/Verifone، Pinwheel Pay، وPayoneer بشرط شركة في هونغ كونغ و20 ألف دولار شهرياً ([community.shopify.com](https://community.shopify.com/t/shopify-in-iraq/323342)).
- **الدفع عند الاستلام في Shopify "طريقة دفع يدوية"**: يبقى الطلب معلّقاً حتى يعلّمه التاجر مدفوعاً، ولا مسار تأكيد ولا تسوية مع شركة توصيل.
- النتيجة: التاجر العراقي على Shopify يدفع الاشتراك بالدولار **زائد 2% أو 1% أو 0.6% من كل طلب** رسماً إضافياً لأنه لا يستطيع استخدام Shopify Payments، ويُحرم من Shop Pay وShopify Shipping وBalance وCapital وAudiences وCollective وManaged Markets كلها.
- **قالب Dawn المرجعي (الإصدار 16.0.0) بلا ملف لغة عربية وبلا أي CSS للاتجاه من اليمين إلى اليسار**: ملفات `locales/ar.json` و`he.json` و`fa.json` غير موجودة (404)، و`assets/base.css` لا يحوي أي `inline-start` أو `[dir=rtl]` ([Dawn على GitHub](https://raw.githubusercontent.com/Shopify/dawn/main/assets/base.css)).

**خريطة الميزات بحسب المجال** (الكاملة في مخرجات البحث؛ هنا ما يصوغ متطلباتنا)

| المجال | ما تقدمه Shopify | ما نأخذه منه لمنصتنا |
|---|---|---|
| المنتجات | حتى 3 خيارات و2,048 متغيراً لكل منتج (متاح للجميع منذ 15 تشرين الأول 2025)، 250 وسيطاً، حقول وصفية (metafields) وكائنات وصفية (128 تعريفاً في الخطط القياسية و256 في Plus)، مخزون لكل موقع بحالات متاح وملتزَم ووارد، تصنيف منتجات قياسي، حِزم عبر Cart Transform، بطاقات هدايا، أوصاف بالذكاء الاصطناعي، محرر جماعي واستيراد CSV | نفس البدائيات: خيارات ومتغيرات ووسائط وحقول مخصصة ومجموعات يدوية وآلية؛ لا داعي لـ 2,048 متغيراً في البداية |
| المجموعات | يدوية، وآلية بحتى 60 شرطاً على العنوان والنوع والبائع والسعر والوسوم والحقول الوصفية | مجموعات آلية بقواعد منذ المرحلة الأولى لأنها توفر على التاجر الوقت |
| المتجر والقوالب | محرك Liquid ("غير مُنفِّذ وآمن" و"مصمم ليعدّله المستخدمون")، معمارية Online Store 2.0 بقوالب JSON وأقسام في كل صفحة وكتل تطبيقات وإعدادات بمخطط، محرر بصري ومساحة Canvas مع Sidekick في 2026، اختبار A/B أصلي، مدونة وصفحات وقوائم وتحويلات، رأس بلا رأس عبر Hydrogen وOxygen | **المعمارية نفسها بالضبط**: قوالب JSON وأقسام وكتل وإعدادات بمخطط، بمحرك متوافق مع Liquid، مع العربية والكردية من اليمين إلى اليسار افتراضياً، وهو ما يفتقده Dawn |
| إتمام الشراء | صفحة واحدة؛ Shop Pay (يتطلب Shopify Payments)؛ **إغلاق `checkout.liquid` نهائياً**: خطوات المعلومات والشحن والدفع منذ 13 آب 2024، وصفحات الشكر وحالة الطلب في 28 آب 2025 لـ Plus و26 آب 2026 للبقية، والتخصيص فقط عبر إضافات واجهة (ui-extensions على remote-ui) ودوال Shopify Functions (خصومات وتخصيص توصيل ودفع، أمثلتها العامة على GitHub) وواجهة العلامة | إتمام شراء مغلق قابل للتوسع من اليوم الأول: الهاتف أولاً بلا بريد إلزامي، عنوان بالمحافظة والمنطقة، تبديل الدفع عند الاستلام، تحقق بالعربية، ونقاط توسع معزولة لا قوالب حرة |
| الطلبات | خط زمني، مسودات طلبات وفواتير، تعديل الطلب بعد إنشائه، تنفيذ لكل موقع مع تنفيذ جزئي وأرقام تتبع وتعليق التنفيذ وقواعد التوجيه وخدمات تنفيذ خارجية، مرتجعات واستبدالات أصلية، التقاط يدوي أو آلي للدفع مع تحليل احتيال، توصيل محلي واستلام من المتجر | كل ذلك، زائد ما لا تملكه Shopify: حالات التأكيد والرفض والتسوية النقدية (القسم 7.3) |
| العملاء | ملفات بالوسوم والملاحظات والموافقة التسويقية، شرائح بلغة تصفية، حسابات جديدة بلا كلمة مرور، B2B بشركات وكتالوجات وشروط دفع (توفره في الخطط الدنيا متنازع عليه) | العميل بالهاتف لا بالبريد؛ شرائح بسيطة؛ درجة مخاطر رفض لكل رقم هاتف |
| الخصومات | رموز وآلية (حتى 25 آلية نشطة)، اشتراط شرائح، قواعد دمج، منطق مخصص عبر Functions بدل Scripts (التي تتوقف بحسب مصدر واحد في 30 حزيران 2026) | رموز وآلية وشحن مجاني فوق مبلغ، وخصم على الدفع المسبق بالمحفظة لتقليل الرفض |
| الشحن والتوصيل | ملفات شحن ومناطق وأسعار ثابتة أو بالوزن أو بالسعر، أسعار محسوبة من الناقل في الخطط العليا، توصيل محلي بنصف قطر ورموز بريدية، استلام محلي، ملصقات Shopify Shipping في 8 دول فقط | مناطق شحن بالمحافظات، شركات توصيل عراقية بمحوّلات، لا ملصقات ولا أرقام بريدية |
| المدفوعات | Shopify Payments (على Stripe تاريخياً)، أكثر من 100 بوابة خارجية مع الرسم الإضافي، طرق يدوية، تقسيط Shop Pay في أمريكا، تخصيص طرق الدفع عبر Functions | صفر رسوم منصة على الدفع عند الاستلام، ومحافظ محلية كمواطنين من الدرجة الأولى |
| الأسواق الدولية | Shopify Markets في كل الخطط (عملات ولغات وأسعار لكل سوق ورسوم جمركية)، Managed Markets كتاجر مسجَّل عبر Global-e لأمريكا وبعض كندا وبريطانيا فقط | تسعير مزدوج بالدينار والدولار بقواعد تحويل، ولغات عربية وكردية وإنجليزية؛ لا حاجة لما هو عابر للحدود |
| التسويق | بريد ورسائل (10,000 مجاناً)، أتمتة تسويقية على Flow، لوحة حملات وإسناد، قنوات Meta وTikTok وGoogle تزامن الكتالوج والبكسل، Inbox وForms وCollabs مجانية، Audiences لعملاء Plus في أمريكا وكندا فقط، بكسلات ويب معزولة | **هنا موضع Adlytic**: ذكاء إعلانات أصلي لكل التجار بدل Audiences المحصورة بـ Plus (القسم 8) |
| التحليلات | لوحات حية؛ تقارير أساسية ثم مهنية ثم منشئ مخصص بحسب الخطة؛ Sidekick يشرح الهبوط والارتفاع | التقارير الأساسية مجانية؛ التدرّج في عمق ذكاء الإعلانات وتحليلات التوصيل والرفض |
| نقاط البيع | POS Lite مجانية، Pro بـ 89 دولاراً للموقع، إصدار 10 في 2026 | نقطة بيع مبسطة في مرحلة لاحقة |
| التطبيقات والأتمتة | متجر بنحو 17,600 إلى 22,500 تطبيق، Flow مجانية من Basic (طلب HTTP من Grow)، إصدارات واجهة برمجة ربع سنوية (2024-10 إلى 2026-10)، قالب تطبيق بـ React Router وPrisma، Polaris Web Components بعد أرشفة Polaris React (1 تشرين الأول 2025)، فوترة تطبيقات لمرة واحدة أو كل 30 يوماً أو سنوية أو بالاستخدام | محرك أتمتة بمحفّزات الدفع عند الاستلام (طلب غير مؤكَّد منذ ساعتَين، محاولة تسليم فاشلة، شحنة مرتجعة) وإجراءات واتساب؛ واجهة Webhooks وإصدارات ربع سنوية في المرحلة الثانية |
| الذكاء الاصطناعي | Magic للنصوص والصور، Sidekick بتفكير متعدد الخطوات ومهام خلفية وصوت وامتدادات تطبيقات ونحو 20 لغة (العربية غير مؤكدة) | Adlytic هو الذكاء، والعربية العراقية أولاً |
| التمويل والشبكة | Collective وAudiences وBalance وCapital وShipping كلها محصورة جغرافياً بأمريكا الشمالية وبريطانيا وأستراليا وبعض أوروبا | غير ذات صلة بالعراق إلا كإلهام تصميمي |

**المكدس مفتوح المصدر الذي كشفته القراءة المباشرة:** قوالب Liquid (روبي) وDawn 16.0.0 بقوالب JSON وأقسام وكتل تطبيقات؛ قالب تطبيق رسمي بـ React Router وتخزين جلسات Prisma وGraphQL Admin وWebhooks معلنة في `shopify.app.toml` وShopify CLI ومزوّد MCP للتطوير؛ Polaris Web Components للوحة الإدارة؛ ui-extensions على remote-ui لإتمام الشراء وحسابات العملاء والإدارة ونقاط البيع؛ Functions بـ Rust وJavaScript وTypeScript مترجمة إلى WebAssembly؛ Hydrogen وOxygen للرأس بلا رأس؛ تعداد إصدارات الواجهة من 2024-10 إلى 2026-10 في `shopify-app-js`.

**دروس التسعير لمنصتنا:** انسخ منطق السلّم لا أرقامه: طبقة مجانية أو شبه مجانية لبائع إنستغرام وواتساب (مقابل Starter بـ 5 دولارات بلا متجر)، طبقة أساسية بالدينار أدنى بكثير من 39 دولاراً، خصم سنوي شفاف نحو 25%، **وصفر رسوم منصة على الدفع عند الاستلام** حتى تكون المقارنة مع Shopify حاسمة. وتجنّب نمط الزيادات المفاجئة (13% إلى 20% في تشرين الأول 2026) بالتزام بنوافذ تثبيت سعر.

**أسئلة مفتوحة من هذا القسم:** الأسعار الدقيقة بعد زيادة 15 تشرين الأول 2026؛ وضع خطة Retail؛ عدد حسابات الطاقم في Basic (صفر أو اثنان) وسقوف المواقع (10 أو 1,000)؛ توفر B2B في الخطط الدنيا؛ تاريخ إيقاف Scripts؛ هل يدعم Sidekick العربية؛ وخارطة Dawn للعربية والاتجاه من اليمين إلى اليسار.

### 2.2 نموذج البيانات وواجهات البرمجة ومعمارية القوالب (قراءة مباشرة للمصادر المفتوحة)

**منهج هذا القسم:** موقع shopify.dev محجوب من بيئة البحث، فاعتمدنا على ما يُقرأ مباشرة من GitHub: أصناف موارد REST في `shopify-api-ruby` و`shopify-app-js` (إصدار 2026-07)، ومخطط Storefront GraphQL المولَّد داخل Hydrogen (16 تشرين الأول 2026)، وملفات JSON في `theme-liquid-docs`، وDawn 16.0.0، ودليلا OAuth وWebhooks في `shopify-app-js`، ومواصفات الامتدادات في Shopify CLI. أما قائمتا النطاقات (scopes) وموضوعات Webhooks فمن لقطات مجتمعية (trufflehog بتاريخ 2024-07 بـ 126 نطاقاً، وopen-connector بتاريخ 2026-10 بـ 146 نطاقاً، ولقطة مخطط 2026-01 بـ 221 موضوعاً) وتحتاج تثبيتاً من الصفحة الرسمية قبل تبنّي الأسماء حرفياً.

#### 2.2.1 الكيانات الجوهرية (36 كياناً) وقرارنا في كل منها

| كيان Shopify | أهم الحقول والعلاقات كما في المصدر | قرارنا للنسخة العراقية |
|---|---|---|
| Shop | id وname وemail وdomain وmyshopify_domain وprimary_locale وcurrency وmoney_format وenabled_presentment_currencies؛ يملك Locations وProducts وOrders وShopLocales وPolicies | `Store` و`StoreDomain`؛ العملة الدينار بلا كسور افتراضياً؛ نطاق فرعي لكل متجر ونطاق مخصص اختياري |
| Product | title وhandle وbody_html وvendor وproduct_type وstatus وtags؛ خيارات بحد أقصى 3 (option1 إلى option3)؛ متغيرات وصور ووسائط وMetafields وتصنيف Taxonomy وSellingPlanGroups | `Product` و`ProductOption` بالحد نفسه (3 خيارات)؛ الوسائط تشمل الفيديو لأن إنستغرام فيديو أولاً |
| ProductVariant | price وcompare_at_price وsku وbarcode وinventory_policy وweight وoption1 إلى option3 وصورة؛ يملك InventoryItem واحداً | `ProductVariant` و`InventoryItem`؛ السعر عدد صحيح بالدينار |
| Collection (مخصصة أو ذكية) مع Collect | يدوية عبر Collect أو آلية بقواعد؛ Filters وsort_options | `Collection` و`CollectionRule`؛ القواعد الآلية (سعر، وسم، مورّد) في النسخة الأولى |
| Customer مع Address | email وphone وstate وtags وموافقات تسويق البريد والرسائل؛ عناوين وعنوان افتراضي؛ Metafields وPaymentMethods وSegments | `Customer` بالهاتف معرّفاً أساسياً والبريد اختياري؛ `CustomerAddress` بحقول محافظة ومنطقة وأقرب نقطة دالة؛ موافقة واتساب حقل من الدرجة الأولى |
| Order مع LineItem | financial_status وfulfillment_status وحقائب مالية (current_total_price وtotal_discounts وغيرها) وnote وtags وsource_name؛ يملك LineItems وFulfillments وRefunds وTransactions وDiscountCodes وFulfillmentOrders وOrderRisks وEvents؛ LineItem يحمل properties مخصصة وDiscountAllocations | `Order` و`OrderLine` و`OrderEvent`؛ financial_status يحتاج حالات الدفع عند الاستلام (نقد مُحصَّل عند التوصيل، مُسوّى مع شركة التوصيل)؛ source_name يصبح مصدر الإحالة (إنستغرام، واتساب، إعلان بمعرّفه) |
| Cart مع CartLine (Storefront) | cost وbuyerIdentity وdeliveryGroups وdiscountCodes وcheckoutUrl؛ لا يوجد نوع Checkout في Storefront API الحديثة | `Cart` و`CartLine`؛ السلة المهجورة تُستعاد بواتساب لا بالبريد |
| Checkout وAbandonedCheckout (REST قديمة) | كيان قديم استُبدل بالسلة | لا نبنيه؛ تقرير السلات المهجورة يُشتق من `Cart` |
| DraftOrder | ينشئه التاجر ثم يتحول إلى Order | `DraftOrder` في النسخة الأولى: هو مسار طلبات الدايركت وواتساب التي يكتبها التاجر بنفسه، وهو أكثر شيوعاً في العراق من السلة الذاتية |
| Fulfillment مع FulfillmentEvent | status وtracking؛ أحداث بالمدينة والإحداثيات وestimated_delivery_at وmessage | `Fulfillment` و`Shipment` وأحداث التتبع الواردة من شركة التوصيل |
| FulfillmentOrder | يُسنَد إلى Location وتنفّذه FulfillmentService ذات callback_url؛ نقل ودمج وتقسيم؛ تعليق وإفراج؛ طلب إلغاء وطلب تنفيذ مقبول أو مرفوض | هو النموذج الصحيح لتسليم الطلب لشركة توصيل عراقية: `CourierAccount` يلعب دور FulfillmentService، وطلبات الإلغاء والتنفيذ تُترجم إلى واجهات الشركات |
| CarrierService | يحسب أسعار الشحن عبر callback | `ShippingRate` بجداول أسعار لكل محافظة لكل شركة توصيل، مع مزوّد سعر حي لاحقاً |
| InventoryItem وInventoryLevel وLocation | مستوى لكل موقع؛ FulfillmentOrder يُسنَد لموقع | كما هو؛ موقع واحد افتراضياً مع دعم مخزن ومتجر فعلي |
| Discount (PriceRule مع DiscountCode، وخصومات آلية ورمزية في GraphQL) | رمز أو آلي؛ شروط وتخصيصات | `Discount` برمز وآلي؛ خصم الشحن لمحافظة معينة ميزة محلية مهمة |
| GiftCard وSellingPlan وCompany (B2B) وMarket | بطاقات هدايا، اشتراكات وطلبات مسبقة، شركات، أسواق متعددة العملات | مؤجَّلة كلها؛ سوق واحد وعملة واحدة في النسخة الأولى |
| Metafield وMetaobject | امتداد البيانات على كل كيان؛ تعريفات Metaobject مخصصة | `Metafield` في النسخة الأولى (المقاس، بلد المنشأ، مدة الضمان)؛ Metaobject لاحقاً |
| WebhookSubscription | موضوع وعنوان وتصفية وحقول مضمّنة | `WebhookSubscription` و`WebhookDelivery` (انظر 2.2.2) |
| Refund وTransaction وOrderRisk | مبالغ وبوابات وتقييم مخاطر | `Payment` و`Refund`؛ OrderRisk يصبح درجة خطر رفض الاستلام التي يحسبها Adlytic من تاريخ الهاتف والمنطقة |
| ShippingZone وCountry وProvince | مناطق بأسعار | `ShippingZone` بالمحافظات العراقية مع جدول مرجعي للأقضية قابل للتحديث، وأسعار مستقلة لإقليم كردستان |
| Page وBlog وArticle وRedirect وMenu | محتوى المتجر وتنقّله | `Page` و`Redirect` و`Menu` في النسخة الأولى؛ المدوّنة لاحقاً |
| Theme وAsset | قالب وملفاته | `Theme` و`ThemeTemplate` و`ThemeSetting` (انظر 2.2.8) |
| ScriptTag وStorefrontAccessToken وAccessScope | حقن سكربتات (قديم)، رموز واجهة المتجر، نطاقات صلاحية | لا ScriptTag (استبدلته Shopify بـ Web Pixels وكتل التطبيقات)؛ نحتفظ بالرموز والنطاقات |
| App billing charges | رسوم لمرة واحدة، اشتراك متكرر، استخدام بسقف | `Subscription` و`Invoice` وبنود تطبيقات؛ Adlytic يُباع بنداً في فاتورة المنصة |
| MarketingEvent | حدث تسويقي بقناة ومنصة وتكلفة ووسوم UTM | `MarketingEvent` كيان أصيل عندنا لا إضافة: كل حملة Meta تُسجَّل هنا وتُربط بالطلبات |
| Event وUser وPolicy | سجل أحداث، أعضاء الطاقم، سياسات المتجر | `AuditLog` و`StoreMember` وسياسات (إرجاع، خصوصية) بصيغ عراقية جاهزة |
| Shopify Payments: Payout وDispute وBalance وTenderTransaction | دفعات وتسويات ونزاعات | لا ينطبق؛ يُستبدل بـ `Remittance` من شركة التوصيل (تحصيل نقدي ثم تسوية) وهو ما لا يملكه Shopify |
| Localization وShopLocale وTranslation | لغات وترجمات لكل كيان | العربية افتراضية والكردية ثانية والإنجليزية ثالثة؛ `Translation` لاحقاً |
| Return وReverseDelivery وInventoryShipment وInventoryTransfer وPaymentTerms وTaxService وDomain وPublication وProductFeed وBulkOperation وSegment | كيانات أحدث في GraphQL فقط | `Return` و`Domain` و`ProductFeed` (كتالوج Meta) في النسخة الأولى؛ البقية لاحقاً |

**ما يلفت النظر في هذا النموذج:** الفصل بين Order (ما اشتراه العميل) وFulfillmentOrder (ما يجب أن يُسلَّم من أي موقع وبأي خدمة) هو أهم قرار تصميمي يمكن نسخه، لأنه يطابق طبيعة التجارة العراقية: الطلب يُنشأ في المتجر ويُسلَّم لشركة توصيل خارجية تقبل أو ترفض وتحاول وتعيد. وكذلك فصل InventoryItem عن ProductVariant يسمح بعدة مواقع بلا تعقيد. أما ما يغيب تماماً فهو دورة النقد: Shopify يفترض أن المال يُحصَّل قبل الشحن، ونحن نفترض العكس.

#### 2.2.2 الـ Webhooks: 221 موضوعاً وآلية تسليم مُحكمة

| العائلة | العدد | أمثلة | أهميتها لنا |
|---|---|---|---|
| تنفيذ الطلبات (FULFILLMENT وFULFILLMENTS) | 24 | FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_ACCEPTED وREJECTED وCANCELLATION_REQUEST_SUBMITTED وHOLDS_ADDED وFULFILLMENT_EVENTS_CREATE | عالية جداً: هي لغة التواصل مع شركات التوصيل |
| المخزون (INVENTORY) | 20 | INVENTORY_LEVELS_UPDATE وINVENTORY_SHIPMENTS_MARK_IN_TRANSIT | متوسطة؛ مستويات المخزون كافية في النسخة الأولى |
| العملاء (CUSTOMERS وCUSTOMER) | 20 | CUSTOMERS_MARKETING_CONSENT_UPDATE وCUSTOMER_JOINED_SEGMENT وCUSTOMER_TAGS_ADDED | عالية لأتمتة واتساب |
| الاشتراكات (SUBSCRIPTION) | 15 | SUBSCRIPTION_BILLING_ATTEMPTS_FAILURE | لا تنطبق في النسخة الأولى |
| المنتجات (PRODUCTS وPRODUCT وVARIANTS) | 16 | PRODUCTS_UPDATE وPRODUCT_FEEDS_FULL_SYNC وVARIANTS_OUT_OF_STOCK | عالية: تغذية كتالوج Meta ونفاد المخزون |
| الطلبات (ORDERS وORDER) | 12 | ORDERS_CREATE وORDERS_PAID وORDERS_CANCELLED وORDERS_EDITED وORDERS_RISK_ASSESSMENT_CHANGED وORDER_TRANSACTIONS_CREATE | أعلى أهمية: عمود الإسناد الإعلاني لـ Adlytic |
| الشركات B2B (COMPANIES وCOMPANY) | 11 | COMPANY_LOCATIONS_CREATE | مؤجَّلة |
| المجموعات (COLLECTIONS وCOLLECTION) | 9 | COLLECTIONS_UPDATE وCOLLECTION_PUBLICATIONS_CREATE | متوسطة |
| المرتجعات (RETURNS وREVERSE) | 10 | RETURNS_REQUEST وRETURNS_APPROVE وREVERSE_DELIVERIES_ATTACH_DELIVERABLE | عالية في سوق الرفض عند الاستلام |
| الخصومات والتطبيقات والمالية والمواقع والقوالب والأسواق والضرائب | 5 لكل منها | DISCOUNTS_CREATE وAPP_UNINSTALLED وAPP_SUBSCRIPTIONS_UPDATE وLOCATIONS_UPDATE وTHEMES_PUBLISH وMARKETS_UPDATE وTAX_SERVICES_CREATE | الخصومات والتطبيقات والقوالب مطلوبة |
| النطاقات والمسودات والسلال وإتمام الشراء واللغات والحقول الوصفية والشرائح والجداول | 2 إلى 3 لكل منها | DOMAINS_CREATE وDRAFT_ORDERS_CREATE وCARTS_UPDATE وCHECKOUTS_UPDATE وLOCALES_UPDATE وMETAOBJECTS_UPDATE وSEGMENTS_CREATE وSCHEDULED_PRODUCT_LISTINGS_ADD | المسودات والسلال والنطاقات مطلوبة |
| مفردة | 1 لكل منها | SHOP_UPDATE وREFUNDS_CREATE وBULK_OPERATIONS_FINISH وAUDIT_EVENTS_ADMIN_API_ACTIVITY وATTRIBUTED_SESSIONS_FIRST وLAST وTENDER_TRANSACTIONS_CREATE | ATTRIBUTED_SESSIONS تكشف أن Shopify نفسها تبني إسناداً للجلسات |

**آلية التسليم كما تكشفها المكتبة الرسمية:**

- ثلاث طرق: HTTPS إلى callbackUrl، وGoogle Pub/Sub، وAmazon EventBridge.
- ترويسات لكل تسليم: X-Shopify-Topic وX-Shopify-Hmac-Sha256 وX-Shopify-Shop-Domain وX-Shopify-API-Version وX-Shopify-Webhook-Id وX-Shopify-Triggered-At وX-Shopify-Event-Id. آلية "Events" الجديدة (إصدار 2026-10) تستخدم ترويسات بأحرف صغيرة تضيف shopify-handle وshopify-action.
- التوقيع: HMAC-SHA256 على الجسم الخام بسرّ التطبيق؛ الـ Webhooks المنشأة يدوياً من لوحة الإدارة لا تُوقَّع بسرّ التطبيق فتفشل في تحقق المكتبة.
- مهلة الإقرار 5 ثوانٍ. سياسة إعادة المحاولة متعارضة بين المصادر: المقتطف الرسمي يقول 19 محاولة خلال 48 ساعة، ومصادر ثالثة تقول 8 محاولات خلال 4 ساعات منذ 10 أيلول 2024. ثم يُحذف الاشتراك عند الفشل المستمر.
- خيارات الاشتراك: topics وuri وinclude_fields (تقليص الحمولة) وfilter بصيغة البحث (مثل `variants.price:>=10.00`) وpayload_query (مستند GraphQL يبني الحمولة) وmetafield_namespaces وcompliance_topics (طلبات بيانات العملاء وحذفها وحذف المتجر).
- آلية Events (2026-10): handle، وtopic باسم المورد (مثل Product)، وactions (مثل update)، وtriggers بمسارات حقول (مثل `product.variants.price`)، وquery تُنفَّذ لبناء الحمولة، وquery_filter (مثل `product.status:'ACTIVE'`). هي تحوّل Webhooks من "إشعار بتغيير" إلى "استعلام يُنفَّذ عند تغيّر حقل".
- اشتراكات خاصة بالتطبيق تُعلَن في `shopify.app.toml` وتُزامَن عند النشر (الموصى به)، مقابل اشتراكات خاصة بالمتجر تُسجَّل بعد OAuth.
- التكرار: قد تُسلَّم الرسالة أكثر من مرة وقد تصل بعد إزالة التطبيق؛ القالب الرسمي يحذف الجلسات بالمتجر عند APP_UNINSTALLED.

**مجموعتنا للنسخة الأولى (نحو 35 موضوعاً بالتسمية نفسها):** ORDERS_CREATE وUPDATED وCANCELLED وPAID وFULFILLED وEDITED؛ وثلاثة موضوعات لا يملكها Shopify: ORDERS_CONFIRMED (تأكيد هاتفي أو واتساب) وDELIVERY_ATTEMPT_FAILED وORDERS_REFUSED وREMITTANCES_SETTLED؛ FULFILLMENTS_CREATE وUPDATE وFULFILLMENT_EVENTS_CREATE وFULFILLMENT_ORDERS_FULFILLMENT_REQUEST_SUBMITTED وACCEPTED وREJECTED وCANCELLED؛ PRODUCTS_CREATE وUPDATE وDELETE وVARIANTS_IN_STOCK وOUT_OF_STOCK وINVENTORY_LEVELS_UPDATE؛ CUSTOMERS_CREATE وUPDATE وCUSTOMERS_MARKETING_CONSENT_UPDATE؛ CARTS_CREATE وUPDATE وDRAFT_ORDERS_CREATE وUPDATE؛ DISCOUNTS_CREATE وUPDATE وDELETE؛ COLLECTIONS_CREATE وUPDATE وDELETE؛ THEMES_PUBLISH وDOMAINS_CREATE وUPDATE وDESTROY؛ APP_UNINSTALLED وAPP_SUBSCRIPTIONS_UPDATE وSHOP_UPDATE؛ وRETURNS_REQUEST وAPPROVE وCLOSE.

#### 2.2.3 نطاقات الصلاحية: من 126 إلى 146 نطاقاً في عامَين

- النمط: `read_X` و`write_X` حيث الكتابة تتضمن القراءة، في نحو 50 فئة قدرات (المنتجات، الطلبات، العملاء، المخزون، التنفيذ المُسنَد وتنفيذ التاجر وتنفيذ الطرف الثالث، الخصومات، الملفات، القوالب، المحتوى، التنقّل والصفحات، التقارير، الترجمات، الأسواق، الحقول الوصفية وتعريفاتها، البكسلات، أحداث التسويق، شروط الدفع، المرتجعات، خطط الشراء، قنوات البيع، الشحن، اللغات، السياسات القانونية، بطاقات الهدايا، رصيد المتجر، وغيرها).
- نطاقات خاصة: `read_all_orders` للطلبات الأقدم من 60 يوماً ويحتاج موافقة؛ `write_app_proxy` لمسارات وكيل التطبيق على واجهة المتجر؛ `read_customer_events` لسلوك التصفح عبر Web Pixels؛ `write_marketing_events` لسطح إسناد منصات الإعلان، وهو النطاق الذي يطابق Adlytic تماماً.
- نطاقات Functions: cart_transforms وvalidations وdelivery_customizations وpayment_customizations وdiscounts_allocator_functions وfulfillment_constraint_rules وorder_submission_rules وdelivery_option_generators وgates.
- ما أُضيف بين 2024-07 و2026-10 (20 نطاقاً جديداً تقريباً كأزواج): إعدادات إتمام الشراء وهويته البصرية وحسابات العملاء، وعود التوصيل، شحنات المخزون وتحويلاته، طلبات ومرتجعات وتنفيذ الأسواق الخارجية (marketplace)، بوابات الدفع وجلساته وتفويضاته (تطبيقات المدفوعات)، معاملات بطاقات الهدايا، الضرائب، المستخدمون، rollouts، تعليقات التحليلات، ومعلومات KYC المالية. الاتجاه واضح: النطاقات تُفتح تدريجياً على إتمام الشراء والمدفوعات والأسواق الخارجية.
- **قرارنا:** نحو 40 نطاقاً في النسخة الأولى بالتسمية نفسها، وتُستعمل القائمة ذاتها لأدوار الطاقم (مالك، مدير، محاسب، مُجهّز طلبات، مسوّق) وللتطبيقات. Adlytic كتطبيق أول يطلب read_orders وread_customers (بتجزئة الهاتف) وread_customer_events وwrite_marketing_events وwrite_pixels وread_products وread_analytics.

#### 2.2.4 إصدارات الواجهة وأنواع العملاء

- إصدار جديد مؤرَّخ كل ربع سنة في أول كانون الثاني ونيسان وتموز وتشرين الأول عند الساعة 17:00 بالتوقيت العالمي؛ تعداد المكتبة الحالي: 2024-10 و2025-01 و2025-04 و2025-07 و2025-10 و2026-01 و2026-04 و2026-07 و2026-10 وunstable.
- كل إصدار مستقر مدعوم 12 شهراً على الأقل، بتداخل 9 أشهر على الأقل بين إصدارَين متتاليَين؛ الطلب إلى إصدار غير مدعوم يُخدَم بأقدم إصدار مستقر مدعوم (fall forward)؛ الأسطح غير المُصدَّرة قد تتغير في أي وقت؛ التوصية: تحديد الإصدار دائماً والانتقال كل ربع.
- ترويسات: X-Shopify-API-Version في الطلب والرد، وX-Shopify-Access-Token للمصادقة.
- أربعة عملاء: REST (قديم منذ 1 تشرين الأول 2024 وأصناف الموارد ما زالت تُشحن حتى 2026-07)، وGraphQL Admin (الأساسي؛ القوالب تستخدم admin.graphql مع productCreate وproductVariantsBulkUpdate)، وStorefront (رمز عام أو خاص بترويسة Shopify-Storefront-Private-Token)، وCustomer Account API. مصادر ثالثة تذكر أن التطبيقات العامة الجديدة GraphQL فقط منذ 1 نيسان 2025.
- **قرارنا:** إصدارات مؤرَّخة من النسخة الأولى (`/api/2027-01/...` أو ترويسة) بدعم 12 شهراً وسلوك fall forward، وهو رخيص إن بُني من البداية ومستحيل إضافته لاحقاً بلا ألم. اختيار REST أو GraphQL لواجهة التجار يُحسم في §7؛ ترجيحنا الأولي: JSON وREST مؤرَّخة لتكاملات التجار والمطورين العراقيين (أسهل تعلّماً ونملك أصلاً 152 مساراً بهذا النمط في Adlytic)، وGraphQL لواجهة المتجر في المرحلة الثانية حين يلزم العرض بلا رأس وتطبيق الهاتف.

#### 2.2.5 منصة التطبيقات: OAuth والجلسات والتضمين والامتدادات

**ثلاثة تدفقات مصادقة:** تبادل الرمز (token exchange) للتطبيقات المضمَّنة، إذ يُستبدل رمز جلسة App Bridge (JWT) برمز وصول متصل أو غير متصل بلا إعادة توجيه، مع "التثبيت المُدار" الذي يمنح نطاقات ملف TOML آلياً؛ ومنحة رمز التفويض (authorization code) للتطبيقات غير المضمَّنة؛ وبيانات اعتماد العميل (client credentials) للتطبيقات الخلفية في المؤسسة نفسها برمز صالح 24 ساعة.

**أنواع الرموز:** متصل (لكل مستخدم، ينتهي، يحمل حقول المستخدم)، وغير متصل (لكل متجر، يتحول إلى رموز منتهية بـ refreshToken وrefreshTokenExpires مع مساعدَي migrateToExpiringToken وrefreshToken)، ورمز الجلسة JWT من App Bridge، ورمز وصول واجهة المتجر العام أو الخاص.

**نموذج الجلسة (17 حقلاً):** id وshop وstate وisOnline وscope وexpires وaccessToken وuserId وfirstName وlastName وemail وaccountOwner وlocale وcollaborator وemailVerified وrefreshToken وrefreshTokenExpires؛ معرّف الجلسة غير المتصلة `offline_<shop>` والمتصلة من JWT. محوّلات تخزين: Prisma وPostgreSQL وMySQL وRedis وSQLite وMongoDB وDynamoDB وDrizzle وCloudflare KV والذاكرة وواجهة مخصصة.

**مساعدات الأمان في المكتبة:** validateHmac وsafeCompare وnonce وsanitizeShop وsanitizeHost وdecode-host وreject-bot-request وensure-cors-headers وrespond-to-invalid-session-token.

**التضمين:** التطبيق يُعرض داخل iframe في لوحة الإدارة؛ App Bridge يوفّر NavMenu وTitleBar وتنبيهات toast ومنتقيات الموارد؛ ترويسات CSP من نوع frame-ancestors تُضبط آلياً؛ ثلاثة أنماط توزيع: app_store (عام) وsingle_merchant (مخصص) وshopify_admin (ينشئه التاجر). سياقات المصادقة في المكتبة: admin (جلسة وعميل GraphQL وفوترة ونطاقات وCORS وإعادة توجيه ورمز جلسة)، وpublic (appProxy لطلبات واجهة المتجر الموقَّعة من Shopify ويُسمح بردود Liquid، وcheckout وcustomerAccount وextension وpos)، وflow وfulfillmentService وwebhook (المتجر والجلسة والموضوع والحمولة) وunauthenticated (admin بجلسة غير متصلة وstorefront).

**ملف `shopify.app.toml` كمانيفست تصريحي:** client_id وname وhandle وapplication_url وembedded؛ [access_scopes] بـ scopes وrequired_scopes وoptional_scopes؛ [access.admin] للوصول المباشر؛ [auth] redirect_urls؛ [webhooks] بإصدار واشتراكات (topics وuri وfilter وinclude_fields وpayload_query وcompliance_topics) وعناوين الامتثال للخصوصية؛ [events] بالآلية الجديدة؛ [app_proxy] بـ url وsubpath وprefix؛ [pos]؛ [build]. الأمر `shopify app deploy` يزامن الإعدادات والامتدادات كنسخة تطبيق.

**27 مواصفة امتداد في CLI:** إعدادات (access وapp_home وapp_proxy وbranding وevents وpoint_of_sale وprivacy_compliance_webhooks وwebhook وwebhook_subscription)؛ واجهات (admin_link وcheckout_ui_extension وcheckout_post_purchase وpos_ui_extension وui_extension بأهداف عبر الإدارة وإتمام الشراء وحساب العميل ونقاط البيع وeditor_extension_collection)؛ منطق (function وtax_calculation وpayments_app_extension وproduct_subscription وorder_attribution_config)؛ أتمتة Flow (action وtemplate وtrigger وtrigger_lifecycle_callback)؛ وchannel وtheme (امتداد قالب التطبيق) وweb_pixel_extension. إعداد امتداد الواجهة: targeting بـ target وmodule وshould_render وmetafields وdefault_placement وcapabilities وpreloads وintents وassets.

**Functions:** وحدات WebAssembly (Rust أو JavaScript وTypeScript عبر Javy أو WASM خام) باستعلام إدخال GraphQL وإخراج JSON، تُعلَن في `shopify.extension.toml` بنوع function وإصدار وأهداف. ثلاثة عشر معرّفاً: خصومات الطلب والمنتج والشحن والخصم الموحَّد وموزّع الخصومات وcart_checkout_validation وcart_transform وdelivery_customization وpayment_customization وfulfillment_constraints وorder_routing_location_rule ومولّدا خيارات الاستلام المحلي ونقاط الاستلام. أهداف مثل `purchase.validation.run` و`purchase.payment-customization.run` و`purchase.delivery-customization.run` و`cart.lines.discounts.generate.run`.

**قرارنا:** Adlytic هو التطبيق المضمَّن الأول: تبادل رمز، جدول جلسات بمحوّل Prisma، مانيفست تصريحي (TOML أو JSON) يعلن النطاقات والـ Webhooks ووكيل التطبيق. ترتيب نقاط الامتداد: كتل التطبيق في القالب وWeb Pixel أولاً (رخيصة وعالية القيمة للإعلانات)، ثم قواعد الدفع عند الاستلام التي تطابق أهداف Functions (تحقق: منع الطلب إن كان الهاتف في القائمة السوداء؛ تخصيص الدفع: إخفاء الدفع عند الاستلام في محافظة معينة أو فوق مبلغ معين؛ تخصيص التوصيل: ترتيب شركات التوصيل بحسب المحافظة) لكن بقواعد تصريحية في النسخة الأولى وصندوق WebAssembly لاحقاً، ثم محفّزات أتمتة على نمط Flow.

#### 2.2.6 واجهة المتجر Storefront API: 266 نوعاً و34 استعلاماً و41 تحويلاً

- جذور الاستعلام: product وproducts وproductByHandle وproductRecommendations وproductTags وproductTypes؛ collection وcollections وcollectionByHandle؛ cart وcartCompletionAttempt؛ customer؛ search وpredictiveSearch؛ menu وpage وpages وpageByHandle وblog وblogs وblogByHandle وarticle وarticles؛ metaobject وmetaobjects؛ localization وlocations وshop وpaymentSettings وpublicApiVersions وsitemap وurlRedirects وnode وnodes.
- التحويلات تتمحور حول السلة (24): cartCreate وcartLinesAdd وUpdate وRemove وcartBuyerIdentityUpdate وcartDeliveryAddressesAdd وUpdate وReplace وRemove وcartDiscountCodesUpdate وcartGiftCardCodesAdd وUpdate وRemove وcartMetafieldsSet وDelete وcartNoteUpdate وcartAttributesUpdate وcartBillingAddressUpdate وcartPaymentUpdate وcartSelectedDeliveryOptionsUpdate وcartPrepareForCompletion وcartSubmitForCompletion وcartRemovePersonalData وcartClone؛ والعميل (15): إنشاء رمز الوصول وتجديده وحذفه وMultipass وcustomerCreate وActivate وActivateByUrl وUpdate وRecover وReset وResetByUrl وعناوين إنشاء وتحديث وحذف وافتراضي؛ واثنان لـ Shop Pay.
- أحجام الأنواع الأساسية: Product 36 حقلاً، ProductVariant 28، Cart 20، CartLine 12، CartCost 9، Customer 18، Order 36، MailingAddress 16، Shop 22، Article 18، Page 12، Metafield 12، SellingPlan 11، Filter 5.
- ملاحظات: لا يوجد نوع Checkout، بل يُوصَل إليه عبر Cart.checkoutUrl؛ Market وLocalization تقودان التسعير بالسياق `@inContext` (بلد ولغة)؛ البحث يدعم productFilters؛ خريطة الموقع وإعادة التوجيه جزء من الواجهة.
- **قرارنا:** واجهة متجر GraphQL متمحورة حول السلة في المرحلة الثانية (للعرض بلا رأس وتطبيق الهاتف)؛ النسخة الأولى تعرض من الخادم وتستدعي الخدمات داخلياً.

#### 2.2.7 واجهة حساب العميل Customer Account API

- نقطة النهاية بالنمط `https://shopify.com/{shopId}/account/customer/api/{version}/graphql` بمعرّف متجر رقمي.
- جذور: customer وorder وdraftOrder وreturn وcompany وcompanyLocation وshop وrequestedOrderEditCalculate وreturnCalculate ورموز الامتدادات.
- 42 تحويلاً أبرزها لنا: `customerWhatsAppMarketingConsentUpdate` (واتساب قناة موافقة من الدرجة الأولى)، وorderRequestEdit وorderRequestReturn (تعديل وإرجاع يطلبهما العميل بنفسه)، وموافقات البريد، وعناوين، وmetafieldsSet؛ والبقية أدوات دفع (Apple Pay وGoogle Pay وPayPal وShop Pay وStripe Financial Connections) وعقود اشتراك لا تنطبق على العراق.
- العميل 21 حقلاً منها phoneNumber وemailAddress وorders وdraftOrders وstoreCreditAccounts وpaymentInstruments وtags وmetafields وmarketCurrencyCode؛ الطلب 80 حقلاً.
- **قرارنا:** حساب العميل بالهاتف ورمز لمرة واحدة عبر واتساب أو رسالة نصية؛ "طلباتي" وتتبّع الشحنة وطلب إرجاع وموافقة واتساب؛ لا بطاقات ولا اشتراكات.

#### 2.2.8 معمارية القوالب (Online Store 2.0) ومحرك Liquid

**بنية المجلدات والعقد الملزم للقالب:**

| المجلد | المحتوى | ما يحكمه |
|---|---|---|
| layout/ | theme.liquid وpassword.liquid | الهيكل العام مع content_for_header وcontent_for_layout |
| templates/ | قوالب JSON (خريطة sections مع ترتيب order) وقوالب Liquid قديمة؛ مجلد customers/ وgift_card.liquid و404 | حتى 25 قسماً في القالب الواحد (الحد الموثَّق) |
| sections/ | ملفات .liquid بكتلة `{% schema %}`؛ ومجموعات أقسام JSON (header-group وfooter-group وaside) | كل قسم يعلن إعداداته وكتله وقوالبه الجاهزة |
| blocks/ | كتل القالب مع `{% content_for 'blocks' %}` وschema | في مخطط المنصة لكن غائبة من Dawn 16 (قالب Horizon يعتمدها ولم نفحصه) |
| snippets/ | مقتطفات تُستدعى بـ render | إعادة استخدام بلا حالة |
| config/ | settings_schema.json (مجموعات إعدادات المتجر) وsettings_data.json (القيم الحالية والقوالب المسبقة) | إعدادات عامة للقالب يراها التاجر |
| locales/ | ملفات ترجمة للواجهة وأخرى للمحرر (.schema.json) | Dawn يشحن 30 لغة بلا عربية |
| assets/ | CSS وJS وصور وخطوط | asset_url وقواعد الحجم في Theme Check |

**مخطط القسم (schema):** name وtag وclass وlimit وsettings وblocks (type وname وsettings وlimit) بحد 50 كتلة في القسم، وmax_blocks وpresets (name وsettings وblocks) وdefault وlocales وenabled_on وdisabled_on (قوالب ومجموعات)؛ نوع الكتلة `@app` يسمح لكتل التطبيقات بالظهور في أي قسم يعلن ذلك.

**35 نوع إعداد:** أساسية (checkbox وnumber وradio وrange وselect وtext وtextarea) ومتخصصة (article وblog وcollection وcollection_list وcolor وcolor_background وcolor_scheme وcolor_scheme_group وfont_picker وhtml وimage_picker وinline_richtext وlink_list وliquid وmetaobject وmetaobject_list وpage وproduct وproduct_list وrichtext وtext_alignment وurl وvideo وvideo_url ولوحات style) وعناصر جانبية (header وparagraph). هذه القائمة هي عقد محرر القالب نفسه: كل نوع يقابل أداة إدخال في المحرر ونوع قيمة في Liquid.

**Section Rendering API:** أي صفحة تُطلب مع `?sections=id1,id2` فتعيد JSON بالـ HTML المُصيَّر لكل قسم، أو `?section_id=` لقسم واحد؛ Dawn يبني عليها درج السلة والبحث التنبؤي وتحديث المتغيرات بلا إطار عمل جافاسكربت.

**أحداث المحرر:** shopify:section:load وunload وselect وdeselect وreorder وshopify:block:select وdeselect، مع علم `request.design_mode` في Liquid لتمييز وضع التصميم.

**نموذج كائنات Liquid:** 142 كائناً، منها كائنات عامة متاحة في كل قالب (shop وcart وcustomer وroutes وlocalization وsettings وsection وblock وrequest وtemplate وcanonical_url وpage_title وcontent_for_header وcontent_for_layout) وكائنات موارد (product بـ 44 خاصية وvariant بـ 39 وcollection وline_item وorder وaddress وimage وmedia وmetafield وmenu وlinklist وpaginate وform)؛ 33 وسماً خاصاً بالقوالب (form وpaginate وsection وsections وrender وlayout وjavascript وstylesheet وschema وstyle وliquid وcontent_for وغيرها)؛ ومرشحات في فئات: المال (money وmoney_with_currency وmoney_without_trailing_zeros)، والنصوص، والمصفوفات، والوسائط (image_url بعرض وارتفاع وقص وصيغة وجودة، وimage_tag وvideo_tag)، والألوان، والخطوط، والتنسيق (date وjson وweight_with_unit)، والترجمة (t وcurrency_selector)، وHTML، والملفات المستضافة (asset_url وfile_url)، والسلة، والعميل، والحقول الوصفية، والدفع، والوسوم، والمجموعات، والقيم الافتراضية، والرياضيات. `shop_locale.direction` موجود في الكائنات، ما يدل على دعم الاتجاه من اليمين إلى اليسار على مستوى المنصة حتى لو غاب عن Dawn.

**أمان المحرك وحوكمة القوالب:** مفصّلان في 2.3؛ الخلاصة أن Liquid لغة لا تنفّذ كوداً، تعرض كائنات بقائمة سماح، وتحدّ الموارد. وأداة Theme Check تفرض 91 قاعدة منها حجم CSS وJS والسكربتات الحاجبة للتحليل والموارد البعيدة وأبعاد الصور وحجم الصفحات وتعقيد Liquid وعمق التداخل وحجم الملف.

**مبادئ Dawn:** عرض خادمي، تحسين تدريجي، لا إطار عمل جافاسكربت، مكوّنات ويب بجافاسكربت خام، CSS رشيق، صور كسولة التحميل. وهي بالضبط ما تحتاجه شبكات الهاتف العراقية ومتصفح إنستغرام الداخلي.

**قرارنا:** ننسخ العقد لا الكود: بنية المجلدات نفسها ومخطط JSON نفسه للأقسام والكتل والإعدادات، حتى يستطيع مطوّر قوالب Shopify نقل قالبه إلينا بتعديلات محدودة؛ محرك LiquidJS (TypeScript) بقائمة سماح للكائنات والمرشحات ووضع صارم وحدود موارد، يُختبر على `liquid-spec` وملفات `theme-liquid-docs`؛ `ar.json` افتراضية و`dir=rtl` وتنسيق الدينار بلا كسور والأرقام العربية المشرقية اختيارية؛ مكافئ Section Rendering API ومكافئ أحداث المحرر؛ وكتل تطبيق لـ Adlytic (مثل "الأكثر طلباً من إعلانات هذا الأسبوع").

#### 2.2.9 Polaris: البنية المعلوماتية للوحة الإدارة

- 11 فئة مكوّنات: actions (زر ومجموعة أزرار وربط حساب)، وfeedback-indicators (شارة ولافتة وشريط تقدم وهياكل تحميل ودوّار)، وimages-icons، وlayout-structure، وlists، وnavigation، وoverlays، وselection-inputs، وtypography، وutilities، وdeprecated.
- Polaris React أُرشفت ومكوّنات الويب حلّت محلها في 1 تشرين الأول 2025.
- أنماط البنية المعلوماتية: صفحات فهرس للموارد (تصفية وعروض محفوظة وإجراءات جماعية)، وصفحات تفاصيل بعمودَين، وتخطيط إعدادات، وتنقّل جانبي بمسار تفصيلي، وقشرة تطبيق مضمَّن (iframe مع رمز جلسة وCSP).
- **قرارنا:** نظام تصميم Adlytic موجود أصلاً؛ نتبنى الأنماط لا المكتبة، بالاتجاه من اليمين إلى اليسار أولاً.

**الدلالات المباشرة على مخططنا في §7:**

1. نمذجة المخطط الجوهري على أشكال REST وStorefront: متجر، منتج بخيارات حتى 3 ومتغيرات ووسائط، مجموعة يدوية وآلية، عميل بعناوين، طلب بحقائب مالية وبنود بخصائص مخصصة، مسودة طلب، فصل Fulfillment عن FulfillmentOrder، مخزون بعناصر ومستويات ومواقع، خصومات رمزية وآلية، حقول وصفية، اشتراكات Webhooks، قوالب وأصول، صفحات وقوائم. وإسقاط كيانات البوابات (دفعات ونزاعات وShop Pay واشتراكات) مع إضافة آلة حالات الدفع عند الاستلام التي يفتقدها Shopify.
2. Webhooks والحقول الوصفية هما عمود التكامل: مجموعة ORDERS وFULFILLMENTS وCUSTOMERS وPRODUCTS وCARTS موقَّعة ومُصدَّرة ومتكررة بأمان، كي يُسنِد Adlytic إنفاق Meta إلى الطلبات.
3. نطاقات صلاحية بالتسمية نفسها للطاقم والتطبيقات من اليوم الأول؛ قائمة Shopify الـ 146 هي قائمة تحقق لقدرات المنتج.
4. نسخ معمارية القالب لا كود Dawn، بمحرك Liquid متوافق ومحدود الموارد في TypeScript.
5. العربية والاتجاه من اليمين إلى اليسار افتراضيان: تمايز حقيقي عن "Shopify في العراق".
6. نموذج كائنات Liquid مكافئ لعموميات Shopify وكائنات مواردها كي تُنقَل القوالب؛ 44 خاصية للمنتج و39 للمتغير هي الحد الأدنى للتكافؤ.
7. واجهة متجر GraphQL متمحورة حول السلة وحساب عميل بالهاتف وموافقة واتساب في المرحلة الثانية.
8. لوحة إدارة بأنماط Polaris وقشرة تطبيق مضمَّن كي يُعرض Adlytic والتطبيقات القادمة داخل لوحة التاجر.
9. إصدارات ربع سنوية مؤرَّخة ومانيفست تطبيق تصريحي وOAuth بتبادل الرمز وبيانات اعتماد العميل وفوترة تطبيقات مربوطة بفاتورة المنصة.
10. لا إرث: لا REST بلا إصدار ولا ScriptTag ولا مكافئ checkout.liquid.

**أسئلة مفتوحة من هذا القسم:** قائمة النطاقات الرسمية الكاملة (اللقطتان مجتمعيتان)؛ هل أضاف إصدار 2026-10 موضوعات Webhooks جديدة فوق الـ 221؛ كيانات GraphQL الحصرية (Segment وMetafieldDefinition وMarket وCatalog وPublication وReturn وReverseFulfillmentOrder وInventoryShipment وTranslation) لم تُعدَّد حقولها؛ هل تشحن Shopify عربية واتجاهاً من اليمين إلى اليسار في قالب أول مثل Horizon؛ معمارية كتل القالب في Horizon؛ حدود المعدل والعمليات الجماعية من مصادر أولية؛ اختلاف Liquid الإنتاجي عن الجوهرة المفتوحة؛ أهداف امتدادات إتمام الشراء وحمولات تطبيقات المدفوعات بالتفصيل؛ أشكال حمولات Webhooks لكل موضوع؛ ودلالات آلية Events بعيدة المدى.

### 2.3 كيف تُبنى Shopify وتُوسَّع: الدروس الهندسية من المواد العامة

**منهج هذا القسم:** مدونة shopify.engineering وshopify.dev ومعظم المضيفين التجاريين محجوبون من بيئة البحث، فالوقائع من مقتطفات البحث عن المقالات الأولية (18 بحثاً) ومن ملفات المستودعات المفتوحة على GitHub؛ وما لم نستطع تثبيته مذكور في الأسئلة المفتوحة.

**الصورة الكبيرة:** Shopify تطبيق Ruby on Rails واحد "متراصّ معياري" لم يُعَد بناؤه قط، حدوده الداخلية تفرضها أداة Packwerk وأنواع Sorbet، ويُنشر من الفرع الرئيس نحو 40 مرة يومياً (نحو 400 إيداع يومياً) عبر Shipit وkrane، بأعلام ميزات وتراجع سريع بدل بيئات تجريبية أو نشر كناري. القرار المعماري المُعرِّف هو تعدد المستأجرين: كل جدول يملكه متجر يحمل shop_id، والمتاجر تعيش في "pods" كل منها شريحة معزولة من Shopify بقاعدة MySQL وRedis وMemcached خاصة، وجدول توجيه على الحافة يربط كل متجر بـ pod، وأداة Ghostferry ("Shop Mover") تنقل متجراً واحداً بين الشرائح بثوانٍ من التوقف (نحو 2.5 ثانية في 2018) بحسب الاستخدام والحركة والتوقع. طبقة البيانات MySQL بحجم بيتابايت (Vitess مُعتمَد لتطبيق Shop على الأقل بمفتاح user_id)، وMemcached بقراءة عابرة عبر IdentityCache، وRedis للمهام والجلسات، وKafka مع Debezium لالتقاط التغييرات من السجل إلى منصة بيانات Spark وdbt وBigQuery ومنصة تعلّم آلي على Ray (Merlin). البنية التحتية على Google Cloud وKubernetes منذ 2016 و2017.

**طبقات المعمارية وما نأخذه منها:**

| الطبقة | المكوّنات والتقنية (Shopify) | لماذا فعلوها | ما نأخذه |
|---|---|---|---|
| الحافة | Nginx مع OpenResty (Lua): جدول توجيه متجر إلى pod، خنق إتمام الشراء بدلو مثقوب، صفحة انتظار مخبأة؛ شهادات Let's Encrypt لنحو 4.5 مليون نطاق مخصص منذ 2016 (حتى 48 ساعة للإصدار)؛ cdn.shopify.com بتحويل الصور عبر معاملات image_url (عرض وارتفاع وقص وصيغة وجودة) بلا تكبير | توجيه قابل للبرمجة، حماية مسار الكتابة، HTTPS مجاني للجميع، رفع واحد وعدة أحجام | Cloudflare for SaaS أو Caddy للنطاقات المخصصة مع واجهة "قيد الإصدار حتى 48 ساعة"؛ خط صور بمعاملات URL خلف CDN يغذّي أيضاً تحليل الإبداعات في Adlytic |
| التطبيق | متراصّ Rails معياري بـ Packwerk وSorbet وTapioca وBootsnap وخادم Pitchfork المُعيد التفريع؛ Semian لقواطع الدارة والحواجز على MySQL وRedis وHTTP؛ Toxiproxy لحقن الأعطال منذ 2014؛ job-iteration لمهام قابلة للمقاطعة بنقاط تفتيش في Redis؛ IdentityCache بإبطال بعد after_commit | قاعدة واحدة بحدود مفروضة آلياً؛ التبعية البطيئة أسوأ من المعطّلة؛ المهام تنجو من نشر متكرر | متراصّ Hono معياري بوحدات صريحة (كتالوج، طلبات، واجهة متجر، إعلانات، فوترة) تُفرض حدودها بأداة فحص تبعيات؛ قواطع دارة ومهلات على Meta وواتساب وشركات التوصيل؛ مهام BullMQ قابلة للاستئناف بمؤشر |
| المستأجرون والبيانات | pods بشريحة MySQL وRedis وMemcached لكل منها؛ shop_id على كل جدول مفتاح تقسيم؛ Ghostferry (Go، نسخ بالدفعات مع تتبع binlog ومُحقِّق ونموذج TLA+)؛ Vitess لتطبيق Shop مع مُحقِّق استعلامات يفرض مفتاح التقسيم في WHERE؛ GKE وkrane وEJSON للأسرار | عزل المستأجرين وحدّ الجيران المزعجين والتوسع الأفقي بإضافة pods؛ انقل المتاجر لا الشرائح | `store_id` إلزامي على كل نموذج Prisma مع RLS في Postgres؛ قاعدة واحدة اليوم قابلة للتقسيم إلى pods لاحقاً بلا إعادة كتابة |
| الأحداث | Kafka مع Kafka Connect وDebezium (التقاط تغييرات من السجل بدل الاستعلام الدوري Longboat)؛ Webhooks عبر HTTPS وPub/Sub وEventBridge بتوقيع HMAC-SHA256 وإقرار 5 ثوانٍ و19 محاولة خلال 48 ساعة | التقاط متسق ومرتّب من متراصّ مُقسَّم؛ دفع موثوق للتطبيقات | صندوق صادر في Postgres أو نسخ منطقي إلى Redis Streams (Redpanda لاحقاً) لتغذية تحليلات التاجر و"دراسة الجدوى من الحساب"؛ عقد Webhooks مطابق |
| عرض المتجر | Storefront Renderer خدمة Ruby مخصصة أُعيد بناؤها من كانون الثاني 2019 بردود أسرع 3 إلى 5 مرات عند غياب الذاكرة المؤقتة: تقليل التخصيصات، SQL مجمَّع، مُحفِّظ كائنات Liquid يوفّر 16 إلى 20 استدعاء Redis وMySQL لكل طلب، هدف Apdex بعتبة 200 ملّي ثانية، مُحقِّق ظلّ للتكافؤ قبل التبديل؛ Liquid (روبي) مع liquid-spec (أكثر من 7 آلاف مواصفة منها 2,260 تسجيلاً إنتاجياً) وtheme-liquid-docs؛ Dawn وTheme Check بـ 91 قاعدة؛ Hydrogen (React Router 7) على Oxygen (workerd) للرأس بلا رأس | السرعة من التبسيط والتجميع والتخبئة؛ القوالب غير موثوقة | عرض خادمي بتحفيظ لكل طلب وهدف 200 ملّي ثانية؛ LiquidJS مُختبر على liquid-spec؛ مجموعة قواعد فحص قوالب مختصرة؛ لا رأس بلا رأس في النسخة الأولى |
| إتمام الشراء والمدفوعات | دلو مثقوب على الحافة مع صفحة انتظار مخبأة (2017) وعدالة بكوكي طابع زمني موقَّع وعتبة قبول لكل موزّع بلا حالة مشتركة؛ تحوّل 2022 إلى طابور عادل واعٍ بالتجارة قرب طبقة التطبيق؛ Shopify Payments على Stripe منذ آب 2013؛ Functions بـ WebAssembly (Rust أو JavaScript عبر Javy وQuickJS) بسقف 256 كيلوبايت للوحدة ونحو 11 مليون تعليمة (مجتمعي) و128 كيلوبايت إدخال، بديلاً عن Scripts | حماية مسار الكتابة بعدالة قابلة للاختبار؛ اشترِ المدفوعات لا تبنِها؛ منطق الطرف الثالث في صندوق رمل | قبول مضبوط على نقطة إنشاء الطلب لكل متجر لحملات إنستغرام الفجائية حتى مع الدفع عند الاستلام؛ المدفوعات عبر شركاء (المحافظ وشركات التوصيل)؛ محرك قواعد تصريحي قبل WebAssembly |
| منصة الواجهات | REST: دلو 40 طلباً يتسرب 2 في الثانية لكل تطبيق لكل متجر (Plus 400 و20)، قديم منذ 1 تشرين الأول 2024؛ GraphQL: نقاط تكلفة في الثانية بحسب الخطة 100 و200 و1,000 و2,000 (مصادر ثالثة) بحد 1,000 نقطة للاستعلام وthrottleStatus في الرد؛ ترويسات X-Shopify-Shop-Api-Call-Limit وRetry-After؛ App Bridge وتبادل رمز ورموز منتهية وبيانات اعتماد عميل 24 ساعة؛ graphql-ruby مع graphql-batch ضد N+1 | حماية عادلة متعددة المستأجرين؛ السعر بحسب تعقيد الاستعلام | دلو مثقوب لكل متجر لكل تطبيق بترويسات حد وإعادة محاولة من اليوم الأول؛ Adlytic والتطبيقات القادمة تخضع للحدود نفسها |
| التسليم والمراقبة | Shipit (أكوام وطابور دمج وأقفال وتراجع) مع krane؛ statsd-instrument إلى DogStatsD وDatadog افتراضياً | شحن متكرر آمن عبر مئات المشاريع | نشر من الفرع الرئيس على Railway بأعلام ميزات وتراجع بنقرة؛ OpenTelemetry من الإصدار الأول |
| البيانات والبحث والتعلّم | Debezium إلى Kafka إلى Starscream (PySpark بعشرات آلاف المهام ومئات التيرابايت يومياً) وبحيرة Spark وPresto وdbt وBigQuery وRedshift؛ Merlin (Ray على Kubernetes، 2022) وتضمينات حية للبحث الدلالي؛ محرك بحث C++ داخلي بدل Elasticsearch وSolr مع استحواذ Vantage Discovery في آذار 2025 | تحليلات التجار والتقارير؛ تحكم في الصلة والكمون والتكلفة | Postgres مع عروض مادية لتحليلات التاجر؛ بحث نصي عربي في Postgres ثم Meilisearch؛ لا محرك مخصص |

**نموذج أمان Liquid كما يكشفه الكود المفتوح:**

- لغة قوالب لا تُقيِّم كوداً: لا تنفيذ لروبي أو أي لغة عامة من داخل القالب.
- الكائنات تُعرض عبر أصناف Drop بقائمة سماح صريحة للطرائق العامة (invokable?) ومُلتقِط liquid_method_missing؛ وضع strict_variables يرمي UndefinedDropMethod عند طلب خاصية غير موجودة.
- المرشحات عبر StrainerTemplate بقائمة سماح لوحدات المرشحات المسجَّلة؛ المرشح غير المعروف يمرّر القيمة كما هي إلا في وضع strict_filters.
- بيئات (Environments) تحدّ الوسوم والمرشحات المتاحة لكل سياق.
- حدود موارد: render_score_limit لدورات التكرار، وcumulative_render_score_limit، وrender_length_limit لبايتات الإخراج، وassign_score_limit وcumulative_assign_score_limit؛ ويُرمى MemoryError برسالة "Memory limits exceeded".
- أوضاع تحليل: lax (افتراضي) وwarn وstrict وstrict2.
- مطابقة عبر liquid-spec: 955 أساسيات و2,106 liquid_ruby و1,905 أخطاء تحليل و2,260 تسجيلاً إنتاجياً، مع محوّلات JSON-RPC لمحركات غير روبي، أي أننا نستطيع تشغيل LiquidJS ضدها مباشرة.
- حوكمة القوالب عبر Theme Check: AssetSizeCSS وAssetSizeJavaScript وParserBlockingScript وRemoteAsset وImgWidthAndHeight وPaginationSize وLiquidComplexity وLiquidNestingDepth وMaxFileSize ضمن 91 قاعدة.

**أرقام الذروة كهدف لتخطيط السعة (ليس لنا بل كشكل للمنحنى):**

| المقياس | BFCM 2024 | BFCM 2025 |
|---|---|---|
| إجمالي المبيعات | 11.5 مليار دولار | 14.6 مليار دولار |
| ذروة المبيعات في الدقيقة | 4.6 مليون دولار | 5.1 مليون دولار |
| طلبات الحافة في الدقيقة | 284 مليوناً | 489 مليوناً |
| طلبات خوادم التطبيق في الدقيقة | أكثر من 80 مليوناً | أكثر من 117 مليوناً |
| طلبات واجهة البرمجة في الدقيقة | غير معلن | 31.8 مليوناً |
| استعلامات قاعدة البيانات | 10.5 تريليون | غير معلن |

الدرس لنا ليس الحجم بل الشكل: ذروة حملة إنستغرام لتاجر عراقي تأتي خلال دقائق من نشر الريل، وهي صورة مصغرة من BFCM تحتاج قبولاً مضبوطاً على مسار الطلب لا على الصفحات.

**المخزون مفتوح المصدر (25 مستودعاً) وما نفعل به:**

| المستودع | الدور عند Shopify | استخدامنا |
|---|---|---|
| Shopify/liquid وliquid-spec وtheme-liquid-docs | لغة القوالب ومجموعة مطابقتها وتوثيق الكائنات والمرشحات والوسوم بصيغة JSON | مرجع مباشر: LiquidJS يُختبر على liquid-spec، وتوثيق JSON يولّد نموذج كائناتنا وقائمة السماح |
| Shopify/theme-tools وdawn | Theme Check (91 قاعدة) وخادم لغة؛ القالب المرجعي | نقتبس مجموعة قواعد الفحص ونبني قالباً عربياً مرجعياً بمبادئ Dawn لا بكوده |
| Shopify/packwerk | حدود المتراصّ المعياري | النمط فقط (أداة فحص تبعيات في TypeScript) |
| Shopify/identity_cache وjob-iteration وsemian وtoxiproxy | تخبئة بقراءة عابرة؛ مهام قابلة للمقاطعة؛ قواطع دارة وحواجز؛ حقن أعطال | الأنماط الأربعة في طبقة BullMQ وعملاء التكاملات؛ Toxiproxy يُشغَّل كما هو في اختبارات التكامل |
| Shopify/ghostferry | نقل متاجر بين شرائح MySQL | لا؛ نعتمد Postgres ونؤجل التقسيم |
| Shopify/shipit-engine وkrane وejson وbootsnap وpitchfork وstatsd-instrument وtapioca وgraphql-batch | نشر ومراقبة وأداء روبي وGraphQL | أنماط فقط؛ Railway وOpenTelemetry وDataLoader في TypeScript |
| Shopify/shopify-app-js وshopify-app-template-remix (React Router) | مكتبة التطبيقات: مصادقة وجلسات وWebhooks وفوترة؛ قالب تطبيق مضمَّن بـ Prisma | مرجع مباشر لتصميم منصة تطبيقاتنا وجلسات Prisma؛ وهو القالب الذي سيكتب به مطوّر عراقي تطبيقاً لمنصتنا إن حافظنا على التشابه |
| Shopify/polaris | نظام تصميم الإدارة | أنماط البنية المعلوماتية فقط |
| Shopify/hydrogen | واجهة متجر بلا رأس مع MiniOxygen | مخطط Storefront GraphQL المولَّد فيه هو مرجع واجهتنا في المرحلة الثانية |
| bytecodealliance/javy وShopify/function-examples | JavaScript إلى WebAssembly وأمثلة Functions | مرحلة لاحقة لصندوق قواعد الطرف الثالث |

**الدروس الأربعة عشر وقرارنا في كل منها:**

| الدرس من Shopify | قرارنا |
|---|---|
| متراصّ معياري واحد بحدود مفروضة لا خدمات مصغرة؛ Rails لم يُعَد بناؤه | متراصّ Hono واحد بوحدات وحدود مفحوصة آلياً |
| قسّم بالمستأجر (shop_id) من البداية وانقل المستأجرين لا الشرائح | `store_id` على كل صف مع RLS، وتصميم يسمح بتقسيم لاحق |
| كل استعلام على جدول مُقسَّم يحمل مفتاح التقسيم ويُفرض آلياً | وسيط Prisma يرفض الاستعلام بلا `store_id` خارج سياق المنصة |
| افشل سريعاً: قواطع دارة وحواجز وحقن أعطال | قواطع على Meta وواتساب وشركات التوصيل والمحافظ؛ Toxiproxy في الاختبارات |
| اشحن صغيراً وكثيراً بأعلام ميزات وتراجع سريع | نشر من الفرع الرئيس بأعلام لكل متجر |
| الذاكرة المؤقتة ليست متسقة أبداً؛ أبطِل بعد الإيداع واقبل القِدَم للقراءة فقط | تخبئة صفحات المتجر لكل متجر بإبطال عند أحداث المنتج والمخزون |
| اجعل المهام الطويلة قابلة للمقاطعة والاستئناف | مزامنة Adlytic والاستيراد الجماعي بمؤشرات في Redis |
| عرض القوالب غير الموثوقة يحتاج لغة لا تُقيِّم كوداً بقوائم سماح وحدود موارد ومطابقة مسجَّلة من الإنتاج | LiquidJS مقيَّد ومُختبر على liquid-spec |
| سرعة واجهة المتجر من التبسيط والتجميع والتخبئة مع مُحقِّق ظلّ قبل التبديل | تحفيظ لكل طلب، تجميع الاستعلامات، هدف 200 ملّي ثانية |
| احمِ مسار الكتابة بقبول مضبوط على الحافة لكن أبقِ الطابور قريباً من منطق العمل | دلو مثقوب لكل متجر على إنشاء الطلب مع صفحة انتظار |
| التقاط التغييرات من السجل أفضل من الاستعلام الدوري للتحليلات | صندوق صادر ونسخ منطقي من Postgres |
| عاير الواجهات بالتكلفة لا بعدد الطلبات فقط، ووقّع الـ Webhooks وحدّ إعادة محاولاتها | ترويسات حد وإعادة محاولة؛ HMAC وإقرار 5 ثوانٍ وتعطيل النقاط الميتة |
| شغّل منطق الطرف الثالث في صندوق WebAssembly بميزانية حجم وتعليمات | محرك قواعد تصريحي أولاً وWebAssembly لاحقاً |
| اشترِ المدفوعات أو شارك فيها وابنِ فقط حيث يفرض الحجم | المحافظ وشركات التوصيل شركاء؛ البحث على Postgres ثم Meilisearch |

**أسئلة مفتوحة من هذا القسم:** هل يعمل المتراصّ الجوهري على Vitess اليوم أم تطبيق Shop فقط؛ هل Storefront Renderer تطبيق Rails أم خدمة روبي أخرى؛ سياسة إعادة محاولة Webhooks الفعلية (19 خلال 48 ساعة أم 8 خلال 4 ساعات)؛ أحجام دلاء GraphQL الرسمية بحسب الخطة؛ حدود Functions الرسمية وتاريخ إيقاف Scripts (مصدر ثالث يقول 30 حزيران 2026)؛ آليات حماية إتمام الشراء من الروبوتات وغرفة الانتظار الحالية؛ معمارية Shopify Protect وتحليل الاحتيال؛ حزمة المراقبة بعد statsd-instrument؛ نظام أعلام الميزات الداخلي وهل يُستعمل النشر التدريجي الآن؛ مزوّد CDN لـ cdn.shopify.com؛ عدد pods وأرقام Shop Mover الحالية؛ أرقام Kafka؛ دور YJIT في الإنتاج؛ تواريخ مقالات pods (يُعتقد 2015) والموازن القابل للبرمجة (يُعتقد 2017)؛ وآلية توجيه النطاقات المخصصة على الحافة بعد إصدار الشهادة.

<!-- FILL:S9 -->

---

## 3. تشريح روزنامة

<!-- FILL:S4 -->

---

## 4. المنافسون العراقيون والعرب

<!-- FILL:S5 -->

---

## 5. البيئة التشغيلية العراقية التي يجب أن تتكامل معها المنصة

<!-- FILL:S6 -->

---

## 6. تحليل الفجوة: ما يجب أن يملكه "شوبيفاي عراقي" ولا يملكه Shopify ولا روزنامة

<!-- FILL:GAP -->

---

## 7. المخطط التقني لمنصتنا

<!-- FILL:S7 -->

<!-- FILL:S8 -->

### 7.3 المخطط المقترح (مسودة تصميم، تُضبط بنتائج 7.1 و7.2)

**المبادئ الحاكمة**

1. الدفع عند الاستلام هو المسار الأساسي لا الاستثناء: دورة الطلب تتضمن خطوة تأكيد بالهاتف أو واتساب، وتسليماً لشركة توصيل، وتحصيلاً نقدياً، وتسوية لاحقة مع التاجر. هذا ما لا يملكه Shopify أصلاً.
2. واتساب هو قناة الإغلاق والإشعار؛ البريد الإلكتروني ثانوي، والعميل يُعرَّف برقم هاتفه.
3. العربية والكردية من اليمين إلى اليسار، والدينار بلا كسور، والعنوان عراقي: محافظة ثم منطقة ثم أقرب نقطة دالة ثم هاتف، لا شارع ورمز بريدي.
4. متعددة المستأجرين من اليوم الأول: `store_id` على كل صف مع عزل على مستوى قاعدة البيانات (RLS)، وهو نمط Shopify نفسه (`shop_id` ثم التقسيم إلى pods لاحقاً).
5. القوالب غير موثوقة: تُعرض بمحرك قوالب آمن لا ينفّذ كوداً (نمط Liquid)، ونموذج الكائنات المتاح للقالب محدد صراحة.
6. Adlytic ليس إضافة بل طبقة ذكاء تقرأ أحداث المتجر نفسها (طلب، تأكيد، تسليم، رفض) مع معرّفات الإعلان، فتحسب ما لا يستطيع أي منافس حسابه.

**طبقات المعمارية**

| الطبقة | المكوّن | التقنية المقترحة | لماذا |
|---|---|---|---|
| الحافة والنطاقات | نطاق فرعي لكل متجر (`*.المنصة`) ونطاقات مخصصة | Cloudflare for SaaS لاستضافة أسماء المضيفين المخصصة مع شهادات تلقائية؛ أو Caddy مع TLS عند الطلب كبديل أرخص | آلاف النطاقات المخصصة بلا إدارة شهادات يدوية |
| عرض المتجر | عارض خادمي يفك النطاق إلى متجر ويعرض القالب | Hono مع LiquidJS (متوافق مع Liquid) وذاكرة مؤقتة لكل صفحة لكل متجر في Redis | سرعة على هواتف أندرويد ضعيفة وبيانات محدودة؛ تحسين محركات البحث؛ أمان القوالب |
| لوحة التاجر | إدارة المنتجات والطلبات والتصميم والإحصاءات | صفحات مقدَّمة من الخادم بنظام تصميم Adlytic أولاً، ثم واجهة تفاعلية حيث يلزم (محرر القالب) | إعادة استخدام ما بُني، وسرعة الإطلاق |
| الواجهة الأساسية | واجهة برمجة للطلبات والمنتجات والعملاء، مصادقة التاجر والطاقم | Hono وPrisma وPostgres | المكدس المعروف للفريق ومُثبت في Adlytic |
| العمال | معالجة الصور، مزامنة شركات التوصيل، إشعارات واتساب، إشعارات Webhook، مزامنة Adlytic | BullMQ على Redis مع نمط صندوق الصادر (outbox) | موثوقية الأحداث، وإعادة المحاولة |
| التكاملات | شركات التوصيل، المحافظ، Meta Pixel وConversions API، WhatsApp Cloud API، تيليجرام | محوّلات خلف واجهات موحدة (CourierAdapter، PaymentRail، MessagingChannel) | إضافة شركة توصيل جديدة بملف واحد |
| البيانات | Postgres مع RLS، Redis، تخزين كائنات للوسائط، بحث | Postgres أولاً (بحث نصي عربي)، Meilisearch عند الحاجة، Cloudflare R2 أو ما يماثله للوسائط مع تحويل صور عند الطلب | كلفة منخفضة ومسار توسع واضح |
| الذكاء | Adlytic الحالي كخدمة شقيقة تقرأ أحداث المتجر | ربط `Store` بـ `Workspace` في Adlytic، وتدفق أحداث عبر الصادر | لا نسخة ثانية من محركات التحليل |

**نموذج البيانات (مسودة Prisma، تُراجَع بما يكشفه القسم 7.1 عن نموذج Shopify)**

- **المستأجر والهوية:** `Store` (الاسم، العملة IQD، اللغة الافتراضية، المحافظة، الخطة)، `StoreDomain` (نطاق فرعي أو مخصص، حالة الشهادة، أساسي)، `StoreMember` و`StoreRole` (مالك، مدير، موظف طلبات، مصمم)، `Staff` يرتبط بـ `User` الموجود في Adlytic.
- **الكتالوج:** `Product` (العنوان، الوصف، الحالة، النوع، البائع، وسوم، SEO)، `ProductOption` (اللون، المقاس)، `ProductVariant` (السعر، سعر المقارنة، التكلفة، SKU، الباركود، الوزن، الصورة)، `Location` و`InventoryLevel` (كمية لكل متغير لكل موقع)، `Collection` و`CollectionRule` (يدوية وآلية بشروط)، `MediaAsset` (صورة أو فيديو، نسخ محوّلة)، `Metafield` (حقول مخصصة لكل كيان).
- **العملاء:** `Customer` (الهاتف هو المفتاح، الاسم، واتساب، ملاحظات، إجمالي الطلبات، نسبة الرفض)، `CustomerAddress` (محافظة، منطقة، نقطة دالة، تفاصيل).
- **الشراء:** `Cart` و`CartLine`، `Order` (رقم متسلسل لكل متجر، القناة: متجر أو واتساب أو إنستغرام، الحالة، الإجمالي، كلفة التوصيل، الخصم، ملاحظة العميل، معرّفات الإعلان `fbclid` و`utm` و`pixel_event_id`)، `OrderLine`، `OrderEvent` (الخط الزمني: من فعل ماذا ومتى)، `Discount` (رمز أو آلي، نسبة أو مبلغ أو شحن مجاني، شروط).
- **التنفيذ والدفع عند الاستلام:** `Fulfillment`، `Shipment` (شركة التوصيل، رقم التتبع، مبلغ التحصيل، حالة التحصيل، حالة التسوية)، `Payment` (الطريقة: نقد عند الاستلام أو زين كاش أو FIB أو كي كارد، الحالة، المرجع الخارجي)، `Return` و`Refund` (سبب الرفض أو الإرجاع برموز موحدة)، `CourierAccount` (بيانات اعتماد التاجر لدى شركة التوصيل)، `Remittance` (دفعة تسوية من شركة التوصيل تغطي عدة شحنات).
- **الشحن:** `ShippingZone` (مجموعة محافظات) و`ShippingRate` (سعر ثابت أو حسب الوزن أو مجاني فوق مبلغ).
- **التصميم:** `Theme` (قالب مثبّت لكل متجر مع إصداره)، `ThemeTemplate` (JSON للصفحات: الرئيسية، المنتج، المجموعة، السلة، صفحة)، `ThemeSetting` (الألوان والخطوط والشعار)، `Section` و`Block` في JSON على نمط Online Store 2.0.
- **التكامل والقنوات:** `PixelConfig` (Meta Pixel، Conversions API، TikTok)، `WhatsAppConfig` (رقم المتجر، القوالب المعتمدة)، `WebhookSubscription` و`WebhookDelivery` (للتطبيقات الخارجية لاحقاً)، `IntegrationApp`.
- **الاشتراك والمنصة:** `Plan` (مجاني، تاجر، نمو)، `Subscription` و`Invoice` (الفوترة بالدينار عبر المحافظ المحلية، على نمط `PaymentEvent` الموجود في Adlytic)، `AuditLog`، `PlatformSetting` (موجود).

**آلة حالات الطلب للدفع عند الاستلام (قلب المنتج)**

```
PLACED ──► CONFIRMING ──► CONFIRMED ──► PACKED ──► HANDED_TO_COURIER ──► IN_TRANSIT ──► DELIVERED ──► REMITTED ──► CLOSED
              │                                                              │
              └─► CANCELLED_UNCONFIRMED (لا رد خلال المهلة، أو رفض)          ├─► REFUSED ──► RETURNED_TO_MERCHANT
                                                                             └─► FAILED_ATTEMPT (إعادة محاولة)
```

كل انتقال يسجَّل في `OrderEvent` مع الفاعل والمصدر (التاجر، شركة التوصيل عبر الواجهة، العميل عبر واتساب). مهلات: تأكيد خلال 24 ساعة وإلا تنبيه؛ تسليم خلال مدة الشركة وإلا إشعار. رموز الرفض موحدة (العميل غير متاح، رفض السعر، تغيّر رأيه، عنوان خاطئ، منتج مخالف للوصف) لأن تحليلها هو ما يميّز Adlytic لاحقاً. التسوية: تُطابق مبالغ `Remittance` مع `Shipment` لتُظهر للتاجر ما حصّلته الشركة وما لم يصله بعد.

**مسارا الشراء**

1. **إغلاق على واتساب** (المرحلة الأولى): زر "اطلب عبر واتساب" يفتح رسالة مُعبّأة برقم طلب حقيقي أُنشئ في حالة `PLACED`، فيكمل التاجر التأكيد من لوحته. هذا يحافظ على عادة السوق ويعطينا بيانات الطلب منذ اليوم الأول.
2. **إتمام شراء أصلي بالدفع عند الاستلام**: الهاتف ثم المحافظة والمنطقة والنقطة الدالة ثم تأكيد. بلا حساب ولا بريد. دفع مسبق اختياري عبر محفظة لتخفيض الرفض (خصم صغير لمن يدفع مقدماً، وهي حيلة YouCan وسلة).

---

## 8. تصميم "Adlytic في الداخل"

الفكرة الأساسية: Shopify تعرف الطلبات ولا تعرف الإعلانات إلا عبر تطبيقات، وAdlytic تعرف الإعلانات ولا تعرف الطلبات إلا كـ"نتائج" يرسلها Meta. حين تملك المنصة الطرفَين، تستطيع حساب ما لا يستطيعه أحد:

| ما يعرضه Adlytic اليوم | ما يصبح ممكناً حين يملك بيانات المتجر |
|---|---|
| تكلفة المحادثة أو النتيجة كما يبلّغها Meta | **تكلفة الطلب المؤكَّد** وتكلفة الطلب المُسلَّم فعلاً بعد خصم الرفض، لكل حملة ولكل تصميم |
| العائد على الإنفاق غير ممكن لحملات الرسائل | **عائد مُعدَّل بالدفع عند الاستلام**: الإيراد المحصَّل ناقص كلفة التوصيل والمرتجعات، مقسوماً على الإنفاق |
| صحة الحملة من مقاييس الإعلان | **صحة المتجر**: نسبة التأكيد، نسبة الرفض بحسب المحافظة والمنتج والحملة، زمن التأكيد |
| نصيحة عامة: "جدّد التصميم" | نصيحة مرتبطة بالمال: "هذا التصميم يجلب طلبات تُرفض بنسبة 40% في البصرة، أوقفه هناك" |
| فحص الإعلان قبل النشر (محلل الإعلانات) | نفس الفحص مع **بيانات منتجك**: السعر مقابل السوق، صور المنتج التي باعت أكثر |
| لا شيء | **دراسة جدوى حية لكل متجر**: الهامش × نسبة التأكيد × نسبة التسليم × كلفة الاكتساب، محدَّثة يومياً، وهي ما طلبه المالك صراحة |

**كيف يُبنى تقنياً**

1. كل متجر مرتبط بـ `Workspace` في Adlytic، وكل متجر يُثبَّت فيه Meta Pixel وConversions API تلقائياً مع معرّف حدث فريد لكل طلب (`pixel_event_id`) فتتحقق المطابقة بين الطلب في قاعدتنا والنتيجة في Meta. هذه وحدها ميزة لا يقدمها منافس عراقي، لأن أغلب التجار يعلنون بلا قياس تحويل.
2. أحداث الطلب (وُضع، أُكِّد، سُلِّم، رُفض) تُنشر عبر صندوق الصادر إلى Adlytic مع `fbclid` وUTM ومعرّف الحملة إن وُجد، فتُلحق بحملات Meta المتزامنة أصلاً عبر `ads_read`.
3. محركات Adlytic الحالية (القواعد، التشخيص، الصحة، النصائح العربية) تُضاف إليها إشارات المتجر كمدخلات جديدة بلا إعادة كتابة: الطلب المؤكَّد والمُسلَّم والمرفوض كنتائج أصيلة بدل "النتيجة" العامة.
4. "عزّز هذا المنتج من اللوحة" (إنشاء إعلانات من المنصة) يُؤجَّل إلى مرحلة لاحقة لأنه يتطلب `ads_management` وتوثيقاً ومراجعة أثقل (القسم 2.4 والدراسة السابقة).

---

## 9. نطاق المنتج الأولي والمراحل والجهد

**المراحل** (الجهد بالأيام من تقدير القسم 7.2 بعد وصوله):

| المرحلة | ما يُبنى | معيار الانتقال |
|---|---|---|
| **0: كتالوج واتساب** (نحو 4 أسابيع) | تسجيل التاجر، منتجات ومجموعات، قالب واحد، نطاق فرعي، زر الطلب عبر واتساب برقم طلب حقيقي، لوحة طلبات بسيطة، Meta Pixel تلقائي، ربط بـ Adlytic | 50 متجراً حقيقياً تنشر منتجات وتستلم طلبات |
| **1: المتجر الكامل بالدفع عند الاستلام** (6 إلى 8 أسابيع) | إتمام شراء أصلي، آلة حالات الطلب مع التأكيد، محوّل شركة توصيل واحدة، محفظة واحدة للدفع المسبق والاشتراك، نطاقات مخصصة، قالبان، فوترة التاجر بالخطط | 30% من الطلبات تمر بالتدفق الأصلي؛ تسوية شركة التوصيل تظهر صحيحة |
| **2: المنصة** (8 إلى 12 أسبوعاً) | محرر القالب (أقسام وكتل JSON)، الكردية، إشعارات WhatsApp Cloud API، مزامنة كتالوج إنستغرام وفيسبوك، شركتا توصيل إضافيتان، واجهة Webhooks للتطبيقات الخارجية، Adlytic بإسناد الطلبات إلى الحملات | التجار يغيّرون تصميمهم بلا دعم؛ أول تقرير "تكلفة الطلب المؤكَّد" حقيقي |
| **3: التمايز الكامل** | دراسة الجدوى الحية لكل متجر، إنشاء الإعلانات من اللوحة بعد موافقة Meta، نقطة بيع مبسطة، سوق تطبيقات | الاشتراك المدفوع يغطي التكاليف الثابتة ثلاث مرات |

<!-- FILL:S8-effort -->

---

## 10. المخاطر

| المخاطرة | الاحتمال | الأثر | التخفيف |
|---|---|---|---|
| تشتت التركيز: Adlytic الأساسي لم يُطلق تجارياً بعد، والمنصة مشروع أكبر منه بثلاث مرات | عالٍ | عالٍ | المرحلة 0 صغيرة ومقيسة؛ تُعامل المنصة كقناة اكتساب لـ Adlytic حتى تثبت نفسها؛ لا يبدأ إتمام الشراء الأصلي قبل 50 متجراً حقيقياً |
| منافسون محليون سبقونا بسنتَين (روزنامة بتمويل، دُكاني، ميل، عرموطة) | مؤكَّد | متوسط | التمايز في ما لا يملكونه: الذكاء الإعلاني المدمج، قياس التحويل التلقائي، تحليل الرفض؛ لا مسابقة على السعر |
| تجّار يرفضون ترك إنستغرام وواتساب لمتجر | عالٍ | عالٍ | المرحلة 0 لا تطلب منهم ترك شيء: كتالوج يُغلق على واتساب ويضيف قياساً وتحليلاً فوق عادتهم الحالية |
| تكامل شركات التوصيل غير مستقر أو بلا واجهات برمجية | متوسط | عالٍ | محوّلات خلف واجهة واحدة مع مسار يدوي (رفع ملف أو إدخال رقم تتبع) لكل شركة بلا واجهة |
| الاعتماد على موافقات Meta لنصف ميزات التمايز (إنستغرام، واتساب، إنشاء الإعلانات) | عالٍ | متوسط | ترتيب المراحل يضع كل ما لا يحتاج موافقة أولاً (Pixel وCAPI وأحداث المتجر)، ويُقدَّم على ما يحتاجها |
| أمان القوالب والمستأجرين: قالب خبيث أو تسرب بيانات بين متاجر | متوسط | عالٍ | محرك قوالب لا ينفّذ كوداً، RLS في قاعدة البيانات، اختبار عزل المستأجرين كاختبار بنيوي كما في Adlytic |
| كلفة الوسائط وعرض الصفحات مع آلاف المتاجر | متوسط | متوسط | تحويل الصور عند الطلب مع ذاكرة مؤقتة على الحافة، وذاكرة مؤقتة للصفحات لكل متجر |
| فوترة التجار بالدينار بلا بطاقات | عالٍ | متوسط | نفس قنوات الدراسة السابقة: FIB وزين كاش للباقات، واتساب يدوي كاحتياط، ورصيد اتصالات لاحقاً |
| تخفيض الدينار يرفع تكاليفنا بالدولار | متوسط | منخفض | التكاليف المتغيرة صغيرة؛ التسعير بالدينار يُراجَع ربع سنوياً |
| فريق واحد صغير يبني Shopify | عالٍ | عالٍ | نطاق المرحلة 0 والمرحلة 1 يُقاس بالأسابيع لا الأشهر؛ تبنّي نواة مفتوحة المصدر إن أظهر القسم 7.1 أنها تختصر أشهراً |

---

## 11. سجل التحقق والمصادر

<!-- FILL:SOURCES -->
