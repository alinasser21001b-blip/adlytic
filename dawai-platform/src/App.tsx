import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Icon } from "./Icon";

type PatientView =
  | "home"
  | "compose"
  | "matching"
  | "offers"
  | "reserved"
  | "search"
  | "pharmacies";
type PharmacyView = "inbox" | "respond" | "sent";
type Role = "patient" | "pharmacy";
type InputMode = "text" | "scan" | "upload";
type PharmacyDisplay = "list" | "map";

interface Offer {
  id: string;
  pharmacy: string;
  district: string;
  distance: string;
  price: number | null;
  kind: "available" | "alternative";
  ready: string;
  fulfillment: string;
  confirmedAgo: string;
  reliability: string;
  note?: string;
}

const offers: Offer[] = [
  {
    id: "al-rawabi",
    pharmacy: "صيدلية الروابي",
    district: "المنصور",
    distance: "700 م",
    price: 12_000,
    kind: "available",
    ready: "جاهز خلال 10 دقائق",
    fulfillment: "استلام من الصيدلية",
    confirmedAgo: "تأكد قبل 2 دقيقة",
    reliability: "تستجيب عادةً خلال 3 دقائق",
  },
  {
    id: "al-yarmouk",
    pharmacy: "صيدلية اليرموك",
    district: "اليرموك",
    distance: "1.2 كم",
    price: 11_500,
    kind: "available",
    ready: "جاهز الآن",
    fulfillment: "استلام · توصيل تجريبي",
    confirmedAgo: "تأكد الآن",
    reliability: "أنجزت 94% من الحجوزات",
  },
  {
    id: "al-hayat",
    pharmacy: "صيدلية الحياة",
    district: "الداوودي",
    distance: "900 م",
    price: null,
    kind: "alternative",
    ready: "يتطلب مراجعة الصيدلي",
    fulfillment: "استلام من الصيدلية",
    confirmedAgo: "ردّت قبل دقيقة",
    reliability: "صيدلية موثقة",
    note: "علامة تجارية مختلفة — لا يُعتمد البديل إلا بعد تحقق الصيدلي والوصفة.",
  },
];

const nearbyPharmacies = [
  {
    id: "rawabi",
    name: "صيدلية الروابي",
    distance: "700 م",
    area: "المنصور · شارع 14 رمضان",
    status: "مفتوحة حتى 11:30 م",
    services: ["استلام", "وصفة طبية", "دفع نقدي"],
    fresh: "آخر نشاط قبل 2 د",
    x: 31,
    y: 33,
  },
  {
    id: "hayat",
    name: "صيدلية الحياة",
    distance: "900 م",
    area: "الداوودي · قرب الساحة",
    status: "مفتوحة الآن",
    services: ["استلام", "محادثة صيدلي"],
    fresh: "آخر نشاط قبل 5 د",
    x: 58,
    y: 48,
  },
  {
    id: "yarmouk",
    name: "صيدلية اليرموك",
    distance: "1.2 كم",
    area: "اليرموك · الأربع شوارع",
    status: "مفتوحة حتى 12:00 ص",
    services: ["استلام", "توصيل تجريبي"],
    fresh: "آخر نشاط الآن",
    x: 68,
    y: 69,
  },
];

const pharmacyRequests = [
  {
    id: "REQ-2841",
    medicine: "Augmentin 625 mg",
    detail: "أقراص · علبة واحدة",
    distance: "1.2 كم",
    area: "المنصور",
    prescription: "الوصفة موجودة — تتحقق بعد قبول العرض",
    age: "منذ 42 ثانية",
    timer: "02:18",
    urgency: "يحتاجه اليوم",
    match: "مطابقة قوية",
  },
  {
    id: "REQ-2838",
    medicine: "Panadol Extra",
    detail: "24 قرص · علبتان",
    distance: "2.4 كم",
    area: "اليرموك",
    prescription: "لا يحتاج وصفة",
    age: "منذ 3 دقائق",
    timer: "00:46",
    urgency: "خلال اليوم",
    match: "بحث مباشر",
  },
];

function formatIqd(value: number) {
  return `${new Intl.NumberFormat("en-IQ").format(value)} د.ع`;
}

function Logo() {
  return (
    <button
      className="brand"
      type="button"
      aria-label="العودة إلى الرئيسية"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      <span>
        <strong>دوائي</strong>
        <small>نجد دواءك بالقرب منك</small>
      </span>
    </button>
  );
}

function DemoNotice() {
  return (
    <div className="demo-notice" role="note">
      <Icon name="shield" size={17} />
      <span>
        نموذج تفاعلي ببيانات تجريبية — لا يمثل مخزونًا أو سعرًا حقيقيًا ولا يقدم
        نصيحة طبية.
      </span>
    </div>
  );
}

