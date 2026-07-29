/* ============================================================
   قريب · الاكتشاف — HOME · ROLES · DOCTOR · PHARMACY · MEDICINE · EXPLORER
   ============================================================
   Split out of one 5890-line js/app.js. These are CLASSIC SCRIPTS loaded in
   sequence, not modules: every top-level const, let and function still shares
   one global lexical scope, so the files see each other exactly as the single
   file's sections did. The ORDER in index.html is therefore load-bearing and
   is the original order of the file — changing it reintroduces the temporal
   dead zone that a single script's function hoisting used to hide.

   Nothing here was rewritten. The cut points are the section comments that
   were already in the file; the code between them is byte-identical.
   ============================================================ */

/* ---------------- SCREENS ---------------- */
/* ---------------- v3 · HOME · 4d ----------------
   The case opens on the one number that matters. There is no search bar
   competing with it: a search field is a question the product asks the user,
   and the home screen's job is to answer one first.

   Which number? Open pharmacies. Not doctors — a doctor is needed a few times
   a year and the answer is rarely "right now". A pharmacy at 02:40 is the
   thing a tired parent is actually holding a phone for.
------------------------------------------------------------- */
function screenHome() {
  if (S.role === "pharmacist") return screenHomePharmacist();
  if (S.role === "doctor") return screenHomeDoctor();
  return screenHomePatient();
}

function screenHomePatient() {
  /* The local directory (doctors, open-now pharmacies, districts) covers
     Baghdad. A patient whose governorate is set elsewhere must not be handed
     Baghdad's numbers as if they were theirs — "5 pharmacies open now" is a
     lie in Basra. They get the national reading instead, with the coverage
     boundary stated in words rather than discovered by disappointment. */
  if ((S.exCity || "baghdad") !== "baghdad") return screenHomeAway();
  const docsOpen = docsOpenNow(), phOpen = phOpenNow(), night = phNight();
  const freshMeds = MEDICINES.filter((m) => m.stock.some((st) => freshBand(freshMins(st)) !== "cold")).length;
  const scarce = MEDICINES.filter((m) => !m.stock.some((st) => freshBand(freshMins(st)) !== "cold"));
  const nearby = [
    ...pharmaciesNear({ openOnly: true }).slice(0, 2).map((x) => pharmacyCard(x)),
    ...doctorsFor({ radius: 25 }).list.slice(0, 2).map((x) => doctorCard(x)),
  ];

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(28px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <a class="b-g" style="font-size:12.5px" href="#/me">${isAR() ? "طلباتي" : "My requests"}</a>
    </div>

    <!-- Everything under this line is answered FOR a district: which pharmacies
         are open, how far, who is on night duty. It was styled as a caption
         with min-height:0 — 67×15.8 measured, no icon, no affordance — so the
         one control that changes every answer below read as a timestamp.
         It is a control now, and the pin says which kind. -->
    <button class="lab" style="margin-top:26px;display:flex;align-items:center;gap:7px;text-align:start;min-height:44px;width:auto"
      onclick="openLocation()">${icon("pin")}${esc(L(here()))} · <span class="num">${fmtT(nowMins())}</span></button>

    <div class="nhuge" style="color:var(--brass-ink);margin-top:12px">${phOpen}</div>
    <div class="d2" style="margin-top:6px;font-weight:500">${isAR() ? countAr(phOpen, AR_PHARM_OPEN) : phOpen === 1 ? "pharmacy open now" : "pharmacies open now"}</div>
    <div class="q-sub" style="margin-top:6px">${night
      ? (isAR() ? `منها <span class="num">${night}</span> خفارة ليلية تعمل حتى الفجر.`
                : `<span class="num">${night}</span> of them on night duty until dawn.`)
      : (isAR() ? `و<span class="num">${docsOpen}</span> طبيب يستقبل الآن.`
                : `and <span class="num">${docsOpen}</span> doctors seeing patients now.`)}</div>

    <div style="margin:26px 0 6px">${ticks()}</div>
    ${axis24()}
  </section>

  <section class="pad" style="margin-top:26px"><div class="v2">
    <button class="btn" onclick="location.hash='#/search'">${isAR() ? "شنو تحتاج؟ — ابدأ من هنا" : "What do you need? Start here"}</button>
    <div style="display:flex;gap:8px">
      <a class="btn btn--2" style="flex:1;min-height:46px;font-size:13.5px" href="#/rx">${isAR() ? "دوا معيّن" : "A medicine"}</a>
      <a class="btn btn--2" style="flex:1;min-height:46px;font-size:13.5px" href="#/needs">${isAR() ? "دكتور" : "A doctor"}</a>
      <a class="btn btn--2" style="flex:1;min-height:46px;font-size:13.5px" href="#/care">${isAR() ? "العناية" : "Care"}</a>
    </div>
  </div></section>

  ${(() => {
    const live = myActiveNeeds();
    if (live.length) {
      const r = live[0];
      const md = needMedOf(r);
      const reach = radarReach(r);
      const answered = (r.resp || []).length;
      return `<section class="pad" style="margin-top:26px">
        <a class="rw" href="#/${reqState(r) === "broadcasting" ? "wait" : "need"}/${esc(r.id)}">
          <span class="rw-lead" style="background:var(--jade)"></span>
          <span class="grow">
            <span class="rowb">
              <span class="d3">${md ? esc(md.name) : (isAR() ? "طلبك" : "Your request")}</span>
              <span class="st ${answered ? "st-v" : "st-t"}"><i class="dot${answered ? "" : " dot-live"}"></i>${
                answered ? (isAR() ? countAr(answered, ["ردّت صيدلية", "ردّت صيدليتان", "ردّت صيدليات", "ردّت صيدلية"])
                                   : `${answered} replied`)
                         : (isAR() ? "ينتظر ردّاً" : "waiting")}</span>
            </span>
            <span class="q-sub" style="display:block">${answered
              ? (isAR() ? "افتح الطلب وشوف منو ردّ." : "Open it and see who replied.")
              : (isAR() ? `ظاهر لـ <span class="num">${reach.n}</span> صيدلية موثّقة.`
                        : `Visible to <span class="num">${reach.n}</span> verified pharmacies.`)}</span>
          </span>
        </a>
        ${live.length > 1 ? `<a class="t3" href="#/me" style="display:block;margin-top:10px">${isAR()
          ? `و${countAr(live.length - 1, ["طلب آخر", "طلبان آخران", "طلبات أخرى", "طلباً آخر"])}`
          : `and ${live.length - 1} more`}</a>` : ""}
      </section>`;
    }
    /* No live request: state the capability instead of hiding it behind a
       search that only finds what is already catalogued. */
    return `<section class="pad" style="margin-top:26px">
      <a class="rw" href="#/need/new">
        <span class="rw-lead" style="background:var(--brass)"></span>
        <span class="grow">
          <span class="rowb">
            <span class="d3">${isAR() ? "دواء ما لكيته؟" : "Can't find a medicine?"}</span>
            <span class="b-g" style="font-size:12px">${isAR() ? "اطلبه" : "Request it"}</span>
          </span>
          <span class="q-sub" style="display:block">${isAR()
            ? "اكتب اسمه وتركيزه ومنطقتك — يوصل للصيدليات الموثّقة، والردود تجيك هنا."
            : "Name, strength and your area — it reaches verified pharmacies, and replies land here."}</span>
        </span>
      </a>
    </section>`;
  })()}

  ${scarce.length ? `<section class="pad" style="margin-top:26px">
    <a class="note note-w" href="#/med/${scarce[0].id}">
      <span>${isAR()
        ? `<b>${countAr(scarce.length, ["دواء واحد", "دواءان", "أدوية", "دواءً"])}</b> بلا توفّر مؤكَّد في بغداد الآن — أوّلها «${esc(L(scarce[0]))}».`
        : `<b class="num">${scarce.length}</b> medicines have no confirmed stock in Baghdad — starting with ${esc(L(scarce[0]))}.`}</span>
    </a></section>` : ""}

  <div class="hr" style="margin:30px 0 0"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "يعمل الآن قربك" : "Open near you"}</div>
    ${nearby.join('<div class="hr"></div>')}
  </section>

  <section class="pad" style="margin-top:22px">
    <!-- The two highest-stakes taps in the product, and until the audit
         measured them the pair was built out of text styles: the number was
         27.1×31.4 and the button 27.8 tall, because .st is a typographic
         class and the inline padding:0 removed what little box it had.
         Someone reaching for this is not aiming carefully. Both are controls
         now, and the number is last in the row so a thumb finds it first. -->
    <div class="rowb" style="border-top:1px solid var(--dial-line);padding-top:8px">
      <button class="b-g st-e" onclick="openEmergency()" style="justify-content:flex-start"><i class="dot"></i>${isAR() ? "طوارئ — أقرب إسعاف" : "Emergency — nearest care"}</button>
      <a class="b-g" style="font-size:17px;color:var(--alarm);padding-inline:10px" href="tel:${CONFIG.emergency.unified}">${CONFIG.emergency.unified}</a>
    </div>
  </section>

  <section class="pad" style="margin-top:22px;padding-bottom:26px">
    <a class="rowb" href="#/trust">
      <span class="t3">${isAR()
        ? `<span class="num">${DOCTORS.filter((d) => d.verified).length}</span> موثّق · <span class="num">${freshMeds}</span> دواء مؤكَّد · <span class="num">${DISTRICTS.length}</span> منطقة`
        : `<span class="num">${DOCTORS.filter((d) => d.verified).length}</span> verified · <span class="num">${freshMeds}</span> confirmed · <span class="num">${DISTRICTS.length}</span> areas`}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "كيف نتحقق" : "How we verify"}</span>
    </a>
    <div class="t3" style="margin-top:12px;opacity:.62">${isAR() ? "النسخة" : "Build"}
      <span class="num" id="buildstamp">${esc(buildLabel())}</span></div>
  </section>
  ${nav("home")}`;
}

/* ---------------- role home · pharmacist ----------------
   The case opens on the demand this branch could answer — not on patient
   discovery, which a pharmacist standing behind a counter does not need. */
/* Home for a patient outside Baghdad: the case opens on what the network
   can truthfully do for them — the availability field across Iraq — and
   says plainly where the local layer stops. */
/* ---------------- THE COVERAGE BOUNDARY ----------------

   `screenHomePatient` has always guarded this correctly: a patient whose
   governorate is not Baghdad gets the national reading and is told where the
   local layer stops. The guard existed on the home screen and NOWHERE ELSE.

   Measured: with the governorate set to Erbil, Kirkuk or Muthanna, the home
   screen honestly showed zero local cards — and the bottom tab bar, present
   on every screen in the product, routed straight past it to fourteen
   Baghdad pharmacies, nine Baghdad doctors and thirteen Baghdad hospitals,
   with distances computed from a Baghdad district the user never picked. The
   most honest screen in the app was one tap from the least.

   So the boundary lives here, in one function, and every directory screen
   asks it the same question. What the answer is NOT: a wall. Nine
   governorates have verified pharmacies in `BRANCHES` — real hours, real
   phone, real services — which no screen had ever been able to reach. Being
   out of the Baghdad directory is not the same as us having nothing, and
   saying "not available" over data we hold would be its own dishonesty. */

const inLocalCoverage = () => (S.exCity || "baghdad") === "baghdad";

/* Everything we hold in a governorate, Baghdad excluded — these are the
   records the local directory never reads. */
const facilitiesInCity = (city, type) => allPharmacies()
  .filter((f) => cityOf(f) === city && f.city && (!type || f.type === type));

/* One shape for every out-of-coverage screen so the three of them cannot
   drift into three different explanations of the same fact.
     `have`  — rows we can honestly show, or [] when there are none
     `title` — what the user asked for, in their words
     `body`  — the rows
   Escapes are constant: change governorate, go national, or say you are in
   Baghdad after all. Never a dead end, and never a bare "nothing found". */
function outOfCoverage({ title, kind, have, body }) {
  const c = cityById(S.exCity);
  return `${header({ back: true, title })}
  <section class="wrap" style="padding-top:16px">
    ${have ? `<div class="note">${icon("info")}<div>${isAR()
        ? `هذا كل اللي متأكدين منه في ${esc(cityName(c))}. دليل «المفتوح الآن» الكامل — بالمسافات والمواعيد — يغطي بغداد لحد الآن.`
        : `This is everything we have confirmed in ${esc(cityName(c))}. The full open-now directory, with distances and hours, covers Baghdad so far.`}</div></div>`
      : `<div class="note note-w">${icon("pin")}<div><b>${isAR()
        ? `ما عدنا ${esc(kind)} في ${esc(cityName(c))} لحد الآن`
        : `No Qareeb ${esc(kind)} in ${esc(cityName(c))} yet`}</b>
        <div class="t3" style="margin-top:4px">${isAR()
          ? "ما نعرض شي ما تحققنا منه. الدليل المحلي يغطي بغداد حالياً، ونتوسّع بمحافظة بعد محافظة."
          : "We do not show what we have not checked. The local directory covers Baghdad for now, and we expand one governorate at a time."}</div></div></div>`}

    ${body || ""}

    <div class="sec" style="margin-top:22px">
      <div class="sec-h"><h2 class="d3">${isAR() ? "شنو ينفعك هسّه" : "What can help right now"}</h2></div>
      <div class="v2">
        <a class="btn" href="#/rx">${isAR() ? "مستكشف الأدوية — يغطي العراق كله" : "Medicine Explorer — covers all of Iraq"}</a>
        <a class="btn btn--2" href="#/need/new">${isAR() ? "انشر حاجتك — الشبكة تدوّر عنك" : "Publish your need"}</a>
        <button class="btn btn--2" onclick="pickExCity()">${icon("pin")}${isAR() ? "غيّر المحافظة" : "Change governorate"}</button>
      </div>
      <a class="rowb" style="border-top:1px solid var(--dial-line);padding-top:16px;margin-top:18px"
         href="tel:${CONFIG.emergency.unified}">
        <span class="st st-e"><i class="dot"></i>${isAR() ? "طوارئ — الرقم الموحد يشتغل بكل مكان" : "Emergency — the unified line works everywhere"}</span>
        <span class="b-g" style="font-size:17px;color:var(--alarm);padding-inline:10px">${CONFIG.emergency.unified}</span>
      </a>
      <button class="b-g" style="font-size:12.5px;margin-top:14px" onclick="setExCity('baghdad')">${
        isAR() ? "أنا في بغداد فعلاً — رجّعني" : "I'm actually in Baghdad — switch back"}</button>
    </div>
  </section>
  ${nav(kind === "pharmacies" || kind === "صيدليات" ? "pharmacies" : "doctors")}`;
}

/* A governorate pharmacy row. Deliberately NOT `pharmacyCard`: that card
   promises a distance and a walking time computed from the user's Baghdad
   district, which for a branch in Basra would be a fabricated number. This
   says only what we actually know. */
function branchRow(f) {
  const st = status(f);
  return `<a class="rw" href="#/pharmacy/${esc(f.id)}"><div style="width:100%">
    <div class="rowb"><b>${esc(L(f))}</b>${statusLabel(st, true)}</div>
    <div class="t3" style="margin-top:4px">${esc(f.area_ar && isAR() ? f.area_ar : cityName(cityById(cityOf(f))))}
      ${(f.services || []).includes("delivery") ? ` · ${isAR() ? "توصيل" : "delivery"}` : ""}</div>
    <div style="margin-top:6px">${sealBadge(f, "pharmacies")}</div>
  </div></a>`;
}

function screenHomeAway() {
  const c = cityById(S.exCity);
  const liveSigs = SIGNALS.filter((g) => sigAgeMin(g) < SIG_TTL);
  const inMine = liveSigs.filter((g) => cityOf(anyFac(g.fac)) === S.exCity);
  const wanted = liveRequests().filter((r) => r.city === S.exCity);

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(28px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <a class="b-g" style="font-size:12.5px" href="#/me">${isAR() ? "طلباتي" : "My requests"}</a>
    </div>

    <button class="lab" style="margin-top:34px;display:block;text-align:start;min-height:0"
      onclick="pickExCity()">${esc(cityName(c))} · <span class="num">${fmtT(nowMins())}</span></button>

    <div class="nhuge" style="color:var(--brass-ink);margin-top:12px">${inMine.length}</div>
    <div class="d2" style="margin-top:6px;font-weight:500">${isAR()
      ? `تأكيد توفّر حيّ في ${esc(cityName(c))}` : `live confirmations in ${esc(cityName(c))}`}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `و<span class="num">${liveSigs.length - inMine.length}</span> في باقي المحافظات — الدواء الناقص عندك قد يكون موجوداً عندهم.`
      : `and <span class="num">${liveSigs.length - inMine.length}</span> across the rest of Iraq — what is missing here may exist there.`}</div>

    <div style="margin-top:26px" class="v2">
      <button class="btn" onclick="location.hash='#/rx'">${isAR() ? "دوّر على دواء" : "Look for a medicine"}</button>
      <button class="btn btn--2" onclick="location.hash='#/need/new'">${isAR() ? "انشر حاجتك — الشبكة تدوّر عنك" : "Publish your need"}</button>
    </div>
  </section>

  ${wanted.length ? `<div class="hr" style="margin-top:30px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? `يدوّرون عليه في ${esc(cityName(c))}` : `Wanted in ${esc(cityName(c))}`}</div>
    ${wanted.slice(0, 3).map((r) => needCard(r, { state: false })).join('<div class="hr"></div>')}
  </section>` : ""}

  <section class="pad" style="margin-top:26px">
    <div class="note note-w"><span>${isAR()
      ? `دليل الأطباء والصيدليات المحلي يغطي بغداد حالياً. في ${esc(cityName(c))} يخدمك مستكشف الأدوية — وهو وطني — وطوارئ الرقم الموحد <b class="num">${CONFIG.emergency.unified}</b> تعمل بكل مكان.`
      : `The local doctor and pharmacy directory currently covers Baghdad. In ${esc(cityName(c))} the Medicine Explorer — which is national — is what serves you, and the unified emergency line <b class="num">${CONFIG.emergency.unified}</b> works everywhere.`}</span></div>
    <button class="b-g" style="font-size:12.5px;margin-top:12px" onclick="setExCity('baghdad')">${isAR() ? "أنا في بغداد فعلاً — رجّعني" : "I'm actually in Baghdad — switch back"}</button>
  </section>

  <section class="pad" style="margin:26px 0 30px">
    <a class="rowb" style="border-top:1px solid var(--dial-line-2);padding-top:16px" href="tel:${CONFIG.emergency.unified}">
      <span class="st st-e"><i class="dot"></i>${isAR() ? "طوارئ — الرقم الموحد" : "Emergency"}</span>
      <span class="n" style="font-size:17px;color:var(--alarm)">${CONFIG.emergency.unified}</span>
    </a>
  </section>
  ${nav("home")}`;
}

function screenHomePharmacist() {
  const f = S.myBranch ? anyFac(S.myBranch) : null;
  const rows = f ? radarFor(f.id) : [];
  const urgent = rows.filter((x) => x.r.urg === "urgent").length;
  const mySigs = f ? SIGNALS.filter((g) => g.fac === f.id && sigAgeMin(g) < SIG_TTL) : [];
  const aging = mySigs.filter((g) => sigAgeMin(g) >= 1440);
  const netReq = liveRequests().length;

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(28px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <button class="b-g" style="font-size:13px" onclick="pickRole()">${isAR() ? "وضع الصيدلاني" : "Pharmacist mode"}</button>
    </div>

    ${f ? `
    <div class="lab" style="margin-top:34px">${esc(L(f))} · ${esc(cityName(cityById(cityOf(f))))}</div>
    <div class="nhuge" style="color:var(--brass-ink);margin-top:12px">${rows.length}</div>
    <div class="d2" style="margin-top:6px;font-weight:500">${isAR() ? "طلب تكدر تجاوب عليه" : "requests you could answer"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `منها <span class="num">${urgent}</span> عاجل · إفاداتك الحية <span class="num">${mySigs.length}</span>`
      : `<span class="num">${urgent}</span> urgent · your live signals <span class="num">${mySigs.length}</span>`}</div>
    <div style="margin-top:24px" class="v2">
      <a class="btn" href="#/radar/${f.id}">${isAR() ? "افتح رادار التوفّر" : "Open Supply Radar"}</a>
      <a class="btn btn--2" href="#/partner/${FACILITIES.some((y) => y.id === f.id) ? f.id : "p1"}">${isAR() ? "لوحة الطلب في منطقتك" : "Demand in your area"}</a>
    </div>`
    : `
    <div class="lab" style="margin-top:34px">${isAR() ? "وضع الصيدلاني" : "Pharmacist mode"}</div>
    <div class="nhuge" style="color:var(--brass-ink);margin-top:12px">${netReq}</div>
    <div class="d2" style="margin-top:6px;font-weight:500">${isAR() ? "طلب دواء نشط في العراق" : "active requests across Iraq"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "اختر فرعك حتى نعرض اللي يخصّك منها — في محافظتك أو لدواء تفيد بتوفّره."
      : "Pick your branch and we'll narrow these to the ones you can answer."}</div>
    <div style="margin-top:24px"><a class="btn" href="#/radar">${isAR() ? "اختر فرعك" : "Pick your branch"}</a></div>`}
  </section>

  ${aging.length ? `<div class="hr" style="margin-top:30px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px;color:var(--brass-ink)">${isAR() ? "إفاداتك تتقادم" : "Your claims are aging"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "أقدم من يوم — المريض يشوفها باهتة. أكّدها من جديد إذا الدواء بعده موجود."
      : "Over a day old — patients see them dimmed. Re-confirm if the stock is still there."}</div>
    ${aging.map((g) => { const x = variantOf(g.v); return x ? `<div class="rw">
      <span class="grow"><span class="d3" style="display:block">${esc(L(x.med))} <span class="n" style="font-weight:300">${esc(x.v.strength)}</span></span>
        <span class="row" style="margin-top:8px"><span class="st st-t"><i class="dot"></i>${isAR() ? `أفدت ${sigAge(sigAgeMin(g))}` : `reported ${sigAge(sigAgeMin(g))}`}</span></span>
      </span></div>` : ""; }).join('<div class="hr"></div>')}
  </section>` : ""}

  ${f && rows.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "أقرب الطلبات" : "Nearest requests"}</div>
    ${rows.slice(0, 3).map(({ r }) => needCard(r, { state: false })).join('<div class="hr"></div>')}
    <a class="b-g" style="font-size:12.5px;margin-top:12px;display:inline-flex" href="#/radar/${f.id}">${isAR() ? "الكل في الرادار" : "All of them in Radar"}</a>
  </section>` : ""}

  <section class="pad" style="margin:26px 0 30px">
    <a class="rowb" style="border-top:1px solid var(--dial-line-2);padding-top:16px" href="#/explorer">
      <span class="t3">${isAR() ? "رجوع لواجهة المريض — استكشاف الأدوية" : "Back to the patient view — Explorer"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "افتح" : "Open"}</span>
    </a>
  </section>
  ${nav("home")}`;
}

/* ---------------- role home · doctor ---------------- */
function screenHomeDoctor() {
  const d = S.myDoc ? DOCTORS.find((x) => x.id === S.myDoc) : null;
  const dm = d && DOC_DEMAND[d.id];
  return `${netBanner()}
  <section class="pad" style="padding-top:calc(28px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <button class="b-g" style="font-size:13px" onclick="pickRole()">${isAR() ? "وضع الطبيب" : "Doctor mode"}</button>
    </div>

    ${d && dm ? `
    <div class="lab" style="margin-top:34px">${esc(L(d))} · ${esc(L(specOf(d.spec)))}</div>
    <div class="nhuge" style="color:var(--brass-ink);margin-top:12px">${dm.searches - dm.requests}</div>
    <div class="d2" style="margin-top:6px;font-weight:500">${isAR() ? "دوّروا على اختصاصك وما وصلوك" : "searched your specialty, never reached you"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `خلال ٣٠ يوم · وصلك <span class="num">${dm.requests}</span> طلباً ورددت على <span class="num">${dm.replied}</span>`
      : `over 30 days · <span class="num">${dm.requests}</span> reached you, you answered <span class="num">${dm.replied}</span>`}</div>
    <div style="margin-top:24px" class="v2">
      <a class="btn" href="#/partner/doctor/${d.id}">${isAR() ? "افتح لوحة الطلب" : "Open your demand dashboard"}</a>
      <a class="btn btn--2" href="#/doctor/${d.id}">${isAR() ? "شوف ملفك مثل ما يشوفه المريض" : "See your profile as a patient does"}</a>
    </div>`
    : `
    <div class="lab" style="margin-top:34px">${isAR() ? "وضع الطبيب" : "Doctor mode"}</div>
    <h1 class="d2" style="margin-top:12px">${isAR() ? "شوف الطلب اللي ما وصلك" : "See the demand that never reached you"}</h1>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "اختر ملفك حتى نعرض كم مريض دوّر على اختصاصك في منطقتك — وما وصلك."
      : "Pick your profile and we'll show how many searched your specialty and never reached you."}</div>
    <div style="margin-top:24px" class="v2">
      ${DOCTORS.filter((x) => DOC_DEMAND[x.id]).map((x) => `<button class="btn btn--2" onclick="setMyDoc('${x.id}')">${esc(L(x))} — ${esc(L(specOf(x.spec)))}</button>`).join("")}
    </div>`}
  </section>

  <section class="pad" style="margin:30px 0 30px">
    <a class="rowb" style="border-top:1px solid var(--dial-line-2);padding-top:16px" href="#/needs">
      <span class="t3">${isAR() ? "رجوع لواجهة المريض" : "Back to the patient view"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "افتح" : "Open"}</span>
    </a>
  </section>
  ${nav("home")}`;
}

function setMyDoc(id) { S.myDoc = id; LS.set("myDoc", id); render(); }

/* Role picker. Reachable from every role's home and from /start — never a
   blocking carousel, and switching back is one tap. */
