/* ============================================================
   QAREEB — قريب
   Seed data. Illustrative only.
   All phone / WhatsApp numbers are deliberate placeholders
   (9647700000xxx) and must be replaced before any launch.
   ============================================================ */

const CONFIG = {
  brand: { ar: "قريب", en: "Qareeb" },
  city: { ar: "بغداد", en: "Baghdad" },
  currency: { ar: "د.ع", en: "IQD" },
  emergency: { ambulance: "122", note_ar: "تأكد من الرقم قبل الإطلاق", note_en: "Verify before launch" },
  defaultDistrict: "karrada",
  radiusKm: 5,
  radiusSteps: [5, 10, 25],
};

/* ---------- DISTRICTS (Baghdad) ---------- */
const DISTRICTS = [
  { id: "karrada",   ar: "الكرادة",        en: "Karrada",      lat: 33.3006, lng: 44.4108, lm_ar: "ساحة كهرمانة", lm_en: "Kahramana Square" },
  { id: "mansour",   ar: "المنصور",         en: "Mansour",      lat: 33.3115, lng: 44.3255, lm_ar: "شارع 14 رمضان", lm_en: "14 Ramadan St" },
  { id: "zayouna",   ar: "زيونة",           en: "Zayouna",      lat: 33.3372, lng: 44.4478, lm_ar: "شارع الربيعي", lm_en: "Rabee St" },
  { id: "jadriya",   ar: "الجادرية",        en: "Jadriya",      lat: 33.2748, lng: 44.3856, lm_ar: "جامعة بغداد", lm_en: "Baghdad University" },
  { id: "adhamiya",  ar: "الأعظمية",        en: "Adhamiya",     lat: 33.3722, lng: 44.3600, lm_ar: "ساحة عنتر", lm_en: "Antar Square" },
  { id: "kadhimiya", ar: "الكاظمية",        en: "Kadhimiya",    lat: 33.3778, lng: 44.3378, lm_ar: "الصحن الشريف", lm_en: "The Holy Shrine" },
  { id: "harthiya",  ar: "الحارثية",        en: "Harthiya",     lat: 33.3150, lng: 44.3600, lm_ar: "ساحة الحارثية", lm_en: "Harthiya Square" },
  { id: "yarmouk",   ar: "اليرموك",         en: "Yarmouk",      lat: 33.3050, lng: 44.3350, lm_ar: "المستشفى التعليمي", lm_en: "Teaching Hospital" },
  { id: "jamia",     ar: "حي الجامعة",      en: "Hay al-Jamia", lat: 33.2900, lng: 44.3200, lm_ar: "مجمع الجامعة", lm_en: "Jamia Complex" },
  { id: "dora",      ar: "الدورة",          en: "Dora",         lat: 33.2536, lng: 44.4056, lm_ar: "ساحة الدورة", lm_en: "Dora Square" },
  { id: "newbaghdad",ar: "بغداد الجديدة",   en: "New Baghdad",  lat: 33.3200, lng: 44.4700, lm_ar: "ساحة بغداد الجديدة", lm_en: "New Baghdad Square" },
  { id: "shaab",     ar: "الشعب",           en: "Sha'ab",       lat: 33.3900, lng: 44.4100, lm_ar: "ملعب الشعب", lm_en: "Sha'ab Stadium" },
  { id: "adl",       ar: "حي العدل",        en: "Hay al-Adl",   lat: 33.3300, lng: 44.3100, lm_ar: "سوق العدل", lm_en: "Adl Market" },
  { id: "saydiya",   ar: "السيدية",         en: "Saydiya",      lat: 33.2700, lng: 44.3400, lm_ar: "ساحة السيدية", lm_en: "Saydiya Square" },
  { id: "shula",     ar: "الشعلة",          en: "Shu'la",       lat: 33.3700, lng: 44.3000, lm_ar: "ساحة الشعلة", lm_en: "Shu'la Square" },
  { id: "ghazaliya", ar: "الغزالية",        en: "Ghazaliya",    lat: 33.3300, lng: 44.2800, lm_ar: "ساحة الغزالية", lm_en: "Ghazaliya Square" },
  { id: "sadr",      ar: "مدينة الصدر",     en: "Sadr City",    lat: 33.3750, lng: 44.4600, lm_ar: "ساحة الفلاح", lm_en: "Falah Square" },
  { id: "bayaa",     ar: "البياع",          en: "Bayaa",        lat: 33.2680, lng: 44.3560, lm_ar: "ساحة البياع", lm_en: "Bayaa Square" },
];

/* ---------- SPECIALTIES (with symptom aliases for tolerant search) ---------- */
const SPECIALTIES = [
  { id: "dent",  ar: "طب الأسنان",           en: "Dentistry",        alias: ["اسنان","أسنان","سن","ضرس","تسوس","لثة","tooth","teeth","dental"] },
  { id: "peds",  ar: "طب الأطفال",           en: "Pediatrics",       alias: ["اطفال","أطفال","طفل","رضيع","حرارة","child","baby","kids","fever"] },
  { id: "derm",  ar: "الجلدية",              en: "Dermatology",      alias: ["جلد","جلدية","بشرة","حبوب","حساسية","شعر","skin","acne","hair","rash"] },
  { id: "int",   ar: "الباطنية",             en: "Internal Medicine",alias: ["باطنية","معدة","قولون","سكري","ضغط","stomach","colon","internal"] },
  { id: "ortho", ar: "جراحة العظام",         en: "Orthopedics",      alias: ["عظام","مفاصل","ظهر","كسر","ركبة","bones","joints","back","knee"] },
  { id: "obgyn", ar: "النسائية والتوليد",     en: "Obstetrics & Gynecology", alias: ["نسائية","حمل","ولادة","توليد","pregnancy","birth","gyn"] },
  { id: "card",  ar: "أمراض القلب",          en: "Cardiology",       alias: ["قلب","قلبية","خفقان","ضغط دم","heart","cardio"] },
  { id: "eye",   ar: "طب العيون",            en: "Ophthalmology",    alias: ["عيون","عين","نظر","عدسات","eye","eyes","vision"] },
  { id: "ent",   ar: "الأنف والأذن والحنجرة", en: "ENT",              alias: ["اذن","أذن","انف","أنف","حنجرة","جيوب","ear","nose","throat","sinus"] },
  { id: "neuro", ar: "الأمراض العصبية",       en: "Neurology",        alias: ["صداع","شقيقة","دوخة","اعصاب","أعصاب","headache","migraine","neuro"] },
  { id: "endo",  ar: "الغدد والسكري",         en: "Endocrinology",    alias: ["سكري","غدة","غدد","هرمونات","thyroid","diabetes","endo"] },
  { id: "psych", ar: "الطب النفسي",           en: "Psychiatry",       alias: ["نفسية","قلق","اكتئاب","نوم","anxiety","depression","sleep"] },
  { id: "uro",   ar: "المسالك البولية",       en: "Urology",          alias: ["كلى","مسالك","حصى","بولية","kidney","urology","stones"] },
  { id: "surg",  ar: "الجراحة العامة",        en: "General Surgery",  alias: ["جراحة","فتق","زائدة","surgery","hernia"] },
];

