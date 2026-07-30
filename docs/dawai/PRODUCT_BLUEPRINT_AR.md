# دوائي — تعريف المنتج وخطة الـMVP

**الحالة:** قرار منتج قابل للتنفيذ  
**تاريخ البحث:** 30 تموز 2026  
**السوق الأول:** بغداد، العراق  
**نوع المنتج:** شبكة طلبات دواء وعروض صيدليات، وليست صيدلية إلكترونية  
**ملاحظة:** ما يخص التنظيم العراقي في هذه الوثيقة توجيه لتصميم المنتج وليس رأيًا
قانونيًا. يلزم اعتماد محامٍ عراقي والجهة الصحية المختصة قبل الإطلاق.

---

## الملخص التنفيذي: ما الشكل الأفضل لدوائي؟

الشكل الأفضل لدوائي هو **شبكة طلبات دواء موثقة ومحدودة الزمن**:

1. يثبت المريض هوية المنتج قدر الإمكان بالاسم أو الصورة أو الوصفة.
2. يرسل دوائي الحد الأدنى من بيانات الطلب إلى دفعة صغيرة من الصيدليات المرخصة
   والمفتوحة والقريبة.
3. ترد الصيدلية بعرض منظم: مطابق/جزئي/يحتاج مراجعة، سعر، جاهزية،
   استلام/توصيل، ومدة صلاحية العرض.
4. يرى المريض **دليل الثقة** لا مجرد كلمة «متوفر»: من أكد، ومتى، وما الذي
   حُجز، ومتى ينتهي.
5. يختار المريض عرضًا واحدًا؛ عندها فقط يبدأ حجز قصير وتُكشف بيانات التواصل
   اللازمة للصيدلية المختارة.

هذا النموذج يجمع أفضل ما في السوق من دون نسخ منتج بعينه:

- من GoodRx: وضوح المقارنة، لكن بعد إضافة دليل مخزون مؤرخ.
- من Medfinder: التأكيد البشري من الصيدلية، لكن عبر صندوق طلبات سريع بدل
  الاتصالات المدفوعة والبطيئة.
- من BidRx/Compounding Finder: طلب عروض موحد وتأخير كشف الهوية.
- من Capsule/Nimble: متابعة الحالة والرسائل الواضحة للصيدلية، من دون امتلاك
  المخزون أو أسطول توصيل.
- من السوق العراقي: نقد/استلام أولًا، عنوان بالحي والمعلم والدبوس، تكامل أو
  رابط تحقق Gudea، وواجهة عربية RTL تعمل تحت اتصال ضعيف.

قرار الـMVP: **Find → Confirm → Compare → Reserve → Pick up**.  
التوصيل، الدفع، إدارة الوصفات، البدائل الدوائية، والتجارة العامة مراحل لاحقة.

---

## 1. Product Definition — ما هو دوائي؟

دوائي طبقة مطابقة بين:

- **طلب حقيقي قريب:** مريض يريد منتجًا دوائيًا محددًا بأقل جهد.
- **عرض قابل للتنفيذ:** صيدلية مرخصة تستطيع تأكيد المنتج والسعر والجاهزية.

وعد المنتج للمريض:

> قل لنا ما تحتاجه، وسنسأل الصيدليات المناسبة بالقرب منك ونريك الخيارات
> المؤكدة حديثًا.

وعد المنتج للصيدلية:

> نرسل لك طلبات قريبة ومطابقة فقط، وتدفع/تُحاسب مستقبلًا على نتيجة ناجحة لا
> على إشعار عشوائي.

### ما ليس دوائي

- ليس طبيبًا أو نظام تشخيص.
- ليس محرك اقتراح علاج.
- ليس مخزونًا عامًا يدّعي الدقة الدائمة.
- ليس متجر منتجات تجميل ومكملات.
- ليس مالكًا للدواء أو جهة صرف.
- ليس شركة توصيل في المرحلة الأولى.

### North-star outcome

**نسبة الطلبات التي انتهت بحجز مؤكد ثم استلام ناجح** خلال نافذة الطلب.

المؤشرات المساندة:

- زمن أول رد صالح.
- عروض صالحة لكل طلب.
- نسبة التأكيد إلى الحجز.
- نسبة الحجز إلى الاستلام.
- نسبة «أكد ثم لم يوجد» لكل صيدلية.
- إشعارات لكل طلب ناجح، لحماية الصيدليات من الإزعاج.

---

## 2. Core Problem — المشكلة التي يحلها

المعلومة الناقصة ليست «أين توجد صيدلية؟»، بل:

> أي صيدلية قريبة تستطيع تلبية **هذا العرض الدوائي والكمية** الآن؟

البدائل الحالية تفرض على المريض الاتصال والتنقل، أو تعرض سعرًا بلا مخزون، أو
تعرض متجرًا واحدًا بلا مقارنة. وفي العراق يضاف:

- سوق صيدليات مجزأ.
- تفاوت تحديث المخزون وربط أنظمة نقاط البيع.
- هيمنة النقد والحاجة إلى اتصال/معلم واضح.
- تفاوت الشبكة، وانقطاعات تشغيلية.
- أسماء تجارية وعلمية وتهجئات عربية/لاتينية متعددة.
- حساسية الوصفة وهوية المريض.

---

## 3. Competitive Research — بحث المنافسين

### 3.1 المنتجات العالمية

