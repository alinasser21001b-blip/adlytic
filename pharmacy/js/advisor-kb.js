/* ============================================================
   صيدلية در الشارقة — قاعدة المعرفة الطبية (ثلاث طبقات)
   Evidence-Based Knowledge Base

   الفلسفة: لا يعتمد النظام على مؤلّف واحد، بل على مراجع طبية
   عالمية معتمدة. كل قاعدة / جرعة / حدّ أعلى / مانع استعمال
   يستشهد بمرجع من طبقة الأدلّة (Layer 1) عبر معرّف "ref".

   ┌── LAYER 1 · Medical Evidence (references) ──────────────┐
   │  سجلّ مركزي للمراجع: WHO / NIH-ODS / EFSA / IOM-DRI /   │
   │  FDA / إرشادات سريرية / نشرة الشركة المصنّعة.            │
   │  كل مرجع: org, title, type, year, version, reviewed,    │
   │           lastVerified, evidenceLevel, url.             │
   └────────────────────────────────────────────────────────┘
                         ↓ يستشهد به
   ┌── LAYER 2 · Knowledge Rules (machine-readable) ─────────┐
   │  goals / nutrients(dosage+indicationRules+contra) /     │
   │  nutrientProducts / questions. كل عنصر طبي يحمل ref.    │
   └────────────────────────────────────────────────────────┘
                         ↓ يقرأها فقط
   ┌── LAYER 3 · Recommendation Engine (advisor.js) ─────────┐
   │  يقرأ القواعد ولا يعدّلها ولا يخترع أي جرعة إطلاقاً.     │
   └────────────────────────────────────────────────────────┘

   للتحديث عند صدور توصية دولية جديدة: عدّل مدخل المرجع في
   references (year/version/reviewed/lastVerified/url) و/أو
   قيمة الجرعة في nutrient.dosage — دون لمس المحرك.
   ============================================================ */

