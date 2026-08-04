# Independent Review — Dawai Product Blueprint v1.0

**Verdict: not ready to build from.**

I wrote the blueprint, so I am the wrong person to review it. This review was
produced by 25 independent agents that had not seen my reasoning — only the
document.

## Method

Eight reviewers read the blueprint through deliberately different lenses, each
told that praise is worthless and that "would be nice to add" is not a finding:

| Lens | Reviewing as |
|---|---|
| Clinical safety | A Baghdad pharmacist of 20 years who has seen medication harm |
| Iraq reality | Someone who knows how pharmacies, addresses, phones and cash actually work |
| Privacy & regulatory | Health-data counsel hunting legal exposure |
| Flow completeness | A PM who walks every flow until it dead-ends |
| Pharmacy economics | An owner of three pharmacies deciding whether to ever open the app |
| Arabic UX | An RTL engineer who ships for elderly Arabic speakers |
| Internal consistency | An auditor who only finds where the document disagrees with itself |
| Absence | Someone hunting what the document never mentions at all |

Every finding was then attacked by **two skeptics with different reasons to
disbelieve** — one checking whether the blueprint already answers it, one asking
whether it is a real failure or reviewer theatre. Both defaulted to *refuted*
when uncertain. A finding survived only if neither killed it.

Finally a completeness critic read the document fresh and answered the question
none of the eight were asked: what did all of you miss.

## Result

| | Count |
|---|---|
| Findings raised | 56 |
| Survived adversarial verification | **20** |
| Killed by both skeptics | 36 |
| Additional gaps found by the completeness critic | **23** |

The consistency lens raised 7 and had **all 7 refuted** — the document does not
contradict itself in the obvious ways. It contradicts itself in ways that need
domain knowledge to see, which is what the other lenses found.

### Survivors by lens

| Lens | Raised | Survived |
|---|---|---|
| clinical | 7 | 2 |
| iraq-reality | 7 | 3 |
| privacy-regulatory | 7 | 2 |
| flow-holes | 7 | 5 |
| pharmacy-economics | 7 | 5 |
| arabic-ux | 7 | 2 |
| contradictions | 7 | 0 |
| missing | 7 | 1 |

---

## Part 1 — Confirmed findings (20)

Each survived two adversarial skeptics. `refuted 1/2` means one skeptic tried to
kill it and failed to convince the other; the finding stands but its framing was
contested — the contest is summarised where it changed the severity.

### 1. All specified Arabic copy is masculine second-person; no gender is captured anywhere

**MAJOR** · §22 · lens: arabic-ux · refuted 1/2

**What is wrong.** Every user-facing Arabic string in the blueprint is grammatically masculine: «تكدر تختار منطقتك يدوياً», «ما ضفت أي دواء بعد», «احفظ صيدليتك المعتادة», «تأكد من الاسم أو دوّر بالرقم», «حدّث التطبيق حتى تكدر تكمل», «سجّل دخول مرة ثانية», «جرّب بإضاءة أحسن». Arabic has no gender-neutral second person; the feminine forms are «تكدرين تختارين», «ما ضفتي», «احفظي», «تأكدي», «حدّثي», «سجّلي», «جرّبي». Relationship copy is worse: «ابنك يطلب…» hard-codes a son (a daughter is «بنتك تطلب») and «وقت دواء والدتك» hard-codes a relationship that A06 itself says is only *claimed*, never verified. The only identity screen, S08, collects "Name, optional birth year" — no gender — so the copy layer has no input from which to select the correct form.

**What happens.** Um Ali — a 63-year-old woman, the persona the product is built around, whose stated fear is "being seen as unable to manage" — is addressed in the masculine on every screen she touches. To an elderly Iraqi woman that does not read as a localisation bug, it reads as an app not made for her, and it is a common reason this demographic hands the phone back to a relative. A grant from a daughter renders «ابنك يطلب» ("your son requests"); a male subject renders «وقت دواء والدتك» ("your mother's medicine time"). Retrofitting after the deck is written means rewriting every string across 197 screens plus adding a field to onboarding.

**Evidence.** | S08 | Your name | Minimum identity | Name, optional birth year | Continue | X |

**Fix.** Decide before the copy deck exists: either (a) add an optional gender field at S08 with a stated default and require every second-person string to ship masculine and feminine variants, or (b) mandate gender-neutral construction throughout by replacing direct address with nominal forms («اختيار المنطقة يدوياً», «وصلنا الحد الأقصى للمحاولات», «تحديث التطبيق مطلوب») and accepting the colder register. Separately, replace all relationship-derived notification copy with the subject's stored name: «وقت دواء أم علي» not «وقت دواء والدتك»; «هشام يريد يشوف أدويتك ويطلبها عنك» not «ابنك يطلب الاطلاع والطلب». Add the chosen rule to §4 Naming rules so it binds the deck.

### 2. No screen anywhere records an allergy, yet §17 grants four roles the right to read allergies

**MAJOR** · §17 (with §3.2, §6) · lens: clinical · refuted 1/2

**What is wrong.** The permission matrix has a "See allergies" row granting access to Patient, View, Order, Confirm, Pharmacist and Clinical. Nothing in the 197-screen inventory creates that data. There is no allergy entry screen, no allergy field on A02 Profile, no allergy step in onboarding — and §3.2 rule 4 plus §8 rule 4 forbid a medical questionnaire outright, which is the only place such data would conventionally be captured. The consequence is that the safety check in §7.1 is an interaction check only: it compares medicine against medicine and never against the patient. Separately, the stated condition on the pharmacist's access is clinically backwards: an allergy list scoped to "the medicine being dispensed" cannot surface cross-reactivity, which is the entire reason a pharmacist reads an allergy list.

**What happens.** A patient with a documented penicillin anaphylaxis requests Augmentin by name through F14. Every gate in the product passes: the interaction check finds no drug-drug interaction because there is only one drug; the pharmacist at Y05 sees medicine, quantity, area, urgency and nothing else; Z03 confirms the hold; an assistant hands it over at Z06. The product's clinical safety layer never had the one fact that mattered, because no screen in the product could ever have collected it. The same defect blocks the sulfonamide and cephalosporin cross-reactivity checks a pharmacist would do at the counter by asking one question.

**Evidence.** ABSENT: no screen in §6 captures an allergy, while §17 states "| See allergies | ✓ | ✓ | ✓ | ✓ | ⚠ | ✗ | ⚠ | ✗ |" and conditions it with "**Pharmacist** sees allergies **only for the medicine being dispensed** — never the full list."

**Fix.** Add an allergy capture screen to §6.3 (patient- and pharmacist-enterable, append-only like the rest of the record), add allergy checking as an explicit second arm of the §7.1 safety gate with its own UNAVAILABLE state, and rewrite the §17 condition to "the pharmacist sees the full allergy list for any medicine being dispensed or substituted" — scoping by dispensed product defeats cross-reactivity checking, which is the only reason the access exists.

### 3. Severe safety layer has no dismiss and the only role allowed to clear it has no surface to do so

**MAJOR** · T11 (with §5, §24, §15) · lens: clinical · refuted 1/2

**What is wrong.** T11 has no dismiss control "not disabled, absent", §5 rule 4 puts it above everything and unreachable by going back, and §24 states a patient cannot override it — "Only a pharmacist can, with a recorded reason." No such pharmacist screen exists. The pharmacy experience (§6.9–§6.12, 46 screens) contains no patient-alert surface, and §15 guarantees the pharmacy never sees clinical history. The Owner is explicitly barred from acting inside a patient's record (§3.4). So the alert's only stated exit — a pharmacist override — has no mechanism anywhere in the product, and "it clears by resolving its cause" is unachievable for the common case where the combination is deliberate and prescriber-sanctioned.

**What happens.** A cardiology patient is deliberately co-prescribed two drugs the rule set flags as a severe interaction — a routine, supervised combination. The safety layer opens above everything with no dismiss. She cannot reach Today, her dose reminders, or her live reservation, because the layer does not participate in navigation. She calls her pharmacist, who opens Dawai and finds no screen that shows her alert, let alone overrides it. Her only remaining exit is to stop tracking the medicine — which M09 says ends the reminder, not the medication — or to delete her account. A patient with correct therapy is locked out of her medication app by a correct alert.