| المنتج | المشكلة الأساسية | تجربة المريض | تدفق الصيدلية | المخزون/السعر | الضعف المهم لدوائي |
|---|---|---|---|---|---|
| GoodRx | مقارنة السعر/الكوبون | بحث دواء وموقع ثم عرض كوبون | لا تستلم طلبًا ولا تؤكد مخزونًا | سعر قوي؛ مخزون غير حي | السعر قد يختلف حسب NDC ولا يضمن وجود الدواء |
| Blink Health | تثبيت سعر نقدي مسبقًا | دفع ثم استلام أو توصيل | معالجة Blink كجهة دفع | سعر مقفل؛ مخزون غير مؤكد قبل الاختيار | قد يسبق الدفع تأكيد المخزون أو النقل |
| Capsule | صيدلية رقمية وتوصيل | تحويل الوصفة ثم متابعة وتوصيل | Capsule تملك عملية الصرف | مخزون داخلي لا يقارن صيدليات | تغطية محدودة واقتصاديات ثقيلة |
| Amazon Pharmacy | صرف رقمي واسع | وصفة، تحقق، طلب، توصيل | صيدلية واحدة تنفذ | داخلي وغير محايد | التزام بصيدلية قبل ظهور التوفر |
| Medfinder | العثور على دواء ناقص | دفع مقابل أن يتصل الفريق بالصيدليات | الصيدلية تؤكد هاتفيًا | تأكيد بشري قوي | 2–24 ساعة، رسم بحث، لا حجز مدمج |
| BidRx | منافسة الصيدليات على الوصفة | إدخال/رفع وصفة ومقارنة عروض | الصيدليات تقدم bids | نموذج عرض قريب جدًا | سيولة الشبكة والحجم الفعلي غير مثبتين علنًا |
| Compounding Finder | مقارنة عروض التركيبات | نموذج ثم عروض عبر البريد | الصيدليات تختار وتقتبس | سعر فعلي، لا مخزون رف حي | بطيء ومخصص للتركيبات |
| PharmaFindr | OCR وبث قريب وحجز | صورة ثم confirmations | رد بنقرة وعرض | الحلقة شبه مطابقة | مشروع مبكر؛ ادعاءات التوسع غير دليل استخدام |
| MediFind Algeria | طلب نص/صورة لصيدليات قريبة | نشر ثم إشعار عند التوفر | تراجع الطلبات القريبة | تأكيد من الصيدلية | تنزيلات قليلة وتحديث قديم؛ مشكلة كثافة العرض |
| Nimble | تحديث تجربة الصيدلية القائمة | تعبئة/دفع/استلام/رسائل | تكامل PMS وSMS | داخل الصيدلية نفسها | لا بحث عبر صيدليات |
| PharmEasy/Chefaa | تجميع وتسليم دواء | بحث/رفع وصفة ثم تخصيص صيدلية | صيدلية شريكة تراجع | تخصيص لا مزايدة حية | تجارة وتوصيل أكثر من اكتشاف محايد |
| Google Maps | معرفة الأقرب والمفتوح | خريطة/قائمة واتصال | لا يوجد | لا دواء محدد | يجبر المستخدم على الاتصالات |
| DoorDash/Uber/ScriptDrop | الميل الأخير | توصيل بعد جهوز الوصفة | الصيدلية تنشئ مهمة التوصيل | لا يحل الاكتشاف | يصلح كموصل لاحق، لا كجوهر المنتج |

### 3.2 الدروس من نماذج فشلت أو تقلصت

**NowRx** امتلكت صيدليات مصغرة وروبوتات ومخزونًا وتوصيلًا في اليوم نفسه. أظهرت
إفصاحات SEC لعامي 2021 و2022 هامشًا ضعيفًا وخسائر كبيرة، ثم نُقلت ملفات المرضى
إلى Alto وCapsule بعد فشل التمويل.

**Medly** توسعت بسرعة في نموذج الصيدلية الرقمية والتوصيل؛ عند تعثر التمويل لم
تستطع شراء الدواء لأسابيع، انهارت المبيعات ثم دخلت الإفلاس.

القرار: لا يمتلك دوائي مخزونًا أو مواقع أو أسطولًا في الـMVP. يحتفظ الصيدلي
بمسؤولية الصرف والمخزون، ودوائي يملك المطابقة، العرض، الحجز، والدليل التشغيلي.

### 3.3 العراق والسوق الإقليمي

| المنتج | ما أمكن توثيقه | الدرس/الحد |
|---|---|---|
| Capsula 360 | بحث دواء وإظهار أقرب صيدلية مشاركة تقول إنه متوفر؛ منظومة B2B/POS واسعة حسب الشركة | أقرب منافس مباشر، وميزة محتملة في بيانات المخزون |
| MedSnap | اسم/صورة تصل إلى صيدليات قريبة ترد مستقلًا؛ استلام ومحادثة، ووصف المتجر يذكر التوصيل | الحلقة قريبة، لكن تبنيها الظاهر مبكر ووصفها غير متسق |
| Doctoury | حجز طبي، وصفة رقمية، عروض صيدليات قريبة، استلام | رحلة متكاملة؛ قانونية الوصفة الرقمية تحتاج تحقق مستقل |
| Lezzoo | توصيل صيدلية ضمن مدن إقليم كردستان مع تتبع | معيار لوجستي قوي، لا يثبت مخزونًا محايدًا |
| Talabat Iraq | سوق توصيل يشمل فئات تجزئة/صيدلية بحسب إفصاحات الشركة | توزيع قوي؛ ليس نظام طلب دواء بعروض |
| Gudea | نظام دواء وطني للتحقق QR والسعر والمصنع والانتهاء والبحث | مصدر ثقة/ربط مهم، وليس منافس تنفيذ |
| Falaq | سوق B2B بين أصحاب الصيدليات والمذاخر والشركات | دليل على تجزؤ سلسلة الإمداد |
| Chefaa | رفع وصفة/صورة، توجيه لصيدلية، صيدلي، COD/دفع وتوصيل | فصل مسؤولية الصرف عن المنصة، وخيار الاستبدال المصرح |
| Yodawy | شبكة صيدليات وتأمين ووصفات مزمنة وتوصيل | مثال على عمليات PBM والرعاية المزمنة لاحقًا |
| Talabat–Aster UAE | الوصفة والهوية والتأمين تذهب مباشرة لأنظمة Aster ولا يخزنها Talabat | نمط خصوصية ممتاز للموصل |