function RoleSwitch({
  role,
  onChange,
}: {
  role: Role;
  onChange: (role: Role) => void;
}) {
  return (
    <div className="role-switch" aria-label="نوع المستخدم">
      <button
        type="button"
        className={role === "patient" ? "active" : ""}
        aria-pressed={role === "patient"}
        onClick={() => onChange("patient")}
      >
        <Icon name="user" size={16} />
        للمريض
      </button>
      <button
        type="button"
        className={role === "pharmacy" ? "active" : ""}
        aria-pressed={role === "pharmacy"}
        onClick={() => onChange("pharmacy")}
      >
        <Icon name="store" size={16} />
        للصيدلية
      </button>
    </div>
  );
}

function StatusPill({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: "green" | "amber" | "blue";
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function PatientHome({
  onCompose,
  onSearch,
  onPharmacies,
}: {
  onCompose: (mode?: InputMode) => void;
  onSearch: (query: string) => void;
  onPharmacies: () => void;
}) {
  const [query, setQuery] = useState("");

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    onSearch(query.trim() || "Panadol Extra");
  }

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="location-line">
            <Icon name="location" size={16} />
            <span>المنصور، بغداد</span>
            <button type="button">تغيير</button>
          </div>
          <p className="overline">طلب واحد · صيدليات قريبة · عروض مؤكدة</p>
          <h1>
            تحتاج دواء؟
            <span>خلّينا نلقاه.</span>
          </h1>
          <p className="hero-lede">
            اكتب الاسم أو صوّر العلبة. نسأل الصيدليات الموثقة القريبة، وأنت تختار
            العرض الأنسب.
          </p>
          <form className="medicine-search" onSubmit={submitSearch}>
            <Icon name="search" size={22} />
            <label className="sr-only" htmlFor="medicine-query">
              اسم الدواء
            </label>
            <input
              id="medicine-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="مثال: Augmentin 625"
              autoComplete="off"
              dir="auto"
            />
            <button type="submit">ابحث الآن</button>
          </form>
          <button className="request-link" type="button" onClick={() => onCompose("text")}>
            لا تعرف الاسم بالضبط؟ صف ما تبحث عنه للصيدلي
            <Icon name="arrow" size={17} />
          </button>
        </div>

        <div className="hero-signal" aria-label="كيف يعمل دوائي">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="signal-center">
            <Icon name="search" size={27} />
            <strong>طلبك</strong>
            <span>المنصور</span>
          </div>
          <div className="pharmacy-node node-one">
            <span className="node-icon"><Icon name="store" size={17} /></span>
            <strong>متوفر</strong>
            <small>700 م</small>
          </div>
          <div className="pharmacy-node node-two">
            <span className="node-icon"><Icon name="store" size={17} /></span>
            <strong>ردّت الآن</strong>
            <small>1.2 كم</small>
          </div>
          <div className="pharmacy-node node-three">
            <span className="node-icon"><Icon name="store" size={17} /></span>
            <strong>تراجع الطلب</strong>
            <small>900 م</small>
          </div>
          <div className="signal-caption">
            <span className="live-dot" />
            البحث يبدأ ضمن 2 كم
          </div>
        </div>
      </section>

      <section className="input-ways section-block" aria-labelledby="input-title">
        <div className="section-heading">
          <div>
            <p className="overline">أسرع طريق لطلب واضح</p>
            <h2 id="input-title">اختر الطريقة الأسهل لك</h2>
          </div>
          <p>لن نخمن اسم دواء غير واضح. سنطلب منك التأكيد أو يحيله صيدلي للمراجعة.</p>
        </div>
        <div className="way-grid">
          <button type="button" onClick={() => onCompose("scan")}>
            <span className="way-icon coral"><Icon name="camera" size={26} /></span>
            <strong>صوّر الدواء</strong>
            <span>علبة، وصفة، أو ورقة مكتوب عليها الاسم</span>
            <Icon name="chevron" size={20} />
          </button>
          <button type="button" onClick={() => onCompose("upload")}>
            <span className="way-icon blue"><Icon name="upload" size={26} /></span>
            <strong>ارفع صورة</strong>
            <span>اختر صورة محفوظة من هاتفك</span>
            <Icon name="chevron" size={20} />
          </button>
          <button type="button" onClick={() => onCompose("text")}>
            <span className="way-icon green"><Icon name="message" size={26} /></span>
            <strong>اكتب طلبك</strong>
            <span>الاسم، القوة، الكمية، وأي وصف مفيد</span>
            <Icon name="chevron" size={20} />
          </button>
        </div>
      </section>

      <section className="nearby-preview section-block">
        <div className="section-heading compact">
          <div>
            <p className="overline">صيدليات نشطة حولك</p>
            <h2>قريبة منك الآن</h2>
          </div>
          <button className="text-action" type="button" onClick={onPharmacies}>
            عرض الكل <Icon name="arrow" size={17} />
          </button>
        </div>
        <div className="pharmacy-strip">
          {nearbyPharmacies.slice(0, 3).map((pharmacy) => (
            <article key={pharmacy.id} className="nearby-card">
              <div className="pharmacy-avatar"><Icon name="store" size={23} /></div>
              <div>
                <div className="card-title-line">
                  <h3>{pharmacy.name}</h3>
                  <Icon name="shield" size={15} />
                </div>
                <p>{pharmacy.area}</p>
                <div className="fresh-line">
                  <span className="live-dot" />
                  {pharmacy.status}
                </div>
              </div>
              <strong className="distance">{pharmacy.distance}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="promise section-block" aria-label="حدود خدمة دوائي">
        <Icon name="shield" size={26} />
        <div>
          <strong>دوائي يفهم الطلب، ولا يصف العلاج.</strong>
          <span>
            لا نشخّص ولا نختار بديلًا تلقائيًا. الصيدلية المرخّصة تتحقق من الوصفة
            والدواء قبل الصرف.
          </span>
        </div>
      </section>
    </>
  );
}

function RequestComposer({
  initialMode,
  onBack,
  onSubmit,
}: {
  initialMode: InputMode;
  onBack: () => void;
  onSubmit: (medicine: string) => void;
}) {
  const [mode, setMode] = useState<InputMode>(initialMode);
  const [medicine, setMedicine] = useState("Augmentin 625 mg");
  const [quantity, setQuantity] = useState("1");
  const [timing, setTiming] = useState("now");
  const [fileName, setFileName] = useState("");

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setFileName(event.target.files?.[0]?.name ?? "");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode !== "text" && !medicine) setMedicine("دواء من الصورة — ينتظر التأكيد");
    onSubmit(medicine || "دواء من الصورة — ينتظر التأكيد");
  }

  return (
    <section className="flow-shell compose-screen">
      <button className="back-button" type="button" onClick={onBack}>
        <Icon name="arrow" size={18} />
        الرئيسية
      </button>
      <div className="flow-heading">
        <p className="overline">طلب جديد</p>
        <h1>أخبرنا ما الدواء الذي تحتاجه</h1>
        <p>يكفي أن تعطينا ما تعرفه. لن نحوّل الوصف الغامض إلى دواء بالتخمين.</p>
      </div>

      <form onSubmit={submit} className="request-form">
        <div className="mode-tabs" role="tablist" aria-label="طريقة إنشاء الطلب">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "text"}
            className={mode === "text" ? "active" : ""}
            onClick={() => setMode("text")}
          >
            <Icon name="message" size={19} /> كتابة
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "scan"}
            className={mode === "scan" ? "active" : ""}
            onClick={() => setMode("scan")}
          >
            <Icon name="camera" size={19} /> تصوير
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            className={mode === "upload" ? "active" : ""}
            onClick={() => setMode("upload")}
          >
            <Icon name="upload" size={19} /> رفع
          </button>
        </div>

        {mode === "text" ? (
          <label className="form-field">
            <span>اسم الدواء أو وصف ما تحتاجه</span>
            <textarea
              value={medicine}
              onChange={(event) => setMedicine(event.target.value)}
              placeholder="مثال: Augmentin 625، علبة واحدة"
              autoFocus
              dir="auto"
              required
            />
            <small>الأفضل إضافة القوة والشكل إن كنت تعرفهما.</small>
          </label>
        ) : (
          <label className="upload-zone">
            <input type="file" accept="image/*" capture={mode === "scan" ? "environment" : undefined} onChange={handleFile} />
            <span className="upload-illustration"><Icon name={mode === "scan" ? "camera" : "upload"} size={32} /></span>
            <strong>{fileName || (mode === "scan" ? "التقط صورة واضحة" : "اختر صورة من الهاتف")}</strong>
            <span>العلبة كاملة أو الوصفة مع إخفاء أي معلومات لا تريد مشاركتها</span>
          </label>
        )}

        <div className="form-row">
          <label className="form-field">
            <span>الكمية</span>
            <select value={quantity} onChange={(event) => setQuantity(event.target.value)}>
              <option value="1">علبة واحدة</option>
              <option value="2">علبتان</option>
              <option value="3">3 علب</option>
              <option value="unknown">يحددها الصيدلي</option>
            </select>
          </label>
          <label className="form-field">
            <span>متى تحتاجه؟</span>
            <select value={timing} onChange={(event) => setTiming(event.target.value)}>
              <option value="now">الآن</option>
              <option value="today">اليوم</option>
              <option value="tomorrow">غدًا</option>
            </select>
          </label>
        </div>

        <div className="request-summary">
          <div><Icon name="location" size={18} /><span>المنصور، بغداد</span></div>
          <div><Icon name="clock" size={18} /><span>الطلب نشط لمدة 20 دقيقة</span></div>
          <button type="button">تعديل الموقع</button>
        </div>

        <div className="safety-note">
          <Icon name="shield" size={21} />
          <p>
            صورة الوصفة للمراجعة فقط. الصيدلي يتحقق من صحتها قبل الصرف، ولا تُرسل
            إلى الصيدليات إلا عند الحاجة وبعد موافقتك.
          </p>
        </div>

        <button className="primary-cta" type="submit">
          ابحث في الصيدليات القريبة
          <Icon name="arrow" size={19} />
        </button>
      </form>
    </section>
  );
}