**Evidence.** | T11 | Safety layer | Interrupt for a severe interaction | What, why, what to do next | Contact pharmacist · **no dismiss** | ! severe |

**Fix.** Specify the override mechanism as a screen, not a sentence. Either add a pharmacist-facing alert review surface (reached by the patient generating a short-lived, patient-initiated share token that scopes the pharmacist to that one alert, logged in A09), or add a prescriber-sanctioned acknowledgement that the patient can record against a named professional. Also define what the patient can still reach while the layer is up — a live reservation and emergency contact must remain reachable, or §5 rule 4 makes the alert dangerous in itself.

### 4. The entire pharmacy application flow has zero screens; the supply side cannot sign up

**MAJOR** · §6.9 (vs §3.3, §7.5, §8) · lens: flow-holes · refuted 0/2

**What is wrong.** §3.3, §7.5 and §8 define a five-step pharmacy joining flow (apply → SUBMITTED with queue position → NEEDS_INFO re-submit → REJECTED with appeal → VERIFIED first-run setup of hours/coverage/capacity), and S02 carries the entry action «أنا صيدلية». The screen inventory contains no screen for any of it. §6.9 opens at Y01 Staff sign-in, which already presumes an unlocked, verified workspace. The account state `pharmacy_applicant` ("Patient things + track the application") likewise has no surface.

**What happens.** Ahmed taps «أنا صيدلية» on the Welcome screen and lands nowhere — there is no screen to build. Meanwhile Phase 0 ships W03 Verification queue, W04 Application review and W06 Decision, so the operator has a queue that no applicant can put anything into, and Phase 0's own precondition ("twenty verified pharmacies") is unreachable through the product. Every branch of §7.5 after 'Application' — the wait, the more-info round trip, the rejection appeal, the hours/coverage/capacity setup before going live — is undesigned.

**Evidence.** §3.3: "→  status: SUBMITTED — visible to the applicant, with a queue position"; §8: "| 3 | Verified — first-run setup | Hours · coverage · capacity. Three screens, then live. |". ABSENT: no application form, no submitted/queue-position screen, no NEEDS_INFO re-submission screen, no rejection/appeal screen, and no verified first-run setup screen anywhere in §6.9–§6.12; §6.9 begins with "| Y01 | Staff sign-in |".

**Fix.** Add a pharmacy-applicant screen group (roughly 8 screens: entry, application form with document upload, submitted/queue status, needs-info response, rejected + appeal, and the three-screen verified first-run setup), place it in Phase 0 ahead of W03–W06, correct the 197 total, and give `pharmacy_applicant` a named home screen.

### 5. Phase 0 omits notifications and every failure screen the Phase 0 metrics are defined by

**MAJOR** · §28 Phase 0 · lens: flow-holes · refuted 1/2

**What is wrong.** Phase 0's contents are the happy path only. Notifications are explicitly deferred to Phase 1, so nothing tells a pharmacist a request arrived and nothing tells a patient an offer landed. Every failure branch of the loop is also excluded while the screen that raises it ships: Z02 ships with a "Cannot hold" action but Z04 does not; Z06 ships with a "! mismatch" state and "Mismatch" action but Z07 does not; R02 ships with "Cancel" but R05 does not; R01 ships with "! refused" but R04 does not; reservations expire per §11 rule 6 but neither R03 nor Z09 ships; F20 ships but F24 does not; S13 offers "Contact support" but U02 does not.

**What happens.** Phase 0 cannot hit its own targets. "Median < 15 seconds" to answer requires a pharmacist to be interrupted; with no push, Y03 is only seen if someone happens to open the app, so "80% of requests receive an offer within five minutes" is measuring luck. And "95% of confirmed reservations are collected" defines success by a 5% failure rate for which no screen exists on either side: the pharmacist taps "Cannot hold" and hits a hole; the patient's reservation expires and hits a hole. This directly contradicts §6's stated purpose — "The prototype shipped happy paths and discovered the rest in production; this inventory exists to end that practice."

**Evidence.** §28: "| Contains | S01–S14 · T01 T06 · F01 F02 F05 F07 F11 F14 F17 F20 F21 · R01 R02 R06 · Y01 Y03 Y04 Y05 Y07 Y08 · Z01 Z02 Z03 Z06 Z08 · W03 W04 W06 |" and Phase 1: "| Adds | Prescription capture (F12 F15 F16) · notifications · map (F08) · reservation lifecycle in full (R03 R04 R05) ..."

**Fix.** Move push notifications (offers, request arrived, customer chose you) and Z04, Z07, Z09, Z10, R03, R04, R05, F24, U02 into Phase 0. The rule should be explicit: a screen may not ship in a phase unless every action and every non-happy state on it has a destination in the same phase.

### 6. The safety check exists only on the reorder path, not on any path that adds a new medicine

**MAJOR** · §12 (vs §7.1) · lens: flow-holes · refuted 1/2

**What is wrong.** §7.1 places a safety gate between Reorder and Confirm, with three outcomes (severe / could-not-check / clear). No other request-creation path has it. §12's flow goes "Patient confirms each line → Confirm request → Sent" with no check. §7.2 goes medicine page → request → sent with no check. §7.3 ends at "Confirm request" and hands off to "…same as 7.1" at a point *after* 7.1's gate has already been passed.

**What happens.** Um Ali photographs a new prescription containing a drug that interacts severely with the statin already in her record. Because the prescription path never runs the check, no alert fires, and the interaction is caught by nobody — the pharmacy never sees clinical history (§15). The check runs only on refills of medicines she is already safely taking, which is the lowest-risk case, and is absent from the two paths that actually introduce a new drug into her regimen. It is also absent when the check is unavailable, so «تعذّر الفحص» is never shown on the prescription path either — silence rendered as an all-clear, the exact failure §7.1 calls "the most important sentence in the entire flow".

**Evidence.** §7.1: "D --> E{Safety check}". §12: "  L --> N[Confirm request]" / "  N --> O[Sent · the image travels with it]". §7.3: "  I --> J[…same as 7.1]" where I is "Confirm request" — i.e. it joins 7.1 downstream of the gate.

**Fix.** Move the safety gate so it sits immediately before F17 Confirm request on every path (reorder, search, prescription, voice, type), and redraw §12's and §7.2's diagrams to show all three outcomes. State in §12's rules that a request cannot be sent without a check result, and that UNAVAILABLE is a result, not a skip.

### 7. Licensed-pharmacist-only hold confirmation cannot be honoured by real Iraqi pharmacies

**MAJOR** · §11 / §17 / Z03 / §7.2 · lens: iraq-reality · refuted 1/2

**What is wrong.** The product's single most important control — only a verified licensed pharmacist may confirm a reservation — assumes the licence holder is physically at the counter when a hold is confirmed. In Baghdad the licence holder is very often not present: evening and night shifts are run by assistants, and a large share of pharmacies operate on a licence the named pharmacist rents out and rarely attends. The blueprint's own sign-in is "Staff picker or PIN", which is shareable in one second, so in practice the assistant will confirm holds using the pharmacist's PIN. The control therefore does not restrict anything, and worse, the audit log will assert as fact that a licensed pharmacist accepted clinical responsibility when they were not in the building.

**What happens.** Zainab's 9pm flow (§7.2) is the blueprint's own acute-need scenario and it ends in "Reserve · directions · go". At 9pm Ahmed has gone home and Noor is at the counter, so either (a) the hold cannot be confirmed and the entire night-time core loop dead-ends — killing the ≥95% collection target for exactly the urgent cases the product exists for — or (b) Noor confirms using Ahmed's PIN, and the platform's strongest safety claim and its audit trail are both false from week one.