### 3.4 سلوك وسياق عراقي مؤثر في التصميم

- وجدت دراسة ميدانية في السليمانية أجريت في 2024 أن الموقع كان عامل اختيار
  الصيدلية لدى 70.54% من المستجيبين.
- أظهر Ipsos في 2025 أن 21% فقط تسوقوا عبر الإنترنت خلال الأشهر الستة السابقة،
  وأن 82% من المتسوقين عبر الإنترنت استخدموا صفحات التواصل؛ لذلك لا يكفي مسار
  app-only.
- تذكر استراتيجية الشمول المالي للبنك المركزي العراقي 2025–2029 أن 95% يستخدمون
  النقد في النفقات اليومية ومنها الصيدليات، و27% يستخدمون طريقة غير نقدية مرة
  شهريًا على الأقل.
- عنوان التوصيل العملي يحتاج محافظة/منطقة/حي/معلم/دبوس/هاتف، لا رمزًا بريديًا
  فقط.
- العربية والكردية لغتان رسميتان؛ Sorani أولوية مبكرة لنسخة إقليم كردستان.
- وثقت Cloudflare انقطاعات إنترنت مرتبطة بالامتحانات في 2025؛ تطبيق الصيدلية
  يحتاج طابورًا محليًا وإعادة إرسال.

---

## 4. Competitive Advantage — لماذا دوائي؟

الميزة ليست أي Feature منفرد، بل **عقد ثقة تشغيلي** بين الطرفين:

1. **طلب بدل مكالمات:** المريض يرسل مرة واحدة.
2. **مطابقة بدل broadcast:** الصيدليات ترى ما يناسب موقعها ونشاطها واحتمال
   توفرها.
3. **عرض بدل نعم/لا:** السعر والكمية والجاهزية وطريقة الاستلام وصلاحية العرض.
4. **دليل حداثة:** «أكد الصيدلي قبل 4 دقائق» أفضل من «متوفر».
5. **حجز فعلي محدود:** العرض لا يتحول إلى ادعاء حجز حتى تقبل الصيدلية مدة
   الحفظ ويختاره المريض.
6. **خصوصية تدريجية:** لا هوية ولا وصفة كاملة في البث؛ تكشف للصيدلية المختارة
   فقط حسب الحاجة.
7. **عراقي من الأصل:** عربي RTL، أسماء لاتينية محمية من أخطاء bidi، نقد
   واستلام، حي ومعلم، اتصال ضعيف، Gudea.

### الخندق التنافسي المتوقع

- كثافة الصيدليات المستجيبة في أحياء محددة.
- تاريخ موثوقية fulfillment لا تقييمات رأي.
- قاموس عراقي للأسماء والتهجئات والعبوات.
- تكامل POS/Inventory تدريجي.
- بيانات طلب مجهولة ومجمعة تساعد الصيدليات على فهم النقص، دون بيع بيانات صحية.

---

## 5. Final Feature Set — المجموعة النهائية

### Must Have — MVP

**للمريض**

- بحث مباشر باسم الدواء دون طلب.
- طلب بالكتابة، صورة علبة، أو رفع صورة وصفة.
- تثبيت يدوي عند الالتباس؛ لا تخمين.
- موقع تقريبي أولًا، والدبوس للصيدلية المختارة فقط.
- حالة بحث حية مفهومة دون progress وهمي.
- عروض منظمة مع وقت التأكيد والمصدر.
- فرز «الأنسب»، المسافة، السعر.
- حجز استلام 15 دقيقة مع مرجع وعد تنازلي.
- اتصال واتجاهات.
- إلغاء، انتهاء 20 دقيقة، وإعادة فتح/توسيع النطاق.
- سجل محلي بسيط للطلبات النشطة/المنتهية.

**للصيدلية**

- تسجيل صيدلية والتحقق من الترخيص/الفرع والهاتف.
- حالة متصل/متوقف وجدول عمل.
- Inbox مرتب حسب المطابقة والعمر.
- رد سريع: متوفر، جزئي، يمكن طلبه، غير متوفر.
- عرض منظم: السعر، كمية/نطاق، تجهيز، استلام.
- تأكيد حفظ الكمية بعد اختيار المريض.
- إشعار اختيار/انتهاء/إلغاء.
- مؤشرات خاصة: معدل الرد، متوسط الزمن، نجاح الحجوزات.

**للمنصة**

- مطابقة جغرافية تدريجية 0–2، 2–5، 5–10 كم.
- حد إشعارات، منع التكرار، وانتهاء تلقائي.
- حالات request/offer/hold صريحة.
- timestamp ومصدر لكل إشارة توفر.
- سجل تدقيق للوصفة والوصول.
- قائمة أدوية خاضعة للسيطرة/غير محسومة تُحظر من البث العام.
- أدوات تشغيل لمراجعة صيدلية وبلاغات عدم التوفر بعد التأكيد.