function MatchingScreen({
  medicine,
  onCancel,
  onResults,
}: {
  medicine: string;
  onCancel: () => void;
  onResults: () => void;
}) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase(1), 650),
      window.setTimeout(() => setPhase(2), 1300),
      window.setTimeout(() => setPhase(3), 1950),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return (
    <section className="matching-screen">
      <div className="matching-radar" aria-hidden="true">
        <div className="radar-ring ring-1" />
        <div className="radar-ring ring-2" />
        <div className="radar-ring ring-3" />
        <div className="radar-sweep" />
        <span className="radar-home"><Icon name="location" size={23} /></span>
        <span className="radar-dot dot-a" />
        <span className="radar-dot dot-b" />
        <span className="radar-dot dot-c" />
      </div>
      <p className="overline">طلب رقم <span dir="ltr">DW-2841</span></p>
      <h1>{phase < 3 ? "نبحث عن دوائك الآن…" : "وصلت أول العروض"}</h1>
      <p className="matching-medicine" dir="auto">{medicine}</p>

      <div className="search-progress" aria-live="polite">
        <div className={phase >= 0 ? "done" : ""}>
          <span><Icon name="check" size={16} /></span>
          <p><strong>فهمنا الطلب</strong><small>تم تثبيت الاسم والقوة والكمية</small></p>
        </div>
        <div className={phase >= 1 ? "done" : ""}>
          <span>{phase >= 1 ? <Icon name="check" size={16} /> : "2"}</span>
          <p><strong>حددنا النطاق الأول</strong><small>صيدليات موثقة ضمن 2 كم</small></p>
        </div>
        <div className={phase >= 2 ? "done" : ""}>
          <span>{phase >= 2 ? <Icon name="check" size={16} /> : "3"}</span>
          <p><strong>أرسلنا إلى 6 صيدليات</strong><small>المفتوحة والأسرع استجابة أولًا</small></p>
        </div>
        <div className={phase >= 3 ? "done current" : "current"}>
          <span>{phase >= 3 ? "3" : "…"}</span>
          <p><strong>{phase >= 3 ? "3 عروض وصلت" : "ننتظر الردود"}</strong><small>سنُعلمك عند وصول كل عرض</small></p>
        </div>
      </div>

      <div className="matching-meta">
        <span><Icon name="clock" size={17} /> ينتهي الطلب خلال <b dir="ltr">18:42</b></span>
        <span><Icon name="bell" size={17} /> الإشعارات مفعّلة</span>
      </div>
      <div className="matching-actions">
        <button type="button" className="primary-cta" onClick={onResults} disabled={phase < 2}>
          {phase >= 3 ? "عرض العروض الثلاثة" : "عرض الردود المتاحة"}
        </button>
        <button type="button" className="quiet-button" onClick={onCancel}>إلغاء الطلب</button>
      </div>
    </section>
  );
}