**Evidence.** "AskedToHold --> Held: LICENSED PHARMACIST confirms" · §24: "The only licensed pharmacist leaves | The branch can offer but cannot confirm reservations, and the app says exactly that" · Y01: "Staff sign-in | Who is at the counter now | Staff picker or PIN" · ABSENT: any mechanism binding a confirmation to the physical presence or identity of the licence holder (remote confirm, per-person credential, session attestation), and ABSENT: any decision on what happens to the loop outside the pharmacist's shift.

**Fix.** Decide explicitly which of three the product is: (1) the pharmacist confirms remotely from their own device (add the screen, the latency budget, and what happens when they do not answer in 60s); (2) an assistant may confirm a hold and the pharmacist is accountable at handover, with the hold recorded as assistant-confirmed; or (3) the branch is offline to requests when no pharmacist is signed in — and then state plainly in §28 that Phase 0 covers daytime only. Whichever is chosen, replace the shared PIN with a per-person credential, or stop claiming the audit log proves who confirmed.

### 8. Coverage routing and the coverage map have no defined area unit or verified pharmacy location

**MAJOR** · §10 / S09 / W04 / G01–G02 · lens: iraq-reality · refuted 1/2

**What is wrong.** Three load-bearing mechanisms — request routing rule 3, the coverage map that decides which district launches next, and every distance and ETA shown to a patient — depend on two things the blueprint never defines: a canonical list of areas, and a verified geographic point for each pharmacy. The pharmacy application collects a free-text "address", which in Baghdad is not a navigable quantity: house and street numbers exist on paper and nobody uses them, and pharmacies are found by landmark. District names are informal, overlapping and disputed (is Yarmouk inside Mansour? is Qadisiya a district or a mahalla?), so "the patient's area is inside its declared coverage" has no evaluable meaning as written.

**What happens.** An engineer implementing §10 has to invent the area taxonomy, and will invent a different one from the one the operator uses in G01/G02, so the launch instrument and the routing filter disagree about the same district. A patient in Yarmouk sends a request; whether the Mansour pharmacy 600m away receives it depends on an undocumented string comparison. And the reservation screen R02 shows "the address" as its core content — an address string that will not get anyone to the door, on a screen whose whole job is to end the journey successfully.

**Evidence.** §10: "3. The patient's area is inside its declared coverage" · S09: "Your area | Where to search from | Map pin or district list" — ABSENT: the district list · W04: "Application review | Documents, address, ownership, named pharmacist" — ABSENT: a verified coordinate captured or confirmed at verification · §10: "**Distance**, and walking or driving time" · R02: "Reservation | The code, the clock, the address" · G01: "Coverage map | Where we are dense and where we are thin — **the launch instrument**"

**Fix.** Name the area gazetteer as a product artefact in §10 with its source and its granularity, and make it the single unit used by routing, S09, B05 and G01–G02. Require a verified pin at verification (operator drops or confirms it against the licence address) rather than a text address. On R02 and F09, show the pin plus a free-text landmark line written by the pharmacy ("مقابل جامع…، قرب…"), because that is what people actually navigate by; treat the postal-style address as secondary.

### 9. The binding offer price is unenforceable in a cash market, and quantity has no defined unit

**MAJOR** · §24 / §29 Q2 / Y05 / F17 · lens: iraq-reality · refuted 1/2

**What is wrong.** §24 declares the offer price binding at the counter and penalises the pharmacy when the counter price differs, while §29 lists the same question as unanswered and §1 refuses to touch money at all. With no payment rail, no receipt, and a cash transaction the platform never observes, there is no evidence of what was actually paid — only two contradicting claims. Compounding it, the product never states the unit: not the currency, not whether a price is per box, per strip, or per tablet, and not what "quantity" means on F17, Y04, Y05 and R02. Iraqi pharmacies routinely dispense a strip or a count of tablets rather than a sealed box, and quote accordingly.

**What happens.** Two failures at the counter. First: the patient's offer said 8,000 and the pharmacist asks 12,000 because he means a box and she meant a strip — the app has no way to tell who is right, and §24 automatically records it against the pharmacy's reliability. Second: with the dinar's parallel rate and supplier lots moving, a pharmacist held to a price he quoted three hours ago will price defensively or refuse to quote, degrading exactly the comparison the product is built on. "Partial fulfilment — 2 of 3 boxes" is undefined when the patient never specified boxes.

**Evidence.** §24: "The price at the counter differs from the offer | The offer price is binding. Disputes route to support and count against the pharmacy." · §29 Q2: "Is the offer price binding at the counter? | The blueprint assumes yes." · §1: "A payment platform | Introducing money changes what we are regulated as" · Y05: "Compose offer | ... Price (numeric pad), readiness chips, quantity" · §24: "Partial fulfilment — 2 of 3 boxes" · ABSENT: currency, dispensing unit, and the pack-size definition that makes a price comparable between two offers.

**Fix.** Define the dispensing unit in §4's concept table (box / strip / tablet, with pack size carried from the catalogue) and require every request, offer and reservation to carry it, so two offers are comparable and the counter cannot mean something different from the app. Then answer Q2 before building: either the price is indicative with a stated tolerance band above which the patient may report a mismatch, or it is binding and time-boxed to the reservation window — and in either case remove the automatic reliability penalty until there is evidence of what was paid.

### 10. A binding price can be typed in 15 seconds by an unlicensed assistant and can never be corrected

**MAJOR** · §24 / §17 / §6.9 · lens: pharmacy-economics · refuted 1/2

**What is wrong.** The offer price is declared binding at the counter and disputes are automatically scored against the pharmacy, but the product contains no way to amend or withdraw a sent offer. Y08's only action is "Back"; §11's state table has no withdrawn/amended offer transition; and §17 grants offer composition to an Assistant, who is by definition unlicensed and, per P5, high-turnover. So a mistyped digit on a numeric pad, entered under a 15-second target by a temporary employee, becomes a commitment my pharmacy must honour with no correction path.

**What happens.** Noor types 5,000 IQD instead of 15,000 for an insulin pen. The patient chooses us, walks in, and I must either hand over stock at a third of cost or refuse and take a support dispute that "counts against the pharmacy" on top of it. There is no screen to fix the offer between those two moments. After the second occurrence I forbid my assistants from answering, which removes the only staff who have time to answer, and my median response time collapses.

**Evidence.** "| The price at the counter differs from the offer | The offer price is binding. Disputes route to support and count against the pharmacy. |" — and "| Y08 | Offer sent | Confirm, and be clear it is not a reservation | Explicit wording, what happens next | Back | — |". ABSENT: any withdraw-offer or amend-offer screen, action, or state.

**Fix.** Add a "Withdraw or correct an offer" action valid until the patient chooses, with the patient told; define an explicit offer validity window; and decide what "binding" means in a product that handles no money (§1 forbids payments) — who enforces it and with what remedy. Also decide whether an assistant may set price unsupervised, or whether price entry above a branch-set threshold requires the pharmacist.

### 11. No way to create a subject who cannot authenticate: minors and incapacitated adults

**MAJOR** · §3 / §24 / F18 · lens: privacy-regulatory · refuted 1/2

**What is wrong.** Every subject must be an account with a verified phone number, and every grant must be approved by the subject on their own device. There is therefore no mechanism to create a record for a young child, or for an adult who cannot consent (dementia, stroke, unconsciousness). §24 asserts decisions for both — "held by a guardian", "converts at 18" — but no screen, account state, or flow in the 197-screen inventory creates a subject who cannot receive an OTP and cannot tap Approve. Incapacity is not addressed at all.

**What happens.** Zainab (P3), the persona built around a sick child at 9pm, cannot select her child in F18 — the child has no phone. She requests the antibiotic under her own record instead. The child's antibiotic is now written into the mother's clinical record, the mother's interaction checking runs against a medicine she is not taking, and the child's is checked against nothing. The same workaround happens for every bedridden parent, which is the core chronic use case.

**Evidence.** §24: "One phone number, two people | Not supported. Each person is an account." and "A minor's record | Held by a guardian; converts at 18 with the young adult's consent"; §7.6: "M->>M: Approve, possibly narrowing the scope". ABSENT: any screen that creates a subject who cannot authenticate.