/* ---------- NEEDS (symptom-first front door) ---------- */
const NEEDS = [
  { id: "n1",  spec: "dent",  ar: "وجع أسنان",        en: "Tooth pain",     icon: "tooth" },
  { id: "n2",  spec: "peds",  ar: "حرارة طفل",        en: "Child fever",    icon: "thermo" },
  { id: "n3",  spec: "derm",  ar: "بشرة وشعر",        en: "Skin & hair",    icon: "drop" },
  { id: "n4",  spec: "obgyn", ar: "حمل ومتابعة",      en: "Pregnancy",      icon: "heartbeat" },
  { id: "n5",  spec: "ortho", ar: "عظام ومفاصل",      en: "Bones & joints", icon: "bone" },
  { id: "n6",  spec: "card",  ar: "قلب وضغط",         en: "Heart & BP",     icon: "heart" },
  { id: "n7",  spec: "int",   ar: "معدة وقولون",      en: "Stomach",        icon: "stomach" },
  { id: "n8",  spec: "eye",   ar: "عيون ونظر",        en: "Eyes & vision",  icon: "eye" },
  { id: "n9",  spec: "ent",   ar: "أذن وأنف وحنجرة",  en: "Ear, nose, throat", icon: "ear" },
  { id: "n10", spec: "neuro", ar: "صداع وأعصاب",      en: "Headache",       icon: "brain" },
  { id: "n11", spec: "endo",  ar: "سكري وغدد",        en: "Diabetes",       icon: "sugar" },
  { id: "n12", spec: "psych", ar: "قلق ونوم",         en: "Anxiety & sleep",icon: "moon" },
];