function OfferCard({
  offer,
  featured,
  onReserve,
}: {
  offer: Offer;
  featured?: boolean;
  onReserve: (offer: Offer) => void;
}) {
  return (
    <article className={`offer-card ${featured ? "featured" : ""}`}>
      {featured ? <span className="best-label"><Icon name="spark" size={14} /> أفضل توازن</span> : null}
      <div className="offer-top">
        <div className="pharmacy-avatar"><Icon name="store" size={23} /></div>
        <div>
          <div className="card-title-line">
            <h2>{offer.pharmacy}</h2>
            <Icon name="shield" size={16} />
          </div>
          <p>{offer.district} · {offer.distance}</p>
        </div>
        <StatusPill tone={offer.kind === "available" ? "green" : "amber"}>
          {offer.kind === "available" ? "متوفر" : "بديل للمراجعة"}
        </StatusPill>
      </div>
      <div className="offer-evidence">
        <span><span className="live-dot" /> {offer.confirmedAgo}</span>
        <span>{offer.reliability}</span>
      </div>
      {offer.note ? <p className="alternative-note">{offer.note}</p> : null}
      <div className="offer-details">
        <div>
          <small>السعر الذي أرسلته الصيدلية</small>
          <strong>{offer.price ? formatIqd(offer.price) : "بعد مراجعة الصيدلي"}</strong>
        </div>
        <div>
          <small>الجاهزية</small>
          <strong>{offer.ready}</strong>
        </div>
        <div>
          <small>طريقة الاستلام</small>
          <strong>{offer.fulfillment}</strong>
        </div>
      </div>
      <div className="offer-actions">
        <button type="button" className="primary-cta" onClick={() => onReserve(offer)}>
          {offer.kind === "available" ? "احجز للاستلام" : "اسأل الصيدلي"}
        </button>
        <button type="button" className="icon-button" aria-label={`اتصال بـ ${offer.pharmacy}`}>
          <Icon name="phone" size={19} />
        </button>
        <button type="button" className="icon-button" aria-label={`اتجاهات ${offer.pharmacy}`}>
          <Icon name="directions" size={19} />
        </button>
      </div>
    </article>
  );
}