### Should Have — بعد إثبات الـloop

- Sorani Kurdish.
- إشعارات SMS fallback.
- مزامنة inventory/POS لشركاء محددين.
- QR/Gudea deep-link أو API رسمي إن أتيح.
- Partial fulfillment.
- «يمكن توفيره لاحقًا» مع موعد واضح.
- مكافأة الصيدليات على النجاح، لا عدد النقرات.
- لوحة طلب محلي مجمع ومجهول.

### Future

- توصيل بواسطة طرف ثالث بعد الصرف.
- دفع إلكتروني/COD settlement.
- إعادة التعبئة والملفات العائلية بموافقة.
- تنبيهات نقص مجمعة.
- ربط تأمين/PBM.
- cold-chain مع إثبات حرارة وتسليم.
- توسيع OTC والمستلزمات بعد ثبات الدواء.

### Avoid

- تشخيص أو توليد وصفة.
- اقتراح جرعة أو بديل تلقائي.
- ترتيب مدفوع يخفي أنه إعلان.
- كلمة «متوفر» بلا وقت ومصدر.
- إرسال لكل صيدليات المدينة.
- رفع الوصفة إلى lock-screen/WhatsApp.
- تقييم نجوم علني قاسٍ.
- الدفع قبل تأكيد المخزون.
- امتلاك المخزون والتوصيل في البداية.
- متجر تجميل ومكملات يطغى على الطلب.

---

## 6. Patient UX Flow

### Path A — Search → Find

1. الرئيسية: «ما الدواء الذي تحتاجه؟».
2. يكتب الاسم/القوة.
3. يرى إشارات حديثة: الصيدلية، المسافة، مفتوحة، آخر تأكيد، والسعر إن وجد.
4. يتصل للتأكد أو يحول البحث إلى Request بنقرة واحدة.

لا تعرض نتيجة البحث كحجز أو حقيقة دائمة.

### Path B — Request → Offers

1. **Tell us what you need:** كتابة/تصوير/رفع.
2. **Identity check:** عند تعدد القوة/الشكل/العبوة، يختار المستخدم أو يحال
   للصيدلي.
3. **Location:** حي تقريبي ونطاق 2 كم.
4. **Consent:** إذا وجدت وصفة، موافقة صريحة على استخدامها لهذا الطلب.
5. **Finding:** مراحل فعلية: ثبت الطلب، حددنا النطاق، أرسلنا لـN صيدليات،
   وصل رد.
6. **Offers:** بطاقات قابلة للمقارنة.
7. **Reserve:** يختار عرضًا؛ ترسل الصيدلية ack؛ يبدأ hold 15 دقيقة.
8. **Pickup:** مرجع، اتجاهات، هاتف، الوصفة الأصلية عند الحاجة.
9. **Outcome:** استلم/لم يستلم/لم يكن متوفرًا، لأغراض الموثوقية.

### حالات UX حرجة

- وصف غامض: «لا نعرف الدواء المقصود. صوّر العلبة أو اكتب الاسم».
- أكثر من presentation: لا تختار الأولى تلقائيًا.
- لا رد ضمن 2 كم: اقترح 5 كم، لا توسع بصمت.
- رد بديل: «اقتراح للمراجعة» بلا زر حجز دواء بديل مباشر.
- انقطاع: أبقِ حالة آخر حدث مؤرخ، لا تدّعِ استمرار البحث.

---

## 7. Pharmacy UX Flow

1. تحقق الفرع، ساعات العمل، وحالة استقبال الطلبات.
2. يصل إشعار قليل التفاصيل: اسم/قوة/شكل/كمية/مسافة تقريبية/مهلة.
3. يفتح Inbox؛ تظهر الطلبات الأعلى match أولًا.
4. يختار:
   - مطابق متوفر.
   - كمية جزئية.
   - يمكن طلبه بحلول وقت محدد.
   - منتج مختلف يحتاج مراجعة.
   - غير متوفر.
5. إن كان متوفرًا، يدخل السعر والجاهزية وطريقة الاستلام ويقبل شرط الحجز.
6. ينتظر اختيار المريض؛ لا يحجز كل عرض مرسل.
7. عند الاختيار: يبدأ 15 دقيقة وتظهر بيانات الاتصال/الوصفة اللازمة.
8. يؤكد جاهز/استُلم/لم يحضر/تعذر المطابقة.

### مبادئ تجربة الصيدلية

- الرد الأساسي أقل من 15 ثانية.
- لا تدخل الصيدلية عدد مخزون دقيق إن كان سيصبح كاذبًا؛ يكفي `1 / قليل /
  كمية الطلب / جزئي`.
- المؤقت إرشادي لا عقابي.
- إيقاف مؤقت للإشعارات وحالة ازدحام.
- لا تكلفة على اعتذار صادق.

---

## 8. Notification System

### قنوات MVP

- Push داخل PWA/app.
- Inbox دائم.
- SMS fallback للحدث الحرج فقط: اختيار العرض/انتهاء الحجز.
- WhatsApp ليس أرشيف وصفة ولا قناة broadcast صحية.

### Payload آمن للصيدلية قبل الاختيار