function pickRole() {
  const opt = (k, t1, t2) => `<button class="rw" onclick="setRole('${k}')">
    <span class="grow"><span class="rowb">
      <span class="t1" style="font-size:15px">${t1}</span>
      ${S.role === k ? `<span class="st st-v"><i class="dot"></i>${isAR() ? "الحالي" : "current"}</span>` : ""}
    </span><span class="q-sub" style="display:block">${t2}</span></span></button>`;
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${isAR() ? "منو يستخدم قريب؟" : "Who is using Qareeb?"}</h2>
      <p>${isAR() ? "يغيّر شكل الرئيسية فقط — بلا حساب، وتكدر ترجع بأي وقت." : "Changes what home opens on — no account, switch back any time."}</p></div></div>
    <div class="sheet-b">
      ${opt("patient", isAR() ? "مريض أو مرافق" : "Patient or carer", isAR() ? "أدور على دواء أو طبيب أو صيدلية" : "Looking for medicine, a doctor, a pharmacy")}
      <div class="hr"></div>
      ${opt("pharmacist", isAR() ? "صيدلاني" : "Pharmacist", isAR() ? "أشوف الطلبات وأفيد بالتوفّر" : "See requests, report availability")}
      <div class="hr"></div>
      ${opt("doctor", isAR() ? "طبيب / طبيبة" : "Doctor", isAR() ? "أشوف الطلب على اختصاصي" : "See the demand on my specialty")}
    </div>`);
}
function setRole(r) { S.role = r; LS.set("role", r); closeSheet(); location.hash = "#/"; render(); }

function qrContext() {
  const src = QR_SOURCES[S.qrSource];
  if (!src) return "";
  return `<div class="qr-ctx fade">${icon("qr")}
    <span>${isAR() ? "دخلت من" : "Scanned at"} ${esc(src.label_ar)}</span>
    <button onclick="S.qrSource=null;render()" aria-label="${t("cancel")}">${icon("close")}</button></div>`;
}

/* ---------------- QR ENTRY ----------------
   Someone scans a poster at a pharmacy counter. They are standing up, probably
   holding a prescription, and they did not come here to be onboarded. So this
   is one question with three answers, every count computed live, and a skip
   that is always the first thing reachable. It is not a carousel: there is no
   second slide, and answering is optional — the district is already filled in
   from the poster, so leaving does not cost them anything.
------------------------------------------------------------- */
const qrSeen = () => LS.get("startSeen", []);

function markStartSeen(src) {
  const seen = qrSeen();
  if (src && !seen.includes(src)) LS.set("startSeen", [src, ...seen].slice(0, 12));
}

function skipStart() {
  markStartSeen(S.qrSource);
  location.hash = "#/";
}

function startTo(hash) {
  markStartSeen(S.qrSource);
  location.hash = hash;
}

function screenStart() {
  const src = QR_SOURCES[S.qrSource];
  const f = src ? fac(S.qrSource) : null;
  const dist = DISTRICTS.find((d) => d.id === (src ? src.district : S.district));

  /* Every number here is counted at render time. A poster that promises "96
     pharmacies" and shows a stale figure is worse than showing nothing. */
  const openPh = FACILITIES.filter((x) => x.type === "pharmacy" && status(x).k !== "shut").length;
  const freshMeds = MEDICINES.filter((m) => m.stock.some((st) => freshBand(freshMins(st)) !== "cold")).length;
  const verifiedDocs = DOCTORS.filter((d) => d.verified).length;

  const tile = (href, title, sub, badge, badgeCls, rail) => `
    <button class="surf-raise ${rail} pad-4 start-tile" onclick="startTo('${href}')">
      <div class="row-b" style="gap:12px">
        <span class="grow" style="text-align:start">
          <span class="q-h2">${title}</span>
          <span class="q-sub" style="display:block">${sub}</span></span>
        <span class="bdg ${badgeCls}">${badge}</span>
      </div></button>`;

  return `
  <div class="start-bar">
    <a class="brand" href="#/" onclick="skipStart()">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
    <button class="btn btn--3 btn--sm" onclick="skipStart()">${isAR() ? "تخطَّ" : "Skip"}${icon("close")}</button>
  </div>
  <section class="wrap" style="padding-top:6px">
    ${f ? `<div class="surf-sunk pad-3 row" style="gap:10px">
      <span class="qc-av qc-av-ph" style="width:34px;height:34px;font-size:13px">${esc(initial(L(f)))}</span>
      <span style="font-size:12.5px;line-height:1.6">${isAR() ? "مسحت الملصق في" : "Scanned at"} <b>${esc(L(f))}</b><br>
        <span class="muted">${dist ? esc(L(dist)) + (isAR() ? (dist.lm_ar ? " — " + esc(dist.lm_ar) : "") : (dist.lm_en ? " — " + esc(dist.lm_en) : "")) : ""}</span></span>
    </div>` : ""}

    <div style="margin-top:20px">
      <h1 class="q-h1">${isAR() ? "شنو تحتاج هالوكت؟" : "What do you need right now?"}</h1>
      <div class="q-sub" style="margin-top:2px">${isAR()
        ? "اختر واحداً — تكدر تغيّره بأي وقت." : "Pick one — you can change it any time."}</div>
    </div>

    <div class="stack-2" style="margin-top:14px">
      ${tile("#/search", isAR() ? "دوا معيّن" : "A specific medicine",
        isAR() ? "منو عنده الدوا هسّه — مؤكَّد بالساعة" : "Who has it now — confirmed by the hour",
        `<span class="num">${freshMeds}</span> ${isAR() ? "دواء مؤكَّد" : "confirmed"}`, "bdg-stock", "rail-stock")}
      ${tile("#/pharmacies", isAR() ? "صيدلية مفتوحة" : "An open pharmacy",
        isAR() ? "المفتوح الآن والخفارة الليلية" : "Open now and night duty",
        `<span class="num">${openPh}</span> ${isAR() ? "مفتوحة" : "open"}`, "bdg-t", "rail-open")}
      ${tile("#/needs", isAR() ? "دكتور" : "A doctor",
        isAR() ? "مرتّب حسب أقرب موعد، لا أقرب مسافة" : "Ranked by soonest slot, not nearest address",
        `<span class="num">${verifiedDocs}</span> ${t("verified")}`, "bdg-v", "")}
    </div>

    <div class="surf-flat pad-3 row-b" style="margin-top:16px;gap:10px">
      <span style="font-size:12.5px">${isAR() ? "منطقتك" : "Your area"}: <b>${dist ? esc(L(dist)) : ""}</b>
        <span class="muted">${src ? (isAR() ? "— من الملصق" : "— from the poster") : ""}</span></span>
      <button class="btn btn--3 btn--sm" onclick="openLocation()">${isAR() ? "تغيير" : "Change"}</button>
    </div>

    <div class="q-sub" style="margin-top:14px;text-align:center;font-size:11px">${isAR()
      ? "بلا حساب · بلا تسجيل · ما نحفظ شي عن صحتك"
      : "No account · no sign-up · nothing about your health is stored"}</div>

    <button class="rowb" style="width:100%;margin-top:14px;border-top:1px solid var(--dial-line-2);padding-top:14px;min-height:44px" onclick="pickRole()">
      <span class="t3">${isAR() ? "صيدلاني أو طبيب؟ عندك واجهة ثانية" : "Pharmacist or doctor? You have a different view"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "اختر دورك" : "Pick your role"}</span>
    </button>

    <a class="note note-e row-b" style="margin-top:14px;gap:10px" href="tel:${CONFIG.emergency.unified}">
      <span><b>${isAR() ? "طوارئ؟" : "Emergency?"}</b> ${isAR() ? "الرقم الموحد" : "Unified line"}</span>
      <b class="num">${CONFIG.emergency.unified}</b></a>
    <a class="row-b tiny emg-alt" href="tel:${CONFIG.emergency.ambulance}">
      <span class="muted">${isAR() ? "أو الإسعاف مباشرة" : "or the ambulance direct"}</span>
      <b class="num">${CONFIG.emergency.ambulance}</b></a>
  </section>
  <div style="height:26px"></div>`;
}

function screenNeeds() {
  /* This is what the bottom bar's «الأطباء» tab opens, so it is the single
     most-reached doctor screen in the product. Out of coverage it rendered a
     grid of fourteen specialties every one of which said "none open now" —
     true of Baghdad, meaningless in Kirkuk, and indistinguishable from a
     product that is simply broken. */
  if (!inLocalCoverage()) {
    return outOfCoverage({ title: isAR() ? "ما الذي تحتاجه؟" : "What do you need?",
      kind: isAR() ? "أطباء" : "doctors", have: 0, body: "" });
  }
  return `${header({ back: true, title: isAR() ? "ما الذي تحتاجه؟" : "What do you need?" })}
  <section class="wrap sec">
    <div class="needs">
      ${NEEDS.map((n) => {
        const c = needCount(n);
        return `<button class="need ${c ? "has" : ""}" onclick="pickNeed('${n.spec}')">
          <span class="ic">${icon(n.icon)}</span>
          <h3>${esc(L(n))}</h3>
          <div class="cnt">${c ? `<b class="num">${c}</b> ${isAR() ? "متاح الآن" : "available now"}` : (isAR() ? "لا أحد متاح الآن" : "none open now")}</div>
          ${ribbon(DOCTORS.find((d) => d.spec === n.spec) || DOCTORS[0], null, "ribbon--micro", true)}
        </button>`;
      }).join("")}
    </div>
    <div class="sec-h" style="margin-top:26px"><h2>${t("allSpecs")}</h2></div>
    <div class="chips chips--wrap">
      ${SPECIALTIES.map((s) => `<button class="chip" onclick="pickNeed('${s.id}')">${esc(L(s))}
        <span class="num muted">${DOCTORS.filter((d) => d.spec === s.id).length}</span></button>`).join("")}
    </div>
  </section>${nav("doctors")}`;
}

function screenDoctors(params) {
  /* Every doctor in the directory practises in Baghdad. Showing them to a
     patient in Najaf — sorted by distance from a district they never chose —
     is the clearest possible case of the app answering a question it was
     never asked. */
  if (!inLocalCoverage()) {
    return outOfCoverage({ title: t("doctors"), kind: isAR() ? "أطباء" : "doctors", have: 0, body: "" });
  }
  const spec = params.get("spec");
  if (spec) S.filters.spec = spec;
  const q = params.get("q");
  const r = doctorsFor({ spec: S.filters.spec, q });
  const sp = S.filters.spec ? specOf(S.filters.spec) : null;
  const f = S.filters;
  return `${header({ back: true, title: sp ? L(sp) : t("doctors") })}
  <div class="filters">
    <div class="chips">
      <button class="chip chip--filter ${activeFilterCount() ? "on" : ""}" onclick="openFilters()">
        ${icon("filter")}${isAR() ? "تحديد" : "Refine"}${activeFilterCount() ? ` <span class="num fcount">${activeFilterCount()}</span>` : ""}</button>
      <button class="chip ${f.openNow ? "on" : ""}" onclick="tf('openNow')">${icon("clock")}${t("openNow")}</button>
      <button class="chip ${f.when === "today" ? "on" : ""}" onclick="setFilter('when', S.filters.when==='today'?null:'today')">${isAR() ? "اليوم" : "Today"}</button>
      <button class="chip ${f.gender === "f" ? "on" : ""}" onclick="tg('f')">${isAR() ? "طبيبة" : "Female"}</button>
      ${sp ? `<button class="chip on" onclick="S.filters.spec=null;render()">${esc(L(sp))} ${icon("close")}</button>`
           : `<button class="chip" onclick="location.hash='#/needs'">${t("allSpecs")}</button>`}
    </div>
  </div>
  <div class="res-head">
    <div class="res-n"><span class="num">${r.list.length}</span> ${t("results")}
      <span class="why">· ${isAR() ? "الأقرب موعداً أولاً" : "soonest first"}</span></div>
    <div class="tiny muted">${esc(approxNote() || L(here()))}</div>
  </div>
  ${r.expanded ? `<div class="radius-note">${icon("info")}<span>${isAR()
      ? `نتائج قليلة ضمن ${S.radius} كم من ${L(here())}؟ وسّعنا تلقائياً إلى 25 كم — أخبرناك، ولم نقرر عنك.`
      : `Thin results within ${S.radius} km of ${L(here())}? We widened to 25 km — telling you, not deciding for you.`}</span></div>` : ""}
  <section class="wrap"><div class="stack list-2">
    ${r.list.length ? (() => { const live = r.list.some((x) => x.st.k !== "shut"); return r.list.map((x) => doctorCard(x, live)).join(""); })() : emptyDoctors(sp)}
  </div>
  ${r.list.length && r.list.length < 6 ? `<div class="list-end">
    <p class="small muted">${isAR() ? "هذا كل ما لدينا في هذا الاختصاص قرب منطقتك." : "That's everything we have in this specialty near you."}</p>
    <button class="btn btn--2" onclick="pickNeed(null)">${icon("grid")}${isAR() ? "جرّب اختصاصاً آخر" : "Try another specialty"}</button>
    <button class="btn btn--3" onclick="openLocation()">${icon("pin")}${isAR() ? "غيّر منطقتي" : "Change my area"}</button>
  </div>` : ""}</section>
  ${nav("doctors")}`;
}

function emptyDoctors(sp) {
  const alt = DISTRICTS.map((d) => {
    const saved = S.district; S.district = d.id;
    const n = doctorsFor({ spec: S.filters.spec, radius: 6 }).list.length;
    S.district = saved; return { d, n };
  }).filter((x) => x.n > 0 && x.d.id !== S.district).sort((a, b) => b.n - a.n).slice(0, 3);
  return `<div class="empty">
    <div class="empty-mark">${icon("pin")}</div>
    <h3>${isAR() ? `لا يوجد ${sp ? L(sp) : "طبيب"} مطابق في ${L(here())}` : `No matching ${sp ? L(sp) : "doctor"} in ${L(here())}`}</h3>
    <p>${isAR() ? "لكن هذه أقرب المناطق التي فيها أطباء متاحون." : "Here are the nearest areas that do have available doctors."}</p>
    <div class="empty-alts stack">
      ${alt.map((x) => `<button class="lane" onclick="setDistrict('${x.d.id}')">
        <span class="ic">${icon("pin")}</span>
        <span class="grow" style="text-align:start"><h3>${esc(L(x.d))}</h3>
          <p><span class="num">${x.n}</span> ${isAR() ? "طبيب" : "doctors"}</p></span>
        <span class="go">${icon("chev")}</span></button>`).join("")}
    </div>
    <button class="btn btn--2" style="margin-top:14px" onclick="S.filters={openNow:false,gender:null,spec:null};render()">
      ${icon("refresh")}${isAR() ? "أزل كل الفلاتر" : "Clear all filters"}</button>
  </div>`;
}

/* ---------------- v3 · DOCTOR · 4g ----------------
   The week as an engraved dial. Two practices, one shape: seven bands on the
   same 24-hour scale, jade for the hospital shift and brass for the private
   clinic. A patient reading it sees at a glance that "Tuesday evening" and
   "Tuesday morning" are different places at different prices — which is the
   single fact a directory listing hides and the reason this screen exists.
------------------------------------------------------------- */
function screenDoctor(id) {
  const d = DOCTORS.find((x) => x.id === id);
  if (!d) return screen404();
  const sp = specOf(d.spec), st = status(d), km = docDist(d);
  const facs = docFacs(d);
  const byFac = facs.map((f) => ({ f, ss: d.sessions.filter((x) => x.fac === f.id) }));
  const nx = st.k !== "shut" ? null : st.next;
  const fee = st.k !== "shut" && st.seg ? st.seg.s?.fee : (nx ? nx.s?.fee : d.sessions[0].fee);
  const gender = d.gender === "f" ? (isAR() ? "طبيبة" : "Female") : (isAR() ? "طبيب" : "Male");

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <button class="b-g" style="font-size:13px" onclick="goBack()">${isAR() ? "→ رجوع" : "← Back"}</button>
      <button class="b-g" style="font-size:13px" onclick="shareDoctor('${d.id}')">${t("share")}</button>
    </div>

    <div style="display:flex;gap:16px;align-items:flex-start;margin-top:26px">
      <span class="av" style="width:56px;height:56px;font-size:21px">${esc(initials(L(d)).charAt(0))}</span>
      <span class="grow">
        <h1 class="d2">${esc(L(d))}</h1>
        <div class="q-sub" style="margin-top:4px">${esc(L(sp))}${d.sub_ar && isAR() ? " — " + esc(d.sub_ar) : ""}</div>
      </span>
      ${sealBadge(d, "doctors")}
    </div>

    <div class="row" style="margin-top:18px;gap:18px;flex-wrap:wrap">
      ${statusLabel(st, true)}
      <span class="t3"><span class="num">${fmtKm(km)}</span></span>
      ${fee !== null && fee !== undefined ? `<span class="t3"><span class="num">${money(fee)}</span></span>` : ""}
    </div>
  </section>

  <section class="pad" style="margin-top:32px">
    <div class="lab">${isAR() ? "شكل الأسبوع" : "The shape of the week"}</div>
    <div style="margin-top:18px">
      <div style="display:grid;grid-template-columns:44px 1fr;gap:12px 14px;align-items:center">
        ${DAY_ORDER.map((dy) => {
          const has = rawSegs(d, dy).length > 0;
          const today = dy === nowDay();
          return `<span class="t3" style="${today ? "font-weight:500;color:var(--ink)" : has ? "" : "opacity:.5"}">${dayName(dy)}</span>
            ${band(d, dy, today)}`;
        }).join("")}
      </div>
      <div class="axis" style="margin-top:10px;padding-inline-start:58px">00<span>08</span><span>16</span>24</div>
    </div>

    <div class="hr" style="margin:22px 0"></div>

    <div class="v3">
      ${byFac.map(({ f, ss }) => {
        const priv = f.type !== "hospital";
        const dist = DISTRICTS.find((x) => x.id === f.district);
        const feeSet = [...new Set(ss.map((x) => x.fee).filter((x) => x !== null && x !== undefined))];
        /* The same hours repeat across several days, so listing sessions
           verbatim prints "09:00 – 13:00" three times and never says which
           days — the one fact a patient is actually looking for. Group by
           the range and name the days against it. */
        const slots = [...ss.reduce((mp, x) => {
          const k = fmtRange(mins(x.f), mins(x.t));
          return mp.set(k, [...(mp.get(k) || []), x.d]);
        }, new Map())].map(([range, days]) => [range, days.sort((p, q) => DAY_ORDER.indexOf(p) - DAY_ORDER.indexOf(q))]);
        return `<div>
          <div class="row" style="gap:8px">
            <i style="width:10px;height:3px;background:var(--${priv ? "brass" : "jade"});border-radius:999px;flex:none"></i>
            <span class="t1" style="font-size:14px">${esc(L(f))}</span>
          </div>
          <div class="t3" style="margin-top:2px;padding-inline-start:18px">
            ${slots.map(([range, days]) =>
              `${days.map(dayName).join("، ")} · ${range}`).join("<br>")}
          </div>
          <div class="t3" style="margin-top:2px;padding-inline-start:18px">
            ${dist ? esc(L(dist)) + " · " : ""}<span class="num">${fmtKm(distTo(f))}</span>
            ${feeSet.length ? " · " + feeSet.map((x) => `<span class="num">${money(x)}</span>`).join(" / ") : ""}
          </div>
          <div class="row" style="margin-top:8px;padding-inline-start:18px">
            <a class="b-g" style="font-size:12px" href="${mapLink(f)}" target="_blank" rel="noopener">${t("directions")}</a>
          </div>
        </div>`;
      }).join("")}
    </div>
  </section>

  ${!d.accepting ? `<section class="pad" style="margin-top:22px"><div class="note note-w">
    <span>${t("notAccepting")}${d.pause_ar ? " — " + esc(isAR() ? d.pause_ar : d.pause_en) : ""}</span></div></section>` : ""}
  ${d.updated > 90 ? `<section class="pad" style="margin-top:12px"><div class="note note-w">
    <span>${isAR() ? "لم تُحدَّث هذه المعلومات منذ فترة طويلة. تحقق قبل ما تروح."
                   : "This information hasn't been updated in a while. Check before travelling."}</span></div></section>` : ""}

  <section class="pad" style="margin-top:26px">
    ${d.creds_ar?.length || d.exp ? `<div class="q-sub" style="max-width:44ch">${
      /* `.map(esc)` used to run over this whole list, including the one entry
         that carries deliberate markup — so the experience line rendered as
         the literal text `<span class="num">12</span> سنة خبرة` on every
         doctor's profile. Escape the DATA, and let the one intentional span
         through; a blanket escape over a mixed list escapes the wrong half. */
      [esc(d.creds_ar?.join(" · ") || ""),
       d.exp ? `<span class="num">${esc(String(d.exp))}</span> ${isAR() ? "سنة خبرة" : "years' experience"}` : "",
       esc(gender || ""),
       d.langs?.length ? esc(d.langs.map((x) => ({ ar: isAR() ? "العربية" : "Arabic", en: isAR() ? "الإنجليزية" : "English", ku: isAR() ? "الكردية" : "Kurdish", tr: isAR() ? "التركية" : "Turkish" }[x])).filter(Boolean).join("، ")) : ""]
        .filter(Boolean).join(" · ")}</div>` : ""}
    <div class="rowb" style="margin-top:18px">
      <span class="t3">${isAR() ? "حُدّث قبل" : "updated"} <span class="num">${d.updated}</span> ${isAR() ? "يوم" : "d ago"}</span>
      <button class="b-g" style="font-size:12px" onclick="reportInfo()">${t("reportInfo")}</button>
    </div>
  </section>

  <!-- The directory and the health record were two products sharing a tab
       bar: nothing on a doctor's page had ever mentioned that the patient
       holds a record, or answered the question a patient about to walk into
       this clinic actually has — can he see it?

       The honest answer today is no, not remotely: every doctor here is
       LISTED from a public directory, not enrolled, and nobody in this list
       has a Qareeb account waiting. What does work is the thing that already
       works on paper in Iraq — the patient carries it in. So the answer names
       the limit and hands over the mechanism that does function. -->
  <section class="pad" style="margin-top:26px">
    <div class="note">${icon("seal")}<div style="width:100%">
      <b>${isAR() ? "ملفك الصحي" : "Your health record"}</b>
      <div class="t3" style="margin-top:4px">${isAR()
        ? "هذا الطبيب مدرَج بالدليل، مو مشترك بقريب — يعني ما يقدر يفتح ملفك من عنده. تكدر تاخذ ملخصك وياك: تطلع رمز، وتعطيه بالعيادة، ويشوف اللي تختاره أنت لمدة تختارها أنت."
        : "This doctor is listed in the directory, not enrolled in Qareeb — so they cannot open your record from their side. You can carry your summary in instead: issue a code, hand it over at the desk, and they see what you chose for as long as you chose."}</div>
      <a class="b-g" style="display:block;margin-top:8px" href="#/record/share">${
        isAR() ? "جهّز رمز الزيارة" : "Prepare a visit code"}</a>
    </div></div>
  </section>

  <section class="pad" style="margin-top:26px">
    <a class="rowb" href="#/partner/doctor/${d.id}">
      <span class="t3">${isAR() ? "هذا ملفك؟ شوف الطلب اللي ما وصلك" : "Is this your profile? See the demand you missed"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "افتح" : "Open"}</span>
    </a>
  </section>

  <div class="actionbar">
    ${d.accepting
      ? `<button class="btn" onclick="openRequest('${d.id}')">${t("request")}</button>`
      : `<button class="btn" disabled>${t("notAccepting")}</button>`}
    ${d.wa ? `<a class="icon-btn" href="${waLink(d.wa, directMsg(d))}" target="_blank" rel="noopener" aria-label="${t("message")}">${icon("wa")}</a>` : ""}
    <a class="icon-btn" href="tel:+${d.phone}" aria-label="${t("call")}">${icon("phone")}</a>
  </div>
  <div style="height:80px"></div>`;
}

function screenPharmacies() {
  /* Out of the Baghdad directory we still hold verified branches in nine
     governorates — show those, and say plainly that the open-now layer with
     distances is Baghdad-only. */
  if (!inLocalCoverage()) {
    const have = facilitiesInCity(S.exCity, "pharmacy");
    return outOfCoverage({
      title: t("pharmacies"), kind: isAR() ? "صيدليات" : "pharmacies",
      have: have.length,
      body: have.length ? `<div class="stack-2" style="margin-top:16px">${have.map(branchRow).join("")}</div>` : "",
    });
  }
  const openOnly = S.filters.openNow;
  let list = pharmaciesNear({ openOnly });
  if (S.phNight) list = list.filter((x) => x.f.night);
  if (S.phSvc) list = list.filter((x) => (x.f.services || []).includes(S.phSvc));
  const night = list.filter((x) => x.f.night);
  return `${header({ back: true, title: t("pharmacies") })}
  <div class="filters"><div class="chips">
    <button class="chip ${openOnly ? "on" : ""}" onclick="tf('openNow')">${icon("clock")}${t("openNow")}</button>
    <button class="chip ${S.phNight ? "on" : ""}" onclick="S.phNight=!S.phNight;render()">${icon("moon")}${t("nightDuty")} <span class="num">${night.length}</span></button>
    <button class="chip ${S.phSvc === "delivery" ? "on" : ""}" onclick="S.phSvc = S.phSvc==='delivery'?null:'delivery';render()">${icon("truck")}${isAR() ? "توصيل" : "Delivery"}</button>
  </div></div>
  <section class="wrap">
    <div class="map-peek" aria-hidden="true">
      ${list.slice(0, 7).map((x, i) => `<span class="pin" style="inset-inline-start:${12 + ((i * 37) % 76)}%;top:${18 + ((i * 29) % 60)}%"></span>`).join("")}
      <span class="pin me" style="inset-inline-start:48%;top:46%"></span>
      <span class="lbl">${esc(L(here()))} · <span class="num">${list.length}</span> ${isAR() ? "صيدلية" : "pharmacies"}</span>
    </div>
  </section>
  <div class="res-head"><span class="res-n"><span class="num">${list.length}</span> ${t("results")}</span>
    <span class="tiny muted">${esc(approxNote()) || (isAR() ? "المفتوح أولاً، ثم الأقرب" : "Open first, then nearest")}</span></div>
  <section class="wrap"><div class="stack list-2">
    ${list.length ? (() => { const live = list.some((x) => x.st.k !== "shut"); return list.map((x) => pharmacyCard(x, live)).join(""); })() : nightFallback()}
  </div></section>
  ${nav("pharmacies")}`;
}