function OffersScreen({
  medicine,
  onBack,
  onReserve,
}: {
  medicine: string;
  onBack: () => void;
  onReserve: (offer: Offer) => void;
}) {
  const [sort, setSort] = useState("recommended");
  const sortedOffers = useMemo(() => {
    if (sort === "price") {
      return [...offers].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    }
    return offers;
  }, [sort]);

  return (
    <section className="flow-shell offers-screen">
      <button className="back-button" type="button" onClick={onBack}>
        <Icon name="arrow" size={18} /> حالة الطلب
      </button>
      <div className="results-heading">
        <div>
          <StatusPill><Icon name="check" size={14} /> 3 صيدليات ردّت</StatusPill>
          <h1>وجدنا خيارات قريبة</h1>
          <p dir="auto">{medicine} · علبة واحدة</p>
        </div>
        <div className="request-clock">
          <span>الطلب نشط</span>
          <strong dir="ltr">18:21</strong>
        </div>
      </div>

      <div className="result-tools">
        <p>الأسعار والتوفر أكدتها الصيدليات في الوقت الموضح.</p>
        <label>
          <Icon name="filter" size={17} />
          <span className="sr-only">ترتيب النتائج</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="recommended">الأنسب لك</option>
            <option value="price">الأقل سعرًا</option>
          </select>
        </label>
      </div>

      <div className="offer-list">
        {sortedOffers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            featured={offer.id === "al-rawabi" && sort === "recommended"}
            onReserve={onReserve}
          />
        ))}
      </div>

      <div className="expand-card">
        <div><Icon name="location" size={22} /><p><strong>تريد خيارات أكثر؟</strong><span>يمكن توسيع البحث من 2 كم إلى 5 كم.</span></p></div>
        <button type="button">وسّع النطاق</button>
      </div>
    </section>
  );
}

function ReservedScreen({
  offer,
  medicine,
  onHome,
}: {
  offer: Offer;
  medicine: string;
  onHome: () => void;
}) {
  return (
    <section className="reserved-screen flow-shell">
      <div className="success-seal"><Icon name="check" size={34} /></div>
      <p className="overline">تم الحجز بنجاح</p>
      <h1>دواؤك محفوظ مؤقتًا</h1>
      <p>توجه إلى الصيدلية قبل انتهاء الوقت، وخذ الوصفة الأصلية إن كانت مطلوبة.</p>

      <div className="reservation-ticket">
        <div className="ticket-header">
          <span>رقم الحجز</span>
          <strong dir="ltr">DW-4817</strong>
        </div>
        <div className="ticket-medicine">
          <small>الدواء</small>
          <strong dir="auto">{medicine}</strong>
          <span>علبة واحدة</span>
        </div>
        <div className="ticket-grid">
          <div><small>الصيدلية</small><strong>{offer.pharmacy}</strong></div>
          <div><small>السعر المؤكد</small><strong>{offer.price ? formatIqd(offer.price) : "بعد المراجعة"}</strong></div>
          <div><small>المسافة</small><strong>{offer.distance}</strong></div>
          <div><small>الجاهزية</small><strong>{offer.ready}</strong></div>
        </div>
        <div className="ticket-timer">
          <Icon name="clock" size={20} />
          <span>الحجز ينتهي خلال</span>
          <strong dir="ltr">14:53</strong>
        </div>
      </div>

      <div className="reservation-actions">
        <button type="button" className="primary-cta"><Icon name="directions" size={19} /> فتح الاتجاهات</button>
        <button type="button" className="secondary-cta"><Icon name="phone" size={19} /> اتصال بالصيدلية</button>
      </div>
      <button type="button" className="quiet-button" onClick={onHome}>العودة إلى الرئيسية</button>
    </section>
  );
}