const ADVISOR_KB = {
  meta: {
    version: "2.0",
    lastReviewed: "2026-07-20",
    disclaimerAr:
      "هذه المعلومات تثقيفية عامة مستمدّة من مراجع علمية دولية معتمدة، وليست " +
      "تشخيصاً ولا وصفة علاجية. الجرعات والحدود القصوى مذكورة كما وردت في مصادرها " +
      "الرسمية. لأي قرار يخص صحتك أو جرعتك، راجع صيدلياً أو طبيباً.",
    maxQuestions: 7,
    confidenceThreshold: 0.7,
    confidenceGap: 0.12,
    evidenceFactor: { High: 1.0, Moderate: 0.75, Limited: 0.5 },
  },

  /* ================= LAYER 1 · REFERENCES (سجلّ الأدلّة) =================
     كل مدخل مرجع دولي واحد. القواعد في Layer 2 تشير إليه عبر معرّفه.
     التحديث الدوري = تعديل year/version/reviewed/lastVerified/url هنا فقط. */
  references: {
    iom_dri: {
      org: "Institute of Medicine (National Academies)",
      title: "Dietary Reference Intakes (DRIs) — RDA & Tolerable Upper Intake Levels",
      type: "Dietary Reference Intake", year: 2011, version: "2011",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "High",
      url: "https://www.nationalacademies.org/our-work/dietary-reference-intakes-tables-and-application",
    },
    efsa_ul: {
      org: "European Food Safety Authority (EFSA)",
      title: "Tolerable Upper Intake Levels for Vitamins and Minerals",
      type: "Scientific Opinion", year: 2018, version: "2018",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "High",
      url: "https://www.efsa.europa.eu/en/topics/topic/dietary-reference-values",
    },
    who_anaemia: {
      org: "World Health Organization (WHO)",
      title: "Guideline: Daily iron supplementation in adult women and adolescent girls",
      type: "Clinical Guideline", year: 2016, version: "2016",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "High",
      url: "https://www.who.int/publications/i/item/9789241510202",
    },
    nih_vitd: {
      org: "NIH Office of Dietary Supplements", title: "Vitamin D — Fact Sheet for Health Professionals",
      type: "Dietary Reference Intake", year: 2024, version: "2024.1",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "High",
      url: "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/",
    },
    nih_iron: {
      org: "NIH Office of Dietary Supplements", title: "Iron — Fact Sheet for Health Professionals",
      type: "Dietary Reference Intake", year: 2024, version: "2024.1",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "High",
      url: "https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/",
    },
    nih_b12: {
      org: "NIH Office of Dietary Supplements", title: "Vitamin B12 — Fact Sheet for Health Professionals",
      type: "Dietary Reference Intake", year: 2024, version: "2024.1",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "High",
      url: "https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/",
    },
    nih_mag: {
      org: "NIH Office of Dietary Supplements", title: "Magnesium — Fact Sheet for Health Professionals",
      type: "Dietary Reference Intake", year: 2022, version: "2022.1",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "High",
      url: "https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/",
    },
    nih_omega3: {
      org: "NIH Office of Dietary Supplements", title: "Omega-3 Fatty Acids — Fact Sheet for Health Professionals",
      type: "Scientific Review", year: 2023, version: "2023.1",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "Moderate",
      url: "https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/",
    },
    nih_zinc: {
      org: "NIH Office of Dietary Supplements", title: "Zinc — Fact Sheet for Health Professionals",
      type: "Dietary Reference Intake", year: 2024, version: "2024.1",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "Moderate",
      url: "https://ods.od.nih.gov/factsheets/Zinc-HealthProfessional/",
    },
    nih_biotin: {
      org: "NIH Office of Dietary Supplements", title: "Biotin — Fact Sheet for Health Professionals",
      type: "Adequate Intake", year: 2022, version: "2022.1",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "Limited",
      url: "https://ods.od.nih.gov/factsheets/Biotin-HealthProfessional/",
    },
    fda_biotin: {
      org: "U.S. Food and Drug Administration (FDA)",
      title: "Biotin May Interfere with Lab Tests — Safety Communication",
      type: "FDA Safety Communication", year: 2019, version: "2019",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "High",
      url: "https://www.fda.gov/medical-devices/safety-communications/update-biotin-interference-troponin-lab-tests",
    },
    cdc_folate: {
      org: "Centers for Disease Control (CDC) / NIH",
      title: "Folic Acid — Recommendations for Pregnancy and Planning",
      type: "Clinical Guideline", year: 2024, version: "2024.1",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "High",
      url: "https://www.cdc.gov/folic-acid/about/",
    },
    clin_collagen: {
      org: "Peer-reviewed clinical reviews (PubMed)",
      title: "Oral collagen peptide supplementation and skin/appendage outcomes — systematic review",
      type: "Systematic Review", year: 2021, version: "2021",
      reviewed: "2026-07-20", lastVerified: "2026-07-20", evidenceLevel: "Moderate",
      url: "https://pubmed.ncbi.nlm.nih.gov/33742704/",
    },
  },

  /* ================= LAYER 2 · KNOWLEDGE RULES ================= */

  /* ---- الأهداف (تربط بفئات المغذّيات، لا بالمنتجات) ---- */
  goals: [
    { id: "energy",    name: "زيادة الطاقة ومقاومة الإرهاق", icon: "⚡", nutrients: ["vitamin_d", "b12", "iron", "magnesium"] },
    { id: "focus",     name: "التركيز والذاكرة", icon: "🧠", nutrients: ["omega3", "b12"] },
    { id: "hair",      name: "صحة الشعر والأظافر", icon: "💇", nutrients: ["biotin_hair", "collagen", "iron"] },
    { id: "immunity",  name: "دعم المناعة", icon: "🛡️", nutrients: ["vitamin_d", "zinc"] },
    { id: "sleep",     name: "النوم والاسترخاء", icon: "🌙", nutrients: ["magnesium"] },
    { id: "bones",     name: "صحة العظام", icon: "🦴", nutrients: ["vitamin_d"] },
    { id: "skin",      name: "نضارة البشرة", icon: "✨", nutrients: ["collagen"] },
    { id: "pregnancy", name: "الحمل والتخطيط له", icon: "🤰", nutrients: ["prenatal"] },
  ],

  /* ---- المغذّيات ----
     dosage: مأخوذ حرفياً من المرجع (ref) — المحرك لا يخترعه.
     indicationRules[].ref: المرجع الذي يدعم ربط الحقيقة بالمغذّي.
     contraindications[].ref: مصدر مانع الاستعمال. */
  nutrients: [
    {
      id: "vitamin_d", name: "فيتامين د", primaryRef: "nih_vitd",
      blurb: "يدعم امتصاص الكالسيوم وصحة العظام والمناعة ووظيفة العضلات.",
      dosage: {
        rda: "الكمية اليومية الموصى بها 600 وحدة دولية (15 ميكروغرام) للبالغين، و800 وحدة فوق 70 سنة.",
        upperLimit: "الحد الأعلى المسموح 4000 وحدة/يوم للبالغين.",
        ref: "nih_vitd", ulRef: "efsa_ul",
      },
      indicationRules: [
        { when: "goal:energy",       weight: 2, evidenceLevel: "Moderate", ref: "nih_vitd" },
        { when: "goal:immunity",     weight: 3, evidenceLevel: "High",     ref: "nih_vitd" },
        { when: "goal:bones",        weight: 4, evidenceLevel: "High",     ref: "iom_dri" },
        { when: "symptom:fatigue",   weight: 2, evidenceLevel: "Moderate", ref: "nih_vitd" },
        { when: "symptom:bone_pain", weight: 3, evidenceLevel: "High",     ref: "iom_dri" },
        { when: "lifestyle:sun_low", weight: 3, evidenceLevel: "High",     ref: "nih_vitd" },
        { when: "lifestyle:indoor",  weight: 2, evidenceLevel: "Moderate", ref: "nih_vitd" },
      ],
      contraindications: [
        { flag: "hypercalcemia", action: "exclude", ref: "nih_vitd",
          note: "ارتفاع كالسيوم الدم مانع — يلزم إشراف طبي." },
        { flag: "kidney_disease", action: "flag", ref: "nih_vitd",
          note: "أمراض الكلى تتطلب مراجعة طبية قبل مكملات فيتامين د." },
      ],
    },
    {
      id: "iron", name: "الحديد", primaryRef: "nih_iron",
      blurb: "ضروري لنقل الأكسجين في الدم؛ نقصه سبب شائع للإرهاق خصوصاً لدى النساء.",
      dosage: {
        rda: "الكمية الموصى بها 8 ملغ/يوم للرجال و18 ملغ/يوم للنساء (19–50 سنة).",
        upperLimit: "الحد الأعلى 45 ملغ/يوم للبالغين؛ يفضّل تأكيد النقص مخبرياً قبل البدء.",
        ref: "nih_iron", ulRef: "nih_iron", guidelineRef: "who_anaemia",
      },
      indicationRules: [
        { when: "goal:energy",            weight: 3, evidenceLevel: "High",     ref: "who_anaemia" },
        { when: "goal:hair",              weight: 2, evidenceLevel: "Moderate", ref: "nih_iron" },
        { when: "symptom:fatigue",        weight: 3, evidenceLevel: "High",     ref: "who_anaemia" },
        { when: "symptom:pale",           weight: 3, evidenceLevel: "High",     ref: "who_anaemia" },
        { when: "symptom:hair_loss",      weight: 2, evidenceLevel: "Moderate", ref: "nih_iron" },
        { when: "lifestyle:low_meat",     weight: 2, evidenceLevel: "Moderate", ref: "nih_iron" },
        { when: "lifestyle:heavy_period", weight: 3, evidenceLevel: "High",     ref: "who_anaemia" },
      ],
      contraindications: [
        { flag: "iron_overload", action: "exclude", ref: "nih_iron",
          note: "زيادة الحديد/الهيموكروماتوز مانع تام." },
        { flag: "male_adult", action: "flag", ref: "nih_iron",
          note: "الرجال البالغون نادراً ما يحتاجون مكملات حديد دون فحص — يُفضّل تأكيد النقص مخبرياً." },
      ],
    },
    {
      id: "b12", name: "فيتامين ب12", primaryRef: "nih_b12",
      blurb: "يدعم إنتاج الطاقة الخلوية، صحة الأعصاب، وتكوين خلايا الدم الحمراء.",
      dosage: {
        rda: "الكمية الموصى بها 2.4 ميكروغرام/يوم للبالغين.",
        upperLimit: "لا حدّ أعلى محدّد؛ يُعتبر آمناً عموماً والفائض يُطرح.",
        ref: "nih_b12", ulRef: "iom_dri",
      },
      indicationRules: [
        { when: "goal:energy",          weight: 3, evidenceLevel: "High",     ref: "nih_b12" },
        { when: "goal:focus",           weight: 2, evidenceLevel: "Moderate", ref: "nih_b12" },
        { when: "symptom:fatigue",      weight: 3, evidenceLevel: "High",     ref: "nih_b12" },
        { when: "symptom:tingling",     weight: 3, evidenceLevel: "High",     ref: "nih_b12" },
        { when: "symptom:brain_fog",    weight: 2, evidenceLevel: "Moderate", ref: "nih_b12" },
        { when: "lifestyle:vegetarian", weight: 3, evidenceLevel: "High",     ref: "nih_b12" },
        { when: "lifestyle:low_meat",   weight: 2, evidenceLevel: "Moderate", ref: "nih_b12" },
      ],
      contraindications: [],
    },
    {
      id: "magnesium", name: "المغنيسيوم", primaryRef: "nih_mag",
      blurb: "يشارك في مئات التفاعلات — وظيفة العضلات والأعصاب، والاسترخاء، وجودة النوم.",
      dosage: {
        rda: "الكمية الموصى بها 310–420 ملغ/يوم للبالغين حسب العمر والجنس.",
        upperLimit: "الحد الأعلى من المكملات 350 ملغ/يوم للبالغين (لا يشمل مغنيسيوم الغذاء).",
        ref: "nih_mag", ulRef: "iom_dri",
      },
      indicationRules: [
        { when: "goal:sleep",         weight: 3, evidenceLevel: "Moderate", ref: "nih_mag" },
        { when: "goal:energy",        weight: 1, evidenceLevel: "Limited",  ref: "nih_mag" },
        { when: "symptom:cramps",     weight: 3, evidenceLevel: "Moderate", ref: "nih_mag" },
        { when: "symptom:poor_sleep", weight: 2, evidenceLevel: "Moderate", ref: "nih_mag" },
        { when: "symptom:stress",     weight: 2, evidenceLevel: "Limited",  ref: "nih_mag" },
      ],
      contraindications: [
        { flag: "kidney_disease", action: "exclude", ref: "nih_mag",
          note: "قصور الكلى مانع — خطر تراكم المغنيسيوم." },
      ],
    },
    {
      id: "omega3", name: "أوميغا-3", primaryRef: "nih_omega3",
      blurb: "أحماض دهنية أساسية تدعم صحة القلب والدماغ والتركيز.",
      dosage: {
        rda: "لا RDA رسمي؛ الكفاية الغذائية (ALA) 1.1–1.6 غ/يوم للبالغين.",
        upperLimit: "جرعات EPA+DHA فوق 3 غ/يوم بإشراف طبي (FDA/NIH).",
        ref: "nih_omega3", ulRef: "nih_omega3",
      },
      indicationRules: [
        { when: "goal:focus",         weight: 3, evidenceLevel: "Moderate", ref: "nih_omega3" },
        { when: "symptom:brain_fog",  weight: 2, evidenceLevel: "Moderate", ref: "nih_omega3" },
        { when: "lifestyle:low_fish", weight: 2, evidenceLevel: "Moderate", ref: "nih_omega3" },
      ],
      contraindications: [
        { flag: "blood_thinner", action: "flag", ref: "nih_omega3",
          note: "مع مميّعات الدم يُنصح بمراجعة الطبيب قبل الجرعات العالية." },
      ],
    },
    {
      id: "zinc", name: "الزنك", primaryRef: "nih_zinc",
      blurb: "معدن يدعم المناعة والتئام الجروح وصحة الجلد.",
      dosage: {
        rda: "الكمية الموصى بها 8–11 ملغ/يوم للبالغين.",
        upperLimit: "الحد الأعلى 40 ملغ/يوم للبالغين — الجرعات العالية تعيق امتصاص النحاس.",
        ref: "nih_zinc", ulRef: "efsa_ul",
      },
      indicationRules: [
        { when: "goal:immunity",          weight: 3, evidenceLevel: "Moderate", ref: "nih_zinc" },
        { when: "symptom:frequent_colds", weight: 3, evidenceLevel: "Moderate", ref: "nih_zinc" },
        { when: "symptom:slow_healing",   weight: 2, evidenceLevel: "Limited",  ref: "nih_zinc" },
      ],
      contraindications: [],
    },
    {
      id: "biotin_hair", name: "بيوتين ومغذّيات الشعر", primaryRef: "nih_biotin",
      blurb: "البيوتين وفيتامينات B تدعم دورة نمو الشعر والأظافر.",
      dosage: {
        rda: "الكفاية الغذائية للبيوتين 30 ميكروغرام/يوم للبالغين.",
        upperLimit: "لا حدّ أعلى محدّد؛ يُعتبر آمناً عموماً.",
        ref: "nih_biotin", ulRef: "nih_biotin",
      },
      indicationRules: [
        { when: "goal:hair",             weight: 3, evidenceLevel: "Limited", ref: "nih_biotin" },
        { when: "symptom:hair_loss",     weight: 3, evidenceLevel: "Limited", ref: "nih_biotin" },
        { when: "symptom:brittle_nails", weight: 2, evidenceLevel: "Limited", ref: "nih_biotin" },
      ],
      contraindications: [
        { flag: "lab_tests_soon", action: "flag", ref: "fda_biotin",
          note: "البيوتين بجرعات عالية قد يشوّش نتائج بعض تحاليل الدم — أخبر المختبر." },
      ],
    },
    {
      id: "collagen", name: "الكولاجين", primaryRef: "clin_collagen",
      blurb: "بروتين بنيوي يُستخدم لدعم نضارة البشرة ومرونتها وصحة الشعر.",
      dosage: {
        rda: "لا RDA رسمي؛ الدراسات السريرية استخدمت 2.5–10 غ/يوم من ببتيدات الكولاجين.",
        upperLimit: "يُعتبر مكملاً غذائياً آمناً عموماً؛ راجع الصيدلي عند حساسية للمصدر.",
        ref: "clin_collagen", ulRef: "clin_collagen",
      },
      indicationRules: [
        { when: "goal:skin",         weight: 3, evidenceLevel: "Moderate", ref: "clin_collagen" },
        { when: "goal:hair",         weight: 1, evidenceLevel: "Limited",  ref: "clin_collagen" },
        { when: "symptom:dull_skin", weight: 2, evidenceLevel: "Moderate", ref: "clin_collagen" },
      ],
      contraindications: [],
    },
    {
      id: "prenatal", name: "فيتامينات الحمل (حمض الفوليك)", primaryRef: "cdc_folate",
      blurb: "حمض الفوليك والحديد والمعادن الأساسية لدعم الحمل الصحي والتخطيط له.",
      dosage: {
        rda: "يوصى بـ 400 ميكروغرام/يوم من حمض الفوليك لكل امرأة قادرة على الإنجاب، و600 ميكروغرام أثناء الحمل.",
        upperLimit: "تُختار التركيبة حسب مرحلة الحمل — راجعي الصيدلي أو الطبيب.",
        ref: "cdc_folate", ulRef: "cdc_folate",
      },
      indicationRules: [
        { when: "goal:pregnancy",          weight: 5, evidenceLevel: "High", ref: "cdc_folate" },
        { when: "flag:pregnancy",          weight: 5, evidenceLevel: "High", ref: "cdc_folate" },
        { when: "flag:planning_pregnancy", weight: 4, evidenceLevel: "High", ref: "cdc_folate" },
      ],
      contraindications: [],
    },
  ],

  /* ---- ربط المغذّيات بالمنتجات (معرّفات من products.js) ---- */
  nutrientProducts: {
    vitamin_d:   ["d3-50000", "multi-nrg-women"],
    iron:        ["multi-nrg-women", "pregnacare"],
    b12:         ["b12", "students-pack", "lipoplex"],
    magnesium:   ["glycimag"],
    omega3:      ["omega3", "students-pack"],
    zinc:        ["multi-nrg-women", "vitarix"],
    biotin_hair: ["novophane-caps", "acm-novophane-set", "skinage-hair"],
    collagen:    ["maddox-collagen"],
    prenatal:    ["pregnacare", "well-pregna", "mamacare-plus", "pregnancy-pack"],
  },

  /* ---- شجرة الأسئلة التكيّفية ---- */
  questions: [
    {
      id: "q_goal", priority: 10, type: "multi",
      text: "ما الذي تريد تحسينه أكثر؟ (يمكن اختيار أكثر من هدف)",
      appearWhen: [], skipWhen: ["answered:q_goal"], relatedNutrients: [], isSafetyGate: false,
      options: [
        { id: "energy",    label: "⚡ طاقة أعلى وإرهاق أقل", facts: ["goal:energy"] },
        { id: "focus",     label: "🧠 تركيز وذاكرة",         facts: ["goal:focus"] },
        { id: "hair",      label: "💇 شعر وأظافر",           facts: ["goal:hair"] },
        { id: "immunity",  label: "🛡️ مناعة",               facts: ["goal:immunity"] },
        { id: "sleep",     label: "🌙 نوم واسترخاء",         facts: ["goal:sleep"] },
        { id: "bones",     label: "🦴 عظام",                 facts: ["goal:bones"] },
        { id: "skin",      label: "✨ نضارة البشرة",         facts: ["goal:skin"] },
        { id: "pregnancy", label: "🤰 حمل أو تخطيط له",      facts: ["goal:pregnancy", "flag:planning_pregnancy"] },
      ],
    },
    {
      id: "q_pregnancy_safety", priority: 9, type: "single", isSafetyGate: true,
      text: "قبل أي توصية — هل أنتِ حامل حالياً أو مرضعة؟",
      appearWhen: [], skipWhen: ["answered:q_pregnancy_safety"], relatedNutrients: ["prenatal"], safetyRelevance: ["pregnancy"],
      options: [
        { id: "no",   label: "لا", facts: [] },
        { id: "preg", label: "نعم، حامل", facts: ["flag:pregnancy", "goal:pregnancy"] },
        { id: "nurse",label: "نعم، مرضعة", facts: ["flag:nursing"] },
        { id: "na",   label: "لا ينطبق", facts: [] },
      ],
    },
    {
      id: "q_conditions", priority: 8, type: "multi", isSafetyGate: true,
      text: "هل لديك أي من التالي؟ (مهم للأمان — اختر ما ينطبق أو «لا شيء»)",
      appearWhen: [], skipWhen: ["answered:q_conditions"], relatedNutrients: [],
      safetyRelevance: ["kidney_disease", "blood_thinner", "iron_overload", "hypercalcemia"],
      options: [
        { id: "none",   label: "لا شيء مما يلي", facts: [] },
        { id: "kidney", label: "مرض/قصور في الكلى", facts: ["flag:kidney_disease"] },
        { id: "thinner",label: "أتناول مميّع للدم", facts: ["flag:blood_thinner"] },
        { id: "iron_ov",label: "زيادة حديد / هيموكروماتوز", facts: ["flag:iron_overload"] },
        { id: "highcal",label: "ارتفاع كالسيوم الدم", facts: ["flag:hypercalcemia"] },
        { id: "labs",   label: "لديّ تحاليل دم قريباً", facts: ["flag:lab_tests_soon"] },
      ],
    },
    {
      id: "q_fatigue", priority: 7, type: "single",
      text: "هل تشعر بإرهاق أو انخفاض طاقة بشكل متكرر؟",
      appearWhen: ["goal:energy", "goal:focus"], skipWhen: ["answered:q_fatigue"], relatedNutrients: ["vitamin_d", "iron", "b12"],
      options: [
        { id: "often", label: "نعم، كثيراً", facts: ["symptom:fatigue"] },
        { id: "some",  label: "أحياناً", facts: ["symptom:fatigue"] },
        { id: "no",    label: "لا", facts: [] },
      ],
    },
    {
      id: "q_diet", priority: 6, type: "single",
      text: "كيف تصف نظامك الغذائي من ناحية اللحوم والأسماك؟",
      appearWhen: ["goal:energy", "goal:focus", "goal:hair"], skipWhen: ["answered:q_diet"], relatedNutrients: ["iron", "b12", "omega3"],
      options: [
        { id: "veg",     label: "نباتي (بلا لحوم)", facts: ["lifestyle:vegetarian", "lifestyle:low_meat", "lifestyle:low_fish"] },
        { id: "lowmeat", label: "قليل اللحوم والأسماك", facts: ["lifestyle:low_meat", "lifestyle:low_fish"] },
        { id: "balanced",label: "متوازن", facts: [] },
      ],
    },
    {
      id: "q_sun", priority: 6, type: "single",
      text: "كم تتعرّض لأشعة الشمس أسبوعياً؟",
      appearWhen: ["goal:energy", "goal:immunity", "goal:bones"], skipWhen: ["answered:q_sun"], relatedNutrients: ["vitamin_d"],
      options: [
        { id: "low",  label: "قليل جداً / أعمل داخل المنزل", facts: ["lifestyle:sun_low", "lifestyle:indoor"] },
        { id: "some", label: "بعض الأحيان", facts: [] },
        { id: "lots", label: "بانتظام", facts: [] },
      ],
    },
    {
      id: "q_sleep", priority: 6, type: "single",
      text: "كيف هي جودة نومك واسترخاؤك؟",
      appearWhen: ["goal:sleep", "goal:energy"], skipWhen: ["answered:q_sleep"], relatedNutrients: ["magnesium"],
      options: [
        { id: "poor",  label: "أعاني من قلة نوم/توتر", facts: ["symptom:poor_sleep", "symptom:stress"] },
        { id: "cramps",label: "أحياناً تشنّج عضلي", facts: ["symptom:cramps"] },
        { id: "ok",    label: "جيدة", facts: [] },
      ],
    },
    {
      id: "q_hair", priority: 6, type: "single",
      text: "ما أبرز ما يزعجك في شعرك أو أظافرك؟",
      appearWhen: ["goal:hair"], skipWhen: ["answered:q_hair"], relatedNutrients: ["biotin_hair", "iron", "collagen"],
      options: [
        { id: "loss", label: "تساقط ملحوظ", facts: ["symptom:hair_loss"] },
        { id: "nails",label: "أظافر هشّة", facts: ["symptom:brittle_nails"] },
        { id: "dull", label: "بهتان/جفاف", facts: ["symptom:dull_skin"] },
      ],
    },
    {
      id: "q_immunity", priority: 6, type: "single",
      text: "هل تصاب بنزلات البرد بشكل متكرر؟",
      appearWhen: ["goal:immunity"], skipWhen: ["answered:q_immunity"], relatedNutrients: ["vitamin_d", "zinc"],
      options: [
        { id: "often", label: "نعم، متكرر", facts: ["symptom:frequent_colds"] },
        { id: "no",    label: "لا", facts: [] },
      ],
    },
    {
      id: "q_period", priority: 5, type: "single",
      text: "هل تعانين من دورة شهرية غزيرة؟ (اختياري — يخص الحديد)",
      appearWhen: ["goal:energy", "goal:hair"], skipWhen: ["answered:q_period", "flag:pregnancy"], relatedNutrients: ["iron"],
      options: [
        { id: "yes", label: "نعم", facts: ["symptom:heavy_period", "lifestyle:heavy_period"] },
        { id: "no",  label: "لا", facts: [] },
        { id: "na",  label: "لا ينطبق", facts: ["flag:male_adult"] },
      ],
    },
  ],
};

if (typeof module !== "undefined") module.exports = ADVISOR_KB;