**Fix.** Introduce a dependent subject held by an account — no phone number, no OTP, no self-approval — with screens for creation, for guardianship transfer at 18 (subject consents, guardian's access converts to a normal grant), and for an incapacity-based grant that records the basis claimed. State which family scopes apply to a dependent, who may hold one, and how reads of a dependent's record appear in an access log the dependent cannot read.

### 12. Consent-only access is contradicted by §17, and no patient consent screen exists

**MAJOR** · §3.4 / §17 / N03 · lens: privacy-regulatory · refuted 1/2

**What is wrong.** §3.4 states there is no mechanism for an identified clinical read without consent; §16 and §17 both permit the Clinical role to read identified records on a recorded reason alone. Two sections state different rules for the same act, and a build team must pick one. Separately, the consent the entire support model rests on has no patient-side surface: §6.6 contains A06 for family access requests only, and there is no screen anywhere for a patient to grant, refuse, or end a support session, and no banner control on the patient side despite N04 promising one.

**What happens.** Engineering implements §17 because it is the operational section, and clinical staff read identified records with a typed reason while §3.4 and the product's public promise say that is impossible — a misrepresentation exposure, not a bug. Meanwhile the support flow N03 → consent → N04 cannot complete: it is built as a checkbox the agent ticks, which is not consent, or it blocks every ticket where the user does not answer.

**Evidence.** §3.4: "The Owner cannot, and there is no mechanism to: ... Read an identified clinical record without consent and a logged reason" vs §17: "**Clinical** works de-identified by default; identified access needs a recorded reason and shows in the patient's own access log." ABSENT: a patient screen to approve, refuse, or end a support session.

**Fix.** Choose one rule and state it identically in §3.4, §16 and §17. Add patient screens: incoming support-session request (approve / refuse / choose duration), an active-session banner with a one-tap end, and a session-ended summary of what was viewed. Define the behaviour when consent is never answered. If an unconsented clinical read is genuinely needed for safety, name it, make it two-person, time-boxed, and reviewed after the fact — and delete the absolute claim in §3.4.

### 13. The two highest-stakes Arabic strings are ambiguous and blame the user

**MINOR** · §23 · lens: arabic-ux · refuted 1/2

**What is wrong.** «تعذّر الفحص» is called "the single most important state in the product" and recurs in §4, §7.1, §21, §23, M08 and T12 — yet it is formal MSA inside an otherwise Iraqi colloquial deck («تكدر», «هسه», «ما لكيناه», «راح»), it never names what could not be checked, and unqualified «الفحص» reads to a lay Arabic speaker as a medical examination or lab test on the patient, not an interaction check on a medicine. Separately, two error strings blame the user in direct contradiction of §23's own rule 1 ("Never blame the user"): «طوّلت» is second-person and means "you took too long", and «حاولت كثير» means "you tried too much". «ممكن تكون نرسلت» is also ungrammatical for its referent — الطلب is masculine, so the verb must be «انرسل» — and «تكون» invites the reading "maybe you were sent". No register policy is stated anywhere, so single sentences mix registers («حدّث التطبيق حتى تكدر تكمل» is MSA imperative plus Iraqi modal), and that will multiply across 197 screens.

**What happens.** Um Ali sees «تعذّر الفحص — راجع الصيدلي قبل الاستعمال» before a reorder and reads it as "the test could not be done" — an administrative failure, not a warning about her own medicine — and proceeds. That is precisely the outcome §7.1 calls "the most important sentence in the entire flow", produced by wording rather than logic. At the timeout screen she reads «طوّلت» as an accusation, hitting her stated fear ("an error blames her") and violating the section's own rule in the same six letters.

**Evidence.** | Timed out | «طوّلت. ممكن تكون نرسلت — نتأكد؟» | Check · Retry |

**Fix.** Rewrite: «تعذّر الفحص — راجع الصيدلي قبل الاستعمال» → «ما كدرنا نتأكد من تداخل هذا الدواء مع أدويتك. لازم مراجعة الصيدلي قبل الاستعمال.»; «طوّلت. ممكن تكون نرسلت — نتأكد؟» → «تأخر الرد. يمكن الطلب انرسل فعلاً — نتحقق؟»; «حاولت كثير. جرّب بعد ١٥ دقيقة» → «وصلنا الحد الأقصى للمحاولات. جرّب بعد ١٥ دقيقة.»; «كل شي بثقة كافية» (§22 — unparseable for a pharmacist, a literal translation of an internal concept) → «ما في شي يحتاج جرد هسه»; «ابنك يطلب الاطلاع والطلب» (§7.6, where «الطلب» collides with the product's own concept name for a medicine request) → «هشام يريد يشوف أدويتك ويطلبها عنك». Add a §4 naming rule fixing the register — Iraqi colloquial throughout including safety strings, no MSA/Iraqi mixing inside a sentence — and require every safety-critical string to pass comprehension testing with the target demographic before it ships.

### 14. The navigation map has no guest state; S04 Guest home is unreachable and contradicted

**MINOR** · §5 (vs §3.1, §8) · lens: flow-holes · refuted 1/2

**What is wrong.** §5's patient map routes an unknown user Launch → Welcome → How it works → HOME, where HOME is "اليوم · Today". §8 step 3 instead lands them on S04 Guest home. S04 appears nowhere in the map. Nothing defines which of the four destinations a guest sees, whether the tab bar is present, or how a guest reaches F05 Medicine page and F07 Nearby — which §3.1 explicitly promises them — given that FIND is a patient destination in the map.

**What happens.** A first-time visitor is routed by §5 straight into Today, a screen composed entirely of doses, reservations, supply windows and family requests, none of which a guest can have. Its "brand new" empty state («هنا راح تشوف أدويتك ومواعيدها» → "Add your first medicine") is a dead end for someone with no account, since adding a medicine requires one. §3.1's entire argument — "demanding a phone number before showing value is the single largest install-to-abandon cause" — is defeated by the map that will actually be built from, and the builder has two contradictory answers for the launch destination.

**Evidence.** §5: "  L[Launch] --> G{Known?}" / "  G -->|no| W[Welcome] --> EX[How it works] --> HOME". §8: "| 3 | Guest home (S04) | Nothing | They can search and browse immediately |". ABSENT: S04 does not appear in the §5 navigation map, and no guest navigation shell is defined.

**Fix.** Redraw §5 with an explicit guest branch: Welcome → How it works → S04, and state which destinations exist for a guest (Find and a reduced Me, not Today), what the tab bar shows, and the exact point each guest-visible screen escalates to S05.

### 15. §7.6 assumes the invited family member already has an account; no path exists if they do not

**MINOR** · §7.6 / A04 · lens: flow-holes · refuted 1/2

**What is wrong.** §7.6 shows the son inviting and the mother immediately receiving an in-app notification and approving on A06. A04 collects only "Phone number, scope chooser, message". Nothing defines what happens when that number belongs to no account — how the invitation reaches her, what she sees on install, or how the pending grant survives her own OTP sign-up. A03's states are "E, L, X" with no pending-invite state, and §3.5's account states have no invited-but-unregistered entry.

**What happens.** This is the blueprint's own flagship case — §2 says of Um Ali "Her daughter installed the app" — and it dead-ends. Hussein invites his mother's number; she is not a user; §7.6 has only two branches, approves and refuses, so nothing is specified for the third and most likely outcome. Either the invite silently vanishes (Hussein sees an invite that will never resolve, with no state on A03 to tell him so) or someone builds an unspecified SMS-plus-deferred-grant path by accident, which is precisely the "pending action must survive authentication" rule (§3.2 rule 2) applied to a case the document never covers.

**Evidence.** §7.6: "  S->>M: Request, with a chosen scope" then "  M-->>M: Notification: \"ابنك يطلب الاطلاع والطلب\"". ABSENT: no branch in §7.6 and no state on A03/A04 for an invitee who has no Dawai account, and no entry in §24's identity edge cases for it.

**Fix.** Add a third branch to §7.6 for an unregistered invitee: how the invitation is delivered off-platform, what the recipient sees on first launch, and that the pending grant is bound to the number and presented for approval immediately after OTP. Add a `pending` state to A03 so the inviter can see an unaccepted invite, and an expiry for it.

### 16. §18 grants pharmacies a support channel that exists on no screen in the 46-screen pharmacy inventory

**MINOR** · §6.9–6.12 · lens: missing · refuted 1/2

**What is wrong.** The feature matrix says a pharmacy can ask for support. The patient experience has three dedicated screens for this (U01 Help, U02 Contact support, U03 Safety report) and the Owner has a support queue (N08/N09) implying inbound tickets. The pharmacy inventory — Y01–Y14, Z01–Z10, K01–K09, B01–B13 — contains no help screen, no contact-support screen, and no route into N08. §6 claims to be "every screen the product needs".

**What happens.** It is 8pm. A pharmacist has a live confirmed hold, a customer at the counter, and a code that will not verify. There is nothing in the app to tap. He has no ticket path, no in-app documentation, and — given P5's stated "high turnover in this role" — the assistant on shift never saw the one-time guided walkthrough in §8. He calls whoever recruited him, or he stops using the product. Every pharmacy-side incident becomes an unlogged phone call invisible to the console the operator is supposed to run the company from.

**Evidence.** §18: "| Support | ✓ ask | ✓ ask | ✓ answer |" against §6's preamble "**Every screen the product needs, with the one job it has**" and a pharmacy inventory whose only settings entry is "| B01 | Branch | Settings root | Open | L |".

**Fix.** Add pharmacy Help, Contact support, and Report a problem screens to §6.9–6.12 (updating the 197 total), route them into N08, and add a re-triggerable in-app training path for new counter staff so onboarding is not a one-time event tied to one employee.

### 17. "Sold since" is structurally guaranteed, then penalised in a patient-visible score that is never defined

**MINOR** · §11 / §24 / F21 / W09 · lens: pharmacy-economics · refuted 1/2

**What is wrong.** Nothing is earmarked at Offer or at Chosen — the blueprint is emphatic that an offer "commits nothing" — and no screen exists that tells the person at the counter a box is spoken for. The interval between my offer and my confirmation is therefore an ordinary trading period in which the box will routinely be sold to a walk-in. That outcome ("Sold since") is recorded against reliability, and reliability is shown to patients as a comparison dimension in F21, yet the blueprint never defines how it is computed, over what window, with what minimum sample, or whether it can be appealed. The one exemption granted is for robbery, power cut, and flood — not for the ordinary case the design itself creates.

**What happens.** I offer on my last box of Augmentin. Three minutes later a customer standing in front of me buys it. The patient chooses me, I press "Cannot hold — sold since", and I am marked down publicly. Two such events in my first month and my card in F21 shows worse reliability than a pharmacy that never answers at all — since a pharmacy that only offers on deep stock is never penalised. The rational strategy becomes: never offer on anything I hold fewer than five of, i.e. never offer on exactly the scarce medicines patients are searching for. Separately, F21 cannot be built as specified because "reliability" has no definition anywhere in the document.

**Evidence.** "| Z04 | Cannot hold — why | … | Sold since · not found · wrong strength · damaged |" and "**Refused re-opens automatically**, and is recorded. A pharmacy that frequently confirms then fails is surfaced in §16." and "| F21 | Compare offers | … | Price, distance, readiness, reliability, substitutions |". ABSENT: the definition, window, minimum sample size, decay, display form, and appeal path for the reliability score.

**Fix.** Define reliability in full (formula, window, minimum request volume before it is shown to patients, decay, and appeal path via W09), and exclude "sold since" occurring within a short window of the offer from the penalty — or close the gap by adding a soft earmark at Chosen that is visible to counter staff. Also answer §29 Q1 before approval: it asks what a pharmacy owes for a failed hold, yet the penalty is already designed and already patient-visible.

### 18. The public medicine page publishes a price range — the city-wide price comparison §18 bans

**MINOR** · §6.4 F05 vs §18 / §9 · lens: pharmacy-economics · refuted 1/2

**What is wrong.** F05, a page a guest can read with no account and no request, shows "price range" alongside nearby availability. That is a city-level price comparison for a named medicine, available to anyone including my competitor across the street, delivered before any request exists. It directly contradicts the deliberately-absent-feature list and §9's claim that "Prices appear in offers, from real pharmacies, for a real request".

**What happens.** My competitor opens Dawai as a guest every morning, reads the price range for the twenty medicines that matter, and prices one dinar under the bottom of it. Within a month every offer in the district converges to the floor and the only differentiator left is price — the exact commoditisation the blueprint says makes pharmacies stop answering. I am the anti-persona's supplier and the product built the tool for them.

**Evidence.** "| F05 | Medicine page | What this medicine is | Names, form, strength, uses in plain Arabic, availability nearby, price range | …" vs "| Price comparison across the city | Commoditises pharmacies; they stop answering |" and §3.1: a guest can "Read a medicine page".

**Fix.** Remove "price range" from F05 and from any pre-request surface. If patients need price expectation before requesting, show a coarse, non-actionable indicator that cannot be undercut against (e.g. a national reference price, or nothing), and state the rule explicitly: no price attributable to any pharmacy is visible outside an offer made to a specific requesting patient.

### 19. The pharmacy has no data rights: no access log, no export screen, no way to leave

**MINOR** · §18 / §6.12 / §19 · lens: pharmacy-economics · refuted 1/2

**What is wrong.** §18 claims a pharmacy has "Data export — ✓ own business data" and "Account deletion — ✓ pharmacy closure", but §6's inventory — which is asserted to contain "Every screen the product needs" — has no export screen and no closure screen anywhere in B01–B13, Y, Z, or K. §18's Access log row is blank for Pharmacy, which by its own header means the feature does not exist for me at all. And §19's ownership and retention tables never mention my licence documents or my named pharmacist's personal credential — the most sensitive things I am asked to hand over.

**What happens.** I upload my licence, my premises documents, and my pharmacist's credential to a startup. I cannot see who at the platform opened them, I cannot get them back, I cannot export my own price and reservation history, and there is no screen that lets me close my account and leave. The patient beside me gets A09, L01, and L04–L07 for the same act of trust. My lawyer reads this and tells me not to sign. Worse, §24 says closure involves refunds in a product that explicitly handles no money, so the exit path is not just unbuilt, it is incoherent.

**Evidence.** "| Access log | ✓ own | | ✓ all |" with the header rule "Blank means the feature does not exist there at all"; "| Data export | ✓ own | ✓ own business data | ✓ platform |"; "| The pharmacy closes permanently | Reservations honoured or refunded; listing removed; history retained |" against "| A payment platform | Introducing money changes what we are regulated as". ABSENT from §19: any row for licence documents or pharmacist credentials, and any retention period for them.

**Fix.** Add three pharmacy screens to §6.12 (export business data, access log of platform reads of our documents and records, close pharmacy account with a stated retention and document-deletion policy); add licence documents and pharmacist credentials to §19's ownership and retention tables with a named retention period; and remove "refunded" from §24 or explain what it means in a product with no payments.

### 20. A pharmacy filtered out of requests is never told, and is then marked inactive for it

**MINOR** · §10 / §24 / §20 · lens: pharmacy-economics · refuted 1/2

**What is wrong.** §10 filters requests before sending against five conditions, one of which is my self-maintained opening hours. A request I never receive cannot appear to me as a missed request, and no screen anywhere tells me I am currently being excluded or why. §24 then treats a pharmacy that neither declines nor answers as inactive. §20 further guarantees I am not notified outside my declared hours — so if the hours themselves are wrong, the app cannot reach me to tell me.

**What happens.** My Ramadan hours are wrong by two hours, or my coverage polygon excludes the street two blocks over. Dawai stops sending me requests. My Requests screen shows the reassuring empty state "ما في طلبات هسه. فرعك متصل وشغّال" — actively telling me nothing is wrong. Weeks later I am flagged inactive and asked to pause or resume, having lost every request in that period and never having been given a reason to look. I conclude the app brings no business and delete it.

**Evidence.** "A pharmacy receives it only if **all** of the following hold: 1. Verified… 2. Open now… 3. The patient's area is inside its declared coverage 4. Not paused… 5. Has not marked this medicine \"not carried\"" and "| A pharmacy never declines and never answers | Treated as inactive after a threshold" and empty state "«ما في طلبات هسه. فرعك متصل وشغّال»". ABSENT: any surface that shows requests the branch was filtered out of, or why.

**Fix.** Add a "Requests you did not receive" count with the filtering reason (closed · outside coverage · at capacity · marked not carried) to the Requests screen and to B11, shipped in Phase 0 rather than Phase 4; and make the no-requests empty state conditional — it must not claim the branch is working when the branch is currently excluded by one of the five gates.

---

## Part 2 — What all eight reviewers missed

Produced by a completeness critic reading the blueprint fresh, after seeing the
20 survivors. This is the more valuable half of the review: 23 further gaps,
several of which outrank the confirmed findings.

### The gaps (N1–N23)

Grouped by how much they cost. Every item cites what to check.

### A. Structural holes in the core loop

**N1 — A request carries many medicines; an offer carries one price. The prescription flow cannot be answered.**
F17 Confirm request lists "**Medicines**, quantity, subject, urgency, area" — plural. Y04 Request detail shows "**Medicine**, quantity"; Y05 Compose offer is one price on one numeric pad; §15's card is "medicine, quantity"; F21 compares offers on a single price. §12 explicitly produces a multi-line prescription and sends it as one request ("Sent · the image travels with it"). So a three-line prescription is either (a) one request no pharmacy holding two of three lines can answer — collapsing fill rate on the flow §12 calls "the hardest in the product" — or (b) three parallel requests, in which case R02's single code, single countdown, single address, §14's singular "Live" band, and the lock-screen live activity are all wrong, and Um Ali collects from three counters. §24's "Partial fulfilment — 2 of 3 boxes" is about quantity of one medicine and does not address this. **The blueprint never decides.** This is the largest undecided thing in the document and it is upstream of Phase 1's entire headline.

**N2 — Supply inference, the product's durable asset, has no defined input.**
"Running low" drives T07, the Soon band (§14), the Supply notification category (§20), the two-tap reorder (§7.1 decision 1), and the blister strip — "the product's signature moment" (§26). Its inputs do not exist anywhere: M04 Schedule editor captures "Times, days, with/without food, course length" — **no dose amount**; no screen captures pack size; §17 forbids typing a quantity; §8 rule 4 forbids a questionnaire; the pharmacy is forbidden from feeding stock data. The only remaining signal is refill *intervals* from M06 — which needs two in-app refills, i.e. ~60 days for a chronic patient, i.e. after the window in which Phase 2's own definition of done ("half of chronic users return within sixty days") must already have been met. M07's "Basis, confidence, what would improve it" is a screen that shows the user an answer the product has no way to compute.

**N3 — Nobody has decided who may collect, or whose name is at the counter.**
Z02 shows "customer's **first name**", but S08 collects "Name" as one field — no first/last split exists, and Iraqi names are commonly four-part, so §19's identity-minimisation promise rests on a field the identity screen does not create. Worse: Family:Order may reserve for a subject (§17), so in the flagship flow (§7.1) Hussein reserves and Um Ali walks in. Z06's "checklist" is undefined and Z07 handles a *wrong code*, not a *different person*. There is no identity rule at handover anywhere — no rule that the code alone suffices, no rule that it does not, nothing preventing the code being forwarded by WhatsApp. For a prescription medicine, and with Z05 letting the pharmacist read a prescription naming a third party, a name mismatch at the counter is guaranteed by design in the product's own primary use case.

**N4 — Prescription-only status has no gate in the request flow.**
B07 enforces "a prescription-only medicine cannot be promoted", so the catalogue carries a POM flag. Nothing else uses it. F14 lets a patient type any name; F17 sends it; Y05 prices it; Z03 has a licensed pharmacist accept clinical responsibility for a dispense with no prescription evidence attached. §7.2 — the document's own worked example — is a mother reserving a **child's antibiotic at 9pm with no prescription**. §12 rule 8 defers only *controlled* substances. In a document whose entire safety architecture is "the pharmacist's licence is the control", the absence of a POM gate is a first-order hole, not a detail.

**N5 — The request window is never defined, and F19 offers a week-long one.**
§11 has state "Unanswered — window elapsed"; Y12 is "Request expired — the window passed"; §7.2 says "within 10 min"; F20 shows "typical time"; Y03 orders "by decision urgency"; §15's top band is "Requests expiring soon". No duration is stated, and no rule ties it to F19's now/today/**this week**. Either a "this week" request expires in minutes — making the option a lie — or it occupies a card in every eligible pharmacy's inbox for seven days, which makes Y03 unusable and inverts §10's "interrupting a pharmacist pointlessly is how you get ignored permanently."

**N6 — §22 promises preferential routing that §10 does not contain.**
The Saved-pharmacies empty state reads «احفظ صيدليتك المعتادة حتى **نسألها أول**» — we will ask it first. §10's five routing rules contain nothing of the kind, and §11 has no pre-broadcast state. A first-look window for a saved pharmacy is a material change to fill time, to Zainab's 9pm case, and to pharmacy economics — and it is the exact lever Open Question 8 (paid placement) is about. It is currently specified only inside a copy string.

### B. The release plan is not a plan

**N7 — The safety system is in no phase. At all.**
Phase 0 ships T01 and T06; Phase 2 ships "M01–M11, T09". **T11 Safety layer, T12 Attention detail, T02 Subject switcher, T03/T04/T05 dose, T07 Running low, T08, T10 appear in no phase in the document.** So the interaction alert — the surface §4, §5 rule 4, §14, §24 and §26 all build around — is never scheduled, while M08 Interaction info ships in Phase 2. Phase 0 ships F17 Confirm request, and §7.1 puts the safety gate immediately before it, so **Phase 0 as written is a live request loop with no safety check and no screen to render one.** Likewise **U01–U03 are in no phase**: N10 "Safety reports — the fast path from U03" ships in Phase 3, so the receiving end of §7.7 ships and the reporting end never does. K01–K09 (the whole stock module) is in no phase, which also means §10's routing rule 5 ("has not marked this medicine not carried") has no data source in any phase. Roughly 90 of the 197 screens are assigned to no phase; the ones above are the ones that matter.

**N8 — Phase 0 cannot measure its own definition of done.**
Phase 0's gate is "80% of requests receive an offer within five minutes and 95% of confirmed reservations are collected." G03 Fill rate and G07 Response times ship in Phase 3. Phase 0's Owner allocation is W03, W04, W06 only. The same applies to §16's "four instruments that matter": G01 is called "**the launch instrument** — the screen that decides which district is next", and it arrives two phases after the decision it exists to inform.

**N9 — Phase 4 schedules a feature §18 permanently bans.**
Phase 4 "Adds: … **price transparency** …". §18 lists "Price comparison across the city" as deliberately absent forever. This is the same collision the pharmacy-economics reviewer found on F05, but here it is a scheduled deliverable in the release plan, not an accident on a screen.

### C. Promises contradicted inside the document, untouched by the consistency review

**N10 — Three mutually exclusive statements about clinical data on the device.**
L03 Sign out: "What stays on the device (**nothing clinical**)". §21: My medicines, timeline, dose logging, downloaded prescriptions all work offline. §26: "Secure device storage — **anything clinical held locally**." All three cannot hold. This is design-changing, not editorial: it decides whether a shared household phone (the Iraqi norm, and the premise of §26's biometric row and §8's "second account on one device") retains a record after sign-out.

**N11 — Two of the three retention promises are contradicted by shipped surfaces.**
§19: "Location — **Never stored**, used for the query and discarded." But S09 stores an area, A02 makes it an editable profile field, F17 attaches it to every request, and G01–G04 analyse fill rate and unmet demand *by area and hour*. §19: "Search history — **on the device only**." But F03 offers "**popular**" searches (a server-side aggregate) and §13.1 requires every unmatched search to be written to C09 Unmatched requests, which §16 calls the recruitment list. The promises are defensible with a definition of "location" and "search history"; as written they are false, and they are the two rows the privacy story is sold on.

**N12 — Deletion cannot mean deletion, and L04 is required to say exactly what it means.**
§19 keeps the audit log 7 years, immutable, and V10 stores "before and after" for each action; reservation history is kept 3 years because "pharmacies have record-keeping obligations" — and that record is identified (Z02, first name) and names the medicine. L04's job is to state "exactly what is deleted, what is legally retained". The blueprint never decides what survives on the pharmacy side, so the one screen whose entire purpose is that sentence has no sentence.

**N13 — A closed-but-opening pharmacy receives requests it can never be told about.**
§10 rule 2 routes to pharmacies "open now, **or opening within the request's urgency window**". §20 rule 8: "A pharmacy is **not notified outside its opening hours**, except for a reservation it already confirmed." §7.2 contradicts both: "Only **open**, in-coverage, accepting pharmacies asked." Three rules, three different answers, and the losing case is silent request loss at exactly the hour §7.2 is set in. Related: B06 "Capacity — how many at once" is used as routing filter §10 rule 4 without ever defining the unit (concurrent requests? open reservations? per hour?).

**N14 — Memorialisation is emphasised and has no mechanism.**
§24: "The subject dies — the account is memorialised… **This will happen and must not be discovered in production.**" §3.5's account-state table has no memorialised state. No screen creates it, no role may trigger it, and nothing says who reports a death or how it is verified. The only plausible reporter is a family grant holder — which makes "stop this person's reminders and freeze their account" a one-tap capability handed to anyone with View scope.

**N15 — "Notify me" is promised four times and has no lifecycle.**
F24, §13.2, §13.3, §23 (outside coverage) and §24 (waitlist) all offer it. §20's nine notification categories contain no match, so it cannot be delivered or governed; A14 is per-category, so it cannot be turned off; no screen lists active watches, and nothing cancels one or expires it. A patient who taps it three times has created three permanent, invisible, undeletable subscriptions.

**N16 — §21 rule 2 requires a surface that does not exist.**
"A queued action is visible to the user, with the ability to cancel it before it sends." There is no outbox, pending list, or queued-request screen in the 197. Given §21's rule that a request must "never be shown as sent", this is the screen that keeps the offline story honest.

**N17 — R07's ratings have no destination, and one of them is the price dispute.**
R07 collects "was it ready · was the price right · was the wait short". B11's eight metrics do not include them; W09's three do not; F21's five comparison dimensions do not. So the product collects patient judgements about small businesses and the document never says where they go — while "was the price right" quietly becomes a second, unaudited intake for the §24 price dispute that is supposed to route to support.

**N18 — Staff permissions stop at the counter.**
§17 governs clinical, reservations, stock, platform. Nothing governs B01–B13. As specified, the 24-year-old high-turnover assistant of P5 may read B11 Performance and B12 Returning customers, edit B02 hours (a §10 routing input), change B05 coverage, remove staff at B09, and upload licence documents at B13. B09 carries a P state, so gating is assumed and never written.

**N19 — Five two-person controls, one operator.**
§3.4 and §17 require a second approver for broadcasts, role grants, claim withdrawal, platform export, and "anything reaching all users". P6 is "the operator (**you**)", singular, and Open Question 4 concedes clinical governance has no name. At launch, five of the document's strongest controls are unexecutable — not weakly enforced, unexecutable.

### D. Iraq-specific misses the Iraq reviewer did not reach

**N20 — Ramadan is treated as a pharmacy-hours problem. It is a medication problem.**
§24's only entry is "Ramadan and holiday hours — Exceptions (B03); the app respects them without being told each year" — which B03, a manual one-off closure list, cannot do, since Ramadan moves ~11 days annually against the Gregorian calendar. The real gap is larger: a fasting chronic patient shifts **every dose in the product for a month**, and "with/without food" (M04) inverts. §14's Now band, §20's dose category, T03/T04/T05, and adherence display all assume a stable daily schedule. A medication app for Iraq with no fasting model will be wrong for roughly one twelfth of every year, for its primary persona, on its primary screen. Nothing in the document mentions fasting. Nothing mentions the Hijri calendar either, though S14 offers numeral systems and §12 rule 7 checks prescription expiry dates.

**N21 — The two most emotionally load-bearing components depend on OS behaviour Iraq's device base does not provide.**
§26 commits to "Wallet pass — the reservation pass" and "Live lock-screen activity — the reservation countdown", and §20 rule 7 makes the lock-screen countdown a requirement "precisely when the patient is anxious". R02 carries a Wallet action. On the low-end Android that dominates this market, live activities do not exist as specified and vendor battery management on Xiaomi/Huawei/Oppo/Transsion also routinely kills §20 rule 2's device-scheduled dose reminders — the rule justified by "a reminder that fails because the connection dropped fails on exactly the days that matter."

**N22 — Kurdish ships in Phase 0 and is an open question.**
S14 offers "Arabic / Kurdish / English" and S01–S14 are all in Phase 0. Open Question 7 asks "Do we support Kurdish at launch?" and says it "changes the type system, the catalogue, and the support model." Meanwhile C02's medicine editor has "Arabic and Latin names" only — there is no Kurdish name field in the catalogue, so a Kurdish UI would render every medicine name in a language the user did not choose. Also: §22 and §23's entire copy deck is Iraqi Arabic, and no rule says whether Kurdish and English get colloquial or formal treatment.

**N23 — Um Ali cannot be represented by the identity model that the family flow requires.**
This sharpens the minors/incapacity finding rather than repeating it. P1 states Um Ali "uses WhatsApp fluently and nothing else" and "**her daughter installed the app**". §7.6 requires the subject to receive an in-app notification on her own device and tap Approve on A06. §24 says one phone number cannot serve two people. So the product's #1 persona, in the product's #1 relationship, either owns a smartphone with the app and an OTP-capable number — contradicting her description — or she cannot be a subject at all. The gap is not an edge case about minors; it is the median chronic patient this product exists for.

---

---

## Part 3 — What changes the design, not the document

Ranked by how much has to be *re-decided*, not how bad they are.

**1. No subject who cannot authenticate (privacy #6), read together with N23.**
Fixing this means introducing a *managed subject* that is not an account — a record with no phone, no OTP, and a responsible account attached. That reverses §3.2 rule 3 ("any authenticated account is a patient"), rewrites §17's family scopes (currently account-to-account with subject-side approval, which a managed subject cannot give), rewrites A03–A08 entirely, forces a new consent-transfer flow at 18 and a new revocation authority, and changes who the record belongs to under §19 — the one principle the whole privacy story hangs on. It also unblocks the actual median user. Nothing else in the list touches this many decided things.

**2. Allergies (clinical #1).**
There are only two exits and both are design changes. Capture allergies — which requires an intake surface and directly reverses §3.2 rule 4 and §8 rule 4, the "no medical questionnaire" principle, and forces a decision about who may author a clinical fact when §17 says nobody may edit one. Or delete the row and state plainly that §7.1's check is medicine-vs-medicine — which changes what «تعذّر الفحص» means, what T12 explains, what M08 can claim, and removes the clinical justification for the pharmacist-routing that half the safety design leans on. Deferring it is not available; the permission matrix currently promises data that does not exist.

**3. Unit of dispense and quantity (Iraq #5), amplified by N2.**
"Quantity" appears on F17, Y04, Y05, R02, M06 and §15 with no unit. Deciding it is a schema decision that propagates to every one of those screens, to F21's comparison, to partial fulfilment (§24), to the offer's binding claim, and to supply inference — which currently has no inputs at all. Iraqi dispensing by strip or tablet count means the answer is probably not "box", which then breaks the "no quantity field, ever" promise to P4 (§2) or breaks the blister strip (§26). This is the cheapest finding to state and the most expensive to fix late.

**4. Licensed-pharmacist-only confirmation (Iraq #3).**
Fixing it means the confirmation act must be bound to a person, not a session: per-confirmation credential, biometric or otherwise, tied to the verified licence — which redesigns Y01 (currently "Staff picker or PIN"), redesigns Z03, adds a not-present state to the branch model (§24's "the only licensed pharmacist leaves" case becomes the *normal* evening case, not an edge case), and collides head-on with the 15-second answer target and the 56pt one-handed-at-speed design premise. Not fixing it is also a design decision — it means the audit log records a professional attestation that is routinely false, which is worse than having no control.

**5. T11 has no exit (clinical #2).**
The only stated escape is a pharmacist override with a recorded reason. Building it requires a pharmacist-facing patient-alert surface, which breaches §15's absolute wall ("any clinical history, ever") and §18's ban on patient-to-pharmacy chat, and requires the pharmacist to see *why* the alert fired — i.e. the patient's other medicines. Every fix here reverses a stated boundary. The alternative fix — a patient-side acknowledgement — reverses §24 and trains the exact dismissal reflex T11 exists to prevent.

**Two unlisted gaps outrank items 4 and 5 on this criterion:** N1 (multi-line request vs single-price offer) forces either line-level offers — a model change touching every request, offer, reservation and code screen — or splitting requests, which breaks the single reservation pass; and N7 (the safety layer is in no release phase) means the sequencing decision that governs when the product becomes safe to use has not been made at all.

---

---

## Part 4 — Is it ready to build from?

**No.** It is an outstanding *decision* document and an incomplete *specification*: it settles principles with unusual precision and leaves every load-bearing quantity undefined — the request window, the area unit, the dispense unit, the capacity unit, the reliability formula, the confidence basis — so a build team would invent all six and each invention would silently contradict a principle stated elsewhere. Second, "197 screens — every screen the product needs" is a claim, not a plan: four decided flows have zero screens, roughly ninety screens are in no release phase, the safety layer and the safety-report intake are in no phase at all, and Phase 0 cannot measure the outcome that defines it. Third, §29 leaves regulatory status and controlled-substance handling open while §12 and §7.2 already build on answers to both — you cannot begin construction on a document that states, in its own words, that it may not be legal to build.

What *is* ready: §1, §2, §4, §14, §15, §19's ownership table, §20, §21, §25, §26 and §27 are better than most shipped products ever get, and the reservation state table in §11 is the right spine. The gap is between "we have decided what we believe" and "we have specified what to make."

---

---

## Part 5 — The single riskiest assumption

**That a clinical record which nobody is permitted to author will nonetheless fill itself accurately through ordinary use.**

§1 stakes the company's identity on the ordering — "a clinical record with a fulfilment loop attached, *in that order*… ordering it the other way produces a marketplace that competes on price and dies." Every mechanism that could populate that record is then individually and correctly forbidden: no medical questionnaire (§3.2 r4, §8 r4), no pharmacist data entry (§2 P4, §1 principle 2), no typed quantity by anyone (§17), no stock counts fed to the patient side, no dose amount in the schedule editor (M04), no pack size anywhere, no free-text clinical entry (§12 r3), and no editing of a clinical record by any role at all (§17). The record is therefore expected to accrete from confirmed doses and refill events alone.

If that assumption is wrong — if patients log doses inconsistently, refill outside the app, or simply never confirm — then M07's confidence, T07's "4 days left", §14's Soon band, the Supply notification category, the two-tap reorder, the blister strip, and Phase 2's entire definition of done all lose their input, and what remains is a request-and-offer board with prices on it: the price-competing marketplace §1 says dies. That is the largest single block of work in the document invalidated by one belief.

What makes it the *riskiest* rather than merely the largest is that **the release plan never tests it.** Phase 0's gate proves the fulfilment loop — the thing §1 calls secondary. Nothing in Phases 0 or 1 produces evidence about the durable asset, and by the time Phase 2 ships to test it, four phases of architecture have been derived from the assumption that it holds. The one belief the whole strategy rests on is the one belief the plan defers longest.

---

## Part 6 — What I take from this

Written by the author of the blueprint, about the blueprint.

The review is right and the verdict is right. Three patterns run through it, and
all three are mine:

**1. I specified principles and left every quantity undefined.** The request
window, the area unit, the dispense unit, the capacity unit, the reliability
formula, the confidence basis — six numbers a build team would each invent, and
each invention would silently contradict a principle stated elsewhere. A
blueprint that decides beliefs but not magnitudes is not a specification.

**2. I let a promise substitute for a mechanism, repeatedly.** The permission
matrix grants access to allergies no screen collects. The safety layer's only
exit is a pharmacist override with no pharmacist surface. "Notify me" is offered
four times and appears in no notification category. Memorialisation is
emphasised in bold and has no account state. The pharmacy application flow is
described in §3.3 and §7.5 and has **zero screens**. Each time, I wrote the rule
and did not check that something could carry it out.

**3. I counted 197 screens and called it complete without checking coverage.**
Roughly ninety of them are in no release phase. The safety layer is in no phase.
Phase 0 cannot measure the outcome that defines it. I verified the *count* —
programmatically, and corrected it when it was wrong — and never verified that
the set was closed under the flows and phases that reference it. Counting is not
completeness, and I mistook one for the other.

The riskiest-assumption answer is the one I would not have found alone: **the
clinical record that nobody is permitted to author is expected to fill itself,
and the release plan never tests whether it does.** Every mechanism that could
populate it is individually and correctly forbidden. I forbade them one at a
time, in different sections, each for a good reason, and never summed them.

---

## Part 7 — What must be decided before a line of code

Ordered by how much has to be re-decided, not by severity. Each is a product
decision; none can be deferred to implementation without the implementation
making it by accident.

| # | Decision | Blocked work |
|---|---|---|
| 1 | **Can a subject exist who cannot authenticate?** (managed records for elderly, minors, incapacitated) | The family model, §17 scopes, A03–A08, §19 ownership — and the median user |
| 2 | **Does a request carry one medicine or many?** | Every request, offer, reservation and pass screen; the whole prescription flow |
| 3 | **Allergies: capture them, or strike the row and say the check is medicine-vs-medicine** | The safety architecture and what «تعذّر الفحص» means |
| 4 | **What is the unit of quantity?** (box, strip, tablet) | Six screens, partial fulfilment, the binding price, supply inference |
| 5 | **What actually populates the medication record?** | Phase 2 in full, and §1's claim about what Dawai is |
| 6 | **How is a pharmacist bound to a confirmation?** (per-act credential vs session) | Y01, Z03, branch staffing model, the 15-second target |
| 7 | **What is the exit from a severe safety alert?** | T11, T12, and one of §15 or §24 must give |
| 8 | **Is a prescription required before a POM request completes?** | §7.2's own worked example currently violates it |
| 9 | **What is the request window, per urgency level?** | Y03 ordering, §10 routing, F19's meaning |
| 10 | **Who is the second approver?** | Five two-person controls are currently unexecutable |

Plus the ten already open in §29, of which **regulatory status** and
**controlled substances** are the two that §12 and §7.2 already assume answers
to.

## Part 8 — Recommended next step

Not "fix the blueprint". The blueprint is a good decision document with holes in
the places where decisions were never made. The next step is:

1. **Answer the ten decisions above, and §29's ten.** They are yours, not mine.
2. **Then** revise the blueprint against those answers — which will change §3,
   §6, §11, §17 and §28 materially, not editorially.
3. **Then** re-run this review. Same eight lenses, same two skeptics. A review
   that has never changed its verdict is not a review.
4. **Then** write the architecture — application count, platform, everything I
   withdrew — from a blueprint that has been attacked twice and survived.

Building before step 1 means the build makes those ten decisions by accident,
which is precisely the failure this whole exercise exists to prevent.