function DirectSearchScreen({
  query,
  onBack,
  onRequest,
}: {
  query: string;
  onBack: () => void;
  onRequest: () => void;
}) {
  return (
    <section className="flow-shell direct-results">
      <button className="back-button" type="button" onClick={onBack}><Icon name="arrow" size={18} /> الرئيسية</button>
      <div className="flow-heading">
        <p className="overline">بحث مباشر · بدون إرسال طلب</p>
        <h1>نتائج قريبة لـ <span dir="auto">“{query}”</span></h1>
        <p>هذه إشارات مخزون حديثة وليست حجزًا. اتصل أو أرسل طلبًا لتحصل على تأكيد.</p>
      </div>
      <div className="search-result-list">
        {nearbyPharmacies.slice(0, 2).map((pharmacy, index) => (
          <article key={pharmacy.id} className="search-result-card">
            <div className="pharmacy-avatar"><Icon name="store" size={23} /></div>
            <div>
              <div className="card-title-line"><h2>{pharmacy.name}</h2><Icon name="shield" size={16} /></div>
              <p>{pharmacy.area} · {pharmacy.distance}</p>
              <span className="stock-signal"><span className="live-dot" /> شوهد متوفرًا {index ? "قبل 18 دقيقة" : "قبل 4 دقائق"}</span>
            </div>
            <strong>{index ? formatIqd(5_500) : formatIqd(5_250)}</strong>
            <button type="button" className="secondary-cta">اتصال للتأكد</button>
          </article>
        ))}
      </div>
      <div className="request-conversion">
        <Icon name="bell" size={24} />
        <div><strong>تريد تأكيدًا من الصيدليات؟</strong><span>أرسل طلبًا واحدًا ودع الصيدليات القريبة ترد عليك.</span></div>
        <button type="button" className="primary-cta" onClick={onRequest}>أنشئ طلبًا</button>
      </div>
    </section>
  );
}