/* ---------- FACILITIES ---------- */
/* type: hospital | clinic | pharmacy      er: emergency room      night: night duty */
const FACILITIES = [
  /* hospitals */
  { id: "h1", type: "hospital", ar: "مستشفى بغداد التعليمي", en: "Baghdad Teaching Hospital", district: "jadriya", lat: 33.2765, lng: 44.3880, er: true,  phone: "9647700000101", wa: null, verified: true, updated: 4,
    ar_note: "مدينة الطب — الردهة الخارجية", departments: ["int","surg","card","ortho","neuro"], hours: [{d:0,f:"00:00",t:"24:00"}], always: true },
  { id: "h2", type: "hospital", ar: "مستشفى ابن النفيس", en: "Ibn Al-Nafees Hospital", district: "karrada", lat: 33.3040, lng: 44.4180, er: true, phone: "9647700000102", wa: null, verified: true, updated: 9,
    departments: ["card","surg","int"], always: true },
  { id: "h3", type: "hospital", ar: "مستشفى اليرموك التعليمي", en: "Al-Yarmouk Teaching Hospital", district: "yarmouk", lat: 33.3033, lng: 44.3320, er: true, phone: "9647700000103", wa: null, verified: true, updated: 12,
    departments: ["surg","ortho","int","peds"], always: true },
  { id: "h4", type: "hospital", ar: "مستشفى الكاظمية التعليمي", en: "Kadhimiya Teaching Hospital", district: "kadhimiya", lat: 33.3790, lng: 44.3390, er: true, phone: "9647700000104", wa: null, verified: true, updated: 21,
    departments: ["int","peds","obgyn"], always: true },
  { id: "h5", type: "hospital", ar: "مستشفى الواسطي التخصصي", en: "Al-Wasiti Specialist Hospital", district: "harthiya", lat: 33.3160, lng: 44.3610, er: false, phone: "9647700000105", wa: null, verified: true, updated: 6,
    departments: ["surg","ortho","derm"], hours: [{d:"wk",f:"08:00",t:"15:00"}] },
  { id: "h6", type: "hospital", ar: "مستشفى الكرخ العام", en: "Karkh General Hospital", district: "adl", lat: 33.3290, lng: 44.3120, er: true, phone: "9647700000106", wa: null, verified: false, updated: 96,
    departments: ["int","surg"], always: true },

  /* private clinics / medical centres */
  { id: "c1", type: "clinic", ar: "مركز الكرادة الطبي", en: "Karrada Medical Centre", district: "karrada", lat: 33.2995, lng: 44.4090, phone: "9647700000201", verified: true, updated: 3 },
  { id: "c2", type: "clinic", ar: "مجمع زيونة الطبي", en: "Zayouna Medical Complex", district: "zayouna", lat: 33.3380, lng: 44.4460, phone: "9647700000202", verified: true, updated: 5 },
  { id: "c3", type: "clinic", ar: "مركز المنصور التخصصي", en: "Mansour Specialist Centre", district: "mansour", lat: 33.3120, lng: 44.3240, phone: "9647700000203", verified: true, updated: 2 },
  { id: "c4", type: "clinic", ar: "عيادات الجادرية", en: "Jadriya Clinics", district: "jadriya", lat: 33.2740, lng: 44.3870, phone: "9647700000204", verified: true, updated: 8 },
  { id: "c6", type: "clinic", ar: "مركز الصدر الطبي التخصصي", en: "Sadr Specialist Centre", district: "sadr", lat: 33.3740, lng: 44.4590, phone: "9647700000206", verified: true, updated: 5 },
  { id: "c7", type: "clinic", ar: "عيادات البياع", en: "Bayaa Clinics", district: "bayaa", lat: 33.2690, lng: 44.3570, phone: "9647700000207", verified: true, updated: 7 },
  { id: "c5", type: "clinic", ar: "مركز الشعب الطبي", en: "Sha'ab Medical Centre", district: "shaab", lat: 33.3910, lng: 44.4090, phone: "9647700000205", verified: false, updated: 40 },

  /* pharmacies */
  { id: "p1",  type: "pharmacy", ar: "صيدلية النور", en: "Al-Noor Pharmacy", district: "karrada", lat: 33.3012, lng: 44.4125, phone: "9647700000301", wa: "9647700000301", verified: true, updated: 2,
    hours: [{d:"all",f:"08:30",t:"23:30"}], services: ["delivery","bp","injections"] },
  { id: "p2",  type: "pharmacy", ar: "صيدلية ابن سينا", en: "Ibn Sina Pharmacy", district: "karrada", lat: 33.2980, lng: 44.4070, phone: "9647700000302", wa: "9647700000302", verified: true, updated: 1,
    hours: [{d:"all",f:"20:00",t:"09:00"}], night: true, services: ["night","injections","baby"] },
  { id: "p3",  type: "pharmacy", ar: "صيدلية الحياة", en: "Al-Hayat Pharmacy", district: "zayouna", lat: 33.3365, lng: 44.4490, phone: "9647700000303", wa: "9647700000303", verified: true, updated: 6,
    hours: [{d:"all",f:"09:00",t:"22:00"}], services: ["delivery","baby"] },
  { id: "p4",  type: "pharmacy", ar: "صيدلية الشفاء", en: "Al-Shifa Pharmacy", district: "mansour", lat: 33.3100, lng: 44.3270, phone: "9647700000304", wa: "9647700000304", verified: true, updated: 3,
    hours: [{d:"all",f:"08:00",t:"22:00"}], services: ["delivery","bp"] },
  { id: "p5",  type: "pharmacy", ar: "صيدلية الرحمة", en: "Al-Rahma Pharmacy", district: "mansour", lat: 33.3135, lng: 44.3230, phone: "9647700000305", wa: null, verified: true, updated: 11,
    hours: [{d:"all",f:"21:00",t:"08:00"}], night: true, services: ["night"] },
  { id: "p6",  type: "pharmacy", ar: "صيدلية السلام", en: "Al-Salam Pharmacy", district: "jadriya", lat: 33.2755, lng: 44.3840, phone: "9647700000306", wa: "9647700000306", verified: true, updated: 4,
    hours: [{d:"all",f:"09:00",t:"21:00"}], services: ["baby","bp"] },
  { id: "p7",  type: "pharmacy", ar: "صيدلية الأمل", en: "Al-Amal Pharmacy", district: "adhamiya", lat: 33.3715, lng: 44.3615, phone: "9647700000307", wa: "9647700000307", verified: false, updated: 74,
    hours: [{d:"all",f:"09:00",t:"22:00"}], services: ["delivery"] },
  { id: "p8",  type: "pharmacy", ar: "صيدلية بغداد المركزية", en: "Baghdad Central Pharmacy", district: "harthiya", lat: 33.3145, lng: 44.3580, phone: "9647700000308", wa: "9647700000308", verified: true, updated: 2,
    hours: [{d:"all",f:"00:00",t:"24:00"}], night: true, services: ["night","delivery","injections","bp","baby"] },
  { id: "p9",  type: "pharmacy", ar: "صيدلية الفارابي", en: "Al-Farabi Pharmacy", district: "yarmouk", lat: 33.3060, lng: 44.3365, phone: "9647700000309", wa: "9647700000309", verified: true, updated: 7,
    hours: [{d:"all",f:"08:30",t:"21:30"}], services: ["delivery","baby"] },
  { id: "p10", type: "pharmacy", ar: "صيدلية الياسمين", en: "Al-Yasmeen Pharmacy", district: "jamia", lat: 33.2895, lng: 44.3215, phone: "9647700000310", wa: "9647700000310", verified: true, updated: 5,
    hours: [{d:"all",f:"09:00",t:"23:00"}], services: ["delivery","bp"] },
  { id: "p11", type: "pharmacy", ar: "صيدلية دجلة", en: "Dijla Pharmacy", district: "dora", lat: 33.2545, lng: 44.4040, phone: "9647700000311", wa: "9647700000311", verified: true, updated: 14,
    hours: [{d:"all",f:"08:00",t:"20:00"}], services: ["baby"] },
  { id: "p13", type: "pharmacy", ar: "صيدلية الصدر المركزية", en: "Sadr Central Pharmacy", district: "sadr", lat: 33.3745, lng: 44.4610, phone: "9647700000313", wa: "9647700000313", verified: true, updated: 3,
    hours: [{d:"all",f:"00:00",t:"24:00"}], night: true, services: ["night","delivery","injections"] },
  { id: "p14", type: "pharmacy", ar: "صيدلية البياع", en: "Bayaa Pharmacy", district: "bayaa", lat: 33.2685, lng: 44.3550, phone: "9647700000314", wa: "9647700000314", verified: true, updated: 8,
    hours: [{d:"all",f:"08:00",t:"22:00"}], services: ["delivery","bp"] },
  { id: "p12", type: "pharmacy", ar: "صيدلية زيونة الليلية", en: "Zayouna Night Pharmacy", district: "zayouna", lat: 33.3390, lng: 44.4440, phone: "9647700000312", wa: "9647700000312", verified: true, updated: 1,
    hours: [{d:"all",f:"22:00",t:"08:00"}], night: true, services: ["night","injections"] },
];