// Nothing open nearby is the 2am case — the moment this product matters most.
// It must hand over the nearest NIGHT-DUTY pharmacy, not report an empty list.
function nightFallback() {
  const duty = FACILITIES.filter((f) => f.type === "pharmacy" && f.night)
    .map((f) => ({ f, km: distTo(f), st: status(f) }))
    .sort((a, b) => (a.st.k === "shut") - (b.st.k === "shut") || a.km - b.km);
  const soon = pharmaciesNear({}).filter((x) => x.st.k === "shut")
    .sort((a, b) => (a.st.next?.abs ?? 1e9) - (b.st.next?.abs ?? 1e9))[0];
  return `<div class="empty">
    <div class="empty-mark">${icon("moon")}</div>
    <h3>${isAR() ? "ماكو صيدلية مفتوحة قربك هسه" : "Nothing open near you right now"}</h3>
    <p>${isAR() ? "هذي أقرب صيدليات الخفارة الليلية — تشتغل طول الليل."
                : "These are the nearest night-duty pharmacies — open through the night."}</p>
    <div class="empty-alts stack">${duty.slice(0, 3).map((x) => pharmacyCard(x)).join("")}</div>
    ${soon ? `<p class="small muted" style="margin-top:18px">${isAR() ? "وأقرب وحدة تفتح" : "Nearest opening"}: ${esc(L(soon.f))} · ${fmtTi(soon.st.next.f)}</p>` : ""}
  </div>`;
}

/* ---------------- v3 · PHARMACY ----------------
   A pharmacy's value here is not its address — Google Maps has that. It is
   what it has confirmed it holds, and how recently. So the screen leads with
   confirmed stock, freshest first, and only then explains where and when.
------------------------------------------------------------- */
function screenPharmacy(id) {
  /* `anyFac`, not `fac`. `fac` searches FACILITIES only, which is Baghdad;
     the governorate branches live in BRANCHES. Three call sites pass a branch
     id — the radar sign-in gate, the stock card, and, worst, the controlled-
     medicine handoff in js/ui-backend.js, which lists "licensed pharmacies
     near you" for a patient who has just been refused a public request for a
     controlled drug. For every user outside Baghdad each of those rows was a
     404: the one safe recovery path the product offers for its most sensitive
     refusal ended in a dead screen. */
  const f = anyFac(id); if (!f) return screen404();
  const st = status(f), km = distTo(f);
  const dist = DISTRICTS.find((d) => d.id === f.district);
  const prods = PRODUCTS.filter((x) => x.stock.includes(f.id));
  const meds = MEDICINES.filter((m) => m.stock.some((x) => x.f === f.id))
    .map((m) => ({ m, mins: freshMins(m.stock.find((x) => x.f === f.id)) }))
    .sort((x, y) => x.mins - y.mins);
  const fresh = meds.filter((x) => freshBand(x.mins) !== "cold");

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <button class="b-g" style="font-size:13px" onclick="goBack()">${isAR() ? "→ رجوع" : "← Back"}</button>
      <button class="b-g" style="font-size:13px" onclick="toggleSave('f:${f.id}')">${
        S.saved.includes("f:" + f.id) ? (isAR() ? "محفوظة" : "Saved") : (isAR() ? "احفظ" : "Save")}</button>
    </div>

    <div style="display:flex;gap:16px;align-items:flex-start;margin-top:26px">
      <span class="av" style="width:56px;height:56px;font-size:21px">${esc(initial(L(f)))}</span>
      <span class="grow">
        <h1 class="d2">${esc(L(f))}</h1>
        <div class="q-sub" style="margin-top:4px">${t("pharmacy")}${placeOf(f)}</div>
      </span>
      ${sealBadge(f)}
    </div>

    <div class="row" style="margin-top:18px;gap:18px;flex-wrap:wrap">
      ${statusLabel(st, true)}
      ${sameCityAsUser(f) ? `<span class="t3"><span class="num">${fmtKm(km)}</span></span>` : ""}
      ${f.night ? `<span class="st st-t">${isAR() ? "خفارة ليلية" : "Night duty"}</span>` : ""}
      <span class="t3">${updatedLine(f)}</span>
    </div>
    <div style="margin-top:16px">${band(f)}</div>
    ${axis24()}
  </section>

  ${fresh.length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "أكّدت توفّرها" : "Confirmed in stock"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "الأحدث تأكيداً أولاً — وهذا سبب اختيار هذي الصيدلية بالذات."
      : "Freshest confirmation first — this is the reason to pick this one."}</div>
    ${fresh.slice(0, 6).map((x) => `<a class="rw" href="#/med/${x.m.id}">
      <span class="rw-lead" style="background:var(--${freshBand(x.mins) === "hot" ? "brass" : "jade"})"></span>
      <span class="av">${esc(L(x.m).charAt(0))}</span>
      <span class="grow">
        <span class="d3" style="display:block">${esc(L(x.m))}</span>
        <span class="q-sub" style="display:block">${esc(x.m.form || "")}</span>
        <span class="row" style="margin-top:9px"><span class="st st-t">${
          freshBand(x.mins) === "hot" ? `<i class="dot dot-live"></i>` : `<i class="dot"></i>`}${freshLabel(x.mins)}</span></span>
      </span></a>`).join('<div class="hr"></div>')}
    ${meds.length > fresh.length ? `<div class="t3" style="margin-top:14px">${isAR()
      ? `و<span class="num">${meds.length - fresh.length}</span> غيرها بتأكيد أقدم من ثلاثة أيام — لا نعدّها توفّراً.`
      : `and <span class="num">${meds.length - fresh.length}</span> more confirmed over three days ago — we don't count those as stock.`}</div>` : ""}
  </section>` : `<section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "التوفّر" : "Stock"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "ما عدنا تأكيد توفّر حديث من هذي الصيدلية. اسألهم مباشرة — وأول جواب يفيد اللي بعدك."
      : "No recent stock confirmation from this pharmacy. Ask them directly — the first answer helps the next person."}</div>
  </section>`}

  <section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "الدوام خلال الأسبوع" : "Weekly hours"}</div>
    <div style="margin-top:18px">
      <div style="display:grid;grid-template-columns:44px 1fr;gap:12px 14px;align-items:center">
        ${DAY_ORDER.map((dy) => {
          const today = dy === nowDay();
          const works = rawSegs(f, dy).length > 0;
          return `<span class="t3" style="${today ? "font-weight:500;color:var(--ink)" : works ? "" : "opacity:.5"}">${dayName(dy)}</span>
            ${band(f, dy, today)}`;
        }).join("")}
      </div>
      <div class="axis" style="margin-top:10px;padding-inline-start:58px">00<span>08</span><span>16</span>24</div>
    </div>
  </section>

  ${(f.services || []).length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "الخدمات" : "Services"}</div>
    <div class="chips chips--wrap" style="margin-top:12px">${(f.services || []).map((sv) =>
      `<span class="chip">${svcLabel(sv)}</span>`).join("")}</div>
  </section>` : ""}

  ${prods.length ? `<section class="pad" style="margin-top:30px">
    <div class="rowb"><span class="lab">${isAR() ? "متوفّر في هذه الصيدلية" : "Also stocked here"}</span>
      <a class="b-g" style="font-size:12px" href="#/care">${isAR() ? "الكل" : "All"}</a></div>
    ${prods.slice(0, 4).map((x) => `<a class="rw" href="#/product/${x.id}">
      <span class="av">${esc(L(x).charAt(0))}</span>
      <span class="grow">
        <span class="d3" style="display:block">${esc(L(x))}</span>
        <span class="q-sub" style="display:block">${esc(x.brand || "")}</span>
      </span>
      <span class="t3 num" style="align-self:center">${money(x.price)}</span></a>`).join('<div class="hr"></div>')}
  </section>` : ""}

  <section class="pad" style="margin-top:30px">
    <a class="rowb" href="#/partner/${f.id}">
      <span class="t3">${isAR() ? "هذي صيدليتك؟ شوف الطلب اللي ضاع بمنطقتك" : "Is this your pharmacy? See the demand your area lost"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "افتح" : "Open"}</span>
    </a>
    <div class="rowb" style="margin-top:14px;border-top:1px solid var(--dial-line-2);padding-top:14px">
      <span class="t3">${updatedLine(f)}</span>
      <button class="b-g" style="font-size:12px" onclick="reportInfo()">${t("reportInfo")}</button>
    </div>
  </section>

  <div class="actionbar">
    ${f.wa ? `<a class="btn btn--wa" href="${waLink(f.wa, isAR() ? "السلام عليكم، عندكم..." : "Hello, do you have...")}" target="_blank" rel="noopener">${isAR() ? "اسأل عبر واتساب" : "Ask on WhatsApp"}</a>`
      : `<a class="btn" href="tel:+${f.phone}">${t("call")}</a>`}
    <a class="icon-btn" href="tel:+${f.phone}" aria-label="${t("call")}">${icon("phone")}</a>
    <a class="icon-btn" href="${mapLink(f)}" target="_blank" rel="noopener" aria-label="${t("directions")}">${icon("nav")}</a>
  </div>
  <div style="height:80px"></div>`;
}

function screenCare(cat) {
  const list = cat ? PRODUCTS.filter((p) => p.cat === cat) : PRODUCTS;
  const c = CARE_CATEGORIES.find((x) => x.id === cat);
  /* An unrecognised category — a stale bookmark, a mistyped link, a category
     retired from the data — rendered a header with no title above an empty
     grid: thirty-one characters of page, all of them the tab bar. The route
     resolved, so nothing 404'd; there was simply nothing there. A screen that
     is blank because the id was wrong must say the id was wrong. */
  if (cat && !c) {
    return `${header({ back: true, title: isAR() ? "العناية" : "Care" })}
    <section class="wrap" style="padding-top:20px">
      <div class="note note-w">${icon("info")}<div>${isAR()
        ? "هذا القسم ما عاد موجود — يمكن الرابط قديم."
        : "That section no longer exists — the link may be out of date."}</div></div>
      <div class="sec-h" style="margin-top:22px"><h2>${isAR() ? "الأقسام الموجودة" : "Sections that do exist"}</h2></div>
      <div class="grid-2">
        ${CARE_CATEGORIES.map((x) => `<a class="need" href="#/care/${x.id}" style="text-align:start">
          <span class="ic">${icon(x.icon)}</span><h3>${esc(L(x))}</h3>
          <div class="cnt"><span class="num">${PRODUCTS.filter((p) => p.cat === x.id).length}</span> ${isAR() ? "منتج" : "products"}</div></a>`).join("")}
      </div>
    </section>${nav("care")}`;
  }
  return `${header({ back: !!cat, title: c ? L(c) : "" })}
  ${!cat ? `<section class="wrap" style="padding-top:20px">
    <h1 class="hero-line" style="font-size:26px">${isAR() ? "رفوف الصيدليات القريبة منك." : "The shelves of the pharmacies near you."}</h1>
    <p class="hero-sub">${isAR() ? "كل منتج يُطلب من صيدلية حقيقية قريبة — لا سلة ولا دفع." : "Every product is ordered from a real nearby pharmacy — no cart, no payment."}</p>
  </section>
  <section class="wrap sec"><div class="grid-2 stagger">
    ${CARE_CATEGORIES.map((x) => `<a class="need" href="#/care/${x.id}" style="text-align:start">
      <span class="ic">${icon(x.icon)}</span><h3>${esc(L(x))}</h3>
      <div class="cnt"><span class="num">${PRODUCTS.filter((p) => p.cat === x.id).length}</span> ${isAR() ? "منتج" : "products"}</div></a>`).join("")}
  </div></section>` : ""}
  <section class="wrap ${cat ? "sec" : ""}">
    ${cat ? "" : `<div class="sec-h"><h2>${isAR() ? "الأكثر طلباً" : "Most requested"}</h2></div>`}
    <div class="grid-2 stagger">${(cat ? list : list.slice(0, 6)).map(productCard).join("")}</div>
  </section>
  ${nav("care")}`;
}

function screenProduct(id) {
  const p = PRODUCTS.find((x) => x.id === id); if (!p) return screen404();
  const stock = p.stock.map(fac).map((f) => ({ f, km: distTo(f), st: status(f) }))
    .sort((a, b) => (a.st.k === "shut") - (b.st.k === "shut") || a.km - b.km);
  const best = stock[0];
  return `${header({ back: true, title: "" })}
  <section class="wrap" style="padding-top:14px">
    <div class="prod-img ch" style="--chamfer-size:20px;aspect-ratio:16/10">${icon(CARE_CATEGORIES.find((c) => c.id === p.cat)?.icon || "pill", "glyph")}</div>
    <h1 class="prof-name" style="margin-top:16px">${esc(L(p))}</h1>
    <div class="prof-spec">${esc(p.brand)}</div>
    <div class="row" style="margin-top:10px;gap:10px">
      <span class="prod-p num" style="font-size:20px">${money(p.price)}</span>
      <span class="chip chip--meta chip--ok">${esc(L(CARE_CATEGORIES.find((c) => c.id === p.cat)))}</span>
    </div>
  </section>
  <section class="blk" style="margin-top:16px"><h3>${isAR() ? "لماذا يُستعمل" : "What it's for"}</h3><p class="small">${esc(p.for_ar)}</p></section>
  <section class="blk"><h3>${isAR() ? "طريقة الاستعمال" : "How to use"}</h3><p class="small">${esc(p.use_ar)}</p></section>
  ${p.warn_ar.length ? `<section class="blk"><h3>${isAR() ? "تنبيهات" : "Warnings"}</h3>
    <div class="stack">${p.warn_ar.map((w) => `<div class="banner banner--warn">${icon("alert")}<span>${esc(w)}</span></div>`).join("")}</div></section>` : ""}
  <section class="blk">
    <h3>${t("stockedBy")}</h3>
    <div class="stack">${stock.slice(0, 4).map((x) => pharmacyCard(x)).join("")}</div>
  </section>
  <div class="actionbar">
    <a class="btn btn--wa" href="${best.f.wa ? waLink(best.f.wa, productMsg(p, best.f)) : "#"}" target="_blank" rel="noopener">
      ${icon("wa")}${t("orderWa")} — ${esc(L(best.f))}</a>
  </div>${nav("care")}`;
}

function screenSearch() {
  const q = LS.get("q", "");
  return `${header({ back: true, title: "" })}
  <section class="wrap" style="padding-top:6px">
    <div class="search-field">${icon("search")}
      <input id="q" value="${esc(q)}" placeholder="${t("searchPh")}" oninput="doSearch(this.value)" autocomplete="off">
      <button class="clear-btn" onclick="doSearch('');document.getElementById('q').value='';document.getElementById('q').focus()" aria-label="${isAR() ? "مسح البحث" : "Clear search"}">${icon("close")}</button></div>
  </section>
  <section class="wrap sec" id="sres">${searchResults(q)}</section>${nav("home")}`;
}

function searchResults(q) {
  if (!q || !q.trim()) {
    return `<div class="hint" style="margin-bottom:16px">${icon("info")}<span>${isAR()
        ? "نفهم «اسنان» و«أسنان» و«سنّي» — اكتب كما تشاء."
        : "We match Arabic spellings loosely — write it however you like."}</span></div>
      <div class="res-group"><h3>${isAR() ? "ابدأ من حاجتك" : "Start from your need"}</h3>
      <div class="chips chips--wrap">${NEEDS.slice(0, 8).map((n) => `<button class="chip" onclick="pickNeed('${n.spec}')">${icon(n.icon)}${esc(L(n))}</button>`).join("")}</div></div>
      <div class="res-group"><h3>${isAR() ? "الأكثر بحثاً" : "Most searched"}</h3>
        <div class="chips chips--wrap">${(isAR()
          ? ["طبيب أطفال", "صيدلية مناوبة", "طبيبة نسائية", "جلدية", "وجع أسنان", "فيتامين د", "واقي شمس"]
          : ["Pediatrician", "Night pharmacy", "Gynecologist", "Dermatology", "Tooth pain", "Vitamin D", "Sunscreen"])
          .map((q) => `<button class="chip" onclick="runSearch('${esc(q)}')">${esc(q)}</button>`).join("")}</div></div>
      ${S.recent.length ? `<div class="res-group"><h3>${isAR() ? "بحثك السابق" : "Recent"}</h3>
        <div class="chips chips--wrap">${S.recent.slice(0, 6).map((r, i) => `<button class="chip" onclick="runRecent(${i})">${esc(r)}</button>`).join("")}</div></div>` : ""}`;
  }
  const nq = norm(q);
  const pq = parseQuery(q);
  const P = pq ? applyParsed(pq) : null;

  // A parsed query answers directly instead of listing weak text matches.
  if (P && (P.spec || P.district || P.gender || P.openNow || P.kind)) {
    const head = parsedChips(pq, q);
    if (P.kind === "pharmacy") {
      let list = pharmaciesNear({ openNow: P.openNow });
      if (P.district) list = list.filter((x) => x.f.district === P.district);
      return head + (list.length
        ? `<div class="res-group"><h3>${t("pharmacies")} · <span class="num">${list.length}</span></h3>
             <div class="stack">${list.slice(0, 8).map(pharmacyCard).join("")}</div></div>`
        : nightFallback());
    }
    if (P.kind === "medicine") {
      const meds = pq.rest.length ? medMatches(pq.rest.join(" ")) : MEDICINES;
      return head + `<div class="res-group"><h3>${isAR() ? "أدوية" : "Medicines"}</h3>
        <div class="stack">${meds.slice(0, 8).map(medRow).join("")}</div></div>`;
    }
    // default: doctors, filtered by everything we understood
    const saved = { ...S.filters };
    S.filters = { ...S.filters, spec: P.spec, gender: P.gender, openNow: P.openNow, district: P.district };
    const r = doctorsFor({ spec: P.spec });
    S.filters = saved;
    return head + (r.list.length
      ? `<div class="res-group"><h3>${t("doctors")} · <span class="num">${r.list.length}</span>
           <span class="muted" style="font-weight:400">· ${isAR() ? "الأقرب موعداً أولاً" : "soonest first"}</span></h3>
         <div class="stack">${(() => { const live = r.list.slice(0, 8).some((x) => x.st.k !== "shut"); return r.list.slice(0, 8).map((x) => doctorCard(x, live)).join(""); })()}</div></div>`
      : zeroWithWayOut(P));
  }

  const docs = DOCTORS.filter((d) => norm(L(d)).includes(nq) || specMatch(d.spec, nq)).slice(0, 6);
  const specs = SPECIALTIES.filter((s) => [s.ar, s.en, ...s.alias].some((a) => norm(a).includes(nq))).slice(0, 5);
  const phs = FACILITIES.filter((f) => f.type === "pharmacy" && norm(L(f)).includes(nq)).slice(0, 4);
  const hos = FACILITIES.filter((f) => f.type !== "pharmacy" && norm(L(f)).includes(nq)).slice(0, 4);
  const prs = PRODUCTS.filter((p) => norm(L(p) + " " + p.brand).includes(nq)).slice(0, 4);
  const meds = medMatches(q).slice(0, 4);
  const none = !docs.length && !specs.length && !phs.length && !hos.length && !prs.length && !meds.length;
  if (none) {
    const guess = findSpecByQuery(q);
    return `<div class="empty">
      ${emptyGlyph()}
      <div class="empty-t">${isAR() ? `ما لگينا «${esc(q)}» بعد` : `Nothing for "${esc(q)}" yet`}</div>
      <div class="empty-b">${isAR() ? "سجّلنا بحثك — نضيف الناقص أسبوعياً. جرّب وحدة من هذي:"
                  : "We logged it — we add what's missing weekly. Try one of these:"}</div>
      <div class="empty-alts stack">
        ${guess ? `<button class="lane" onclick="pickNeed('${guess.id}')"><span class="ic">${icon("stetho")}</span>
          <span class="grow" style="text-align:start"><h3>${esc(L(guess))}</h3>
            <p>${isAR() ? "أقرب اختصاص لبحثك" : "closest specialty to your search"}</p></span>${icon("chev")}</button>` : ""}
        <button class="lane" onclick="location.hash='#/needs'"><span class="ic">${icon("grid")}</span>
          <span class="grow" style="text-align:start"><h3>${isAR() ? "تصفّح حسب الحاجة" : "Browse by need"}</h3>
            <p>${isAR() ? "12 حاجة شائعة" : "12 common needs"}</p></span>${icon("chev")}</button>
        <button class="lane" onclick="openLocation()"><span class="ic">${icon("pin")}</span>
          <span class="grow" style="text-align:start"><h3>${isAR() ? "شوف نتائج بغداد كلها" : "Search all of Baghdad"}</h3>
            <p>${isAR() ? "بدل " + esc(L(here())) + " بس" : "instead of just " + esc(L(here()))}</p></span>${icon("chev")}</button>
      </div></div>`;
  }
  const G = (title, body) => body ? `<div class="res-group"><h3>${title}</h3><div class="stack">${body}</div></div>` : "";
  // Medicines lead: "who has this" is the most urgent question a search can carry.
  return G(isAR() ? "أدوية — منو عنده؟" : "Medicines — who has it?", meds.map(medRow).join(""))
    + G(t("doctors"), docs.map((d) => doctorCard({ d, km: docDist(d), st: status(d) })).join(""))
    + G(isAR() ? "اختصاصات" : "Specialties", specs.map((s) => `<button class="lane" onclick="pickNeed('${s.id}')"><span class="ic">${icon("stetho")}</span>
        <span class="grow" style="text-align:start"><h3>${esc(L(s))}</h3><p><span class="num">${DOCTORS.filter((d) => d.spec === s.id).length}</span> ${isAR() ? "طبيب" : "doctors"}</p></span>
        <span class="go">${icon("chev")}</span></button>`).join(""))
    + G(t("pharmacies"), phs.map((f) => pharmacyCard({ f, km: distTo(f), st: status(f) })).join(""))
    + G(isAR() ? "مستشفيات ومراكز" : "Hospitals & centres", hos.map((f) => `<a class="lane" href="#/hospital/${f.id}"><span class="ic">${icon("building")}</span>
        <span class="grow"><h3>${esc(L(f))}</h3><p>${esc(L(DISTRICTS.find((d) => d.id === f.district)))} · ${fmtKm(distTo(f))}</p></span>
        <span class="go">${icon("chev")}</span></a>`).join(""))
    + G(t("care"), prs.length ? `<div class="grid-2">${prs.map(productCard).join("")}</div>` : "");
}

function screenHospitals() {
  if (!inLocalCoverage()) {
    return outOfCoverage({ title: isAR() ? "المستشفيات" : "Hospitals",
      kind: isAR() ? "مستشفيات" : "hospitals", have: 0, body: "" });
  }
  const list = FACILITIES.filter((f) => f.type !== "pharmacy").map((f) => ({ f, km: distTo(f) })).sort((a, b) => a.km - b.km);
  const er = list.filter((x) => x.f.er);
  return `${header({ back: true, title: isAR() ? "المستشفيات" : "Hospitals" })}
  <section class="wrap sec">
    <div class="banner banner--stop">${icon("alert")}<span>${isAR()
      ? `للحالات الطارئة اتصل بالرقم الموحد <b class="num">${CONFIG.emergency.unified}</b> — أو الإسعاف <b class="num">${CONFIG.emergency.ambulance}</b>.`
      : `In an emergency call <b class="num">${CONFIG.emergency.unified}</b> — or the ambulance on <b class="num">${CONFIG.emergency.ambulance}</b>.`}</span></div>
    <div class="sec-h" style="margin-top:20px"><h2>${isAR() ? "طوارئ مفتوحة الآن" : "Emergency rooms open now"}</h2></div>
    <div class="stack list-2">${er.map((x) => hospitalRow(x)).join("")}</div>
    <div class="sec-h" style="margin-top:24px"><h2>${isAR() ? "كل المستشفيات والمراكز" : "All hospitals & centres"}</h2></div>
    <div class="stack list-2">${list.filter((x) => !x.f.er).map((x) => hospitalRow(x)).join("")}</div>
  </section>${nav("doctors")}`;
}

function hospitalRow(x) {
  const n = DOCTORS.filter((d) => d.sessions.some((s) => s.fac === x.f.id)).length;
  return `<a class="card ${x.f.er ? "is-open" : ""}" href="#/hospital/${x.f.id}">
    <div class="card-top"><div class="avatar avatar--sq">${icon("building")}</div>
      <div class="grow"><div class="card-t">${esc(L(x.f))}</div>
        <div class="card-meta">${x.f.verified ? `<span class="seal">${icon("seal")}${t("verified")}</span><i class="dot"></i>` : ""}
          <span class="dist">${icon("pin")}${fmtKm(x.km)}</span><i class="dot"></i>
          <span><span class="num">${n}</span> ${isAR() ? "طبيب" : "doctors"}</span></div></div>
      ${x.f.er ? `<span class="chip chip--meta chip--warn">${isAR() ? "طوارئ ٢٤ ساعة" : "24h ER"}</span>` : ""}
    </div></a>`;
}

function screenHospital(id) {
  const f = fac(id); if (!f) return screen404();
  const docs = DOCTORS.filter((d) => d.sessions.some((s) => s.fac === f.id));
  const deps = [...new Set(docs.map((d) => d.spec))];
  return `${header({ back: true, title: "" })}
  <section class="prof-head">
    <div class="row" style="align-items:flex-start;gap:14px">
      <div class="avatar prof-avatar avatar--sq">${icon("building")}</div>
      <div class="grow"><h1 class="prof-name">${esc(L(f))}</h1>
        <div class="prof-spec">${t(f.type)} · ${esc(L(DISTRICTS.find((d) => d.id === f.district)))}</div>
        <div class="card-meta" style="margin-top:7px">${sealBadge(f)}<i class="dot"></i>${updatedLine(f)}</div></div>
    </div>
    ${f.er ? `<div class="banner banner--stop" style="margin-top:14px">${icon("alert")}
      <span>${isAR() ? "طوارئ تعمل ٢٤ ساعة" : "Emergency department open 24h"} · <span class="num">${CONFIG.emergency.unified}</span></span></div>` : ""}
    <div class="prof-facts">
      <div class="prof-fact"><div class="k">${isAR() ? "المسافة" : "Distance"}</div><div class="v">${fmtKm(distTo(f))}</div></div>
      <div class="prof-fact"><div class="k">${isAR() ? "الأطباء" : "Doctors"}</div><div class="v num">${docs.length}</div></div>
      <div class="prof-fact"><div class="k">${isAR() ? "الأقسام" : "Departments"}</div><div class="v num">${deps.length}</div></div>
    </div>
  </section>
  <section class="blk"><h3>${isAR() ? "الأقسام" : "Departments"}</h3>
    <div class="chips chips--wrap">${deps.map((s) => `<button class="chip" onclick="pickNeed('${s}')">${esc(L(specOf(s)))}</button>`).join("")}</div></section>
  <section class="blk"><h3>${isAR() ? "أطباء يداومون هنا" : "Doctors who practise here"}</h3>
    <div class="stack">${docs.map((d) => doctorCard({ d, km: distTo(f), st: status(d) })).join("")}</div></section>
  <div class="actionbar">
    <a class="btn" href="${mapLink(f)}" target="_blank" rel="noopener">${icon("nav")}${t("directions")}</a>
    <a class="icon-btn" href="tel:+${f.phone}">${icon("phone")}</a>
  </div>${nav("doctors")}`;
}

/* ---------------- MY REQUESTS ----------------
   The receipt drawer. Each entry shows the state we can actually justify —
   opened / you-sent-it / not-sent — never "delivered" and never "confirmed".
   Every entry stays actionable: reopen the chat, call, or get directions,
   because the most common reason to come back here is that nobody replied.
------------------------------------------------------------- */
function screenMe() {
  const reqs = S.requests || [];
  const stale = (r) => Date.now() - (r.ts || 0) > 864e5;   // older than a day

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <button class="b-g" style="font-size:13px" onclick="location.hash='#/trust'">${isAR() ? "كيف نتحقق" : "How we verify"}</button>
    </div>
    <div class="lab" style="margin-top:28px">${t("myRequests")}</div>
    <h1 class="d2" style="margin-top:8px">${reqs.length
      ? (isAR() ? countAr(reqs.length, ["طلب واحد", "طلبان", "طلبات", "طلباً"]) : `${reqs.length} request${reqs.length === 1 ? "" : "s"}`)
      : (isAR() ? "لا توجد طلبات بعد" : "No requests yet")}</h1>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "محفوظة على هذا الجهاز فقط. بلا حساب، وبلا رقمك."
      : "Saved on this device only. No account, and we never take your number."}</div>
  </section>

  ${reqs.length ? `<section class="pad" style="margin-top:26px">
    ${reqs.map((r) => {
      const st = REQ_STATE[r.state] || REQ_STATE.opened;
      return `<div class="rw${stale(r) ? " quiet" : ""}">
        ${r.state === "sent" ? `<span class="rw-lead" style="background:var(--jade)"></span>` : ""}
        <span class="av mono" style="font-size:12px;letter-spacing:.04em">${esc(r.ref)}</span>
        <span class="grow">
          <span class="rowb"><span class="d3">${esc(r.doctor)}</span>
            <span class="st ${st.cls}"><i class="dot"></i>${esc(isAR() ? st.ar : st.en)}</span></span>
          <span class="q-sub" style="display:block">${esc(r.facility)} · ${esc(r.when)}</span>
          <span class="t3" style="display:block;margin-top:4px"><span class="num">${esc(r.at)}</span></span>
          <span class="row" style="gap:14px;margin-top:10px;flex-wrap:wrap">
            ${r.wa ? `<a class="b-g" style="font-size:12.5px" href="https://wa.me/${esc(r.wa)}" target="_blank" rel="noopener"
              onclick="markRequest('${esc(r.ref)}','opened')">${isAR() ? "افتح المحادثة" : "Open chat"}</a>` : ""}
            ${r.phone ? `<a class="b-g" style="font-size:12.5px" href="tel:+${esc(r.phone)}">${t("call")}</a>` : ""}
            ${r.mapUrl ? `<a class="b-g" style="font-size:12.5px" href="${esc(r.mapUrl)}" target="_blank" rel="noopener">${t("directions")}</a>` : ""}
            ${r.state !== "sent" ? `<button class="b-g" style="font-size:12.5px" onclick="markRequest('${esc(r.ref)}','sent')">${isAR() ? "أرسلتها" : "I sent it"}</button>` : ""}
          </span>
        </span></div>`;
    }).join('<div class="hr"></div>')}
    <div class="t3" style="margin-top:18px;border-top:1px solid var(--dial-line-2);padding-top:14px">${isAR()
      ? "«أرسلتها» يعني أنك أخبرتنا — ما نكدر نشوف واتساب ولا نأكد وصول الرسالة."
      : "\"You sent it\" means you told us so — we cannot see inside WhatsApp or confirm delivery."}</div>
  </section>` : `<section class="pad" style="margin-top:30px">
    <div class="v2">
      <a class="btn" href="#/needs">${isAR() ? "ابحث عن طبيب" : "Find a doctor"}</a>
      <a class="btn btn--2" href="#/search">${isAR() ? "دوّر على دواء" : "Look for a medicine"}</a>
    </div>
    <div class="t3" style="margin-top:16px">${isAR()
      ? "عند إرسال طلب موعد يبقى إيصاله هنا برمزه، حتى تعرف أي عيادة ردّت."
      : "When you send a request, its stub stays here with a code, so you know which clinic replied."}</div>
  </section>`}

  ${S.saved.length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${t("savedItems")}</div>
    ${(() => {
      const rows = S.saved.map((k) => {
        const [ty, id] = k.split(":");
        if (ty === "d") { const d = DOCTORS.find((x) => x.id === id); return d ? { st: status(d), html: (live) => doctorCard({ d, km: docDist(d), st: status(d) }, live) } : null; }
        const f = fac(id); return f ? { st: status(f), html: (live) => pharmacyCard({ f, km: distTo(f), st: status(f) }, live) } : null;
      }).filter(Boolean);
      const live = rows.some((x) => x.st.k !== "shut");
      return rows.map((x) => x.html(live)).join('<div class="hr"></div>');
    })()}
  </section>` : ""}

  ${S.watch?.length || LS.get("watch", []).length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "أدوية تتابعها" : "Medicines you follow"}</div>
    ${LS.get("watch", []).map(medById).filter(Boolean).map((m) => {
      const c = pharmaciesForMed(m).confirmed.filter((x) => x.band !== "cold");
      return `<a class="rw" href="#/med/${m.id}">
        ${c.length ? `<span class="rw-lead" style="background:var(--jade)"></span>` : ""}
        <span class="av">${esc(L(m).charAt(0))}</span>
        <span class="grow">
          <span class="d3" style="display:block">${esc(L(m))}</span>
          <span class="q-sub" style="display:block">${c.length
            ? (isAR() ? `متوفّر الآن — ${esc(L(c[0].f))}` : `Available now — ${esc(L(c[0].f))}`)
            : (isAR() ? "لسّه ما توفّر" : "Still unavailable")}</span>
        </span></a>`;
    }).join('<div class="hr"></div>')}
  </section>` : ""}

  ${nav("home")}`;
}