function PharmaciesScreen({ onBack }: { onBack: () => void }) {
  const [display, setDisplay] = useState<PharmacyDisplay>("list");

  return (
    <section className="flow-shell pharmacies-screen">
      <button className="back-button" type="button" onClick={onBack}><Icon name="arrow" size={18} /> الرئيسية</button>
      <div className="results-heading">
        <div>
          <p className="overline">دليل الصيدليات</p>
          <h1>صيدليات قريبة منك</h1>
          <p><Icon name="location" size={15} /> المنصور، بغداد · ضمن 3 كم</p>
        </div>
        <div className="display-switch" aria-label="طريقة العرض">
          <button type="button" className={display === "list" ? "active" : ""} onClick={() => setDisplay("list")}><Icon name="list" size={18} /> قائمة</button>
          <button type="button" className={display === "map" ? "active" : ""} onClick={() => setDisplay("map")}><Icon name="map" size={18} /> خريطة</button>
        </div>
      </div>

      {display === "map" ? (
        <div className="map-panel" aria-label="خريطة توضيحية للصيدليات القريبة">
          <div className="road road-a" /><div className="road road-b" /><div className="road road-c" />
          <span className="map-home"><Icon name="location" size={20} /></span>
          {nearbyPharmacies.map((pharmacy, index) => (
            <button
              type="button"
              key={pharmacy.id}
              className="map-pin"
              style={{ "--x": `${pharmacy.x}%`, "--y": `${pharmacy.y}%` } as React.CSSProperties}
              aria-label={`${pharmacy.name}، ${pharmacy.distance}`}
            >
              <Icon name="store" size={17} /><span>{index + 1}</span>
            </button>
          ))}
          <div className="map-key"><span className="live-dot" /> بيانات خريطة تجريبية</div>
        </div>
      ) : null}

      <div className="pharmacy-directory">
        {nearbyPharmacies.map((pharmacy, index) => (
          <article className="directory-card" key={pharmacy.id}>
            <span className="directory-index">{index + 1}</span>
            <div className="pharmacy-avatar"><Icon name="store" size={22} /></div>
            <div className="directory-main">
              <div className="card-title-line"><h2>{pharmacy.name}</h2><Icon name="shield" size={16} /></div>
              <p>{pharmacy.area}</p>
              <div className="service-tags">{pharmacy.services.map((service) => <span key={service}>{service}</span>)}</div>
              <div className="fresh-line"><span className="live-dot" /> {pharmacy.status} · {pharmacy.fresh}</div>
            </div>
            <strong className="distance">{pharmacy.distance}</strong>
            <div className="directory-actions">
              <button type="button" aria-label={`اتصال بـ ${pharmacy.name}`}><Icon name="phone" size={18} /></button>
              <button type="button" aria-label={`اتجاهات ${pharmacy.name}`}><Icon name="directions" size={18} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PharmacyInbox({ onRespond }: { onRespond: () => void }) {
  return (
    <section className="pharmacy-shell">
      <div className="pharmacy-hero">
        <div>
          <p className="overline">وضع الصيدلية</p>
          <h1>مرحبًا، صيدلية الروابي</h1>
          <p><span className="live-dot" /> متصلة وتستقبل طلبات ضمن 3 كم</p>
        </div>
        <div className="pharmacy-stat">
          <span>طلبات اليوم</span><strong>17</strong><small>11 تم تلبيتها</small>
        </div>
      </div>

      <div className="pharmacy-metrics">
        <div><span>معدل الاستجابة</span><strong dir="ltr">92%</strong><small>آخر 30 يومًا</small></div>
        <div><span>متوسط الرد</span><strong>2:48 د</strong><small>أسرع من 81% من الصيدليات</small></div>
        <div><span>الحجوزات الناجحة</span><strong dir="ltr">94%</strong><small>بلا تقييمات علنية</small></div>
      </div>

      <div className="inbox-heading">
        <div><p className="overline">طلبات مطابقة وقريبة</p><h2>بانتظار ردّك</h2></div>
        <span>طلبان جديدان</span>
      </div>
      <div className="request-list">
        {pharmacyRequests.map((request, index) => (
          <article className={`pharmacy-request ${index === 0 ? "new" : ""}`} key={request.id}>
            <div className="request-clock-line">
              <StatusPill tone={index === 0 ? "blue" : "amber"}>{request.match}</StatusPill>
              <span><Icon name="clock" size={15} /><b dir="ltr">{request.timer}</b> للرد السريع</span>
            </div>
            <div className="request-body">
              <div>
                <small>{request.id} · {request.age}</small>
                <h3 dir="auto">{request.medicine}</h3>
                <p>{request.detail}</p>
              </div>
              <div className="request-distance"><strong>{request.distance}</strong><span>{request.area}</span></div>
            </div>
            <div className="request-flags">
              <span><Icon name="prescription" size={17} /> {request.prescription}</span>
              <span><Icon name="clock" size={17} /> {request.urgency}</span>
            </div>
            <div className="pharmacy-response-actions">
              <button type="button" className="available-button" onClick={onRespond}><Icon name="check" size={18} /> متوفر — أرسل عرضًا</button>
              <button type="button" className="not-available-button">غير متوفر</button>
            </div>
          </article>
        ))}
      </div>
      <div className="pharmacy-privacy">
        <Icon name="shield" size={20} />
        <p><strong>بيانات المريض محمية.</strong><span>يظهر الحي وطلب الدواء فقط. لا تُفتح الوصفة أو وسيلة التواصل إلا بعد اختيار عرضك وبصلاحية محدودة.</span></p>
      </div>
    </section>
  );
}

function PharmacyRespond({
  onBack,
  onSubmit,
}: {
  onBack: () => void;
  onSubmit: () => void;
}) {
  const [price, setPrice] = useState("12000");
  const [fulfillment, setFulfillment] = useState("pickup");

  return (
    <section className="flow-shell pharmacy-offer-form">
      <button className="back-button" type="button" onClick={onBack}><Icon name="arrow" size={18} /> الطلبات</button>
      <div className="flow-heading">
        <p className="overline">إنشاء عرض · <span dir="ltr">REQ-2841</span></p>
        <h1>أكّد ما يمكنك توفيره</h1>
        <p>لا ترسل العرض إلا إذا كان المنتج موجودًا ويمكن حفظه للمريض خلال مدة الحجز.</p>
      </div>
      <div className="medicine-identity">
        <Icon name="prescription" size={24} />
        <div><strong dir="ltr">Augmentin 625 mg</strong><span>أقراص · علبة واحدة · الوصفة موجودة</span></div>
        <StatusPill>مطابقة الطلب</StatusPill>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="form-row">
          <label className="form-field">
            <span>السعر الكلي بالدينار</span>
            <input dir="ltr" inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} required />
          </label>
          <label className="form-field">
            <span>وقت التجهيز</span>
            <select defaultValue="10"><option value="now">جاهز الآن</option><option value="10">خلال 10 دقائق</option><option value="20">خلال 20 دقيقة</option></select>
          </label>
        </div>
        <fieldset className="fulfillment-options">
          <legend>طريقة الاستلام</legend>
          <label className={fulfillment === "pickup" ? "selected" : ""}>
            <input type="radio" name="fulfillment" checked={fulfillment === "pickup"} onChange={() => setFulfillment("pickup")} />
            <Icon name="store" size={21} /><span><strong>استلام</strong><small>من الصيدلية</small></span>
          </label>
          <label className={fulfillment === "delivery" ? "selected" : ""}>
            <input type="radio" name="fulfillment" checked={fulfillment === "delivery"} onChange={() => setFulfillment("delivery")} />
            <Icon name="directions" size={21} /><span><strong>توصيل</strong><small>تجريبي داخل المنطقة</small></span>
          </label>
        </fieldset>
        <label className="form-field">
          <span>ملاحظة للمريض (اختيارية)</span>
          <textarea placeholder="مثال: أحضر الوصفة الأصلية عند الاستلام." />
        </label>
        <label className="confirmation-check">
          <input type="checkbox" required />
          <span><Icon name="check" size={15} /></span>
          أؤكد أن المنتج مطابق ومتوفر الآن وسأحفظ علبة واحدة لمدة 15 دقيقة بعد اختيار العرض.
        </label>
        <button className="primary-cta" type="submit">إرسال العرض للمريض <Icon name="arrow" size={18} /></button>
      </form>
    </section>
  );
}

function PharmacySent({ onInbox }: { onInbox: () => void }) {
  return (
    <section className="matching-screen pharmacy-sent">
      <div className="success-seal"><Icon name="check" size={34} /></div>
      <p className="overline">أُرسل العرض</p>
      <h1>المريض يرى عرضك الآن</h1>
      <p>لم يبدأ الحجز بعد. سنبلغك فور اختيار المريض، وعندها يبدأ عدّاد الحفظ لمدة 15 دقيقة.</p>
      <div className="sent-summary">
        <div><span>الطلب</span><strong dir="ltr">Augmentin 625 mg</strong></div>
        <div><span>السعر</span><strong>{formatIqd(12_000)}</strong></div>
        <div><span>التجهيز</span><strong>خلال 10 دقائق</strong></div>
      </div>
      <button type="button" className="primary-cta" onClick={onInbox}>العودة إلى الطلبات</button>
    </section>
  );
}

export default function App() {
  const [role, setRole] = useState<Role>("patient");
  const [patientView, setPatientView] = useState<PatientView>("home");
  const [pharmacyView, setPharmacyView] = useState<PharmacyView>("inbox");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [medicine, setMedicine] = useState("Augmentin 625 mg");
  const [query, setQuery] = useState("");
  const [reservedOffer, setReservedOffer] = useState<Offer | null>(null);

  function goHome() {
    setPatientView("home");
    setReservedOffer(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeRole(nextRole: Role) {
    setRole(nextRole);
    if (nextRole === "patient") setPatientView("home");
    else setPharmacyView("inbox");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function compose(mode: InputMode = "text") {
    setInputMode(mode);
    setPatientView("compose");
    window.scrollTo({ top: 0 });
  }

  let content: React.ReactNode;
  if (role === "pharmacy") {
    if (pharmacyView === "respond") {
      content = <PharmacyRespond onBack={() => setPharmacyView("inbox")} onSubmit={() => setPharmacyView("sent")} />;
    } else if (pharmacyView === "sent") {
      content = <PharmacySent onInbox={() => setPharmacyView("inbox")} />;
    } else {
      content = <PharmacyInbox onRespond={() => setPharmacyView("respond")} />;
    }
  } else if (patientView === "compose") {
    content = <RequestComposer initialMode={inputMode} onBack={goHome} onSubmit={(nextMedicine) => { setMedicine(nextMedicine); setPatientView("matching"); }} />;
  } else if (patientView === "matching") {
    content = <MatchingScreen medicine={medicine} onCancel={goHome} onResults={() => setPatientView("offers")} />;
  } else if (patientView === "offers") {
    content = <OffersScreen medicine={medicine} onBack={() => setPatientView("matching")} onReserve={(offer) => { setReservedOffer(offer); setPatientView("reserved"); }} />;
  } else if (patientView === "reserved" && reservedOffer) {
    content = <ReservedScreen offer={reservedOffer} medicine={medicine} onHome={goHome} />;
  } else if (patientView === "search") {
    content = <DirectSearchScreen query={query} onBack={goHome} onRequest={() => compose("text")} />;
  } else if (patientView === "pharmacies") {
    content = <PharmaciesScreen onBack={goHome} />;
  } else {
    content = <PatientHome onCompose={compose} onSearch={(nextQuery) => { setQuery(nextQuery); setPatientView("search"); }} onPharmacies={() => setPatientView("pharmacies")} />;
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">انتقل إلى المحتوى</a>
      <header className="site-header">
        <Logo />
        <div className="header-actions">
          {role === "patient" ? (
            <button className="header-location" type="button">
              <Icon name="location" size={17} />
              <span>المنصور</span>
              <Icon name="chevron" size={14} />
            </button>
          ) : (
            <span className="pharmacy-online"><span className="live-dot" /> الصيدلية متصلة</span>
          )}
          <RoleSwitch role={role} onChange={changeRole} />
        </div>
      </header>
      <DemoNotice />
      <main id="main-content">{content}</main>
      <footer className="site-footer">
        <Logo />
        <p>طبقة مطابقة بين حاجة المريض وعرض الصيدلية — وليست جهة تشخيص أو صرف.</p>
        <span>دوائي · نموذج منتج مستقل · بغداد 2026</span>
      </footer>
    </div>
  );
}