```json
{
  "requestId": "REQ-2841",
  "presentation": {
    "canonicalId": "IQ-MED-AMC-625-TAB-14",
    "displayName": "Augmentin",
    "strength": "625 mg",
    "form": "tablet"
  },
  "quantityBand": "ONE_PACK",
  "coarseArea": "المنصور",
  "distanceBand": "0-2_KM",
  "neededBy": "NOW",
  "prescriptionStatus": "HELD_FOR_REVIEW",
  "expiresAt": "..."
}
```

لا اسم، هاتف، عنوان دقيق، تشخيص، نص ملاحظة طبية، أو صورة وصفة في الإشعار.

### منع الإزعاج

- حد أعلى 6 صيدليات في الجولة الأولى.
- دفعات 3+3 حسب عدم الرد.
- cooldown للطلب المكرر.
- collapse key لكل request؛ تحديث الإشعار بدل إنشاء عشرات.
- Quiet hours وساعات الصيدلية.
- pharmacy capacity state.
- إيقاف إرسال لصيدلية تجاهلت N طلبات مشابهة مؤقتًا.

### أحداث المريض

- استلمنا الطلب.
- صيدلية بدأت المراجعة، من دون ادعاء توفر.
- وصل عرض.
- اختير العرض/أكدت الصيدلية الحجز.
- بقي 5 دقائق.
- انتهى/ألغي/اتسع النطاق.

---

## 9. Matching Logic

### Hard filters

1. صيدلية مرخصة ونشطة.
2. الفرع مفتوح وسيظل مفتوحًا خلال نافذة الطلب.
3. داخل radius الحالي.
4. لا block أو capacity pause.
5. category/presentation مسموح للبث.
6. بالنسبة للدواء الوصفي: الصيدلية تقبل مراجعة الوصفة.

### Ranking score

```text
score =
  0.28 × distance_score
  + 0.22 × recent_exact_availability
  + 0.17 × response_probability
  + 0.13 × fulfillment_reliability
  + 0.10 × open_window_fit
  + 0.06 × service_fit
  + 0.04 × workload_balance
  - spam_penalty
  - stale_claim_penalty
```

القيم يجب أن تكون قابلة للتفسير. لا يجوز أن يتغلب دفع إعلاني على الملاءمة
السريرية/التشغيلية.

### Availability confidence

مصدر الإشارة وترتيب الثقة:

1. **حجز نشط** مؤكد للطلب نفسه.
2. **تأكيد صيدلي** exact presentation خلال دقائق.
3. **Inventory feed** بمزامنة ناجحة حديثًا.
4. **استجابة ناجحة حديثة** لنفس presentation.
5. **Catalog association**؛ يستخدم للمطابقة فقط ولا يظهر «متوفر».

كل مستوى يحمل `observedAt`, `source`, `expiresAt`, و`presentationId`.

### توسع النطاق

- الجولة A: 0–2 كم، حتى 6 صيدليات.
- بعد 2–3 دقائق بلا عرض صالح: طلب إذن 5 كم.
- الجولة B: 2–5 كم، حتى 8 صيدليات جديدة.
- الجولة C: 5–10 كم للمنتجات النادرة، بموافقة.
- لا يعاد إشعار فرع سبق أن اعتذر لنفس الطلب.

---

## 10. Request Lifecycle

```text
DRAFT
  → NEEDS_CLARIFICATION
  → READY
  → ACTIVE_RADIUS_2KM
  → ACTIVE_RADIUS_5KM
  → ACTIVE_RADIUS_10KM
  → OFFERED
  → OFFER_SELECTED
  → HOLD_PENDING
  → HOLD_ACTIVE
  → FULFILLED
```

النهايات:

- `CANCELLED_BY_PATIENT`
- `EXPIRED_NO_RESPONSE`
- `EXPIRED_OFFERS`
- `HOLD_EXPIRED`
- `PHARMACY_COULD_NOT_FULFILL`
- `PATIENT_NO_SHOW`
- `BLOCKED_SAFETY`

### الأزمنة المقترحة

- الطلب: 20 دقيقة افتراضيًا، قابل للتمديد مرة.
- رد الصيدلية السريع: 3 دقائق كإشارة UX، لا حذف تلقائي فوري.
- العرض: 10 دقائق ما لم تختَر الصيدلية غير ذلك.
- hold بعد الاختيار: 15 دقيقة.
- availability signal: حسب المصدر؛ 15 دقيقة لتأكيد يدوي، أقصر/أطول لتكامل
  المخزون حسب SLA.

### قاعدة مهمة

العد التنازلي للحجز لا يبدأ عند إرسال العرض، بل بعد:

`patient_selected → pharmacy_hold_acknowledged`.

---

## 11. Data Model Requirements

### الكيانات الأساسية

**PatientSession**

- id, locale, anonymous/coarseLocation, consentVersion, createdAt, expiresAt.

**Medicine**

- canonicalId, INN, tradeNames, Arabic/Kurdish/Latin aliases, classification,
  controlledFlag, Gudea reference.

**MedicinePresentation**

- medicineId, strength, unit, dosageForm, route, releaseMechanism, pack,
  barcode/NDC-like identifier.

**MedicineRequest**

- sessionId, presentationId nullable, rawTextEncrypted, quantityBand, urgency,
  coarse geohash, radiusStage, prescriptionStatus, lifecycle status, expiresAt.

**PrescriptionEnvelope**

- requestId, encryptedObjectRef, consentId, hash, stagedAt, deleteAt,
  selectedPharmacyId nullable. لا يدخل blob في request/event العام.

**Pharmacy / PharmacyBranch**