function screenTrust() {
  return `${header({ back: true, title: t("trust") })}
  <section class="wrap sec">
    <h1 class="hero-line" style="font-size:25px">${isAR() ? "نعرض ما تحققنا منه فقط." : "We only show what we've checked."}</h1>
    <div class="stack" style="margin-top:20px">
      <div class="lane"><span class="ic">${icon("seal")}</span><span class="grow"><h3>${t("verified")}</h3>
        <p>${isAR() ? "تأكدنا من الهوية والاختصاص وجهة العمل ورقم الواتساب." : "Identity, specialty, affiliation and WhatsApp number confirmed."}</p></span></div>
      <div class="lane"><span class="ic">${icon("info")}</span><span class="grow"><h3>${t("listed")}</h3>
        <p>${isAR() ? "معلومات من مصادر عامة، لم نؤكدها بعد. تظهر بدون ختم." : "Publicly sourced, not yet confirmed. Shown without a seal."}</p></span></div>
      <div class="lane"><span class="ic">${icon("refresh")}</span><span class="grow"><h3>${isAR() ? "تاريخ التحديث" : "Last updated"}</h3>
        <p>${isAR() ? "كل صفحة تعرض متى حُدّثت. بعد ٩٠ يوماً ننبّهك." : "Every page shows its update date. After 90 days we warn you."}</p></span></div>
      <div class="lane"><span class="ic">${icon("flag")}</span><span class="grow"><h3>${t("reportInfo")}</h3>
        <p>${isAR() ? "زر في كل صفحة. البلاغات تصل فريق التحقق مباشرة." : "A button on every page. Reports go straight to the verification team."}</p></span></div>
    </div>
    <div class="banner banner--info" style="margin-top:18px">${icon("info")}<span>${isAR()
      ? "لا نعرض تقييمات أو نجوماً. بدون عدد كافٍ من التقييمات الحقيقية فهي إما فارغة أو مضللة."
      : "We show no ratings or stars. Without real volume they are either empty or gamed."}</span></div>
    <div class="banner banner--warn" style="margin-top:10px">${icon("alert")}<span>${isAR()
      ? `${L(CONFIG.brand)} لا يقدّم استشارة طبية ولا تشخيصاً. للحالات الطارئة اتصل بالرقم الموحد ${CONFIG.emergency.unified}.`
      : `${L(CONFIG.brand)} does not provide medical advice or diagnosis. In an emergency call ${CONFIG.emergency.unified}.`}</span></div>
    <div class="banner banner--info" style="margin-top:10px">${icon("check")}<span>${isAR()
      ? "بدون حساب، بدون كلمة مرور، ولا نحتفظ بأي بيانات صحية. طلبك يذهب مباشرة إلى العيادة عبر واتساب."
      : "No account, no password, no health data stored. Your request goes straight to the clinic over WhatsApp."}</span></div>
    <p class="tiny muted" style="margin-top:18px">${isAR() ? "البيانات المعروضة في هذا النموذج توضيحية. أرقام الهواتف غير حقيقية." : "Data in this prototype is illustrative. Phone numbers are not real."}</p>
    <div class="btn-row" style="margin-top:14px">
      <a class="btn btn--3" href="#/hospitals">${icon("building")}${isAR() ? "المستشفيات" : "Hospitals"}</a>
      <a class="btn btn--3" href="#/me">${icon("user")}${t("myRequests")}</a>
      <a class="btn btn--3" href="#/admin">${icon("grid")}${isAR() ? "لوحة التحكم" : "Admin"}</a>
    </div>
  </section>${nav("home")}`;
}

/* The failure the user actually hits is not a 404 — it is a route that throws.
   Before this, render() left the previous screen on the glass, so a tap simply
   appeared to do nothing, which reads as "this app is broken" with no way out.
   State it, take the blame, and always leave two doors open. */
function screenError(err) {
  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <button class="b-g" style="font-size:13px" onclick="goBack()">${isAR() ? "→ رجوع" : "← Back"}</button>
    <div class="lab" style="margin-top:28px">${isAR() ? "خطأ" : "Error"}</div>
    <div class="rowb" style="margin-top:14px">
      <span class="q-sub">${isAR()
        ? "ما كدرنا نجيب النتائج.<br><span class=\"t3\">الخلل عدنا، مو عندك.</span>"
        : "We couldn't load that.<br><span class=\"t3\">That's on us, not on you.</span>"}</span>
      <button class="btn btn--2 btn--sm" style="width:auto" onclick="render()">${isAR() ? "إعادة" : "Retry"}</button>
    </div>
    <div class="hr" style="margin:26px 0"></div>
    <a class="b-g" href="#/">${isAR() ? "الرئيسية" : "Home"}</a>
    ${err && CONFIG.debug ? `<pre class="t3" dir="ltr" style="margin-top:14px;white-space:pre-wrap">${esc(String(err && err.stack || err))}</pre>` : ""}
  </section>${nav("home")}`;
}

function screen404() {
  return `${header({ back: true, title: "" })}
  <div class="empty" style="padding-top:60px">
    <div class="empty-mark">${icon("pin")}</div>
    <h3>${isAR() ? "لم نصل إلى هنا بعد" : "We're not here yet"}</h3>
    <p>${isAR() ? "قريب يعمل حالياً في بغداد فقط. أخبرنا بمدينتك وسنعلمك عند الإطلاق." : "Qareeb currently covers Baghdad only. Tell us your city and we'll let you know."}</p>
    <a class="btn" href="#/">${icon("home")}${isAR() ? "تصفّح بغداد" : "Browse Baghdad"}</a>
    <button class="btn btn--3" onclick="toast('${isAR() ? "سنعلمك عند الإطلاق" : "We'll notify you at launch"}')">${icon("plus")}${isAR() ? "أعلمني عند الإطلاق" : "Notify me at launch"}</button>
  </div>${nav("home")}`;
}

/* ---------------- ADMIN ---------------- */
/* ==================================================================
   OPERATOR CONSOLE — a different product, not a different page
   ==================================================================
   The patient app is a 390px instrument used standing up. The operator
   console is a desk tool: dense, wide, scanning-oriented, and it does not
   share the patient shell — no bottom nav, no actionbar, its own wrapper,
   its own width. Everything on it is computed from the live model, because
   an operator screen showing invented numbers trains operators to ignore it.

   Four jobs, in the order they keep the network honest:
     1. STALE RADAR        — claims and profiles going bad right now
     2. VERIFICATION QUEUE — who is in the network without a human check
     3. SUPPLY GAPS        — where demand is going unanswered, by governorate
     4. INTEGRITY          — the validator, surfaced
------------------------------------------------------------- */
function screenAdmin() {
  const A = ADMIN_STATS;
  const pharmacies = allPharmacies();

  /* stale: availability claims in the stale band, and profiles nobody has
     touched in 90 days. Both are trust leaks, listed worst-first. */
  const staleSigs = SIGNALS.filter((g) => sigAgeMin(g) < SIG_TTL && sigAgeMin(g) >= 1440)
    .map((g) => ({ g, f: anyFac(g.fac), x: variantOf(g.v) })).filter((r) => r.f && r.x)
    .sort((p2, q2) => sigAgeMin(q2.g) - sigAgeMin(p2.g));
  const staleProfiles = [...pharmacies, ...DOCTORS].filter((e) => e.updated > 90);

  const unverified = [
    ...pharmacies.filter((f) => !f.verified).map((f) => ({ e: f, kind: isAR() ? "صيدلية" : "pharmacy", city: cityName(cityById(cityOf(f))) })),
    ...DOCTORS.filter((d) => !d.verified).map((d) => ({ e: d, kind: isAR() ? "طبيب" : "doctor", city: isAR() ? "بغداد" : "Baghdad" })),
  ];

  const gaps = supplyDemand();
  const integrity = validateData();
  /* What is genuinely between this build and a real launch. Computed from
     the actual data and the actual deployment flags, never from a checklist
     someone remembered to tick — a readiness board that can be right by
     accident is worse than none, because it grants permission to stop
     looking. Every item here is a thing that would harm a real user. */
  /* Read from the live deployment, not from constants someone remembers to
     update. When the backend is configured these two clear themselves; when
     it is not, no amount of code claiming otherwise can hide it. */
  const blockers = QD.launchBlockers(allPharmacies(), {
    dataPlane: NET.on,
    pharmacyAuthBackend: BACKEND.server,
    auditServerSide: BACKEND.server,
    realData: DATA_PROVENANCE.real,
  });
  const controlledCount = RX_MEDS.filter((m) => QD.isControlled(m)).length;
  const liveReq = liveRequests();
  const liveSig = SIGNALS.filter((g) => sigAgeMin(g) < SIG_TTL);

  const kpi = (n, l, warn) => `<div class="ops-kpi${warn ? " warn" : ""}">
    <div class="ops-n num">${n}</div><div class="ops-l">${l}</div></div>`;

  const sec = (title, note, body) => `<section class="ops-sec">
    <div class="rowb"><span class="lab">${title}</span>${note ? `<span class="t3">${note}</span>` : ""}</div>
    <div style="margin-top:10px">${body}</div></section>`;

  return `<div class="ops" dir="${isAR() ? "rtl" : "ltr"}">
  <header class="ops-hdr">
    <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
    <span class="lab">${isAR() ? "وحدة التشغيل" : "Operations"}</span>
    <span class="grow"></span>
    <span class="t3"><span class="num">${fmtT(nowMins())}</span> · ${isAR() ? "بيانات نموذج" : "prototype data"}</span>
    <a class="b-g" style="font-size:12.5px" href="#/">${isAR() ? "خروج للتطبيق" : "Exit to app"}</a>
  </header>

  <div class="ops-body">
    <div class="ops-kpis">
      ${kpi(liveSig.length, isAR() ? "إفادة توفّر حية" : "live signals")}
      ${kpi(liveReq.length, isAR() ? "طلب دواء نشط" : "active requests")}
      ${kpi(staleSigs.length, isAR() ? "إفادة تتقادم" : "aging claims", staleSigs.length > 0)}
      ${kpi(unverified.length, isAR() ? "بانتظار التوثيق" : "verification queue", unverified.length > 0)}
      ${kpi(A.zeroResults7d, isAR() ? "بحث بلا نتيجة (٧ أيام)" : "zero-result (7d)", true)}
      ${kpi(integrity.length, isAR() ? "خلل بيانات" : "integrity faults", integrity.length > 0)}
      ${kpi(blockers.length, isAR() ? "مانع إطلاق" : "launch blockers", blockers.length > 0)}
    </div>

    ${sec(isAR() ? "جاهزية الإطلاق" : "Launch readiness",
      isAR() ? "محسوبة من البيانات، مو من قائمة يدوية" : "computed, not ticked",
      blockers.length ? `
      <div class="t3" style="margin-bottom:12px">${isAR()
        ? "هذي الأشياء تؤذي مستخدماً حقيقياً لو أُطلقت الآن. مرتّبة كما هي، بلا تجميل."
        : "Each of these would harm a real user if launched today."}</div>
      ${blockers.map((b) => `<div class="ops-row">
        <span class="grow"><b>${esc(isAR() ? b.ar : b.id)}</b>
          <span class="t3" style="display:block mono">${esc(b.id)}</span></span>
        ${b.count > 1 ? `<span class="st st-e"><span class="num">${b.count}</span></span>` : `<span class="st st-e">${isAR() ? "مانع" : "blocker"}</span>`}
      </div>`).join("")}`
      : `<div class="t3">${isAR() ? "ما بقى مانع مسجّل." : "No recorded blockers."}</div>`)}

    ${sec(isAR() ? "الضوابط الفعّالة" : "Controls in force",
      isAR() ? "مفحوصة باختبارات" : "covered by tests",
      `<div class="ops-row"><span class="grow"><b>${isAR() ? "بوابة الصيدلية على الرادار" : "Pharmacy gate on the radar"}</b>
        <span class="t3" style="display:block">${isAR()
          ? "الدور والإجازة والفرع تُفحص عند كل إفادة، مو عند الباب بس"
          : "role, licence and branch checked on every claim"}</span></span>
        <span class="st st-v"><i class="dot"></i>${isAR() ? "فعّال" : "on"}</span></div>
      <div class="ops-row"><span class="grow"><b>${isAR() ? "منع بث الأدوية الخاضعة" : "Controlled medicines never broadcast"}</b>
        <span class="t3" style="display:block">${isAR()
          ? `<span class="num">${controlledCount}</span> دواء بالكتلوك — يُحوَّل لصيدلية مرخّصة`
          : `${controlledCount} in the catalogue — routed to a licensed pharmacy`}</span></span>
        <span class="st st-v"><i class="dot"></i>${isAR() ? "فعّال" : "on"}</span></div>
      <div class="ops-row"><span class="grow"><b>${isAR() ? "حمولة البث بقائمة سماح" : "Broadcast payload is a whitelist"}</b>
        <span class="t3" style="display:block">${isAR()
          ? "المَعلَم والرقم والصورة والملاحظة ما تغادر الجهاز"
          : "landmark, number, photo and note never leave the device"}</span></span>
        <span class="st st-v"><i class="dot"></i>${isAR() ? "فعّال" : "on"}</span></div>
      <div class="ops-row"><span class="grow"><b>${isAR() ? "سجل تدقيق مترابط" : "Hash-linked audit"}</b>
        <span class="t3" style="display:block">${BACKEND.server
          ? (isAR() ? "يُكتب على الخادم — المُدقَّق ما يكدر يعيد كتابته" : "written server-side — the audited party cannot rewrite it")
          : (isAR() ? "يكشف التعديل والحذف — على الجهاز، فما يمنعهما" : "detects edits and deletions — on-device, so it cannot prevent them")}</span></span>
        <span class="st ${BACKEND.server ? "st-v" : "st-t"}"><i class="dot"></i>${
          BACKEND.server ? (isAR() ? "فعّال" : "on") : (isAR() ? "جزئي" : "partial")}</span></div>
      <div class="ops-row"><span class="grow"><b>${isAR() ? "طبقة البيانات" : "Data plane"}</b>
        <span class="t3" style="display:block">${NET.on
          ? (isAR() ? "الطلبات تُنشر على الخادم وتصل صيدليات على أجهزة أخرى" : "requests reach pharmacies on other devices")
          : (isAR() ? "الطلب ما يغادر جهاز المريض — الحلقة الأساسية معطّلة" : "the request never leaves the patient's device")}</span></span>
        <span class="st ${NET.on ? "st-v" : "st-e"}"><i class="dot"></i>${
          NET.on ? (isAR() ? "فعّالة" : "on") : (isAR() ? "غائبة" : "absent")}</span></div>
      <div class="ops-row"><span class="grow"><b>${isAR() ? "وضع التشغيل" : "Runtime mode"}</b>
        <span class="t3" style="display:block">${BACKEND.server
          ? (isAR() ? "خادم — الجلسات موقّعة، والإجازة تُفحص مقابل قائمة معتمدة" : "server — sessions signed, licence checked against the approved list")
          : (isAR() ? "جهاز — القواعد سارية لكن الاعتماد يُفحص على جهاز صاحبه" : "device — rules hold, but the credential is checked on the claimant's own device")}</span></span>
        <span class="st ${BACKEND.server ? "st-v" : "st-e"}"><i class="dot"></i>${esc(backendMode())}</span></div>`)}

    <div class="ops-cols">
      <div>
        ${sec(isAR() ? "رادار التقادم" : "Stale radar",
          isAR() ? "الأسوأ أولاً" : "worst first",
          staleSigs.length || staleProfiles.length ? `
          ${staleSigs.map(({ g, f, x }) => `<div class="ops-row">
            <span class="grow"><b>${esc(L(x.med))} ${esc(x.v.strength)}</b>
              <span class="t3" style="display:block">${esc(L(f))} · ${esc(cityName(cityById(cityOf(f))))}</span></span>
            <span class="st st-t">${sigAge(sigAgeMin(g))}</span>
          </div>`).join("")}
          ${staleProfiles.map((e) => `<div class="ops-row">
            <span class="grow"><b>${esc(L(e))}</b>
              <span class="t3" style="display:block">${isAR() ? "ملف بلا تحديث" : "profile untouched"}</span></span>
            <span class="st st-e"><span class="num">${e.updated}</span> ${isAR() ? "يوم" : "d"}</span>
          </div>`).join("")}`
          : `<div class="t3">${isAR() ? "لا شيء يتقادم حالياً." : "Nothing going stale."}</div>`)}

        ${sec(isAR() ? "طابور التوثيق" : "Verification queue",
          isAR() ? `<span class="num">${unverified.length}</span>` : String(unverified.length),
          unverified.length ? unverified.map(({ e, kind, city }) => `<div class="ops-row">
            <span class="grow"><b>${esc(L(e))}</b>
              <span class="t3" style="display:block">${kind} · ${esc(city)}</span></span>
            <span class="t3">${isAR() ? "يظهر بلا ختم" : "shown unsealed"}</span>
          </div>`).join("") : `<div class="t3">${isAR() ? "الكل موثّق." : "Everyone verified."}</div>`)}

        ${sec(isAR() ? "سلامة البيانات" : "Data integrity", "",
          integrity.length ? integrity.map((e) => `<div class="ops-row">
            <span class="grow">${esc(e.m)}</span><span class="st st-e">${esc(e.t)}</span></div>`).join("")
          : `<div class="ops-row"><span class="grow">${isAR()
              ? "المدقّق نظيف — المعرّفات، المراجع، المدد، البدائل."
              : "Validator clean — ids, references, ranges, substitutes."}</span>
              <span class="st st-v"><i class="dot"></i>${isAR() ? "سليم" : "ok"}</span></div>`)}
      </div>

      <div>
        ${sec(isAR() ? "فجوات التوفّر — حسب المحافظة" : "Supply gaps — by governorate",
          isAR() ? "الطلب مقابل الإفادات الحية" : "demand vs live signals",
          gaps.map(({ c, supply, demand, gap }) => {
            const mx = Math.max(...gaps.map((x) => Math.max(x.supply, x.demand)), 1);
            return `<div class="ops-row" style="display:block">
              <div class="rowb"><b>${esc(cityName(c))}</b>
                ${gap > 0 ? `<span class="st st-t">${isAR() ? "فجوة" : "gap"} <span class="num">${gap}</span></span>`
                          : `<span class="st st-v"><i class="dot"></i>${isAR() ? "مغطّى" : "covered"}</span>`}</div>
              <div class="ops-bars">
                <span class="t3">${isAR() ? "طلب" : "D"}</span><span class="ops-bar"><i style="width:${(demand / mx) * 100}%;background:var(--brass)"></i></span><span class="t3 num">${demand}</span>
                <span class="t3">${isAR() ? "توفّر" : "S"}</span><span class="ops-bar"><i style="width:${(supply / mx) * 100}%;background:var(--jade)"></i></span><span class="t3 num">${supply}</span>
              </div></div>`;
          }).join(""))}

        ${sec(isAR() ? "بحث بلا نتيجة — إشارة النمو" : "Zero-result searches — the growth signal", "",
          A.zeroQueries.map(([q, n]) => `<div class="ops-row">
            <span class="grow">${esc(q)}</span><span class="num" style="font-weight:500">${n}</span></div>`).join(""))}

        ${sec(isAR() ? "طلب الأدوية حسب المنطقة" : "Medicine demand by district",
          isAR() ? "يُسأل / يُلبّى" : "asked / filled",
          MED_DEMAND.map((r) => {
            const m = medById(r.med), d = DISTRICTS.find((x) => x.id === r.district);
            const rate = Math.round((r.filled / r.asks) * 100);
            return `<div class="ops-row">
              <span class="grow"><b>${esc(L(m))}</b> <span class="t3">· ${esc(L(d))}</span></span>
              <span class="num" style="font-weight:500">${r.asks}</span>
              <span class="st ${rate < 30 ? "st-t" : "st-q"}" style="width:44px;justify-content:flex-end"><span class="num">${rate}٪</span></span>
            </div>`;
          }).join(""))}
      </div>
    </div>
  </div></div>`;
}

function sheet(html, cls = "") {
  closeSheet(true);
  const scrim = document.createElement("div"); scrim.className = "scrim"; scrim.onclick = () => closeSheet();
  const el = document.createElement("div"); el.className = "sheet " + cls; el.innerHTML = html;
  document.body.append(scrim, el);
  requestAnimationFrame(() => { scrim.classList.add("in"); el.classList.add("in"); });
  document.body.style.overflow = "hidden";
}
function closeSheet(instant) {
  document.body.style.overflow = "";
  document.querySelectorAll(".sheet,.scrim").forEach((n) => {
    if (instant) return n.remove();
    n.classList.remove("in"); setTimeout(() => n.remove(), 260);
  });
}

function openLocation() {
  const rows = DISTRICTS.map((d) => {
    const n = DOCTORS.filter((x) => x.sessions.some((s) => haversine(d, fac(s.fac)) <= 5)).length;
    const lm = isAR() ? d.lm_ar : d.lm_en;
    return `<button class="place ${d.id === S.district ? "on" : ""}" onclick="setDistrict('${d.id}')">
      <h3>${esc(L(d))}</h3>
      <div class="m lm">${esc(lm)}</div>
      <div class="m"><span class="num">${n}</span> ${isAR() ? "طبيب قريب" : "doctors near"}</div></button>`;
  }).join("");
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${t("pickArea")}</h2>
      <p>${isAR() ? "اختر منطقة — أو معلماً تعرفه. لا نسأل عن عنوان شارع أبداً."
                  : "Pick an area — or a landmark you know. We never ask for a street address."}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <button class="lane on" onclick="askGps()" style="width:100%">
        <span class="ic">${icon("nav")}</span>
        <span class="grow" style="text-align:start"><h3>${t("useGps")}</h3>
          <p>${isAR() ? "مسافات دقيقة وترتيب حسب الأقرب" : "Exact distances and nearest-first sorting"}</p></span>
        <span class="go">${icon("chev")}</span></button>
      ${S.locState === "denied" ? `<div class="banner banner--${S.gpsReason === "policy" || S.gpsReason === "insecure" ? "warn" : "info"}" style="margin-top:10px">
        ${icon(S.gpsReason === "policy" || S.gpsReason === "insecure" ? "alert" : "info")}
        <span>${esc(L(GPS_MSG[S.gpsReason] || GPS_MSG.denied))}</span></div>` : ""}
      <h3 class="eyebrow" style="margin:20px 0 10px">${isAR() ? "أو اختر منطقتك" : "Or choose your area"}</h3>
      <div class="places">${rows}</div>
      <button class="btn btn--3" style="margin-top:14px" onclick="closeSheet()">${t("withoutLoc")}</button>
    </div>`);
}