/* ---------- DOCTORS ----------
   sessions: { fac, d (0=Sun..6=Sat), f, t, fee }
   fee 0 = public hospital outpatient (no consultation fee)
------------------------------------------------------------- */
const DOCTORS = [
  { id: "d1", ar: "د. علي حسين الجبوري", en: "Dr. Ali Hussein Al-Jubouri", title_ar: "اختصاص", title_en: "Specialist",
    spec: "dent", sub_ar: "تقويم وزراعة الأسنان", sub_en: "Orthodontics & implants",
    gender: "m", verified: true, updated: 3, wa: "9647700000401", phone: "9647700000401", accepting: true,
    creds_ar: ["بورد عراقي - طب الأسنان", "زمالة تقويم - الأردن"], langs: ["ar","en"], exp: 12,
    sessions: [
      { fac: "c1", d: 6, f: "16:00", t: "21:00", fee: 25000 },
      { fac: "c1", d: 0, f: "16:00", t: "21:00", fee: 25000 },
      { fac: "c1", d: 2, f: "16:00", t: "21:00", fee: 25000 },
      { fac: "c1", d: 4, f: "16:00", t: "20:00", fee: 25000 },
    ] },

  { id: "d2", ar: "د. زينب محمد عبدالحسين", en: "Dr. Zainab Abdul Kareem", title_ar: "استشاري", title_en: "Consultant",
    spec: "peds", sub_ar: "طب الأطفال وحديثي الولادة", sub_en: "Neonatology",
    gender: "f", verified: true, updated: 1, wa: "9647700000402", phone: "9647700000402", accepting: true,
    creds_ar: ["بورد عربي - طب الأطفال", "دبلوم حديثي الولادة"], langs: ["ar","en"], exp: 17,
    sessions: [
      { fac: "h4", d: 0, f: "09:00", t: "13:00", fee: 0 },
      { fac: "h4", d: 1, f: "09:00", t: "13:00", fee: 0 },
      { fac: "h4", d: 3, f: "09:00", t: "13:00", fee: 0 },
      { fac: "c2", d: 0, f: "17:00", t: "21:00", fee: 30000 },
      { fac: "c2", d: 2, f: "17:00", t: "21:00", fee: 30000 },
      { fac: "c2", d: 4, f: "17:00", t: "21:00", fee: 30000 },
    ] },

  { id: "d3", ar: "د. مصطفى الربيعي", en: "Dr. Mustafa Al-Rubaie", title_ar: "اختصاص", title_en: "Specialist",
    spec: "derm", sub_ar: "الأمراض الجلدية والليزر", sub_en: "Dermatology & laser",
    gender: "m", verified: true, updated: 6, wa: "9647700000403", phone: "9647700000403", accepting: true,
    creds_ar: ["بورد عراقي - الأمراض الجلدية"], langs: ["ar","en"], exp: 9,
    sessions: [
      { fac: "h5", d: 1, f: "08:30", t: "13:00", fee: 0 },
      { fac: "h5", d: 3, f: "08:30", t: "13:00", fee: 0 },
      { fac: "c3", d: 1, f: "16:30", t: "21:00", fee: 25000 },
      { fac: "c3", d: 3, f: "16:30", t: "21:00", fee: 25000 },
      { fac: "c3", d: 5, f: "16:30", t: "20:00", fee: 25000 },
    ] },

  { id: "d4", ar: "د. نور الهدى عبدالرزاق الخفاجي", en: "Dr. Noor Al-Huda Al-Khafaji", title_ar: "استشارية", title_en: "Consultant",
    spec: "obgyn", sub_ar: "العقم والحمل عالي الخطورة", sub_en: "Fertility & high-risk pregnancy",
    gender: "f", verified: true, updated: 2, wa: "9647700000404", phone: "9647700000404", accepting: true,
    creds_ar: ["بورد عربي - النسائية والتوليد", "زمالة أطفال أنابيب"], langs: ["ar","en","ku"], exp: 21,
    sessions: [
      { fac: "h4", d: 6, f: "09:00", t: "13:00", fee: 0 },
      { fac: "c1", d: 0, f: "16:00", t: "20:00", fee: 35000 },
      { fac: "c1", d: 2, f: "16:00", t: "20:00", fee: 35000 },
      { fac: "c4", d: 4, f: "16:00", t: "20:00", fee: 35000 },
    ] },

  { id: "d5", ar: "د. عمر السامرائي", en: "Dr. Omar Al-Samarrai", title_ar: "استشاري", title_en: "Consultant",
    spec: "ortho", sub_ar: "جراحة المفاصل والكسور", sub_en: "Joint & trauma surgery",
    gender: "m", verified: true, updated: 5, wa: "9647700000405", phone: "9647700000405", accepting: true,
    creds_ar: ["بورد عراقي - جراحة العظام", "زمالة مفاصل - تركيا"], langs: ["ar","en","tr"], exp: 19,
    sessions: [
      { fac: "h3", d: 0, f: "09:00", t: "13:00", fee: 0 },
      { fac: "h3", d: 2, f: "09:00", t: "13:00", fee: 0 },
      { fac: "c3", d: 0, f: "17:00", t: "21:00", fee: 30000 },
      { fac: "c3", d: 2, f: "17:00", t: "21:00", fee: 30000 },
      { fac: "c3", d: 4, f: "17:00", t: "21:00", fee: 30000 },
    ] },

  { id: "d6", ar: "د. رغد التميمي", en: "Dr. Raghad Al-Tamimi", title_ar: "اختصاص", title_en: "Specialist",
    spec: "int", sub_ar: "الجهاز الهضمي", sub_en: "Gastroenterology",
    gender: "f", verified: true, updated: 4, wa: "9647700000406", phone: "9647700000406", accepting: true,
    creds_ar: ["بورد عراقي - الطب الباطني"], langs: ["ar","en"], exp: 11,
    sessions: [
      { fac: "h2", d: 1, f: "09:00", t: "13:00", fee: 0 },
      { fac: "h2", d: 3, f: "09:00", t: "13:00", fee: 0 },
      { fac: "c1", d: 1, f: "17:00", t: "21:00", fee: 25000 },
      { fac: "c1", d: 3, f: "17:00", t: "21:00", fee: 25000 },
      { fac: "c1", d: 6, f: "10:00", t: "14:00", fee: 25000 },
    ] },

  { id: "d7", ar: "د. حيدر الموسوي", en: "Dr. Haider Al-Mousawi", title_ar: "استشاري", title_en: "Consultant",
    spec: "card", sub_ar: "قسطرة القلب", sub_en: "Interventional cardiology",
    gender: "m", verified: true, updated: 8, wa: "9647700000407", phone: "9647700000407", accepting: true,
    creds_ar: ["بورد عربي - أمراض القلب", "زمالة قسطرة - مصر"], langs: ["ar","en"], exp: 23,
    sessions: [
      { fac: "h2", d: 0, f: "08:30", t: "13:00", fee: 0 },
      { fac: "h2", d: 2, f: "08:30", t: "13:00", fee: 0 },
      { fac: "h2", d: 4, f: "08:30", t: "13:00", fee: 0 },
      { fac: "c1", d: 1, f: "18:00", t: "21:30", fee: 40000 },
      { fac: "c4", d: 3, f: "18:00", t: "21:30", fee: 40000 },
    ] },

  { id: "d8", ar: "د. سارة العزاوي", en: "Dr. Sara Al-Azzawi", title_ar: "اختصاص", title_en: "Specialist",
    spec: "eye", sub_ar: "قرنية وتصحيح النظر", sub_en: "Cornea & vision correction",
    gender: "f", verified: true, updated: 3, wa: "9647700000408", phone: "9647700000408", accepting: true,
    creds_ar: ["بورد عراقي - طب العيون"], langs: ["ar","en"], exp: 10,
    sessions: [
      { fac: "c2", d: 6, f: "16:00", t: "20:00", fee: 25000 },
      { fac: "c2", d: 1, f: "16:00", t: "20:00", fee: 25000 },
      { fac: "c2", d: 3, f: "16:00", t: "20:00", fee: 25000 },
    ] },

  { id: "d9", ar: "د. أحمد الشمري", en: "Dr. Ahmed Al-Shammari", title_ar: "اختصاص", title_en: "Specialist",
    spec: "ent", sub_ar: "جراحة الجيوب والأنف", sub_en: "Sinus & nasal surgery",
    gender: "m", verified: true, updated: 12, wa: "9647700000409", phone: "9647700000409", accepting: true,
    creds_ar: ["بورد عراقي - الأنف والأذن والحنجرة"], langs: ["ar"], exp: 14,
    sessions: [
      { fac: "h3", d: 1, f: "09:00", t: "13:00", fee: 0 },
      { fac: "c3", d: 0, f: "17:30", t: "21:00", fee: 25000 },
      { fac: "c3", d: 2, f: "17:30", t: "21:00", fee: 25000 },
    ] },

  { id: "d10", ar: "د. فاطمة الحسيني", en: "Dr. Fatima Al-Husseini", title_ar: "استشارية", title_en: "Consultant",
    spec: "neuro", sub_ar: "الصداع والصرع", sub_en: "Headache & epilepsy",
    gender: "f", verified: true, updated: 7, wa: "9647700000410", phone: "9647700000410", accepting: true,
    creds_ar: ["بورد عربي - الأمراض العصبية"], langs: ["ar","en"], exp: 18,
    sessions: [
      { fac: "h1", d: 0, f: "09:00", t: "13:00", fee: 0 },
      { fac: "h1", d: 3, f: "09:00", t: "13:00", fee: 0 },
      { fac: "c4", d: 1, f: "17:00", t: "20:30", fee: 35000 },
      { fac: "c4", d: 4, f: "17:00", t: "20:30", fee: 35000 },
    ] },

  { id: "d11", ar: "د. يوسف الدليمي", en: "Dr. Yousif Al-Dulaimi", title_ar: "اختصاص", title_en: "Specialist",
    spec: "endo", sub_ar: "السكري والغدة الدرقية", sub_en: "Diabetes & thyroid",
    gender: "m", verified: true, updated: 2, wa: "9647700000411", phone: "9647700000411", accepting: true,
    creds_ar: ["بورد عراقي - الطب الباطني", "دبلوم السكري - بريطانيا"], langs: ["ar","en"], exp: 13,
    sessions: [
      { fac: "c1", d: 6, f: "17:00", t: "21:00", fee: 30000 },
      { fac: "c1", d: 1, f: "17:00", t: "21:00", fee: 30000 },
      { fac: "c1", d: 4, f: "17:00", t: "21:00", fee: 30000 },
      { fac: "h2", d: 2, f: "09:00", t: "12:30", fee: 0 },
    ] },

  { id: "d12", ar: "د. هدى الكناني", en: "Dr. Huda Al-Kinani", title_ar: "اختصاص", title_en: "Specialist",
    spec: "psych", sub_ar: "القلق واضطرابات النوم", sub_en: "Anxiety & sleep disorders",
    gender: "f", verified: true, updated: 5, wa: "9647700000412", phone: "9647700000412", accepting: true,
    creds_ar: ["بورد عراقي - الطب النفسي"], langs: ["ar","en"], exp: 8,
    sessions: [
      { fac: "c2", d: 0, f: "16:00", t: "20:00", fee: 30000 },
      { fac: "c2", d: 2, f: "16:00", t: "20:00", fee: 30000 },
    ] },

  { id: "d13", ar: "د. كرار العبيدي", en: "Dr. Karrar Al-Obaidi", title_ar: "اختصاص", title_en: "Specialist",
    spec: "dent", sub_ar: "علاج جذور وحشوات تجميلية", sub_en: "Endodontics & cosmetic fillings",
    gender: "m", verified: true, updated: 9, wa: "9647700000413", phone: "9647700000413", accepting: true,
    creds_ar: ["ماجستير علاج الجذور - جامعة بغداد"], langs: ["ar"], exp: 7,
    sessions: [
      { fac: "c6", d: 1, f: "16:00", t: "21:00", fee: 20000 },
      { fac: "c2", d: 6, f: "15:00", t: "21:00", fee: 20000 },
      { fac: "c2", d: 1, f: "15:00", t: "21:00", fee: 20000 },
      { fac: "c2", d: 3, f: "15:00", t: "21:00", fee: 20000 },
      { fac: "c2", d: 5, f: "15:00", t: "19:00", fee: 20000 },
    ] },

  { id: "d14", ar: "د. مريم الزبيدي", en: "Dr. Mariam Al-Zubaidi", title_ar: "اختصاص", title_en: "Specialist",
    spec: "peds", sub_ar: "أمراض الأطفال العامة", sub_en: "General pediatrics",
    gender: "f", verified: true, updated: 4, wa: "9647700000414", phone: "9647700000414", accepting: true,
    creds_ar: ["بورد عراقي - طب الأطفال"], langs: ["ar","en"], exp: 10,
    sessions: [
      { fac: "c3", d: 6, f: "16:00", t: "21:00", fee: 25000 },
      { fac: "c3", d: 0, f: "16:00", t: "21:00", fee: 25000 },
      { fac: "c3", d: 1, f: "16:00", t: "21:00", fee: 25000 },
      { fac: "c3", d: 2, f: "16:00", t: "21:00", fee: 25000 },
      { fac: "c3", d: 3, f: "16:00", t: "21:00", fee: 25000 },
    ] },

  /* --- deliberate edge cases for state design --- */
  { id: "d15", ar: "د. سيف الدين عبدالوهاب النعيمي", en: "Dr. Saif Al-Deen Al-Naimi", title_ar: "استشاري", title_en: "Consultant",
    spec: "uro", sub_ar: "حصى الكلى والمناظير", sub_en: "Kidney stones & endoscopy",
    gender: "m", verified: true, updated: 6, wa: null, phone: "9647700000415", accepting: true,   /* NO WHATSAPP */
    creds_ar: ["بورد عربي - المسالك البولية"], langs: ["ar","en"], exp: 20,
    sessions: [
      { fac: "h1", d: 1, f: "09:00", t: "13:00", fee: 0 },
      { fac: "c4", d: 2, f: "17:00", t: "20:00", fee: 30000 },
    ] },

  { id: "d16", ar: "د. آية الساعدي", en: "Dr. Aya Al-Saedi", title_ar: "اختصاص", title_en: "Specialist",
    spec: "derm", sub_ar: "الأمراض الجلدية", sub_en: "Dermatology",
    gender: "f", verified: true, updated: 11, wa: "9647700000416", phone: "9647700000416", accepting: false, /* NOT ACCEPTING */
    pause_ar: "بإجازة أمومة — تعود في الشهر القادم", pause_en: "On maternity leave — returns next month",
    creds_ar: ["بورد عراقي - الأمراض الجلدية"], langs: ["ar"], exp: 6,
    sessions: [{ fac: "c1", d: 0, f: "16:00", t: "20:00", fee: 25000 }] },

  { id: "d17", ar: "د. باسم الطائي", en: "Dr. Basim Al-Taie", title_ar: "اختصاص", title_en: "Specialist",
    spec: "surg", sub_ar: "الجراحة العامة والمناظير", sub_en: "General & laparoscopic surgery",
    gender: "m", verified: false, updated: 118, wa: "9647700000417", phone: "9647700000417", accepting: true, /* LISTED, STALE */
    creds_ar: [], langs: ["ar"], exp: null,
    sessions: [{ fac: "c5", d: 2, f: "16:00", t: "20:00", fee: null }] },

  { id: "d18", ar: "د. رند الجنابي", en: "Dr. Rand Al-Janabi", title_ar: "اختصاص", title_en: "Specialist",
    spec: "int", sub_ar: "الطب الباطني العام", sub_en: "General internal medicine",
    gender: "f", verified: true, updated: 1, wa: "9647700000418", phone: "9647700000418", accepting: true,
    creds_ar: ["بورد عراقي - الطب الباطني"], langs: ["ar","en"], exp: 9,
    sessions: [
      { fac: "c2", d: 6, f: "10:00", t: "14:00", fee: 25000 },
      { fac: "c2", d: 0, f: "17:00", t: "21:00", fee: 25000 },
      { fac: "c2", d: 2, f: "17:00", t: "21:00", fee: 25000 },
      { fac: "c2", d: 4, f: "17:00", t: "21:00", fee: 25000 },
      { fac: "c2", d: 5, f: "17:00", t: "20:00", fee: 25000 },
    ] },
];