- licence identifiers, verification state/time, federal/KRG jurisdiction,
  contact, geo, hours, capabilities, pause/capacity state.

**InventorySignal**

- branchId, presentationId, source, state, quantityBand, observedAt, expiresAt,
  confidence.

**RequestDispatch**

- requestId, branchId, matchScore snapshot, reasons, sentAt, seenAt, outcome.

**PharmacyOffer**

- requestId, branchId, match type, price IQD, quantity, readyAt, pickup,
  delivery metadata, substitutionNote, createdAt, expiresAt, status.

**ReservationHold**

- offerId, reference, acknowledgedAt, expiresAt, status, releaseReason.

**FulfillmentOutcome**

- holdId, fulfilledAt, failedReason, patientReported, pharmacyReported,
  discrepancy state.

**ReliabilityAggregate**

- branchId, responseRate, medianResponseSeconds, confirmedNotFoundRate,
  holdSuccessRate, noShowRate, sampleSize, window.

**AuditEvent**

- actor/purpose/resource/action/timestamp, immutable chain/hash, retention class.

### قيود قاعدة البيانات

- السعر integer IQD، لا float.
- الموقع العام coarse geohash؛ الدقيق منفصل ومقيد.
- uniqueness على offer(requestId, branchId, active).
- idempotency keys على إنشاء الطلب والرد والحجز.
- optimistic lock/version لحماية hold من السباق.
- TTL indexes/cleanup للطلبات والصور.
- append-only للأحداث التنظيمية.

---

## 12. UI/UX Architecture

### خريطة السطوح

**Patient**

- Home
- Direct search results
- Request composer
- Identity clarification
- Consent/prescription review
- Matching status
- Offer comparison
- Reservation ticket
- Nearby pharmacies: list/map
- My requests

**Pharmacy**

- Onboarding/verification
- Request inbox
- Request detail
- Offer composer
- Active holds
- Today dashboard
- Hours/capacity/integrations

**Operations**

- Pharmacy verification
- Safety queue
- Dispute: confirmed but unavailable
- Request/dispatch trace
- Controlled-item rules
- Retention/deletion audit

### لغة التصميم

- عربية أولًا وRTL حقيقي، لا مجرد انعكاس CSS.
- ألوان الثقة خضراء عميقة؛ coral للحركة/الوقت لا للخطر الطبي.
- «إشارة الرف»/حلقات النطاق العنصر المميز: تظهر أن الدواء يُسأل عنه ضمن دائرة
  صغيرة تتسع بموافقة.
- بطاقات العروض تشبه إثباتًا تشغيليًا: من/ماذا/متى/إلى متى.
- الأسماء والجرعات والأرقام اللاتينية داخل `dir=ltr` مستقل.
- hit targets لا تقل عن 44×44.
- reduced motion، تباين WCAG AA، keyboard focus، وaria-live للحالة فقط.

### المحتوى

- «أكدت الصيدلية قبل 4 دقائق» لا «متوفر» وحدها.
- «بديل للمراجعة» لا «بديل مناسب».
- «طلب تأكيد» لا «اشترِ».
- «حجز للاستلام» لا «اطلب الآن».
- لا نسب تقدم وهمية؛ كل مرحلة تتغير بحدث حقيقي.

---

## 13. MVP Scope

### داخل النطاق

- بغداد: حيّان أو ثلاثة بكثافة صيدليات يمكن تشغيلها يدويًا.
- Web/PWA للمريض وصندوق ويب للصيدلية.
- منتجات OTC وRx غير الخاضعة للسيطرة بعد تصنيف معتمد.
- استلام فقط.
- عروض نقدية IQD.
- تحقق صيدلية يدوي/رسمي حيث يتاح.
- طلب 20 دقيقة، نطاق 2→5 كم.
- إشعار push + SMS للأحداث الحرجة.
- تشغيل بشري خلفي للتأكد من الجودة.

### خارج النطاق

- checkout/payment.
- delivery orchestration.
- insurance.
- family profiles/refills.
- public ratings.
- nationwide launch.
- autonomous OCR decisions.
- inventory claims from static catalog.
- controlled substances.
- medical advice or generic substitution.

### فرضيات pilot المطلوب اختبارها

1. هل تصل ثلاثة عروض صالحة في أقل من 5 دقائق داخل منطقة كثيفة؟
2. هل ترد الصيدلية إذا كان النموذج أقل من 15 ثانية؟
3. هل الحجز 15 دقيقة يخفض الرحلات الفاشلة؟
4. هل يفضل المرضى السعر أم القرب/الجاهزية؟
5. ما نسبة الطلبات التي لا يمكن تثبيت presentation فيها؟

### بوابة التوسع

لا توسع جغرافيًا قبل تحقيق، بعينة كافية:

- median first valid offer < 5 min.
- ≥ 60% من الطلبات القابلة للمطابقة تحصل على عرض.
- ≥ 70% من الحجوزات تؤكد نجاح/استلام.
- confirmed-not-found < 5%.
- ≤ 8 إشعارات صيدلية لكل طلب ناجح.

هذه أهداف pilot قابلة للتعديل، وليست حقائق سوقية.

---

## 14. Future Roadmap

### المرحلة 1 — Liquidity

- جودة الطلب والعرض والحجز في نطاق صغير.
- تشغيل يدوي، قياس دقيق، وقاموس أسماء.

### المرحلة 2 — Supply tooling

- POS/inventory adapters.
- availability freshness آلي.
- لوحة أداء خاصة.
- Sorani وSMS/offline queue.