// Why a diagnosis and not one generic message: getCurrentPosition fails for
// five different reasons and only one of them is the user's to fix. Telling
// someone to "check your browser settings" when the HOST is blocking the API
// sends them somewhere they can do nothing. Each cause gets its own sentence.
const GPS_MSG = {
  denied:      { ar: "رفضتَ إذن الموقع في المتصفح — لا مشكلة، اختر منطقتك ويعمل كل شيء كالمعتاد.",
                 en: "Location permission was denied — no problem, pick your area and everything still works." },
  timeout:     { ar: "تأخّر تحديد الموقع (الشبكة بطيئة؟). اختر منطقتك يدوياً — أسرع على أي حال.",
                 en: "Locating timed out. Pick your area instead — it's faster anyway." },
  unavailable: { ar: "تعذّر على جهازك تحديد الموقع الآن. اختر منطقتك يدوياً.",
                 en: "Your device couldn't get a fix right now. Pick your area instead." },
  insecure:    { ar: "تحديد الموقع يحتاج اتصالاً آمناً (HTTPS). اختر منطقتك يدوياً.",
                 en: "Location needs a secure (HTTPS) connection. Pick your area instead." },
  unsupported: { ar: "متصفحك لا يدعم تحديد الموقع. اختر منطقتك يدوياً.",
                 en: "This browser doesn't support location. Pick your area instead." },
  policy:      { ar: "الاستضافة تمنع تحديد الموقع في هذه الصفحة — ليس خطأً منك. اختر منطقتك يدوياً.",
                 en: "The host blocks location on this page — not something you can fix. Pick your area instead." },
};

function askGps() {
  const b = document.querySelector(".sheet .lane.on");
  if (b) b.innerHTML = `<span class="ic">${icon("nav")}</span>
    <span class="grow" style="text-align:start"><h3>${t("loading")}…</h3>
      <p>${isAR() ? "اسمح للمتصفح بالوصول للموقع" : "Allow location in your browser"}</p></span>`;
  if (!window.isSecureContext) return gpsFail("insecure");
  if (!navigator.geolocation) return gpsFail("unsupported");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const near = DISTRICTS.map((d) => ({ d, k: haversine(me, d) })).sort((a, b) => a.k - b.k)[0];

      /* THE SNAP MUST BE BOUNDED. Without this, a patient in Kut — 160 km
         from Baghdad — was snapped to the nearest Baghdad district, their
         real coordinates discarded, and then shown "صيدلية زيونة · 3.2 كم"
         with the approximation caveat suppressed because locState had been
         set to "precise". A fabricated distance is the most dangerous thing
         this product can print: someone drives across a governorate at night
         on the strength of it.

         Outside the covered map we say so. The app already has an honest
         screen for exactly this case — screenHomeAway, which states the
         coverage boundary in words — and it was unreachable by GPS. */
      const CITY_SNAP_KM = 40;
      if (!near || near.k > CITY_SNAP_KM) {
        const city = CITIES.map((c) => ({ c, k: haversine(me, c) })).sort((a, b) => a.k - b.k)[0];
        const known = city && city.k <= 150;
        S.gps = true; S.locState = "approx"; S.gpsReason = null;
        LS.set("gps", true); LS.set("locState", "approx");
        if (known) {
          S.exCity = city.c.id; LS.set("exCity", city.c.id);
          toast(isAR() ? `أنت خارج تغطية بغداد — عرضنا ${cityName(city.c)}`
                       : `Outside Baghdad coverage — showing ${cityName(city.c)}`);
        } else {
          toast(isAR() ? "ما نغطّي منطقتك بالدليل المحلي بعد — نعرض الشبكة الوطنية"
                       : "Your area is not in the local directory yet — showing the national network");
        }
        closeSheet(); render();
        return;
      }

      S.locState = "precise"; S.gps = true; S.gpsReason = null;
      LS.set("gps", true); LS.set("locState", "precise");
      setDistrict(near.d.id);
      toast(isAR() ? `حُدّد موقعك — أقرب منطقة: ${L(near.d)}` : `Located — nearest area: ${L(near.d)}`);
    },
    (err) => {
      // A Permissions-Policy block also arrives as PERMISSION_DENIED, but the
      // message names the policy. Separating it matters: the user cannot fix it.
      const msg = String(err && err.message || "");
      const policy = err && err.code === 1 && /policy/i.test(msg);
      gpsFail(policy ? "policy" : !err ? "unavailable"
        : err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable");
    },
    { timeout: 9000, maximumAge: 60000, enableHighAccuracy: false }
  );
}

function gpsFail(reason = "unavailable") {
  S.locState = "denied"; S.gpsReason = reason;
  LS.set("locState", "denied");
  openLocation();
}

function setDistrict(id) {
  S.district = id; LS.set("district", id);
  if (S.locState === "inferred" || S.locState === "denied") { S.locState = "chosen"; LS.set("locState", "chosen"); }
  closeSheet(); render();
}

/* --- appointment request --- */
function upcomingSlots(d, n = 7) {
  const out = []; const d0 = nowDay(), now = nowMins();
  for (let i = 0; i < 14 && out.length < n; i++) {
    const day = (d0 + i) % 7;
    rawSegs(d, day).sort((a, b) => a.f - b.f).forEach((s) => {
      if (out.length >= n) return;
      if (i === 0 && s.t <= now) return;
      out.push({ day, i, seg: s });
    });
  }
  return out;
}

function openRequest(id) {
  const d = DOCTORS.find((x) => x.id === id);
  const slots = upcomingSlots(d);
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${t("request")}</h2><p>${esc(L(d))} · ${esc(L(specOf(d.spec)))}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <div class="reassure">
        <div class="reassure-r">${icon("check")}<span>${isAR() ? "ما تدفع شي هسه — الطلب مجاني" : "Nothing to pay now — the request is free"}</span></div>
        <div class="reassure-r">${icon("wa")}<span>${isAR() ? "ترسل من واتساب مالك، وتشوف الرسالة قبل الإرسال" : "Sent from your own WhatsApp, previewed first"}</span></div>
        <div class="reassure-r">${icon("clock")}<span>${isAR() ? "العيادة ترد عادة خلال ١٥–٦٠ دقيقة بأوقات الدوام" : "Clinics usually reply in 15–60 min during hours"}</span></div>
      </div>
      <label class="eyebrow" style="display:block;margin-top:18px">${t("chooseTime")}</label>
      <div class="slot" style="margin-top:9px">
        ${slots.map((s, i) => `<button class="slot-btn ${i === 0 ? "on" : ""}" data-i="${i}" onclick="pickSlot(${i})">
          <span><span class="d">${s.i === 0 ? t("today") : s.i === 1 ? t("tomorrow") : dayName(s.day)}</span>
            <span class="m">${esc(L(s.seg.fac))} · ${money(s.seg.s.fee)}</span></span>
          <span class="t">${fmtRange(s.seg.f, s.seg.t)}</span></button>`).join("")}
      </div>
      <div class="field"><label for="nm">${t("yourName")}</label>
        <input id="nm" value="${esc(S.name)}" placeholder="${isAR() ? "الاسم الثلاثي" : "Full name"}" autocomplete="name"></div>
      <div class="field"><label for="nt">${t("note")}</label>
        <textarea id="nt" rows="2" placeholder="${isAR() ? "مثال: مراجعة سابقة، أو حالة الطفل" : "e.g. follow-up visit"}"></textarea></div>
      <div class="hint">${icon("info")}<span>${isAR()
        ? "لا نطلب رقم هاتفك — رقمك يصل مع رسالة الواتساب. لا حساب ولا كلمة مرور."
        : "We don't ask for your phone number — WhatsApp carries it. No account, no password."}</span></div>
    </div>
    <div class="sheet-f"><button class="btn" onclick="toPreview('${d.id}')">${t("continue")}${icon("chev")}</button></div>`);
  window.__slot = 0; window.__slots = slots;
}
function pickSlot(i) {
  window.__slot = i;
  document.querySelectorAll(".slot-btn").forEach((b) => b.classList.toggle("on", +b.dataset.i === i));
}

function apptMsg(d, s, name, note, ref) {
  const when = `${dayName(s.day)} ${fmtRangeTxt(s.seg.f, s.seg.t)}`;
  if (isAR()) {
    return `السلام عليكم، أود حجز موعد.

الطبيب: ${d.ar}
العيادة: ${s.seg.fac.ar} — ${DISTRICTS.find((x) => x.id === s.seg.fac.district).ar}
الموعد المطلوب: ${when}
الاسم: ${name}${note ? `\nملاحظة: ${note}` : ""}

الرمز: ${ref}
—
عبر قريب`;
  }
  return `Hello, I'd like to request an appointment.

Doctor: ${d.en}
Clinic: ${s.seg.fac.en} — ${DISTRICTS.find((x) => x.id === s.seg.fac.district).en}
Requested: ${when}
Name: ${name}${note ? `\nNote: ${note}` : ""}

Ref: ${ref}
—
via Qareeb`;
}
const directMsg = (d) => isAR()
  ? `السلام عليكم، وصلت لعيادة ${d.ar} عبر تطبيق قريب وأود الاستفسار عن موعد.`
  : `Hello, I found ${d.en} through Qareeb and would like to ask about an appointment.`;
const productMsg = (p, f) => isAR()
  ? `السلام عليكم، أود الاستفسار عن توفر:\n\nالمنتج: ${p.ar}\nالماركة: ${p.brand}\nالسعر المعروض: ${money(p.price)}\n\n—\nعبر قريب`
  : `Hello, is this available?\n\nProduct: ${p.en}\nBrand: ${p.brand}\nListed price: ${money(p.price)}\n\n—\nvia Qareeb`;

function toPreview(id) {
  /* Check for a request to the same doctor and slot before showing the
     message again. Someone tapping twice usually wants the first one's
     status, not a second message landing in the clinic's inbox.

     The name and note are read HERE, before anything can open a sheet. The
     guard's sheet replaces the DOM that holds #nm and #nt, so reading them
     after it has opened throws on null — which is what happened on every
     "send anyway": the loop above kept it from ever getting that far, and the
     crash was waiting behind it. */
  const val = (elId) => { const el = document.getElementById(elId); return el ? (el.value || "").trim() : null; };
  const typed = { name: val("nm"), note: val("nt") };
  if (typed.name !== null) window.__typed = typed;

  const dd = DOCTORS.find((x) => x.id === id);
  const ss = dd && window.__slots && window.__slots[window.__slot || 0];
  if (dd && ss && !window.__dupOK) {
    const when = `${dayName(ss.day)} ${fmtRangeTxt(ss.seg.f, ss.seg.t)}`;
    const prior = priorRequest(id, when);
    if (prior) return duplicateGuard(id, when, () => toPreview(id));
  }
  window.__dupOK = false;        /* one shot, consumed */
  return toPreviewInner(id);
}

function toPreviewInner(id) {
  const d = DOCTORS.find((x) => x.id === id);
  /* Prefer the live fields; fall back to what toPreview captured before a
     sheet replaced them. */
  const live = (elId) => { const el = document.getElementById(elId); return el ? (el.value || "").trim() : null; };
  const kept = window.__typed || {};
  const name = live("nm") ?? kept.name ?? "";
  const note = live("nt") ?? kept.note ?? "";
  if (!name) {
    toast(isAR() ? "اكتب اسمك من فضلك" : "Please enter your name");
    const el = document.getElementById("nm"); if (el) el.focus();
    return;
  }
  S.name = name; LS.set("name", name);
  const s = window.__slots[window.__slot];
  const ref = refCode();
  const msg = apptMsg(d, s, name, note, ref);
  const link = d.wa ? waLink(d.wa, msg) : null;

  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${isAR() ? "هذه هي رسالتك" : "This is your message"}</h2>
      <p>${isAR() ? "راجعها أو عدّلها قبل الإرسال." : "Review or edit it before sending."}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <div class="slip">
        <div class="slip-h">
          <span class="lab">${esc(L(CONFIG.brand))} · ${isAR() ? "طلب موعد" : "Appointment request"}</span>
          <span class="slip-ref" dir="ltr">${ref}</span>
        </div>
        <div class="bubble" id="msg" contenteditable="true" spellcheck="false">${esc(msg)}</div>
        <div class="slip-to rowb">
          <span>${isAR() ? "إلى" : "To"} ${d.wa ? `<span class="num">+${d.wa}</span>` : (isAR() ? "غير متوفر" : "unavailable")}</span>
          <button class="b-g" style="font-size:12px" onclick="document.getElementById('msg').focus()">${t("edit")}</button>
        </div>
      </div>
      ${!d.wa ? `<div class="note" style="margin-top:16px"><span>${t("noWa")}</span></div>` : ""}
    </div>
    <div class="sheet-f">
      ${d.wa ? `<a class="btn btn--wa" id="sendbtn" href="${link}" target="_blank" rel="noopener"
          onclick="handoffOpened('${d.id}','${ref}','${esc(dayName(s.day))} ${esc(fmtRangeTxt(s.seg.f, s.seg.t))}','${esc(L(s.seg.fac))}')">
          ${t("sendWa")}</a>`
        : `<a class="btn" href="tel:+${d.phone}">${t("call")} +${d.phone}</a>`}
      <div class="t3" style="text-align:center;margin-top:14px">${isAR()
        ? "تُرسل من واتسابك — لا نطلب رقمك ولا نُنشئ حساباً."
        : "Sent from your own WhatsApp — we never ask for your number or create an account."}</div>
    </div>`);
}

/* ---------------- THE HANDOFF, HONESTLY ----------------
   What we actually know when the user taps "send on WhatsApp" is that we
   asked the OS to open WhatsApp. We do not know that WhatsApp opened, that a
   message was typed, that send was pressed, that the number was right, or
   that anyone read it. The previous version stamped "SENT" and told the user
   "your message reached the clinic" — a claim built on nothing, at the exact
   moment the product is asking to be trusted.

   So the request is recorded as `opened`, and then we ask. Three states, all
   of them things we can actually justify:

     opened     — we opened WhatsApp. That is all we know.
     sent       — the user told us they sent it. Self-reported, labelled so.
     abandoned  — the user told us they did not. Route them to the phone.

   There is no `delivered` and there is no `confirmed`, because nothing in
   this architecture can observe either one.
------------------------------------------------------------- */
const REQ_STATE = {
  opened:    { ar: "فتحنا واتساب",    en: "WhatsApp opened",  cls: "st-q" },
  sent:      { ar: "أرسلتها",          en: "You sent it",      cls: "st-v" },
  abandoned: { ar: "لم تُرسل",         en: "Not sent",         cls: "st-t" },
};

/* A person who taps the same doctor twice in five minutes almost never wants
   two requests — they want to know what happened to the first one. */
function priorRequest(docId, when) {
  return S.requests.find((r) => r.doc === docId && r.when === when &&
    Date.now() - (r.ts || 0) < 36e5);
}

function handoffOpened(id, ref, when, facility) {
  const d = DOCTORS.find((x) => x.id === id);
  if (!d) return;
  S.requests.unshift({
    ref, doc: d.id, doctor: L(d), facility, when, wa: d.wa, phone: d.phone,
    state: "opened", ts: Date.now(),
    mapUrl: mapLink(docFacs(d)[0]),
    at: new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
  });
  LS.set("requests", S.requests.slice(0, 20));
  /* Deliberately delayed: the sheet must not appear over WhatsApp while the
     user is still in it. It is waiting when they come back. */
  setTimeout(() => askHandoff(ref), 1200);
}

function askHandoff(ref) {
  const r = S.requests.find((x) => x.ref === ref);
  if (!r) return;
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div>
      <div class="lab">${isAR() ? "طلب" : "Request"} <span class="mono">${esc(r.ref)}</span></div>
      <h2 style="margin-top:8px">${isAR() ? "فتحنا واتساب — أرسلتها؟" : "WhatsApp opened — did you send it?"}</h2>
      <p>${isAR()
        ? "ما نكدر نشوف واتساب، فما نعرف. كولنا وبس، حتى نعرض لك الحالة الصح."
        : "We can't see inside WhatsApp, so we don't know. Tell us, and we'll show you the honest state."}</p>
    </div></div>
    <div class="sheet-b">
      <div class="plate">
        <div class="rowb"><span class="d3">${esc(r.doctor)}</span><span class="mono">${esc(r.ref)}</span></div>
        <div class="q-sub" style="margin-top:4px">${esc(r.facility)} · ${esc(r.when)}</div>
      </div>
      <div class="v2" style="margin-top:18px">
        <button class="btn" onclick="markRequest('${esc(r.ref)}','sent')">${isAR() ? "إي، أرسلتها" : "Yes, I sent it"}</button>
        <button class="btn btn--2" onclick="markRequest('${esc(r.ref)}','abandoned')">${isAR() ? "لا، ما أرسلتها" : "No, I didn't"}</button>
      </div>
      <div class="t3" style="text-align:center;margin-top:14px">${isAR()
        ? "الطلب محفوظ برمزه بأي حال — تكدر ترجعله من «طلباتي»."
        : "The request is saved with its code either way — you can return to it from My requests."}</div>
    </div>`);
}

function markRequest(ref, state) {
  const r = S.requests.find((x) => x.ref === ref);
  if (!r) return closeSheet();
  r.state = state; r.ts = Date.now();
  LS.set("requests", S.requests.slice(0, 20));
  const d = DOCTORS.find((x) => x.id === r.doc);
  if (state === "sent") {
    /* No "delivered", no "confirmed". What we can honestly add is what
       happens next and what to do if it doesn't. */
    sheet(`<div class="sheet-grip"></div>
      <div class="sheet-h"><div>
        <div class="lab">${isAR() ? "محفوظ" : "Saved"}</div>
        <h2 style="margin-top:8px">${isAR() ? "خلص — رمزك محفوظ" : "Done — your code is saved"}</h2>
        <p>${isAR()
          ? "العيادات ترد عادةً خلال ١٥–٦٠ دقيقة بأوقات الدوام. ما نكدر نأكد وصولها، بس رمزك عندك."
          : "Clinics usually reply within 15–60 minutes during working hours. We can't confirm delivery, but you have your code."}</p>
      </div></div>
      <div class="sheet-b">
        <div class="plate">
          <div class="rowb"><span class="d3">${esc(r.doctor)}</span><span class="mono">${esc(r.ref)}</span></div>
          <div class="q-sub" style="margin-top:4px">${esc(r.facility)} · ${esc(r.when)}</div>
          <div class="row" style="margin-top:10px"><span class="st st-v"><i class="dot"></i>${isAR() ? "أرسلتها" : "You sent it"}</span></div>
        </div>
        <div class="lab" style="margin-top:22px">${isAR() ? "وإذا ما وصلك رد؟" : "And if nobody replies?"}</div>
        <div class="q-sub" style="margin-top:6px">${isAR()
          ? "بعض العيادات ما تتابع واتساب وقت الزحام. الاتصال أسرع."
          : "Some clinics don't watch WhatsApp when busy. Calling is faster."}</div>
        <div class="v2" style="margin-top:14px">
          ${r.phone ? `<a class="btn btn--2" href="tel:+${esc(r.phone)}">${t("call")} <span class="num">+${esc(r.phone)}</span></a>` : ""}
          ${d ? `<button class="btn btn--2" onclick="closeSheet();pickNeed('${d.spec}')">${isAR() ? "طبيب بديل بنفس الاختصاص" : "Another doctor, same specialty"}</button>` : ""}
          <button class="btn btn--3" onclick="closeSheet();location.hash='#/me'">${t("myRequests")}</button>
        </div>
      </div>`);
  } else {
    sheet(`<div class="sheet-grip"></div>
      <div class="sheet-h"><div>
        <h2>${isAR() ? "ما مشكلة" : "No problem"}</h2>
        <p>${isAR()
          ? "خلّيناه محفوظاً برمزه. تكدر ترسله بعدين، أو تتصل مباشرة."
          : "We kept it with its code. Send it later, or just call."}</p>
      </div></div>
      <div class="sheet-b"><div class="v2">
        ${r.wa ? `<a class="btn btn--wa" href="https://wa.me/${esc(r.wa)}" target="_blank" rel="noopener"
          onclick="markRequest('${esc(r.ref)}','opened')">${isAR() ? "افتح واتساب مرة ثانية" : "Open WhatsApp again"}</a>` : ""}
        ${r.phone ? `<a class="btn btn--2" href="tel:+${esc(r.phone)}">${t("call")} <span class="num">+${esc(r.phone)}</span></a>` : ""}
        <button class="btn btn--3" onclick="closeSheet()">${isAR() ? "إغلاق" : "Close"}</button>
      </div></div>`);
  }
}

/* Tapping the same doctor and slot again within the hour is almost never a
   second request — it is someone checking on the first one. */
function duplicateGuard(docId, when, proceed) {
  const prior = priorRequest(docId, when);
  if (!prior) return proceed();
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div>
      <h2>${isAR() ? "عندك طلب لنفس الموعد" : "You already have a request for this slot"}</h2>
      <p>${isAR()
        ? "أرسلته قبل شوي. إرسال ثاني يوصلهم مرتين — بس القرار قرارك."
        : "You sent it recently. Sending again reaches them twice — but it's your call."}</p>
    </div></div>
    <div class="sheet-b">
      <div class="plate">
        <div class="rowb"><span class="d3">${esc(prior.doctor)}</span><span class="mono">${esc(prior.ref)}</span></div>
        <div class="q-sub" style="margin-top:4px">${esc(prior.facility)} · ${esc(prior.when)}</div>
        <div class="row" style="margin-top:10px"><span class="st ${REQ_STATE[prior.state].cls}"><i class="dot"></i>${
          esc(isAR() ? REQ_STATE[prior.state].ar : REQ_STATE[prior.state].en)}</span>
          <span class="t3" style="margin-inline-start:auto"><span class="num">${esc(prior.at)}</span></span></div>
      </div>
      <div class="v2" style="margin-top:18px">
        <button class="btn btn--2" onclick="closeSheet();location.hash='#/me'">${isAR() ? "شوف الطلب" : "See the request"}</button>
        ${prior.phone ? `<a class="btn btn--2" href="tel:+${esc(prior.phone)}">${t("call")}</a>` : ""}
        <button class="btn btn--3" onclick="dupSendAnyway()">${isAR() ? "أرسل مرة ثانية" : "Send anyway"}</button>
      </div>
    </div>`);
  window.__dupPending = proceed;
}

/* "Send anyway" was an infinite loop, and reading the two lines apart from
   each other is why it survived.

   `toPreview` gates on `!window.__dupProceed` — "no override is in flight, so
   check for a duplicate". The override handler set that same variable to null
   BEFORE calling proceed(). So proceed() re-entered toPreview, the gate saw
   null, and the guard sheet opened again. The prior request is still in
   S.requests, so it opened forever.

   One flag cannot mean both "here is the override" and "an override is
   running". Now there are two: __dupPending holds the continuation, and
   __dupOK is the one-shot permission that toPreview consumes. */
function dupSendAnyway() {
  const go = window.__dupPending;
  if (!go) return;
  window.__dupPending = null;
  window.__dupOK = true;      /* consumed by toPreview, once */
  go();
}