/* ---------- CARE — categories & products ---------- */
const CARE_CATEGORIES = [
  { id: "skin",  ar: "العناية بالبشرة", en: "Skin care",     icon: "drop" },
  { id: "hair",  ar: "العناية بالشعر",  en: "Hair care",     icon: "wave" },
  { id: "baby",  ar: "الأم والطفل",     en: "Mother & baby", icon: "baby" },
  { id: "sun",   ar: "الحماية من الشمس",en: "Sun protection",icon: "sun" },
  { id: "hyg",   ar: "النظافة اليومية", en: "Daily hygiene", icon: "hand" },
  { id: "vit",   ar: "الفيتامينات",     en: "Supplements",   icon: "pill" },
];

const PRODUCTS = [
  { id: "pr1", cat: "sun",  ar: "واقي شمس SPF 50+ للبشرة الحساسة", en: "Sunscreen SPF 50+ sensitive skin", brand: "Dermaline", price: 18000,
    for_ar: "حماية يومية من الشمس، خفيف وغير دهني، مناسب للبشرة الحساسة والمعرّضة للتصبغات.",
    use_ar: "يوضع على الوجه والرقبة قبل الخروج بـ ٢٠ دقيقة، ويعاد كل ساعتين عند التعرض المباشر.",
    warn_ar: ["للاستعمال الخارجي فقط", "تجنب ملامسة العين", "أوقف الاستعمال عند ظهور تهيج"],
    stock: ["p1","p4","p8","p3"] },
  { id: "pr2", cat: "skin", ar: "غسول لطيف للبشرة الدهنية", en: "Gentle cleanser — oily skin", brand: "Dermaline", price: 12500,
    for_ar: "ينظف الزيوت الزائدة دون أن يجفّف البشرة، خالٍ من الصابون والعطور.",
    use_ar: "مرتين يومياً على بشرة مبللة، يشطف بالماء الفاتر.",
    warn_ar: ["تجنب ملامسة العين"], stock: ["p1","p6","p9"] },
  { id: "pr3", cat: "skin", ar: "كريم مرطب بالسيراميد", en: "Ceramide moisturiser", brand: "Hydralab", price: 21000,
    for_ar: "يرمّم حاجز البشرة ويناسب الجفاف الشديد والإكزيما الخفيفة.",
    use_ar: "يوضع صباحاً ومساءً على بشرة نظيفة.", warn_ar: [], stock: ["p1","p3","p8"] },
  { id: "pr4", cat: "skin", ar: "سيروم فيتامين C ١٠٪", en: "Vitamin C serum 10%", brand: "Hydralab", price: 27000,
    for_ar: "يوحّد لون البشرة ويخفف آثار التصبغ مع الاستعمال المنتظم.",
    use_ar: "٣-٤ قطرات صباحاً قبل المرطب والواقي الشمسي.",
    warn_ar: ["يُستعمل مع واقي شمس", "قد يسبب وخزاً خفيفاً في البداية"], stock: ["p4","p8"] },
  { id: "pr5", cat: "hair", ar: "شامبو ضد تساقط الشعر", en: "Anti hair-loss shampoo", brand: "Keratin+", price: 16000,
    for_ar: "يقوّي بصيلة الشعر ويقلل التساقط الموسمي.",
    use_ar: "٣ مرات أسبوعياً، يُترك دقيقتين ثم يُشطف.", warn_ar: [], stock: ["p1","p3","p4","p9","p10"] },
  { id: "pr6", cat: "hair", ar: "زيت أرغان للشعر التالف", en: "Argan oil — damaged hair", brand: "Keratin+", price: 11000,
    for_ar: "ترطيب عميق للأطراف المتقصفة.", use_ar: "بضع قطرات على الأطراف بعد الاستحمام.", warn_ar: [], stock: ["p3","p9"] },
  { id: "pr7", cat: "baby", ar: "كريم حماية من التسلخات للأطفال", en: "Baby nappy-rash cream", brand: "BabySoft", price: 9500,
    for_ar: "يحمي بشرة الطفل ويعالج الاحمرار الناتج عن الحفاض.",
    use_ar: "عند كل تغيير حفاض على منطقة نظيفة وجافة.", warn_ar: ["للاستعمال الخارجي فقط"], stock: ["p2","p6","p9","p11"] },
  { id: "pr8", cat: "baby", ar: "حليب أطفال — المرحلة الأولى", en: "Infant formula — stage 1", brand: "NutriBaby", price: 24000,
    for_ar: "تغذية تكميلية من الولادة حتى ٦ أشهر.",
    use_ar: "حسب إرشادات العبوة وبعد استشارة طبيب الأطفال.",
    warn_ar: ["الرضاعة الطبيعية هي الأفضل", "استشر طبيب الأطفال قبل الاستعمال"], stock: ["p2","p3","p6","p11"] },
  { id: "pr9", cat: "vit", ar: "فيتامين D3 ٥٠٠٠ وحدة", en: "Vitamin D3 5000 IU", brand: "NutraWell", price: 14000,
    for_ar: "يدعم صحة العظام والمناعة، شائع النقص في المنطقة.",
    use_ar: "كبسولة يومياً مع الطعام أو حسب وصفة الطبيب.",
    warn_ar: ["لا تتجاوز الجرعة الموصوفة"], stock: ["p1","p4","p8","p10"] },
  { id: "pr10", cat: "vit", ar: "حديد وحمض الفوليك للحوامل", en: "Iron & folic acid — pregnancy", brand: "NutraWell", price: 13500,
    for_ar: "يدعم الحمل ويعوّض نقص الحديد الشائع.",
    use_ar: "حبة يومياً بعد الأكل أو حسب وصفة الطبيب.",
    warn_ar: ["استشيري طبيبك قبل الاستعمال"], stock: ["p3","p6","p8"] },
  { id: "pr11", cat: "hyg", ar: "معقم يدين ٧٠٪ كحول", en: "Hand sanitiser 70%", brand: "CleanCare", price: 4500,
    for_ar: "تعقيم سريع خارج المنزل.", use_ar: "يُفرك على اليدين حتى الجفاف.",
    warn_ar: ["قابل للاشتعال", "يُحفظ بعيداً عن الأطفال"], stock: ["p1","p2","p4","p6","p8","p9","p10"] },
  { id: "pr12", cat: "hyg", ar: "غسول فم بدون كحول", en: "Alcohol-free mouthwash", brand: "CleanCare", price: 7000,
    for_ar: "ينعش النفس دون حرقة، مناسب بعد علاج الأسنان.",
    use_ar: "٢٠ مل مرتين يومياً بعد التنظيف.", warn_ar: [], stock: ["p1","p9","p10"] },
  { id: "pr13", cat: "sun",  ar: "واقي شمس للأطفال SPF 50", en: "Kids sunscreen SPF 50", brand: "BabySoft", price: 19500,
    for_ar: "تركيبة معدنية لطيفة لبشرة الأطفال فوق ٦ أشهر.",
    use_ar: "قبل الخروج بـ ٢٠ دقيقة، يعاد كل ساعتين.",
    warn_ar: ["غير مناسب لأقل من ٦ أشهر"], stock: ["p2","p6","p11"] },
  { id: "pr14", cat: "skin", ar: "كريم لعلاج حب الشباب", en: "Acne treatment cream", brand: "Dermaline", price: 15500,
    for_ar: "يقلل الحبوب الالتهابية ويهدئ الاحمرار.",
    use_ar: "طبقة رقيقة مساءً على المنطقة المصابة.",
    warn_ar: ["قد يسبب جفافاً في البداية", "يُستعمل مع واقي شمس"], stock: ["p4","p8","p10"] },
];