### المرحلة 3 — Fulfillment options

- توصيل شريك للطلبات المصروفة والمؤهلة.
- COD settlement ومحفظة/بطاقة اختيارية.
- partial fulfillment وorderable.

### المرحلة 4 — Continuity

- refill reminders بموافقة.
- family delegation.
- shortage intelligence مجهول.
- insurance/PBM integrations.

### المرحلة 5 — Adjacent commerce

- مستلزمات/OTC عند ثبات الـDNA، مع إبقاء «ابحث عن دوائي» المدخل الرئيسي.

---

## 15. Risks & Edge Cases

| الخطر | الشدة | التحكم المطلوب |
|---|---:|---|
| صورة الوصفة لا تكفي قانونيًا | حرجة | رأي قانوني مكتوب ومسار الأصل/الوصفة الصحيحة |
| صرف دواء وصفي/خاضع للسيطرة خطأ | حرجة | تصنيف معتمد، hard block، صيدلي، audit |
| دواء مقلد/غير مسجل | حرجة | صيدليات مرخصة، Gudea، تتبع المورد |
| تأكيد ثم عدم وجود | عالية | hold ack، outcome، reliability، عقوبة تشغيلية تدريجية |
| بديل غير آمن | عالية | لا auto-substitution؛ موافقة الصيدلي/الواصف حسب القانون |
| كشف وصفة/مرض | عالية | تقليل البيانات، تشفير، RBAC، حذف قصير، لا إعلانات صحية |
| صيدلية وهمية/ترخيص منتهي | عالية | re-verification دوري ضد سجلات الجهات المختصة |
| سباق على آخر علبة | عالية | atomic hold، version، quantity reservation |
| عنوان/هاتف غير دقيق | عالية | pin+landmark+call confirmation بعد الاختيار |
| انقطاع شبكة/كهرباء | عالية | local queue، retries، SMS، آخر حدث مؤرخ |
| cold chain | عالية | خارج MVP ثم إثبات تغليف/حرارة |
| bidi يغير الجرعة | عالية | LTR isolation واختبارات عربية/كردية/لاتينية |
| cash no-show | متوسطة | hold قصير، no-show rate خاص، تأكيد اتصال |
| spam للصيدليات | متوسطة | batch limits، relevance، capacity، expiry |
| انحياز الترتيب | متوسطة | أسباب ترتيب ظاهرة، لا pay-to-rank مخفي |
| ادعاء «ذكاء» طبي | متوسطة | AI extraction فقط، confidence + clarification |

### حالات إضافية

- وصفة تحتوي أكثر من دواء: request items منفصلة؛ عرض جزئي واضح.
- كمية أكبر من المتوفر: لا تجعلها نعم؛ `PARTIAL`.
- صيدلية تغلق بعد 10 دقائق: لا ترتبها إن كان التجهيز/الوصول غير ممكن.
- مريض يعيد الطلب: dedupe مع خيار refresh.
- سعر رسمي مقابل عرض: يعرضان كسطرين منفصلين ولا يخلطان.
- دواء نادر خارج المدينة: مسار منفصل لاحق، لا توسع تلقائي لكل العراق.
- طوارئ: التطبيق ليس طوارئ؛ رسالة توجه للخدمة المناسبة بدل البحث الطويل.

---

## 16. Final Recommendation — التوصية النهائية

1. اعتمد تعريفًا واحدًا: **دوائي يجد عرض دواء مؤكدًا وقابلًا للحجز من صيدلية
   قريبة**.
2. ابدأ ببغداد وبالاستلام؛ لا تبدأ كتطبيق توصيل أو متجر.
3. اجعل العرض هو primitive الرئيسي، لا product listing.
4. اجعل الحداثة والمصدر والحجز أساس الثقة، لا النجوم.
5. قم بتشغيل supply side يدويًا في أحياء صغيرة حتى تثبت liquidity؛ عدد
   الصيدليات المسجلة أقل أهمية من عدد الصيدليات التي ترد بصدق خلال دقائق.
6. افصل البحث العام عن request:
   - Search يعطي إشارات.
   - Request يعطي التزامًا وعرضًا.
7. لا تفتح الوصفة لكل الصيدليات؛ البث يحمل أقل معلومات، والوصول المؤقت بعد
   الاختيار فقط.
8. تعامل مع AI كقارئ مدخلات عالي الحذر: استخراج candidates وconfidence؛ إذا
   انخفضت الثقة يطلب صورة/تأكيد، ولا ينتج تشخيصًا أو بديلًا.
9. اطلب قرارًا قانونيًا مكتوبًا قبل أي صرف/توصيل/وصفة رقمية في كل من الاختصاص
   الاتحادي وإقليم كردستان.
10. ابنِ التكامل مع Capsula/POS أو Gudea كشراكة محتملة إذا كان ذلك ممكنًا؛
    البيانات المحدثة أقوى من إعادة بناء كل inventory من الصفر.

### الجواب الواضح

دوائي الأفضل ليس «GoodRx عراقيًا» ولا «Capsule عراقيًا». هو:

> **Request-for-availability network** عربية عراقية: يرسل المريض حاجة محددة،
> تتنافس صيدليات موثقة قريبة بعروض قابلة للتنفيذ ومؤرخة، ثم يتحول اختيار واحد
> إلى حجز استلام قصير وآمن.

كل ميزة لا تقلل وقت العثور، أو تحسن صدق التوفر، أو تزيد نجاح الاستلام، أو تحمي
الصيدلية من الطلبات غير المناسبة، تؤجل.