function openEmergency() {
  const er = FACILITIES.filter((f) => f.er).map((f) => ({ f, km: distTo(f) })).sort((a, b) => a.km - b.km).slice(0, 3);
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2 style="color:var(--coral)">${t("emergency")}</h2>
      <p>${isAR() ? "إذا كانت الحالة خطرة، اتصل بالإسعاف فوراً." : "If this is serious, call the ambulance now."}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <a class="btn btn--danger" href="tel:${CONFIG.emergency.unified}">${icon("phone")}${isAR() ? "الطوارئ الموحد" : "Unified emergency"} <span class="num">${CONFIG.emergency.unified}</span></a>
      <a class="btn btn--2" href="tel:${CONFIG.emergency.ambulance}">${icon("phone")}${t("ambulance")} <span class="num">${CONFIG.emergency.ambulance}</span></a>
      <h3 class="eyebrow" style="margin:20px 0 10px">${t("nearestEr")}</h3>
      <div class="stack">${er.map((x) => hospitalRow(x)).join("")}</div>
      <p class="tiny muted" style="margin-top:14px">${isAR() ? "تحقق من رقم الإسعاف المحلي قبل الاعتماد عليه." : "Verify the local ambulance number before relying on it."}</p>
    </div>`);
}

function reportInfo() {
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${t("reportInfo")}</h2>
      <p>${isAR() ? "ما الذي وجدته غير صحيح؟" : "What did you find wrong?"}</p></div>
      <button class="icon-btn" onclick="closeSheet()">${icon("close")}</button></div>
    <div class="sheet-b">
      <div class="chips chips--wrap">${(isAR()
        ? ["الدوام غير صحيح", "الرقم لا يعمل", "العنوان تغيّر", "الأجرة مختلفة", "لم يعد يعمل هنا", "شيء آخر"]
        : ["Hours are wrong", "Number doesn't work", "Address changed", "Fee is different", "No longer works here", "Something else"])
        .map((x) => `<button class="chip" onclick="this.classList.toggle('on')">${x}</button>`).join("")}</div>
      <div class="field"><label>${isAR() ? "تفاصيل (اختياري)" : "Details (optional)"}</label><textarea rows="3"></textarea></div>
      <div class="hint">${icon("seal")}<span>${isAR() ? "يصل البلاغ لفريق التحقق خلال يوم عمل." : "Reports reach the verification team within one working day."}</span></div>
    </div>
    <div class="sheet-f"><button class="btn" onclick="closeSheet();toast('${isAR() ? "شكراً — وصل بلاغك" : "Thank you — report received"}')">${icon("flag")}${isAR() ? "أرسل البلاغ" : "Send report"}</button></div>`);
}

const activeFilterCount = () => ["when","gender","district","fee","facType"].filter((k) => S.filters[k]).length + (S.filters.openNow ? 1 : 0);

/* Filter priority follows intent, not the data model:
   specialty -> when -> gender -> area -> fee -> facility. */
function openFilters() {
  const f = S.filters;
  const grp = (title, key, opts) => `
    <div class="fgrp"><h3 class="eyebrow">${title}</h3>
      <div class="chips chips--wrap">${opts.map(([v, lab]) =>
        `<button class="chip ${f[key] === v ? "on" : ""}" onclick="setFilter('${key}', ${v === null ? "null" : `'${v}'`})">${lab}</button>`).join("")}</div></div>`;
  const near = DISTRICTS.map((d) => ({ d, k: haversine(here(), d) })).sort((a, b) => a.k - b.k).slice(0, 7);
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${isAR() ? "تحديد النتائج" : "Refine results"}</h2>
      <p>${isAR() ? "الأهم أولاً — متى، ثم مين، ثم وين." : "What matters first: when, then who, then where."}</p></div>
      <button class="icon-btn" onclick="closeSheet()" aria-label="${t("cancel")}">${icon("close")}</button></div>
    <div class="sheet-b">
      ${grp(isAR() ? "متاح متى" : "Available when", "when",
        [[null, isAR() ? "أي وقت" : "Any"], ["today", isAR() ? "اليوم" : "Today"], ["tomorrow", isAR() ? "باچر" : "Tomorrow"], ["week", isAR() ? "خلال الأسبوع" : "This week"]])}
      ${grp(isAR() ? "جنس الطبيب" : "Doctor gender", "gender",
        [[null, isAR() ? "الكل" : "Any"], ["f", isAR() ? "طبيبة" : "Female"], ["m", isAR() ? "طبيب" : "Male"]])}
      ${grp(isAR() ? "المنطقة" : "Area", "district",
        [[null, isAR() ? "كل بغداد" : "All Baghdad"], ...near.map((x) => [x.d.id, esc(L(x.d))])])}
      ${grp(isAR() ? "الأجرة" : "Fee", "fee",
        [[null, isAR() ? "الكل" : "Any"], ["free", isAR() ? "بدون أجرة" : "No fee"], ["u25", isAR() ? "حتى 25 ألف" : "Up to 25k"]])}
      ${grp(isAR() ? "المنشأة" : "Facility", "facType",
        [[null, isAR() ? "الكل" : "Any"], ["hospital", isAR() ? "مستشفى" : "Hospital"], ["clinic", isAR() ? "عيادة خاصة" : "Private clinic"]])}
    </div>
    <div class="sheet-f">
      <div class="btn-row">
        <button class="btn btn--2" onclick="resetFilters()">${icon("refresh")}${isAR() ? "إعادة ضبط" : "Reset"}</button>
        <button class="btn" onclick="closeSheet()">${isAR() ? "اعرض" : "Show"} <span class="num">${doctorsFor({ spec: S.filters.spec }).list.length}</span></button>
      </div>
    </div>`);
}
function setFilter(k, v) { S.filters[k] = v; if (document.querySelector(".sheet")) { closeSheet(true); openFilters(); } render(); }
function resetFilters() {
  S.filters = { openNow: false, when: null, gender: null, spec: S.filters.spec, district: null, fee: null, facType: null };
  closeSheet(true); openFilters(); render();
}

/* ---------------- MEDICINE AVAILABILITY ----------------
   The wedge. Iraq's chronic shortages mean the painful, repeated question is
   "who has this right now", not "which doctor". WhatsApp answers it 1:1 —
   you message six pharmacies one at a time. This turns it into 1:N: one
   request, ranked pharmacies, one pre-written message each, a shared code.

   Ranking is confirmation-freshness first, then distance. A two-day-old
   "yes we have it" beats a nearer pharmacy that has never confirmed.
------------------------------------------------------------- */
const medById = (id) => MEDICINES.find((m) => m.id === id);

function medRow(m) {
  const c = pharmaciesForMed(m).confirmed;
  return `<a class="card ${c.length ? "is-open" : ""}" href="#/med/${m.id}">
    <div class="card-top"><div class="avatar avatar--sq">${icon("pill")}</div>
      <div class="grow"><div class="card-t">${esc(L(m))}</div>
        <div class="card-meta">${c.length
          ? `<span class="chip--meta chip--ok">${icon("check")}<span class="num">${c.length}</span> ${isAR() ? "صيدلية أكّدت" : "confirmed"}</span>`
          : `<span class="chip--meta chip--warn">${isAR() ? "شحيح — اسأل مباشرة" : "scarce — ask directly"}</span>`}
          ${c.length ? `<i class="dot"></i><span>${freshLabel(c[0].mins)}</span>` : ""}</div></div>
      ${icon("chev")}</div></a>`;
}

function medMatches(q) {
  const nq = norm(q); if (!nq) return [];
  return MEDICINES.filter((m) => norm(m.ar + " " + m.en + " " + m.alias.join(" ")).includes(nq));
}

function pharmaciesForMed(med) {
  const confirmed = med.stock.map((st) => {
    const f = fac(st.f); if (!f) return null;
    const mins = freshMins(st);
    return { f, km: distTo(f), mins, band: freshBand(mins), price: st.p, st: status(f), confirmed: true };
  }).filter(Boolean);
  const others = FACILITIES.filter((f) => f.type === "pharmacy" && !med.stock.some((st) => st.f === f.id))
    .map((f) => ({ f, km: distTo(f), mins: null, band: null, st: status(f), confirmed: false }));
  /* Freshness first, always. Distance only breaks ties inside the same band —
     a nearer pharmacy whose last "yes" is four days old is not a better answer. */
  confirmed.sort((a, b) => a.mins - b.mins || a.km - b.km);
  others.sort((a, b) => (a.st.k === "shut") - (b.st.k === "shut") || a.km - b.km);
  return { confirmed, others };
}

/* Freshness is the only claim this product actually makes. We never say a
   pharmacy "has" a medicine — we say someone confirmed it, and how long ago.
   Minutes matter below a day: a confirmation from 40 minutes ago is a different
   fact from one from this morning, and the screen has to be able to say so. */
const freshMins = (st) => st.mins !== undefined ? st.mins : st.d * 1440;

/* Three bands, and they are the ranking. hot = today, warm = this week,
   cold = older than three days, which is not information any more. */
const freshBand = (mins) => mins < 720 ? "hot" : mins <= 4320 ? "warm" : "cold";

/* Every duration here goes through countAr, because Arabic has a dual and
   "2 ساعات" is the same class of error as "2 patients": English grammar
   wearing Arabic words. See ROADMAP principle 9. */
/* Genitive dual (ـين), not nominative (ـان): every one of these follows the
   preposition «قبل». "قبل ساعتان" is wrong in the same way "before two hour"
   would be. The tier card's "مريضان" stays nominative because it is a
   predicate, not the object of a preposition — the case has to follow the
   sentence, which is why the forms live at the call site and not in countAr. */
const AR_MIN  = ["دقيقة واحدة", "دقيقتين", "دقائق", "دقيقةً"];
const AR_HOUR = ["ساعة واحدة", "ساعتين", "ساعات", "ساعةً"];
/* Arabic counts the way Arabic counts: one, two (dual), a few (3-10 takes
   the plural), many (11+ takes the singular accusative). A binary
   singular/plural is English grammar wearing Arabic words — principle 9. */
const AR_PHARM_OPEN = ["صيدلية وحدة مفتوحة الآن", "صيدليتان مفتوحتان الآن", "صيدليات مفتوحة الآن", "صيدليةً مفتوحة الآن"];
const AR_PHARM_CONF = ["صيدلية وحدة مؤكِّدة", "صيدليتان مؤكِّدتان", "صيدليات مؤكِّدة", "صيدليةً مؤكِّدة"];
const AR_REQ = ["طلب واحد", "طلبان", "طلبات", "طلباً"];
const AR_DAY  = ["يوم واحد", "يومين", "أيام", "يوماً"];

function freshLabel(mins) {
  if (isAR()) {
    if (mins < 60) return `مؤكَّد قبل ${countAr(Math.max(1, Math.round(mins)), AR_MIN)}`;
    if (mins < 1440) return `مؤكَّد قبل ${countAr(Math.round(mins / 60), AR_HOUR)}`;
    const d = Math.round(mins / 1440);
    if (d === 1) return "مؤكَّد أمس";
    if (d <= 3) return `مؤكَّد قبل ${countAr(d, AR_DAY)}`;
    return `قبل ${countAr(d, AR_DAY)} — غير مؤكّد`;
  }
  const n = (v) => `<span class="num">${v}</span>`;
  if (mins < 60) return `confirmed ${n(Math.max(1, Math.round(mins)))} min ago`;
  if (mins < 1440) return `confirmed ${n(Math.round(mins / 60))}h ago`;
  const d = Math.round(mins / 1440);
  return d <= 3 ? `confirmed ${n(d)}d ago` : `${n(d)}d ago — unconfirmed`;
}
const freshLabelTxt = (mins) => freshLabel(mins).replace(/<[^>]+>/g, "");

/* Age with no verdict attached, for places that already supply their own
   ("last confirmed …" must not then say "unconfirmed" in the same breath). */
function ageLabel(mins) {
  const n = (v) => `<span class="num">${v}</span>`;
  if (mins < 60) return isAR() ? `قبل ${countAr(Math.max(1, Math.round(mins)), AR_MIN)}` : `${n(Math.max(1, Math.round(mins)))} min ago`;
  if (mins < 1440) return isAR() ? `قبل ${countAr(Math.round(mins / 60), AR_HOUR)}` : `${n(Math.round(mins / 60))}h ago`;
  const d = Math.round(mins / 1440);
  return isAR() ? (d === 1 ? "أمس" : `قبل ${countAr(d, AR_DAY)}`) : `${n(d)}d ago`;
}

function medMsg(med, ref) {
  return isAR()
    ? `السلام عليكم، عندكم هذا الدواء؟\n\n${med.ar}${med.form ? ` (${med.form})` : ""}\n\nالرمز: ${ref}\n—\nعبر قريب`
    : `Hello, do you have this in stock?\n\n${med.en}\n\nRef: ${ref}\n— via Qareeb`;
}

/* People waiting on this medicine — derived from demand we actually logged
   (asks that never got filled), never a decorative number. */
/* Every other pharmacy here is "صيدلية الـ…", so naive first-letter avatars all
   render as ا. Drop the category word and the definite article to get the
   letter a person would actually use to tell them apart. */
const initial = (name) => {
  const w = String(name).replace(/^(صيدلية|صيدليه|مستشفى|عيادة|مركز)\s+/, "").trim();
  return (w.startsWith("ال") && w.length > 3 ? w.slice(2) : w).charAt(0);
};

const medWaiting = (med) => MED_DEMAND.filter((r) => r.med === med.id)
  .reduce((n, r) => n + Math.max(0, r.asks - r.filled), 0);

/* How many pharmacies we could even have asked. Computed from the network, so
   "we asked 18 within 10 km" is true by construction rather than asserted. */
const medPolled = (r = 10) => FACILITIES.filter((f) => f.type === "pharmacy" && distTo(f) <= r).length;

/* Batch ask: the whole reason a neutral party is needed. One person messaging
   six pharmacies one at a time is the status quo; this is the same six, once. */
function batchAsk(medId) {
  const med = medById(medId); if (!med) return;
  const ref = (S.medRef ||= refCode());
  const targets = FACILITIES.filter((f) => f.type === "pharmacy" && f.wa)
    .map((f) => ({ f, km: distTo(f), st: status(f) }))
    .sort((a, b) => (a.st.k === "shut") - (b.st.k === "shut") || a.km - b.km).slice(0, 6);
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${isAR() ? "اسأل الكل دفعة واحدة" : "Ask them all at once"}</h2>
      <p>${isAR()
        ? `نفس الرسالة ونفس الرمز لـ<span class="num"> ${targets.length} </span>صيدليات. تفتح واتساب واحدة واحدة — أنت ترسل، لا نرسل نيابة عنك.`
        : `The same message and code to ${targets.length} pharmacies. Each opens WhatsApp — you send, we never send for you.`}</p></div></div>
    <div class="sheet-b">
      <div class="slip">
        <div class="slip-h">
          <div><div class="eyebrow">${isAR() ? "سؤال عن توفّر" : "Availability request"}</div>
            <div class="card-t" style="margin-top:3px">${esc(L(med))}</div>
            <div class="card-q">${esc(med.form || "")}</div></div>
          <div style="text-align:end"><div class="slip-ref mono" dir="ltr">#${ref}</div>
            <div class="tiny muted mono">${new Date().toLocaleDateString("en-GB")}</div></div>
        </div>
        <div class="slip-to">${isAR() ? "إلى" : "To"}: <span class="num">${targets.length}</span> ${isAR() ? "صيدلية" : "pharmacies"}</div>
        <div class="bubble">${esc(medMsg(med, ref))}</div>
      </div>
      <div class="stack-2" style="margin-top:12px">
        ${targets.map((x) => `<a class="btn btn--wa" href="${waLink(x.f.wa, medMsg(med, ref))}"
          target="_blank" rel="noopener" onclick="logAsk('${med.id}')">${icon("wa")}${esc(L(x.f))}
          <span class="num" style="opacity:.75;margin-inline-start:auto">${fmtKm(x.km)}</span></a>`).join("")}
      </div>
      <p class="tiny muted" style="margin-top:14px">${isAR()
        ? "أول جواب يوصلنا نخليه متاح للي بعدك — بدون اسمك."
        : "The first answer we get is published for the next person — without your name."}</p>
    </div>`);
}

/* Notify-me. No account, so it lives in this browser and says so plainly
   rather than implying a server is watching on the user's behalf. */
function watchMed(medId) {
  const w = LS.get("watch", []);
  const on = w.includes(medId);
  LS.set("watch", on ? w.filter((x) => x !== medId) : [medId, ...w]);
  toast(on ? (isAR() ? "أوقفنا المتابعة" : "Stopped following")
           : (isAR() ? "نتابعه لك — يظهر هنا أول ما تتأكد صيدلية" : "Following — it will show here once a pharmacy confirms"));
  render();
}

/* Was it actually there? The answer is the whole dataset. One tap, no form. */
function confirmStock(medId, facId, yes) {
  const log = LS.get("reports", []);
  log.unshift({ med: medId, fac: facId, yes, at: Date.now() });
  LS.set("reports", log.slice(0, 80));
  toast(isAR() ? "وصلتنا — شكراً، هذا يفيد اللي بعدك" : "Got it — thank you, this helps the next person");
  render();
}

function stockCard(med, x, ref) {
  const stale = x.band === "cold";
  const d = DISTRICTS.find((y) => y.id === x.f.district);
  return `<div class="rw${stale ? " quiet" : ""}">
    ${stale ? "" : `<span class="rw-lead" style="background:var(--${x.band === "hot" ? "brass" : "jade"})"></span>`}
    <span class="av">${esc(initial(L(x.f)))}</span>
    <span class="grow">
      <span class="d3" style="font-size:17px;display:block">${esc(L(x.f))}</span>
      <span class="q-sub" style="display:block">${d ? esc(L(d)) + " · " : ""}<span class="num">${fmtKm(x.km)}</span></span>
      <span class="row" style="margin-top:9px;gap:14px;flex-wrap:wrap">
        <span class="st ${stale ? "st-q" : "st-t"}">${stale ? "" : `<i class="dot${x.band === "hot" ? " dot-live" : ""}"></i>`}${freshLabel(x.mins)}</span>
        ${x.price ? `<span class="t3"><span class="num">${money(x.price)}</span></span>` : ""}
      </span>
      <span class="row" style="gap:14px;margin-top:10px">
        ${x.f.wa ? `<a class="b-g" style="font-size:12.5px" href="${waLink(x.f.wa, medMsg(med, ref))}"
             target="_blank" rel="noopener" onclick="logAsk('${med.id}')">${isAR() ? "اسأل عبر واتساب" : "Ask on WhatsApp"}</a>`
          : `<a class="b-g" style="font-size:12.5px" href="tel:+${x.f.phone}">${t("call")}</a>`}
        <a class="b-g" style="font-size:12.5px" href="#/pharmacy/${x.f.id}">${isAR() ? "الصيدلية" : "Pharmacy"}</a>
      </span>
    </span></div>`;
}

/* 14 days of "how many pharmacies had this confirmed". A shortage that is
   nine days old and widening is a different thing from a bad afternoon, and
   the slope is the only honest way to say which one you are looking at. */
function medTrend(med) {
  const tr = med.trend || [];
  if (!tr.length) return "";
  const mx = Math.max(...tr, 1);
  const zeros = [...tr].reverse().findIndex((v) => v > 0);
  const dry = zeros === -1 ? tr.length : zeros;
  const last = tr[tr.length - 1];
  /* Fourteen engraved ticks, oldest first — which in RTL puts the oldest at
     the right, the same direction the day runs on every other dial here. A
     tick that reaches full height is a day this was widely held; a stub is a
     day it was not. The shortage is a shape, not a sentence. */
  return `<div>
    <div class="lab">${isAR() ? "أسبوعان من التوفّر" : "Two weeks of availability"}</div>
    <div class="ticks" style="margin-top:14px;height:26px" role="img"
      aria-label="${isAR() ? "عدد الصيدليات المؤكِّدة خلال ١٤ يوم" : "Confirming pharmacies over 14 days"}">
      ${tr.map((v) => `<i class="${v === mx && dry >= 2 ? "maj" : ""}"
        style="height:${Math.max(3, Math.round((v / mx) * 26))}px;background:var(--${v === 0 ? "dial-line" : v === mx && dry >= 2 ? "brass" : "ink-4"})"></i>`).join("")}
    </div>
    <div class="t3" style="margin-top:8px">${dry >= 2
      ? (isAR() ? `التوفّر توقّف قبل <span class="num">${dry}</span> أيام ويتّسع — الشاهد على اليمين من التاريخ.`
                : `Availability stopped <span class="num">${dry}</span> days ago and is widening.`)
      : last <= 1
      ? (isAR() ? `التوفّر هش — <span class="num">${last}</span> صيدلية فقط سجّلته مؤخراً.`
                : `Thin supply — only <span class="num">${last}</span> pharmacy has it on record lately.`)
      : (isAR() ? "التوفّر مستقر خلال الأسبوعين الماضيين." : "Availability has been steady over the past two weeks.")}</div>
  </div>`;
}