/* ---------- MEDICINES ----------
   The research finding that reframed the product: Iraq's chronic problem is
   not "which doctor" (a few times a year, and IRAQDR/Doctoury already serve
   it) but "who has this medicine right now" — a weekly, painful hunt caused
   by chronic shortages. Nobody structures that. This is the wedge.

   `stock` records WHICH pharmacy last confirmed it and HOW LONG AGO. The
   freshness is the whole point: a two-day-old confirmation is worth calling,
   a two-month-old one is not.
------------------------------------------------------------------------- */
const MEDICINES = [
  { id: "m1",  ar: "أنسولين خلطي 30/70", en: "Insulin mix 30/70", form: "قلم", chronic: true,
    alias: ["انسولين","أنسولين","سكري","insulin"], stock: [{ f: "p1", d: 1 }, { f: "p8", d: 3 }, { f: "p4", d: 12 }] },
  { id: "m2",  ar: "ميتفورمين 850 ملغم", en: "Metformin 850mg", form: "حبوب", chronic: true,
    alias: ["متفورمين","ميتفورمين","سكري","metformin"], stock: [{ f: "p1", d: 2 }, { f: "p3", d: 2 }, { f: "p9", d: 6 }, { f: "p13", d: 4 }] },
  { id: "m3",  ar: "أملوديبين 5 ملغم", en: "Amlodipine 5mg", form: "حبوب", chronic: true,
    alias: ["ضغط","أملوديبين","amlodipine"], stock: [{ f: "p4", d: 1 }, { f: "p8", d: 5 }, { f: "p10", d: 9 }] },
  { id: "m4",  ar: "ليفوثيروكسين 50 مايكروغرام", en: "Levothyroxine 50mcg", form: "حبوب", chronic: true,
    alias: ["غدة","درقية","ليفوثيروكسين","thyroid"], stock: [{ f: "p8", d: 6 }] },
  { id: "m5",  ar: "سالبيوتامول بخاخ", en: "Salbutamol inhaler", form: "بخاخ", chronic: true,
    alias: ["ربو","بخاخ","سالبيوتامول","ventolin","asthma"], stock: [{ f: "p2", d: 1 }, { f: "p8", d: 2 }, { f: "p12", d: 3 }] },
  { id: "m6",  ar: "أموكسيسيلين شراب للأطفال", en: "Amoxicillin syrup (pediatric)", form: "شراب",
    alias: ["مضاد","اموكسيسيلين","أطفال","amoxicillin"], stock: [{ f: "p2", d: 1 }, { f: "p6", d: 4 }, { f: "p9", d: 2 }] },
  { id: "m7",  ar: "باراسيتامول شراب أطفال", en: "Paracetamol syrup (pediatric)", form: "شراب",
    alias: ["حرارة","باراسيتامول","بنادول","paracetamol"], stock: [{ f: "p1", d: 1 }, { f: "p2", d: 1 }, { f: "p6", d: 1 }, { f: "p11", d: 3 }] },
  { id: "m8",  ar: "حديد وريدي — أمبولات", en: "IV iron ampoules", form: "أمبول",
    alias: ["حديد","فقر دم","انيميا","iron"], stock: [] },   /* deliberately unavailable: the shortage case */
  { id: "m9",  ar: "وارفارين 5 ملغم", en: "Warfarin 5mg", form: "حبوب", chronic: true,
    alias: ["وارفارين","سيولة","warfarin"], stock: [{ f: "p8", d: 8 }] },
  { id: "m10", ar: "أوميبرازول 20 ملغم", en: "Omeprazole 20mg", form: "كبسول", chronic: true,
    alias: ["معدة","حموضة","اوميبرازول","omeprazole"], stock: [{ f: "p1", d: 3 }, { f: "p3", d: 2 }, { f: "p4", d: 5 }, { f: "p14", d: 7 }] },
];