---

## Feature Matrix — دوائي مقابل النماذج المرجعية

| القدرة | دوائي MVP | GoodRx | Capsule | Medfinder | BidRx | Capsula 360 | MedSnap |
|---|---:|---:|---:|---:|---:|---:|---:|
| بحث بلا طلب | ✓ | ✓ | محدود | — | ✓ | ✓ | جزئي |
| نص/صورة/وصفة | ✓ | نص | وصفة | نص | ✓ | بحث | ✓ |
| إرسال لصيدليات قريبة | ✓ ذكي | — | صيدلية واحدة | اتصالات فريق | ✓ | غير موثق | ✓ |
| عرض صيدلية منظم | ✓ | — | — | — | ✓ | غير موثق | رد مستقل |
| سعر مقارن | ✓ | ✓ | — | — | ✓ | غير واضح | غير واضح |
| تأكيد مخزون مؤرخ | ✓ | — | داخلي | ✓ | ضمني | claim | reply |
| حجز بمهلة | ✓ | — | fulfillment | — | price lock | غير موثق | غير موثق |
| خصوصية تدريجية | ✓ | غير منطبق | صيدلية واحدة | بحث هاتفي | جزئي | غير موثق | غير موثق |
| استلام | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| توصيل | لاحق | شركاء | ✓ | — | ✓ | غير واضح | موصوف |
| ملكية المخزون | لا | لا | نعم | لا | لا | لا | لا |
| AI لا يقرر طبيًا | guardrail صريح | غير منطبق | صيدلي | غير منطبق | صيدلي | غير موثق | وسيط |

---

## المصادر

### عالمي

- GoodRx 2025 Form 10-K، 26 شباط 2026:
  <https://investors.goodrx.com/static-files/bad42c0b-8a43-4bd8-843f-945ae3d380be>
- GoodRx NDC pricing discrepancies:
  <https://support.goodrx.com/hc/en-us/articles/4415457351579-I-keep-having-pricing-discrepancies-at-the-pharmacy-when-I-present-a-coupon-How-can-I-avoid-this>
- FTC GoodRx health-data order، 1 شباط 2023:
  <https://www.ftc.gov/news-events/news/press-releases/2023/02/ftc-enforcement-action-bar-goodrx-sharing-consumers-sensitive-health-info-advertising>
- Capsule, How it works: <https://www.capsule.com/how-it-works>
- Amazon Pharmacy, How it works: <https://pharmacy.amazon.com/how-it-works>
- Medfinder pricing/workflow: <https://www.medfinder.com/pricing>
- BidRx workflow: <https://www.bidrx.com/Home/Contents/how-it-work>
- Compounding Finder FAQ: <https://www.compoundingfinder.com/faq>
- PharmaFindr product/pilot: <https://pharmafindr.com/>،
  <https://devpost.com/software/pharmafindr-bzt0sm>
- MediFind Algeria:
  <https://play.google.com/store/apps/details?id=dz.amic.medifind&hl=en_US>
- Nimble patient workflow: <https://www.nimblerx.com/patients>
- Chefaa intermediary model:
  <https://chefaa.com/eg-en/now/order-medicine-online-prescription>
- NowRx SEC 2021:
  <https://www.sec.gov/Archives/edgar/data/1702206/000110465922054011/tm2213836d1_partii.htm>
- NowRx SEC H1 2022:
  <https://www.sec.gov/Archives/edgar/data/1702206/000110465922103473/tm2226607d1_1sa.htm>
- ScriptDrop API: <https://docs.scriptdrop.co/>

### العراق والمنطقة

- Capsula: <https://capsula.iq/>
- MedSnap Google Play:
  <https://play.google.com/store/apps/details?id=com.medsnap.medsnap_main&hl=en_US>
- Doctoury: <https://www.doctoury.com/>
- Lezzoo: <https://lezzoo.com/>
- Gudea: <https://gudea.gov.iq/>
- Iraqi Pharmacists Syndicate registers: <https://iraqipharm.org/>
- WHO/EMHJ, pharmaceutical regulation in Iraq, 2021:
  <https://applications.emro.who.int/EMHJ/V27/10/1020-3397-2021-2710-1007-1015-eng.pdf>
- Pharmacy Practice Law No. 40 (archive):
  <https://wiki.dorar-aliraq.net/iraqilaws/law/4248.html>
- Narcotics and Psychotropic Substances Law No. 50 of 2017:
  <https://www.moj.gov.iq/upload/pdf/4446.pdf>
- KRG pharmaceutical regulation:
  <https://gov.krd/moh-en/activities/news-and-press-releases/2022/november/kurdistan-region-s-medicine-market-sees-fundamental-changes-in-pharmaceutical-regulations/>
- CBI National Financial Inclusion Strategy 2025–2029:
  <https://cbi.iq/static/uploads/up/file-175032973296039.pdf>
- Ipsos Iraq online shopping, 12 آب 2025:
  <https://www.ipsos.com/en-jo/spotlightiraq-online-shopping-behaviour-attitudes>
- Sulaymaniyah pharmacy-choice study:
  <https://ajms.iq/index.php/ALRAFIDAIN/article/view/3018>
- Cloudflare Q2 2025 disruptions:
  <https://blog.cloudflare.com/q2-2025-internet-disruption-summary/>
- Talabat–Aster prescription privacy pattern:
  <https://www.asterdmhealthcare.com/newsroom/aster-pharmacy-partners-with-talabat-to-offer-prescription-delivery-services>