/* ---------------- v3 · MEDICINE · 4e / 4f ----------------
   The dial. Freshness is set as the largest thing on the page — a 46px
   numeral for the minutes since the last confirmation — because that number
   IS the product. The scarcity variant (4f) is the most designed screen here
   on purpose: the failure state is where a directory gives up and where this
   has to be worth opening.
------------------------------------------------------------- */
function screenMed(id) {
  const med = medById(id); if (!med) return screen404();
  const { confirmed, others } = pharmaciesForMed(med);
  const ref = (S.medRef ||= refCode());
  const watching = LS.get("watch", []).includes(med.id);
  const waiting = medWaiting(med);
  const lastMins = med.stock.length ? Math.min(...med.stock.map(freshMins)) : null;
  const fresh = confirmed.filter((x) => x.band !== "cold");
  const stale = confirmed.filter((x) => x.band === "cold");
  const rest = [...fresh.slice(1), ...stale];
  const sub = (med.subs || []).map(medById).filter(Boolean)
    .map((sm) => ({ sm, best: pharmaciesForMed(sm).confirmed[0] })).filter((x) => x.best)[0];
  const hereD = DISTRICTS.find((d) => d.id === S.district);
  const elsewhere = fresh.length && !fresh.some((x) => x.f.district === S.district) ? hereD : null;

  const head = `<section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <button class="b-g" style="font-size:13px" onclick="goBack()">${isAR() ? "→ رجوع" : "← Back"}</button>
      <button class="b-g" style="font-size:13px" onclick="watchMed('${med.id}')">${watching
        ? (isAR() ? "نتابعه لك" : "Following") : (isAR() ? "تابع التوفّر" : "Follow stock")}</button>
    </div>
    <div class="lab" style="margin-top:28px${fresh.length ? "" : ";color:var(--brass-ink)"}">${fresh.length
      ? (isAR() ? "دواء" : "Medicine") + (med.chronic ? (isAR() ? " · علاج مزمن" : " · chronic") : "")
      : (isAR() ? "نقص حالي · بغداد" : "Current shortage · Baghdad")}</div>
    <h1 class="d1" style="margin-top:10px">${esc(L(med))}</h1>
    <div class="q-sub" style="margin-top:6px">${esc(med.form || "")}${
      med.equiv?.length ? (isAR() ? " · البديل المكافئ: " : " · equivalent: ") + esc(med.equiv[0]) : ""}</div>
  </section>`;

  /* 4e — there is a live answer. The minutes since confirmation are the hero. */
  const dial = fresh.length ? (() => {
    const x = fresh[0];
    const d = DISTRICTS.find((y) => y.id === x.f.district);
    const v = x.mins < 60 ? Math.max(1, Math.round(x.mins))
            : x.mins < 1440 ? Math.round(x.mins / 60) : Math.round(x.mins / 1440);
    const unit = x.mins < 60 ? (isAR() ? "دقيقة" : "min") : x.mins < 1440 ? (isAR() ? "ساعة" : "hours") : (isAR() ? "يوم" : "days");
    return `<section class="pad" style="margin-top:30px"><div class="plate">
      <div class="lab">${isAR() ? "آخر تأكيد" : "Last confirmed"}</div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:8px">
        <span class="nbig" style="color:var(--brass-ink)">${v}</span>
        <span class="d3" style="font-weight:400;color:var(--ink-2)">${unit}</span>
        <span class="st st-t" style="margin-inline-start:auto">${x.band === "hot" ? `<i class="dot dot-live"></i>` : ""}${
          x.band === "hot" ? (isAR() ? "حيّ" : "live") : (isAR() ? "اليوم" : "today")}</span>
      </div>
      <div class="hr" style="margin:20px 0"></div>
      <div class="d3">${esc(L(x.f))}</div>
      <div class="q-sub">${d ? esc(L(d)) + (isAR() ? (d.lm_ar ? " — " + esc(d.lm_ar) : "") : (d.lm_en ? " — " + esc(d.lm_en) : "")) : ""}</div>
      <div class="row" style="margin-top:12px;gap:16px;flex-wrap:wrap">
        <span class="t3"><span class="num">${fmtKm(x.km)}</span></span>
        ${x.price ? `<span class="t3"><span class="num">${money(x.price)}</span></span>` : ""}
        ${statusLabel(x.st, true)}
      </div>
      <div style="margin-top:14px">${band(x.f)}</div>
      ${x.f.wa ? `<a class="btn btn--wa" style="margin-top:22px" href="${waLink(x.f.wa, medMsg(med, ref))}"
           target="_blank" rel="noopener" onclick="logAsk('${med.id}')">${isAR() ? "اسأل عبر واتساب" : "Ask on WhatsApp"}</a>`
        : `<a class="btn" style="margin-top:22px" href="tel:+${x.f.phone}">${t("call")}</a>`}
    </div></section>`;
  })()
  /* 4f — there is no live answer. A zero, at 76px, and three doors. */
  : `<section class="pad" style="margin-top:30px">
      <div style="display:flex;align-items:baseline;gap:12px">
        <span class="nhuge" style="color:var(--ink-3)">0</span>
        <span><span class="d3" style="font-weight:500;display:block">${isAR() ? "صيدلية مؤكَّدة اليوم" : "pharmacies confirmed today"}</span>
          <span class="q-sub">${isAR()
            ? `من <span class="num">${medPolled()}</span> سُئلت خلال <span class="num">24</span> ساعة`
            : `of <span class="num">${medPolled()}</span> asked in the last <span class="num">24</span> hours`}</span></span>
      </div>
      ${lastMins !== null ? `<div class="t3" style="margin-top:14px">${isAR() ? "آخر تأكيد " : "last confirmed "}${ageLabel(lastMins)}</div>` : ""}
    </section>

    <section class="pad" style="margin-top:28px"><div class="v2">
      <button class="btn" onclick="watchMed('${med.id}')">${isAR()
        ? `${watching ? "نتابعه لك" : "نبّهني أول ما يتوفّر"}${waiting ? ` — <span class="num">${waiting}</span> ينتظرون` : ""}`
        : `${watching ? "Following" : "Notify me"}${waiting ? ` — <span class="num">${waiting}</span> waiting` : ""}`}</button>
      <button class="btn btn--2" onclick="batchAsk('${med.id}')">${isAR()
        ? `اسأل <span class="num">6</span> صيدليات دفعة واحدة` : `Ask <span class="num">6</span> pharmacies at once`}</button>
      ${sub ? `<a class="btn btn--2" href="#/med/${sub.sm.id}">${isAR() ? "البديل المكافئ" : "Equivalent"} — ${esc(L(sub.sm))}</a>` : ""}
    </div></section>`;

  return `${netBanner()}${head}${dial}

  ${!fresh.length && sub ? `<div class="hr" style="margin-top:30px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "البديل المكافئ المتوفّر الآن" : "Equivalent available now"}</div>
    ${stockCard(sub.sm, sub.best, ref)}
    <div class="t3" style="margin-top:4px;color:var(--alarm)">${isAR()
      ? "نفس الاستطباب — راجع طبيبك قبل التبديل."
      : "Same indication — ask your doctor before switching."}</div>
  </section>` : ""}

  ${elsewhere ? `<section class="pad" style="margin-top:24px"><div class="note note-w">
    <span>${isAR()
      ? `ما لكيناه مؤكَّداً في <b>${esc(L(elsewhere))}</b> — أقرب تأكيد في <b>${esc(L(DISTRICTS.find((d) => d.id === fresh[0].f.district)) || "")}</b>، <span class="num">${fmtKm(fresh[0].km)}</span>.`
      : `Not confirmed in <b>${esc(L(elsewhere))}</b> — nearest is <b>${esc(L(DISTRICTS.find((d) => d.id === fresh[0].f.district)) || "")}</b>, <span class="num">${fmtKm(fresh[0].km)}</span> away.`}</span>
  </div></section>` : ""}

  ${rest.length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${fresh.length
      ? (isAR() ? "توفّر آخر — مرتّب بحداثة التأكيد، لا بالمسافة" : "Also available — by confirmation freshness, not distance")
      : (isAR() ? "تأكيدات سابقة — مرتّبة بحداثة التأكيد" : "Earlier confirmations — by freshness")}</div>
    ${rest.slice(0, 4).map((x) => stockCard(med, x, ref)).join('<div class="hr"></div>')}
  </section>` : ""}

  <section class="pad" style="margin-top:30px">${medTrend(med)}</section>

  ${fresh.length ? `<section class="pad" style="margin:26px 0 0">
    <div class="lab">${isAR() ? "ساعدنا نُحدّث" : "Help us stay current"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "سألت صيدلية ووصلك جواب؟ ثانية واحدة، ويستفيد غيرك."
      : "Asked a pharmacy and got an answer? One second, and it helps the next person."}</div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn--2 btn--sm" style="flex:1" onclick="confirmStock('${med.id}','${fresh[0].f.id}',true)">${isAR() ? "كان متوفّراً" : "It was there"}</button>
      <button class="btn btn--2 btn--sm" style="flex:1" onclick="confirmStock('${med.id}','${fresh[0].f.id}',false)">${isAR() ? "لم يكن" : "It wasn't"}</button>
    </div>
  </section>` : ""}

  ${others.length ? `<section class="pad" style="margin-top:30px">
    <div class="lab">${isAR() ? "صيدليات لم تؤكّد بعد" : "Not confirmed yet"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `رسالة جاهزة لكل وحدة، ونفس الرمز <b class="mono">${ref}</b>.`
      : `A ready message for each, same code <b class="mono">${ref}</b>.`}</div>
    <button class="btn btn--2" style="margin-top:14px" onclick="batchAsk('${med.id}')">${isAR()
      ? "اسألهم كلهم دفعة واحدة" : "Ask them all at once"}</button>
  </section>` : ""}

  <section class="pad" style="margin:26px 0 30px">
    <div class="t3" style="border-top:1px solid var(--dial-line-2);padding-top:16px">${isAR()
      ? "معلومة توفّر، لا نصيحة طبية. لا توقف دواءك ولا تبدّله دون طبيبك."
      : "Availability information, not medical advice. Never stop or switch a medicine without your doctor."}</div>
  </section>
  ${nav("pharmacies")}`;
}

function logAsk(medId) {
  const log = LS.get("asks", []);
  log.unshift({ med: medId, at: Date.now(), district: S.district });
  LS.set("asks", log.slice(0, 50));
}


/* ==================================================================
   MEDICINE EXPLORER — engine
   ==================================================================
   The safety argument lives here, not in the copy. Three rules the rest of
   the layer is built on:

   1. A signal EXPIRES BY ITSELF. Nobody has to remember to retract a stale
      claim, because the claim decays as a function of the clock. A pharmacy
      that stops answering stops being shown.
   2. Verified identity does NOT transfer to a stock claim. `verified` says a
      human checked the pharmacy exists and the number reaches it. It says
      nothing about the box on the shelf, and the UI never merges the two.
   3. We match an exact VARIANT — molecule + strength + form. We never map one
      variant onto another, never surface `alt` as a suggestion, and never say
      a medicine is appropriate. Discovery and connection only.
------------------------------------------------------------- */

/* Signal decay. Stock is the most perishable fact in the product, so the
   bands are tight — an hour is "just now", a day is already suspect. */
const SIG_BANDS = [
  { max: 60,   k: "live",   ar: "مؤكَّد الآن",      en: "confirmed now" },
  { max: 360,  k: "fresh",  ar: "مؤكَّد اليوم",     en: "confirmed today" },
  { max: 1440, k: "aging",  ar: "خلال ٢٤ ساعة",    en: "within 24h" },
  { max: 4320, k: "stale",  ar: "قديم — أعد السؤال", en: "stale — ask again" },
];
const SIG_TTL = 4320;   /* 3 days. Past this a signal is not shown at all. */

function sigBand(mins) {
  return SIG_BANDS.find((b) => mins < b.max) || null;   /* null = expired */
}

/* The state a signal is actually IN, which is the pharmacy's claim narrowed
   by how old it is. A "we have plenty" from four days ago is not low stock —
   it is no information, and it leaves the network entirely. */
function sigState(sig) {
  const band = sigBand(sig.m);
  if (!band) return { k: "expired", band: null };
  if (band.k === "stale") return { k: "stale", band };
  return { k: sig.st === "low" ? "low" : "available", band };
}

const QTY_LABEL = {
  many: { ar: "كمية جيدة", en: "good quantity" },
  few:  { ar: "كمية محدودة", en: "limited" },
  low:  { ar: "آخر وحدات", en: "last units" },
};

/* Every facility, Baghdad or governorate, behind one lookup so the rest of
   the layer never has to care which list a pharmacy came from. */
const allPharmacies = () => [...FACILITIES.filter((f) => f.type === "pharmacy"), ...BRANCHES];
const anyFac = (id) => allPharmacies().find((f) => f.id === id);

/* A Baghdad facility's city is Baghdad; a branch carries its own. */
const cityOf = (f) => f && (f.city || "baghdad");
const cityById = (id) => CITIES.find((c) => c.id === id);

/* Where a facility IS, in one phrase, for either shape of record. Baghdad
   facilities carry a `district` id; governorate branches carry `city` and a
   free-text `area_ar` with `district: null`. A screen that reads only
   `district` renders an empty place for every branch — which is how a
   pharmacy in Basra ends up looking like a pharmacy with no address. */
function placeOf(f) {
  if (!f) return "";
  const d = f.district && DISTRICTS.find((x) => x.id === f.district);
  if (d) {
    const lm = isAR() ? d.lm_ar : d.lm_en;
    return " — " + esc(L(d)) + (lm ? (isAR() ? "، " : ", ") + esc(lm) : "");
  }
  const c = cityName(cityById(cityOf(f)));
  const area = isAR() ? f.area_ar : (f.area_en || f.area_ar);
  return c ? " — " + esc(c) + (area ? (isAR() ? "، " : ", ") + esc(area) : "") : "";
}

/* A distance is only meaningful inside the user's own city. `distTo` is a
   straight haversine from the user's district centre, so on a Basra branch it
   confidently returns ~450 km under a header that reads "distances are
   approximate from Karrada centre". A number that is arithmetically right and
   contextually meaningless is worse than no number: the screen states the
   city instead. */
const sameCityAsUser = (f) => cityOf(f) === (S.exCity || "baghdad");
/* Governorates whose seat has its own name (نينوى / الموصل) show the seat,
   because that is what a person says out loud. */
const cityName = (c) => !c ? "" : (isAR() ? (c.seat_ar || c.ar) : (c.seat_en || c.en));

const variantOf = (vid) => {
  for (const m of RX_MEDS) { const v = m.variants.find((x) => x.id === vid); if (v) return { med: m, v }; }
  return null;
};
const variantLabel = (vid) => { const x = variantOf(vid); return x ? `${L(x.med)} ${x.v.strength}` : ""; };

/* Live signals for a variant: expired ones are dropped here, once, so no
   screen downstream can accidentally render one. */
/* A signal's age: seed rows have a chosen `m`, anything a pharmacy actually
   claimed carries `at`. Without this, a live claim stayed "قبل ٠ دقيقة"
   permanently and the freshness engine — the core of the product — never
   moved a single signal from live to stale. */
function sigAgeMin(g) {
  return g.at ? (Date.now() - g.at) / 60000 : (g.m || 0);
}

function signalsFor(vid) {
  return SIGNALS.filter((g) => g.v === vid && sigAgeMin(g) < SIG_TTL)
    .map((g) => ({ ...g, f: anyFac(g.fac), state: sigState(g) }))
    .filter((g) => g.f)
    .sort((a, b) => sigAgeMin(a) - sigAgeMin(b));
}

/* THE AVAILABILITY FIELD — the answer to "where in Iraq might this be?".
   Cities are ordered by the strength of what is actually known, not
   alphabetically and not by population: a city with a confirmation from ten
   minutes ago outranks one with four claims from yesterday. */
function availabilityField(vid) {
  const sigs = signalsFor(vid);
  const reqs = REQUESTS.filter((r) => r.v === vid && r.st !== "expired");
  return CITIES.map((c) => {
    const inCity = sigs.filter((g) => cityOf(g.f) === c.id);
    const live = inCity.filter((g) => g.state.k === "available" || g.state.k === "low");
    const best = inCity[0] || null;
    return {
      c, n: live.length, stale: inCity.length - live.length, best,
      demand: reqs.filter((r) => r.city === c.id).length,
      /* rank: freshest evidence first, then how much of it there is */
      rank: best ? (best.m + (live.length ? 0 : 1e5)) : 1e9,
    };
  }).sort((a, b) => a.rank - b.rank);
}

/* Request urgency. Colour is confirmation, never the carrier — each level
   also has its own word and its own position in the sort. */
/* Labels state the same windows the machine actually enforces (REQ_TTL_BY_URG:
   6h / 24h / 72h). A label promising "within two hours" against a six-hour
   expiry would be the countdown lie wearing different clothes. */
const URGENCY = {
  urgent: { ar: "عاجل جداً — خلال ٦ ساعات", en: "Very urgent — within 6h", short_ar: "عاجل", short_en: "Urgent", cls: "st-e", w: 0 },
  high:   { ar: "خلال ٢٤ ساعة", en: "Within 24h", short_ar: "خلال يوم", short_en: "24h", cls: "st-t", w: 1 },
  normal: { ar: "غير مستعجل — حتى ٣ أيام", en: "Not urgent — up to 3 days", short_ar: "غير مستعجل", short_en: "Normal", cls: "st-q", w: 2 },
};
const urgShort = (u) => isAR() ? (u.short_ar || u.ar) : (u.short_en || u.en);

/* Dosage forms and strength units, for a medicine we do not carry yet. */
const RX_FORMS = ["حبوب / كبسول", "شراب", "حقن", "قطرة", "مرهم / كريم", "بخاخ", "أخرى"];
const RX_UNITS = ["ملغم", "مل", "مايكروغرام", "٪"];

/* One view of "which medicine is this request about", whether it came from the
   catalogue (r.v) or was typed by the patient (r.manual). Every card and
   screen reads through this so a manual medicine is a first-class citizen,
   not a crash. */
/* "بغداد — المنصور، قرب مستشفى اليرموك" from whatever the request carries. */
function needPlace(r) {
  const c = cityName(cityById(r.city));
  const dd = r.district && DISTRICTS.find((y) => y.id === r.district);
  const lm = (r.lm || "").replace(/^\s*(قرب|جنب|مجاور|يم|near)\s+/i, "").trim();
  return [c, dd ? L(dd) : null].filter(Boolean).join(" — ") + (lm ? (isAR() ? "، قرب " : ", near ") + lm : "");
}

/* Distance from a branch to the request's district centre, when both sides
   have coordinates. Shown as approximate, because it is. */
function needDistFrom(f, r) {
  const dd = r.district && DISTRICTS.find((y) => y.id === r.district);
  if (!dd || !f || !f.lat) return null;
  return haversine(f, dd);
}

function needMedOf(r) {
  if (r.v) { const x = variantOf(r.v); if (x) return { name: L(x.med), strength: x.v.strength, form: x.v.form, x }; }
  if (r.manual) return { name: r.manual.name, strength: r.manual.strength || "", form: r.manual.form || "", x: null };
  return null;
}

/* Request lifecycle. `expired` is reached by the clock, like a signal — a
   need nobody answered should leave the feed on its own rather than sit
   there implying the network is working. */
/* TTL scales with urgency, because a request that says "today" and then sits
   in the feed for three days is lying twice: to the patient about being acted
   on, and to the pharmacist about being live. This is also what makes the
   countdown honest — it counts down to a real expiry, not a manufactured one. */
/* Age in minutes. Seed rows carry a static `m` because they are fiction with
   a chosen age; anything a real user creates carries `ts`, a real timestamp,
   and must be measured against the actual clock.

   This is the fix for the worst bug in the product. `reqLeft` used to be
   `reqTtl(r) - r.m`, and `r.m` was written once at publish as 0 and never
   incremented by anything, anywhere. So every request a real user published
   was immortal, and the countdown beside it displayed the same number
   forever — the exact "manufactured countdown" the comment above says this
   code exists to prevent. The tested `QD.isExpired` had it right the whole
   time and was never called. */
const REQ_TTL_BY_URG = QD.TTL_BY_URGENCY;
const reqTtl = (r) => QD.ttlFor(r.urg);
const reqAge = (r) => (r.ts ? (Date.now() - r.ts) / 60000 : (r.m || 0));
const reqLeft = (r) => Math.max(0, reqTtl(r) - reqAge(r));
const REQ_TTL = 4320;
/* ==================================================================
   REQUEST STATE MACHINE
   ==================================================================
   Booleans lie by omission. `isLoading && isError` is a state nobody
   designed, and in a medicine network the undesigned states are the ones
   that hurt: a request that is simultaneously "searching" and "answered",
   or "fulfilled" and "expired".

   One state at a time, and transitions declared rather than assumed —
   anything not in this table cannot happen.

     idle          nothing published yet
     broadcasting  live, visible to matching pharmacies, nobody has answered
     acknowledged  at least one pharmacy has reported stock
     handoff       the patient opened a channel to one of them
     fulfilled     the patient says they got it
     expired       the clock ran out (see REQ_TTL_BY_URG)

   `expired` is reachable from every live state because time does not ask
   permission. `fulfilled` is only reachable once someone has actually been
   contacted — you cannot fulfil a request nobody answered.
------------------------------------------------------------- */
const REQ_MACHINE = {
  idle:         ["broadcasting"],
  broadcasting: ["acknowledged", "expired"],
  acknowledged: ["handoff", "fulfilled", "expired"],
  handoff:      ["fulfilled", "acknowledged", "expired"],
  fulfilled:    [],
  expired:      [],
};

/* Legacy seed rows use the older vocabulary; map them once, here, so the
   machine is the only thing the rest of the app reasons about. */
const REQ_ALIAS = { published: "broadcasting", matched: "broadcasting", responded: "acknowledged", contacted: "handoff" };
const normState = (v) => REQ_ALIAS[v] || v || "broadcasting";

/* The only way a request changes state. Refuses illegal transitions loudly
   in debug and silently in production, rather than corrupting the record. */
function reqTransition(r, next) {
  const from = normState(r.st);
  if (from === next) return true;
  if (!(REQ_MACHINE[from] || []).includes(next)) {
    if (CONFIG.debug) console.warn(`[machine] refused ${from} -> ${next}`, r.id);
    return false;
  }
  r.st = next;
  r.ts = Date.now();
  const mine = LS.get("needs", []);
  const rec = mine.find((x) => x.id === r.id);
  if (rec) { rec.st = next; rec.ts = r.ts; LS.set("needs", mine); }
  return true;
}

const REQ_STATE_X = {
  broadcasting: { ar: "جارِ البحث",       en: "Broadcasting" },
  acknowledged: { ar: "وصلك ردّ",         en: "Answered" },
  handoff:      { ar: "تواصلت",           en: "Contacted" },
  fulfilled:    { ar: "انتهى",            en: "Fulfilled" },
  expired:      { ar: "انتهت صلاحيته",    en: "Expired" },
};
function reqState(r) {
  const st = normState(r.st);
  if (st === "fulfilled" || st === "expired") return st;
  if (reqAge(r) >= reqTtl(r)) return "expired";
  return st;
}

/* The countdown. Real remaining time against a real expiry — never a
   decorative 15-minute clock. A fabricated timer in a healthcare network is
   the same class of lie as a fabricated "delivered" receipt, and it would be
   found out the first time a pharmacist watched one reset. */
function expiryLabel(r) {
  const left = reqLeft(r);
  if (left <= 0) return isAR() ? "انتهى" : "expired";
  if (left < 60) return isAR() ? `يبقى ${countAr(Math.round(left), AR_MIN)}` : `${Math.round(left)} min left`;
  if (left < 1440) return isAR() ? `يبقى ${countAr(Math.round(left / 60), AR_HOUR)}` : `${Math.round(left / 60)}h left`;
  return isAR() ? `يبقى ${countAr(Math.round(left / 1440), AR_DAY)}` : `${Math.round(left / 1440)}d left`;
}
/* Urgency of the countdown itself: under an hour reads as pressure. */
const expiryHot = (r) => reqLeft(r) > 0 && reqLeft(r) < 60;
const LIVE_STATES = ["broadcasting", "acknowledged", "handoff"];
const liveRequests = () => REQUESTS.filter((r) => LIVE_STATES.includes(reqState(r)))
  .sort((a, b) => URGENCY[a.urg].w - URGENCY[b.urg].w || reqAge(a) - reqAge(b));

/* Bounded edit distance. Arabic spelling of transliterated drug names varies
   a lot — ميثوتركسات / ميثوتريكسات / ميثوتريكسيت are the same request — and a
   patient hunting a rare medicine is the last person who should be punished
   for a letter. Capped at 2 and short-circuited on length, so it stays cheap
   inside a search loop. */
function lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/* Variant search. Matches molecule, brand, alias, strength and form — and
   deliberately does NOT fall back to "same molecule, different strength",
   because presenting a 50mg vial to someone who asked for a 2.5mg tablet is
   a substitution, and substitutions are not ours to make. */
function searchVariants(q) {
  const nq = norm(q); if (!nq) return [];
  const toks = nq.split(/\s+/).filter(Boolean);
  const out = [];
  for (const m of RX_MEDS) {
    const medHay = norm([L(m), m.ar, m.en, ...(m.alias || [])].join(" "));
    for (const v of m.variants) {
      const hay = medHay + " " + norm([v.strength, v.form, v.pack, ...(v.alt || [])].join(" "));
      let score = 0;
      for (const tk of toks) {
        if (hay.includes(tk)) score += 2;
        else if (medHay.split(/\s+/).some((w) => w.length > 3 && lev(w, tk) <= 1)) score += 1;
      }
      if (score) out.push({ med: m, v, score, n: signalsFor(v.id).filter((g) => g.state.k !== "stale").length });
    }
  }
  return out.sort((a, b) => b.score - a.score || b.n - a.n);
}

/* Fast Responder. Earned from what a branch actually did: it has answered
   requests, and its live claims are fresh. Never assigned, never bought, and
   it disappears the moment the behaviour stops — which is the only kind of
   badge worth showing in a network built on freshness.

   Threshold: at least 2 answered requests AND a median claim age under 12h. */
function responderStats(facId) {
  const answered = REQUESTS.filter((r) => (r.resp || []).includes(facId)).length;
  const mine = SIGNALS.filter((g) => g.fac === facId && sigAgeMin(g) < SIG_TTL).map((g) => sigAgeMin(g)).sort((a, b) => a - b);
  const median = mine.length ? mine[Math.floor(mine.length / 2)] : Infinity;
  return { answered, median, fast: answered >= 2 && median < 720 };
}
const fastBadge = (facId) => responderStats(facId).fast
  ? `<span class="badge-fast">${isAR() ? "سريع الاستجابة" : "Fast responder"}</span>` : "";

/* Supply Radar: what a given branch should be shown. A pharmacy is offered a
   request when it is in the same city, OR when it has ever signalled that
   exact variant — which is how a Baghdad pharmacy learns that someone in
   Basra needs what it happens to be holding. */
/* Requests fetched from the server for this branch's governorate, refreshed
   on a timer while the radar screen is open. Kept separate from the seed
   REQUESTS array so a network hiccup can never delete the demo data. */
let REMOTE_QUEUE = [];
let queueTimer = null;

function startQueuePolling(facId) {
  if (queueTimer) { clearInterval(queueTimer); queueTimer = null; }
  if (!NET.on) return;
  const f = anyFac(facId); if (!f) return;
  const city = cityOf(f);
  const pull = async () => {
    if (!location.hash.startsWith("#/radar/")) { clearInterval(queueTimer); queueTimer = null; return; }
    const rows = await netQueue(city);
    if (rows === null) return;                   /* offline: keep what we have */
    const next = rows.map(adoptRemote);
    /* Only repaint when something actually changed — a list that redraws on
       a timer steals taps from a pharmacist mid-reach. */
    if (JSON.stringify(next.map((x) => x.id + x.st)) !==
        JSON.stringify(REMOTE_QUEUE.map((x) => x.id + x.st))) {
      REMOTE_QUEUE = next;
      render();
    } else { REMOTE_QUEUE = next; }
  };
  pull();
  queueTimer = setInterval(pull, 20000);
}

function radarFor(facId) {
  const f = anyFac(facId); if (!f) return [];
  const myCity = cityOf(f);
  const mine = new Set(SIGNALS.filter((g) => g.fac === facId).map((g) => g.v));
  /* Real requests from the network first, seed rows behind them. A remote id
     always wins over a local one with the same id so a request this device
     published does not appear twice. */
  const seen = new Set(REMOTE_QUEUE.map((r) => r.id));
  const pool = [...REMOTE_QUEUE, ...liveRequests().filter((r) => !seen.has(r.id))];
  return pool.map((r) => ({
    r,
    sameCity: r.city === myCity,
    holds: mine.has(r.v),
    answered: (r.resp || []).includes(facId),
  })).filter((x) => x.sameCity || x.holds)
    .sort((a, b) => (b.holds - a.holds) || URGENCY[a.r.urg].w - URGENCY[b.r.urg].w
      || reqAge(a.r) - reqAge(b.r));
}

/* City-level supply and demand, for the operator map. */
function supplyDemand() {
  const live = liveRequests();
  return CITIES.map((c) => {
    const supply = SIGNALS.filter((g) => sigAgeMin(g) < SIG_TTL && cityOf(anyFac(g.fac)) === c.id).length;
    const demand = live.filter((r) => r.city === c.id).length;
    return { c, supply, demand, gap: demand - supply };
  }).filter((x) => x.supply || x.demand).sort((a, b) => b.gap - a.gap || b.demand - a.demand);
}


/* ==================================================================
   MEDICINE EXPLORER — surfaces
   ================================================================== */

/* THE FIELD — the signature component of this layer.
   Not a map. A map of Iraq at 390px is four pixels of Basra and a lot of
   desert, and it would imply a precision about location we do not have. What
   the patient actually needs is a reading: which governorates hold evidence,
   how fresh it is, and where the need is going unanswered. So the field is
   built from the identity's own vocabulary — engraved marks on a rule, brass
   for the freshest — one row per governorate, ordered by strength of
   evidence. It reads like an instrument, not an infographic. */
function fieldRow(x, vid) {
  const marks = Math.min(x.n, 6);
  const live = x.n > 0;
  return `<a class="rw fld" href="#/rx/${vid}?city=${x.c.id}">
    ${live ? `<span class="rw-lead" style="background:var(--${x.best && x.best.m < 60 ? "brass" : "jade"})"></span>` : ""}
    <span class="grow">
      <span class="rowb">
        <span class="t1" style="font-size:14.5px${live ? "" : ";opacity:.55"}">${esc(cityName(x.c))}</span>
        <span class="fld-marks" aria-hidden="true">${
          live ? Array.from({ length: marks }, (_, i) =>
            `<i class="${i === 0 && x.best && x.best.m < 60 ? "hot" : ""}"></i>`).join("")
          : `<i class="none"></i>`}</span>
      </span>
      <span class="t3" style="display:block;margin-top:5px">${
        live
          ? `<span class="num">${x.n}</span> ${isAR() ? (countAr(x.n, AR_PHARM_CONF)) : "confirming"} · ${x.best ? sigAge(x.best.m) : ""}`
          : x.stale
            ? (isAR() ? `<span class="num">${x.stale}</span> تأكيد قديم — لا نعدّه توفّراً` : `<span class="num">${x.stale}</span> stale — not counted`)
            : x.demand
              ? (isAR() ? `لا توفّر · <span class="num">${x.demand}</span> يدوّرون عليه` : `no supply · <span class="num">${x.demand}</span> looking`)
              : (isAR() ? "لا معلومة" : "no data")}</span>
    </span></a>`;
}

const sigAge = (m) => {
  if (isAR()) {
    if (m < 60) return `قبل ${countAr(Math.max(1, Math.round(m)), AR_MIN)}`;
    if (m < 1440) return `قبل ${countAr(Math.round(m / 60), AR_HOUR)}`;
    return `قبل ${countAr(Math.round(m / 1440), AR_DAY)}`;
  }
  return m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/* A medicine request, as published. Carries a city, a variant, a quantity
   band and an urgency — and nothing that could identify the person. */
function needCard(r, opts = {}) {
  const md = needMedOf(r); if (!md) return "";
  const u = URGENCY[r.urg];
  const st = reqState(r);
  return `<a class="rw${st === "expired" ? " quiet" : ""}" href="#/need/${r.id}">
    ${r.urg === "urgent" && st !== "expired" ? `<span class="rw-lead" style="background:var(--alarm)"></span>` : ""}
    <span class="grow">
      <span class="rowb">
        <span class="d3">${esc(md.name)} ${md.strength ? `<span class="n" style="font-weight:300">${esc(md.strength)}</span>` : ""}</span>
        <span class="st ${u.cls}"><i class="dot${r.urg === "urgent" ? " dot-live" : ""}"></i>${esc(urgShort(u))}</span>
      </span>
      <span class="q-sub" style="display:block">${md.form ? esc(md.form) + " · " : ""}${esc(r.qty)} · ${esc(needPlace(r))}</span>
      <span class="row" style="margin-top:9px;gap:14px;flex-wrap:wrap">
        <span class="t3">${sigAge(r.m)}</span>
        ${st !== "expired" ? `<span class="st ${expiryHot(r) ? "st-e" : "st-q"}">${expiryHot(r) ? `<i class="dot dot-live"></i>` : ""}${expiryLabel(r)}</span>` : ""}
        ${(r.resp || []).length
          ? `<span class="st st-v"><i class="dot"></i>${isAR()
              ? `${countAr(r.resp.length, ["صيدلية ردّت", "صيدليتان ردّتا", "صيدليات ردّت", "صيدلية ردّت"])}`
              : `${r.resp.length} replied`}</span>`
          : `<span class="t3">${isAR() ? "بانتظار ردّ" : "awaiting a reply"}</span>`}
        ${opts.state !== false ? `<span class="t3">${esc(isAR() ? REQ_STATE_X[st].ar : REQ_STATE_X[st].en)}</span>` : ""}
      </span>
    </span></a>`;
}

/* ---------------- /explorer ----------------
   Discovery, not search. The premise a patient has to feel in the first two
   seconds is "maybe somebody in Iraq has this" — so the screen opens on the
   size of the network, then shows the needs going unanswered right now.
   Editorial, one idea per band, no grid of tiles. */
function screenExplorer() {
  const live = liveRequests();
  const urgent = live.filter((r) => r.urg === "urgent");
  const sigsLive = SIGNALS.filter((g) => sigAgeMin(g) < SIG_TTL);
  const recent = sigsLive.filter((g) => sigAgeMin(g) < 360).sort((a, b) => sigAgeMin(a) - sigAgeMin(b)).slice(0, 4);
  const myCity = cityOf(anyFac(null)) && null;
  const here = S.exCity || "baghdad";
  const nearMe = live.filter((r) => r.city === here);
  /* Found elsewhere: a variant with no live supply in the user's city but
     confirmed somewhere else. This is the whole thesis in one rail. */
  const elsewhere = RX_MEDS.flatMap((m) => m.variants).map((v) => {
    const f = availabilityField(v.id);
    const mine = f.find((x) => x.c.id === here);
    const other = f.find((x) => x.c.id !== here && x.n > 0);
    return (!mine || mine.n === 0) && other ? { v, other } : null;
  }).filter(Boolean).slice(0, 4);

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <a class="brand" href="#/">${BRAND_MARK}<span>${esc(L(CONFIG.brand))}</span></a>
      <button class="b-g" style="font-size:13px" onclick="pickExCity()">${esc(cityName(cityById(here)))}</button>
    </div>

    <div class="lab" style="margin-top:32px">${isAR() ? "شبكة توفّر الدواء" : "Medicine availability network"}</div>
    <div class="nhuge" style="color:var(--brass-ink);margin-top:10px">${sigsLive.length}</div>
    <div class="d2" style="margin-top:4px;font-weight:500">${isAR() ? "تأكيد توفّر حيّ في العراق" : "live confirmations across Iraq"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `من <span class="num">${allPharmacies().filter((f) => f.verified).length}</span> صيدلية موثّقة في <span class="num">${new Set(sigsLive.map((g) => cityOf(anyFac(g.fac)))).size}</span> محافظات. كل تأكيد ينتهي وحده بعد ثلاثة أيام.`
      : `from <span class="num">${allPharmacies().filter((f) => f.verified).length}</span> verified pharmacies in <span class="num">${new Set(sigsLive.map((g) => cityOf(anyFac(g.fac)))).size}</span> governorates. Every confirmation expires on its own after three days.`}</div>

    <div style="margin-top:24px" class="v2">
      <button class="btn" onclick="location.hash='#/rx'">${isAR() ? "دوّر على دواء صعب" : "Look for a hard-to-find medicine"}</button>
      <button class="btn btn--2" onclick="location.hash='#/need/new'">${isAR() ? "انشر حاجتك — الشبكة تدوّر عنك" : "Publish your need — the network searches"}</button>
    </div>
  </section>

  ${urgent.length ? `<div class="hr" style="margin-top:30px"></div>
  <section class="pad">
    <div class="rowb" style="padding-top:24px">
      <span class="lab" style="color:var(--alarm)">${isAR() ? "مطلوب اليوم" : "Needed today"}</span>
      <span class="t3"><span class="num">${urgent.length}</span></span>
    </div>
    ${urgent.slice(0, 3).map((r) => needCard(r, { state: false })).join('<div class="hr"></div>')}
  </section>` : ""}

  ${elsewhere.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "غير متوفّر عندك — لكنه موجود" : "Not near you — but it exists"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `ما لكينا تأكيداً في ${esc(cityName(cityById(here)))} — بس هذي الأدوية مؤكَّدة في محافظات ثانية.`
      : `Nothing confirmed in ${esc(cityName(cityById(here)))}, but confirmed elsewhere.`}</div>
    ${elsewhere.map(({ v, other }) => {
      const x = variantOf(v.id);
      return `<a class="rw" href="#/rx/${v.id}">
        <span class="rw-lead" style="background:var(--jade)"></span>
        <span class="grow">
          <span class="d3" style="display:block">${esc(L(x.med))} <span class="n" style="font-weight:300">${esc(v.strength)}</span></span>
          <span class="q-sub" style="display:block">${isAR() ? "متوفّر في" : "available in"} <b>${esc(cityName(other.c))}</b> — <span class="num">${other.n}</span> ${isAR() ? "صيدلية" : "pharmacies"}</span>
          <span class="row" style="margin-top:9px"><span class="st st-t"><i class="dot"></i>${other.best ? sigAge(other.best.m) : ""}</span></span>
        </span></a>`;
    }).join('<div class="hr"></div>')}
  </section>` : ""}

  ${recent.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "تأكيدات وصلت للتو" : "Just confirmed"}</div>
    ${recent.map((g) => {
      const f = anyFac(g.fac), x = variantOf(g.v);
      if (!f || !x) return "";
      return `<a class="rw" href="#/rx/${g.v}">
        <span class="rw-lead"></span>
        <span class="av">${esc(initial(L(f)))}</span>
        <span class="grow">
          <span class="d3" style="display:block">${esc(L(x.med))} <span class="n" style="font-weight:300">${esc(x.v.strength)}</span></span>
          <span class="q-sub" style="display:block">${esc(L(f))} — ${esc(cityName(cityById(cityOf(f))))}</span>
          <span class="row" style="margin-top:9px;gap:12px">
            <span class="st st-t"><i class="dot${sigAgeMin(g) < 60 ? " dot-live" : ""}"></i>${sigAge(sigAgeMin(g))}</span>
            ${f.verified ? `<span class="st st-v">${isAR() ? "صيدلية موثّقة" : "verified pharmacy"}</span>` : ""}
          </span>
        </span></a>`;
    }).join('<div class="hr"></div>')}
    <div class="t3" style="margin-top:14px">${isAR()
      ? "التوثيق يخص الصيدلية، لا الكمية. التوفّر إفادة من الصيدلية نفسها ويقدر يتغيّر بأي لحظة."
      : "Verification applies to the pharmacy, not to the stock. Availability is the pharmacy's own claim and can change at any moment."}</div>
  </section>` : ""}

  ${EXPLORER_TRENDS.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "الأكثر بحثاً" : "Most searched"}</div>
    <div class="chips chips--wrap" style="margin-top:14px">
      ${EXPLORER_TRENDS.map((tr) => { const x = variantOf(tr.v); return x
        ? `<a class="chip" href="#/rx/${tr.v}">${esc(L(x.med))} <span class="num" style="opacity:.6">${tr.n}</span></a>` : ""; }).join("")}
    </div>
  </section>` : ""}

  ${nearMe.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? `يدوّرون عليه في ${esc(cityName(cityById(here)))}` : `Wanted in ${esc(cityName(cityById(here)))}`}</div>
    ${nearMe.slice(0, 4).map((r) => needCard(r, { state: false })).join('<div class="hr"></div>')}
  </section>` : ""}

  <section class="pad" style="margin:30px 0 0">
    <a class="rowb" href="#/radar">
      <span class="t3">${isAR() ? "عندك صيدلية؟ شوف الطلبات اللي تكدر تجاوب عليها" : "Run a pharmacy? See the requests you can answer"}</span>
      <span class="b-g" style="font-size:12px">${isAR() ? "افتح الرادار" : "Open Radar"}</span>
    </a>
  </section>

  <section class="pad" style="margin:22px 0 30px">
    <div class="t3" style="border-top:1px solid var(--dial-line-2);padding-top:16px">${isAR()
      ? "قريب يعرض توفّراً وتواصلاً فقط — لا يبيع دواءً ولا يصرفه ولا يقترح بديلاً. الأدوية الموصوفة تبقى خاضعة للوصفة وللصيدلي المرخّص."
      : "Qareeb shows availability and opens a contact channel. It does not sell or dispense medicine and never suggests a substitute. Prescription medicines remain subject to a prescription and a licensed pharmacist."}</div>
  </section>
  ${nav("explorer")}`;
}