/* Demand actually recorded by the platform — the asset a pharmacy would pay
   to see. Synthetic here, but this is exactly the shape the live log produces. */
const MED_DEMAND = [
  { med: "m1",  district: "sadr",      asks: 84, filled: 31 },
  { med: "m8",  district: "karrada",   asks: 71, filled: 4  },
  { med: "m2",  district: "newbaghdad",asks: 66, filled: 48 },
  { med: "m5",  district: "bayaa",     asks: 52, filled: 22 },
  { med: "m4",  district: "mansour",   asks: 47, filled: 11 },
  { med: "m9",  district: "zayouna",   asks: 38, filled: 9  },
];

/* ---------- QR SOURCES (poster attribution) ---------- */
const QR_SOURCES = {
  "p1":  { label_ar: "ملصق صيدلية النور", district: "karrada" },
  "c1":  { label_ar: "بطاقة مركز الكرادة الطبي", district: "karrada" },
  "p8":  { label_ar: "ملصق صيدلية بغداد المركزية", district: "harthiya" },
  "c3":  { label_ar: "ملصق مركز المنصور", district: "mansour" },
};

/* ---------- ADMIN demo metrics ---------- */
const ADMIN_STATS = {
  scans7d: 1284, requests7d: 213, searches7d: 3960, zeroResults7d: 287,
  topNeeds: [["وجع أسنان", 412], ["حرارة طفل", 355], ["بشرة وشعر", 298], ["عظام ومفاصل", 190], ["حمل ومتابعة", 164]],
  zeroQueries: [["دكتور اطفال الغزالية", 41], ["مختبر تحليل", 38], ["اشعة رنين", 33], ["دكتور اسنان الشعلة", 27], ["علاج طبيعي", 24], ["دكتور جلدية الدورة", 19]],
  sources: [["ملصق صيدلية النور — الكرادة", 486], ["بطاقة مركز الكرادة", 311], ["ملصق صيدلية بغداد المركزية", 268], ["ملصق مركز المنصور", 219]],
  queue: [
    { t: "verify", ar: "د. باسم الطائي — طلب توثيق", meta: "الجراحة العامة · مركز الشعب الطبي" },
    { t: "flag",   ar: "صيدلية الأمل — الدوام غير صحيح", meta: "بلاغ من مستخدم · قبل ٣ ساعات" },
    { t: "flag",   ar: "د. سيف الدين النعيمي — رقم واتساب مفقود", meta: "تلقائي · تحقق النظام" },
    { t: "verify", ar: "صيدلية دجلة — تحديث الخفارة الليلية", meta: "الدورة · طلب المالك" },
  ],
};