function pickExCity() {
  sheet(`<div class="sheet-grip"></div>
    <div class="sheet-h"><div><h2>${isAR() ? "من أي محافظة؟" : "Which governorate?"}</h2>
      <p>${isAR() ? "نستخدمها لترتيب النتائج فقط — ما نطلب عنوانك." : "Used only to order results — we never ask for your address."}</p></div></div>
    <div class="sheet-b">${CITIES.map((c) => `<button class="rw" onclick="setExCity('${c.id}')">
      <span class="grow"><span class="rowb">
        <span class="t1" style="font-size:14.5px">${esc(cityName(c))}</span>
        ${(S.exCity || "baghdad") === c.id ? `<span class="st st-v"><i class="dot"></i>${isAR() ? "مختارة" : "selected"}</span>` : ""}
      </span></span></button>`).join('<div class="hr"></div>')}</div>`);
}
function setExCity(id) { S.exCity = id; LS.set("exCity", id); closeSheet(); render(); }


/* ---------------- /rx · variant search ---------------- */
function screenRxSearch() {
  const q = LS.get("rxq", "");
  const hits = q ? searchVariants(q) : [];
  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <button class="b-g" style="font-size:13px" onclick="goBack()">${isAR() ? "→ رجوع" : "← Back"}</button>
    <div class="lab" style="margin-top:24px">${isAR() ? "بحث الدواء" : "Medicine search"}</div>
    <h1 class="d2" style="margin-top:8px">${isAR() ? "شنو الدواء بالضبط؟" : "Which exact medicine?"}</h1>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "اكتب الاسم التجاري أو العلمي، عربي أو إنكليزي. التركيز مهم — <b>2.5 ملغم</b> غير <b>50 ملغم</b>، وما نبدّل وحدة بالثانية."
      : "Brand or generic, Arabic or English. Strength matters — <b>2.5mg</b> is not <b>50mg</b>, and we never swap one for the other."}</div>
    <div class="search-field" style="margin-top:18px">${icon("search")}
      <input id="rxq" value="${esc(q)}" placeholder="${isAR() ? "زاريلتو ٢٠ · ميثوتركسات · Humira" : "Xarelto 20 · methotrexate · Humira"}"
        oninput="rxSearch(this.value)" autocomplete="off" enterkeyhint="search">
      ${q ? `<button class="clear-btn" onclick="rxSearch('');document.getElementById('rxq').value='';document.getElementById('rxq').focus()" aria-label="${isAR() ? "مسح" : "Clear"}">${icon("close")}</button>` : ""}
    </div>
  </section>

  ${q ? (hits.length ? `<section class="pad" style="margin-top:26px">
    <div class="lab">${isAR() ? "اختر التركيز والشكل" : "Pick the exact strength and form"}</div>
    ${hits.slice(0, 8).map(({ med, v, n }) => `<a class="rw" href="#/rx/${v.id}">
      ${n ? `<span class="rw-lead" style="background:var(--jade)"></span>` : ""}
      <span class="grow">
        <span class="d3" style="display:block">${esc(L(med))} <span class="n" style="font-weight:300">${esc(v.strength)}</span></span>
        <span class="q-sub" style="display:block">${esc(v.form)} · ${esc(v.pack)}${med.rx ? (isAR() ? " · بوصفة" : " · prescription") : ""}</span>
        <span class="row" style="margin-top:9px">${n
          ? `<span class="st st-v"><i class="dot"></i>${isAR() ? `<span class="num">${n}</span> صيدلية مؤكِّدة` : `<span class="num">${n}</span> confirming`}</span>`
          : `<span class="st st-q"><i class="dot"></i>${isAR() ? "لا تأكيد حالي" : "nothing confirmed"}</span>`}</span>
      </span></a>`).join('<div class="hr"></div>')}
  </section>` : `<section class="pad" style="margin-top:30px">
    <div class="empty" style="padding:26px 0">
      <div class="glyph"><i></i><i></i><i></i><b></b></div>
      <div class="empty-t">${isAR() ? `ما لكينا «${esc(q)}»` : `No match for "${esc(q)}"`}</div>
      <div class="empty-b">${isAR()
        ? "ممكن الاسم مكتوب بشكل ثاني، أو الدواء لسّه مو بقاعدتنا. انشر حاجتك وخلّي الشبكة تدوّر."
        : "The spelling may differ, or we don't carry it yet. Publish the need and let the network look."}</div>
      <button class="btn" style="margin-top:20px" onclick="location.hash='#/need/new'">${isAR() ? "انشر حاجتك" : "Publish your need"}</button>
    </div>
  </section>`) : `<section class="pad" style="margin-top:26px">
    <div class="lab">${isAR() ? "الأكثر بحثاً" : "Most searched"}</div>
    ${EXPLORER_TRENDS.map((tr) => { const x = variantOf(tr.v); if (!x) return "";
      const n = signalsFor(tr.v).filter((g) => g.state.k !== "stale").length;
      return `<a class="rw" href="#/rx/${tr.v}">
        ${n ? `<span class="rw-lead" style="background:var(--jade)"></span>` : ""}
        <span class="grow">
          <span class="d3" style="display:block">${esc(L(x.med))} <span class="n" style="font-weight:300">${esc(x.v.strength)}</span></span>
          <span class="q-sub" style="display:block">${esc(x.v.form)}</span>
          <span class="row" style="margin-top:9px;gap:12px">
            <span class="t3"><span class="num">${tr.n}</span> ${isAR() ? "بحث" : "searches"}</span>
            ${n ? `<span class="st st-v"><i class="dot"></i><span class="num">${n}</span> ${isAR() ? "مؤكِّدة" : "confirming"}</span>`
                : `<span class="st st-q"><i class="dot"></i>${isAR() ? "لا تأكيد" : "none"}</span>`}
          </span>
        </span></a>`; }).join('<div class="hr"></div>')}
  </section>`}
  ${nav("explorer")}`;
}

function rxSearch(v) { LS.set("rxq", v); const el = document.getElementById("rxq"); const p = el && el.selectionStart; render(); const e2 = document.getElementById("rxq"); if (e2) { e2.focus(); try { e2.setSelectionRange(p, p); } catch {} } }

/* ---------------- /rx/:variant · the availability field ---------------- */
function screenVariant(vid) {
  const x = variantOf(vid); if (!x) return screen404();
  const { med, v } = x;
  const field = availabilityField(vid);
  const sigs = signalsFor(vid);
  const liveSigs = sigs.filter((g) => g.state.k !== "stale");
  const staleSigs = sigs.filter((g) => g.state.k === "stale");
  const reqs = liveRequests().filter((r) => r.v === vid);
  const here = S.exCity || "baghdad";
  const mine = field.find((c) => c.c.id === here);

  return `${netBanner()}
  <section class="pad" style="padding-top:calc(26px + env(safe-area-inset-top))">
    <div class="rowb">
      <button class="b-g" style="font-size:13px" onclick="goBack()">${isAR() ? "→ رجوع" : "← Back"}</button>
      <button class="b-g" style="font-size:13px" onclick="location.hash='#/need/new?v=${vid}'">${isAR() ? "انشر حاجتك" : "Publish a need"}</button>
    </div>
    <div class="lab" style="margin-top:26px">${esc(med.cls_ar && isAR() ? med.cls_ar : "")}${med.rx ? (isAR() ? " · يُصرف بوصفة" : "Prescription only") : ""}</div>
    <h1 class="d1" style="margin-top:10px">${esc(L(med))} <span class="n" style="font-weight:300">${esc(v.strength)}</span></h1>
    <div class="q-sub" style="margin-top:6px">${esc(v.form)} · ${esc(v.pack)}${
      (v.alt || []).length ? ` · ${isAR() ? "يُباع أيضاً باسم" : "also sold as"} ${esc(v.alt.join("، "))}` : ""}</div>
  </section>

  <section class="pad" style="margin-top:26px">
    <div style="display:flex;align-items:baseline;gap:12px">
      <span class="nhuge" style="color:var(--${liveSigs.length ? "brass-ink" : "ink-3"})">${liveSigs.length}</span>
      <span><span class="d3" style="font-weight:500;display:block">${isAR()
        ? (countAr(liveSigs.length, AR_PHARM_CONF)) : "pharmacies confirming"}</span>
        <span class="q-sub">${isAR()
          ? `في <span class="num">${field.filter((c) => c.n > 0).length}</span> من <span class="num">${CITIES.length}</span> محافظة`
          : `across <span class="num">${field.filter((c) => c.n > 0).length}</span> of <span class="num">${CITIES.length}</span> governorates`}</span></span>
    </div>
    ${mine && mine.n === 0 ? `<div class="note note-w" style="margin-top:18px"><span>${isAR()
      ? `لا تأكيد في <b>${esc(cityName(mine.c))}</b>${field.find((c) => c.n > 0) ? ` — أقرب تأكيد في <b>${esc(cityName(field.find((c) => c.n > 0).c))}</b>.` : "."}`
      : `Nothing confirmed in <b>${esc(cityName(mine.c))}</b>${field.find((c) => c.n > 0) ? ` — nearest is <b>${esc(cityName(field.find((c) => c.n > 0).c))}</b>.` : "."}`}</span></div>` : ""}
  </section>

  <section class="pad" style="margin-top:26px">
    <div class="lab">${isAR() ? "أين قد يوجد في العراق" : "Where it might be, across Iraq"}</div>
    <div style="margin-top:6px">${field.filter((c) => c.n || c.stale || c.demand).map((c) => fieldRow(c, vid)).join('<div class="hr"></div>')}</div>
    <div class="t3" style="margin-top:14px">${isAR()
      ? "كل علامة = صيدلية أفادت بالتوفّر. النحاسية أحدث من ساعة. التأكيد ينتهي وحده بعد ثلاثة أيام."
      : "Each mark is one pharmacy's report. Brass is under an hour old. A report expires by itself after three days."}</div>
  </section>

  ${liveSigs.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "متوفّر الآن" : "Available now"}</div>
    ${liveSigs.slice(0, 6).map((g) => sigRow(g, vid)).join('<div class="hr"></div>')}
  </section>` : `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "لا تأكيد حالي في العراق" : "Nothing confirmed in Iraq right now"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? "ما عدنا إفادة توفّر حية لهذا التركيز. انشر حاجتك — توصل الصيدليات الموثّقة اللي تكدر تجاوب."
      : "No live report for this exact presentation. Publish the need — it reaches the verified pharmacies that could answer."}</div>
    <button class="btn" style="margin-top:18px" onclick="location.hash='#/need/new?v=${vid}'">${isAR() ? "انشر حاجتك" : "Publish your need"}</button>
  </section>`}

  ${staleSigs.length ? `<section class="pad" style="margin-top:24px">
    <div class="lab">${isAR() ? "إفادات قديمة — لا نعدّها توفّراً" : "Stale reports — not counted as stock"}</div>
    <div style="margin-top:4px">${staleSigs.slice(0, 3).map((g) => sigRow(g, vid)).join('<div class="hr"></div>')}</div>
  </section>` : ""}

  ${reqs.length ? `<div class="hr" style="margin-top:26px"></div>
  <section class="pad">
    <div class="lab" style="padding-top:24px">${isAR() ? "يدوّرون عليه الآن" : "People looking for this"}</div>
    <div class="q-sub" style="margin-top:6px">${isAR()
      ? `<span class="num">${reqs.length}</span> ${countAr(reqs.length, AR_REQ)} في ${esc([...new Set(reqs.map((r) => cityName(cityById(r.city))))].join("، "))}`
      : `<span class="num">${reqs.length}</span> active in ${esc([...new Set(reqs.map((r) => cityName(cityById(r.city))))].join(", "))}`}</div>
    ${reqs.slice(0, 3).map((r) => needCard(r, { state: false })).join('<div class="hr"></div>')}
  </section>` : ""}

  <section class="pad" style="margin:26px 0 30px">
    <div class="t3" style="border-top:1px solid var(--dial-line-2);padding-top:16px">${isAR()
      ? `${med.rx ? "هذا دواء يُصرف بوصفة طبية؛ الصيدلي راح يطلبها. " : ""}قريب يدلّك على التوفّر ويفتح قناة تواصل — ما يبيع ولا يصرف ولا يقترح بديلاً. أي تبديل قرار طبيبك والصيدلي.`
      : `${med.rx ? "This is a prescription medicine; the pharmacist will ask for one. " : ""}Qareeb points to availability and opens a channel — it does not sell, dispense, or suggest a substitute. Any switch is your doctor's and pharmacist's call.`}</div>
  </section>
  ${nav("explorer")}`;
}

/* One pharmacy's claim. The verification mark and the freshness mark are
   deliberately rendered as two separate statements, never merged into one
   badge: the first is about the pharmacy, the second about the box. */
function sigRow(g, vid) {
  const st = g.state, stale = st.k === "stale";
  const c = cityById(cityOf(g.f));
  return `<div class="rw${stale ? " quiet" : ""}">
    ${stale ? "" : `<span class="rw-lead" style="background:var(--${sigAgeMin(g) < 60 ? "brass" : "jade"})"></span>`}
    <span class="av">${esc(initial(L(g.f)))}</span>
    <span class="grow">
      <span class="rowb">
        <span class="d3" style="font-size:17px">${esc(L(g.f))}</span>
        ${sealBadge(g.f, "pharmacies")}
      </span>
      ${fastBadge(g.fac) ? `<span style="display:block;margin-top:6px">${fastBadge(g.fac)}</span>` : ""}
      <span class="q-sub" style="display:block">${esc(cityName(c))}${g.f.area_ar && isAR() ? " — " + esc(g.f.area_ar) : g.f.district ? " — " + esc(L(DISTRICTS.find((d) => d.id === g.f.district))) : ""}</span>
      <span class="row" style="margin-top:9px;gap:14px;flex-wrap:wrap">
        <span class="st ${stale ? "st-q" : "st-t"}${sigAgeMin(g) < 5 ? " fresh-live" : ""}">${stale ? "" : `<i class="dot${sigAgeMin(g) < 60 ? " dot-live" : ""}"></i>`}${
          isAR() ? `أفادت ${sigAge(sigAgeMin(g))}` : `reported ${sigAge(sigAgeMin(g))}`}</span>
        ${!stale ? `<span class="t3">${esc(L(QTY_LABEL[g.q]))}</span>` : ""}
        ${g.dl ? `<span class="t3">${isAR() ? "تقدر ترتّب توصيل" : "may arrange delivery"}</span>` : ""}
      </span>
      ${!stale ? `<span class="row" style="margin-top:10px">
        <button class="b-g" style="font-size:12.5px" onclick="contactPharmacy('${g.fac}','${vid}')">${isAR() ? "تواصل مع الصيدلية" : "Contact this pharmacy"}</button>
      </span>` : `<span class="row" style="margin-top:10px"><span class="t3">${isAR() ? "أقدم من ثلاثة أيام — اسأل قبل ما تتحرك" : "over three days old — ask before travelling"}</span></span>`}
    </span></div>`;
}


/* ==================================================================
   DEMAND-SIDE INTEGRITY
   ==================================================================
   The directory stays public — anyone can look up a pharmacy or a doctor
   without identifying themselves, and that is deliberate. But PUBLISHING a
   need puts a claim in front of real pharmacists and consumes their attention,
   so it costs something: a phone number, and a cap.

   Simulated OTP only. There is no backend; the code is generated client-side
   and the screen says so, because a fake security theatre that pretends to be
   real auth is worse than an honest placeholder.
------------------------------------------------------------- */
const MAX_ACTIVE_NEEDS = 3;

/* The build the service worker reports it is actually serving, once it
   answers. Null until then. */
let SW_BUILD = null;

/* The one string that answers "is what I am looking at the thing that was
   deployed?". Two sources: what this JS was stamped with, and what the
   service worker reports it is serving. Agreement prints once; disagreement
   prints both, because that IS the bug and hiding it would be the old
   mistake wearing a new coat. */
function buildLabel() {
  const app = CONFIG.build || "—";
  if (!SW_BUILD || SW_BUILD === app) return app;
  return app + " / " + SW_BUILD;
}

const myNeeds = () => LS.get("needs", []);
const myActiveNeeds = () => myNeeds().filter((r) => LIVE_STATES.includes(reqState(r)));
const isAuthed = () => !!LS.get("auth", null);
const authPhone = () => (LS.get("auth", null) || {}).phone || "";

/* Hidden trust score. A patient who publishes needs, gets pharmacies to
   answer, and then never opens the conversation is burning supply-side
   attention — the scarcest thing in this network. The score is never shown to
   the user and never gates the directory; it exists so operators can see
   attention being wasted, and so a future version can throttle it. */
function trustScore() {
  return LS.get("trust", { score: 100, published: 0, answered: 0, handoffs: 0, penalties: 0 });
}
function updateUserTrustScore(event, meta = {}) {
  const t = trustScore();
  if (event === "published") { t.published++; }
  if (event === "answered")  { t.answered++; }
  if (event === "handoff")   { t.handoffs++; }
  /* The penalty: a request that received a pharmacy response and was then
     abandoned without the patient ever opening the channel. Charged once per
     request, on expiry or withdrawal — never on publish, because wanting a
     medicine is not an offence. */
  if (event === "abandoned" && meta.hadResponse) { t.penalties++; t.score = Math.max(0, t.score - 12); }
  if (event === "handoff" && t.score < 100) { t.score = Math.min(100, t.score + 4); }
  LS.set("trust", t);
  return t;
}

/* Simulated OTP. Six digits, generated and shown on screen, labelled as a
   prototype. Nothing is sent anywhere. */
