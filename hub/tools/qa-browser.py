#!/usr/bin/env python3
"""Independent mobile, RTL, accessibility, and clinical-meaning browser gate."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("QAREEB_BASE_URL", "http://127.0.0.1:4173")
OUTPUT = Path(os.environ.get("QAREEB_QA_OUTPUT", "/tmp/qareeb-clinical-browser-qa.json"))
CHROME = os.environ.get("CHROME_PATH", "/usr/local/bin/google-chrome")
WIDTHS = (320, 390, 430)
ROUTES = (
    "#/",
    "#/record",
    "#/record/allergies",
    "#/record/medications",
    "#/record/labs",
    "#/record/timeline",
    "#/record/shares",
    "#/record/access",
    "#/clinical",
    "#/clinical/encounter",
    "#/clinical/inbox",
    "#/lab",
    "#/imaging",
    "#/pharmacy-rx",
    "#/settings",
    "#/privacy",
)

NOW = 1_785_408_000_000
RECORD = {
    "patient": {
        "id": "PAT-QA",
        "nameParts": {
            "given": "زينب",
            "father": "كاظم",
            "grandfather": "عبدالله",
            "family": "الجبوري ذات الاسم السريري الطويل",
        },
        "birthDate": "1986-11-02",
        "sex": "female",
        "identifiers": [],
    },
    "conditions": [
        {
            "id": "C-DM",
            "display": "داء السكري من النوع الثاني",
            "clinicalStatus": "active",
            "chronic": True,
            "onsetDate": "2024-03-01",
            "lastReviewed": "2026-07-01",
            "episodeId": "EP-DM",
        }
    ],
    "medications": [
        {
            "id": "M-1",
            "display": "ميتفورمين ممتد المفعول 500 mg",
            "dose": "500 mg",
            "frequency": "BID",
            "indication": "داء السكري من النوع الثاني",
            "startDate": "2026-06-01",
            "lastConfirmed": "2026-07-01",
            "status": "active",
            "episodeId": "EP-DM",
        }
    ],
    "allergies": [
        {
            "id": "A-UNKNOWN",
            "substance": "Amoxicillin / أموكسيسيلين",
            "reaction": "تفاعل أبلغ عنه المريض ولم تُقيّم شدته",
            "criticality": "unable-to-assess",
            "verificationStatus": "patient-reported",
        }
    ],
    "results": [
        {
            "id": "R-HB-1",
            "code": "718-7",
            "display": "الهيموغلوبين",
            "value": 11.2,
            "unit": "g/dL",
            "refLow": 12,
            "refHigh": 16,
            "effectiveAt": "2025-01-01",
            "performerId": "LAB-A",
            "episodeId": "EP-DM",
            "acknowledgedBy": "DR-A",
        },
        {
            "id": "R-HB-2",
            "code": "718-7",
            "display": "الهيموغلوبين",
            "value": 9.1,
            "unit": "g/dL",
            "refLow": 12,
            "refHigh": 16,
            "effectiveAt": "2026-07-15",
            "performerId": "LAB-B",
            "episodeId": "EP-DM",
            "acknowledgedBy": None,
        },
        {
            "id": "R-UNKNOWN",
            "code": "NO-RANGE",
            "display": "اختبار بلا مدى مرجعي",
            "value": 8.4,
            "unit": "mmol/L",
            "effectiveAt": "2026-07-20",
            "performerId": "LAB-A",
            "acknowledgedBy": None,
        },
    ],
    "procedures": [
        {
            "id": "P-1",
            "display": "استئصال المرارة بالمنظار",
            "performedAt": "2025-06-01",
            "episodeId": "EP-GB",
            "pathology": "التهاب مزمن — لا خباثة",
        }
    ],
    "encounters": [
        {
            "id": "E-1",
            "state": "signed",
            "startedAt": "2026-07-15",
            "chiefComplaint": "تعب ودوخة",
            "assessment": "فقر دم يحتاج متابعة",
            "clinicianId": "DR-A",
            "episodeId": "EP-DM",
        }
    ],
    "episodes": [
        {"id": "EP-DM", "title": "السكري", "status": "ACTIVE"},
        {"id": "EP-GB", "title": "المرارة", "status": "COMPLETED"},
    ],
    "tasks": [
        {
            "id": "T-ACK",
            "kind": "result-acknowledgement",
            "status": "open",
            "blocking": True,
            "dueAt": "2026-07-15",
            "episodeId": "EP-DM",
        }
    ],
    "documents": [],
    "immunizations": [],
    "prescriptions": [],
    "appointments": [],
    "shares": [],
    "accessLog": [],
    "requests": [],
    "orders": [],
    "studies": [],
    "referrals": [],
    "followUps": [],
    # Deliberately belongs to DR-ER, not the current DR-OTHER actor.
    "breakGlass": {
        "actorId": "DR-ER",
        "role": "DOCTOR",
        "patientId": "PAT-QA",
        "reason": "إنعاش مريض فاقد الوعي",
        "at": NOW,
        "expiresAt": NOW + 3_600_000_000,
        "tier": "critical",
        "notifyPatient": True,
    },
}

CLINICIAN = {
    "id": "DR-OTHER",
    "name": "شخص مدّعٍ آخر",
    "role": "DOCTOR",
    "specialty": "غير متحقق",
    "licenseNumber": "CLAIMED",
    "syndicateId": "CLAIMED",
    "licenseStatus": "SELF_ASSERTED",
}


def finding(level: str, code: str, message: str, evidence: dict | None = None) -> dict:
    return {
        "level": level,
        "code": code,
        "message": message,
        "evidence": evidence or {},
    }


def main() -> int:
    findings: list[dict] = []
    route_results: list[dict] = []
    console_errors: list[dict] = []

    init_script = f"""
      localStorage.clear();
      const qaRecord = {json.dumps(RECORD, ensure_ascii=False)};
      qaRecord.breakGlass.at = Date.now();
      qaRecord.breakGlass.expiresAt = Date.now() + 3600000;
      localStorage.setItem("qrb.lang", JSON.stringify("ar"));
      localStorage.setItem("qrb.role", JSON.stringify("patient"));
      localStorage.setItem("qrb.qareeb.record.v1", JSON.stringify(qaRecord));
      localStorage.setItem("qrb.qareeb.clinician.v1", JSON.stringify({json.dumps(CLINICIAN, ensure_ascii=False)}));
    """

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=CHROME,
            args=["--no-sandbox"],
        )

        for width in WIDTHS:
            context = browser.new_context(
                viewport={"width": width, "height": 844},
                reduced_motion="reduce",
                locale="ar-IQ",
            )
            page = context.new_page()
            page.add_init_script(script=init_script)
            page.on(
                "console",
                lambda msg, w=width: console_errors.append(
                    {"width": w, "type": msg.type, "text": msg.text}
                )
                if msg.type == "error"
                else None,
            )
            page.on(
                "pageerror",
                lambda error, w=width: console_errors.append(
                    {"width": w, "type": "pageerror", "text": str(error)}
                ),
            )

            for route in ROUTES:
                page.goto(f"{BASE_URL}/{route}")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(450)
                result = page.evaluate(
                    """() => {
                      const visible = (el) => {
                        const r = el.getBoundingClientRect();
                        const s = getComputedStyle(el);
                        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
                      };
                      const unnamed = [...document.querySelectorAll("a[href],button,input,select,textarea")]
                        .filter(visible)
                        .filter((el) => {
                          if (el.matches("input,select,textarea")) {
                            return !(el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"));
                          }
                          return !(el.innerText.trim() || el.getAttribute("aria-label") ||
                            el.getAttribute("aria-labelledby") || el.getAttribute("title"));
                        })
                        .map((el) => el.outerHTML.slice(0, 180));
                      const small = [...document.querySelectorAll("a[href],button,input,select,textarea,[onclick]")]
                        .filter(visible)
                        .map((el) => {
                          const r = el.getBoundingClientRect();
                          const pseudo = getComputedStyle(el, "::after");
                          const extended = pseudo.content !== "none" && pseudo.content !== "normal";
                          const ew = extended ? Math.max(r.width, 44) : r.width;
                          const eh = extended ? Math.max(r.height, 44) : r.height;
                          return { el, r, ew, eh };
                        })
                        .filter((x) => x.ew < 44 || x.eh < 44)
                        .map((x) => ({
                          tag: x.el.tagName,
                          text: (x.el.innerText || x.el.getAttribute("aria-label") || "").trim().slice(0, 60),
                          width: Math.round(x.r.width),
                          height: Math.round(x.r.height),
                        }));
                      const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
                      const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
                      return {
                        route: location.hash,
                        dir: document.documentElement.dir,
                        lang: document.documentElement.lang,
                        bodyText: document.body.innerText,
                        appText: document.getElementById("app")?.innerText || "",
                        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 ||
                          document.body.scrollWidth > innerWidth + 1,
                        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                        unnamed,
                        small,
                        duplicates,
                        headingLevels: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
                          .filter(visible).map((h) => Number(h.tagName.slice(1))),
                      };
                    }"""
                )
                result["width"] = width
                route_results.append(result)
                if result["dir"] != "rtl" or result["lang"] != "ar":
                    findings.append(
                        finding("P1", "RTL_ROOT", "Arabic route lost RTL/lang semantics", result)
                    )
                if result["horizontalOverflow"]:
                    findings.append(
                        finding(
                            "P2",
                            "MOBILE_OVERFLOW",
                            f"Horizontal overflow at {width}px on {route}",
                            {"scrollWidth": result["scrollWidth"]},
                        )
                    )
                if result["unnamed"]:
                    findings.append(
                        finding(
                            "P2",
                            "UNNAMED_CONTROL",
                            f"Unnamed controls at {width}px on {route}",
                            {"controls": result["unnamed"]},
                        )
                    )
                if result["small"]:
                    findings.append(
                        finding(
                            "P2",
                            "TOUCH_TARGET",
                            f"Sub-44px effective targets at {width}px on {route}",
                            {"controls": result["small"][:10]},
                        )
                    )
                if result["duplicates"]:
                    findings.append(
                        finding(
                            "P2",
                            "DUPLICATE_ID",
                            f"Duplicate IDs on {route}",
                            {"ids": result["duplicates"]},
                        )
                    )
                if result["headingLevels"] and result["headingLevels"][0] != 1:
                    findings.append(
                        finding(
                            "P2",
                            "HEADING_HIERARCHY",
                            "Rendered pages start below heading level 1.",
                            {"route": route, "levels": result["headingLevels"]},
                        )
                    )

            if width == 390:
                by_route = {item["route"]: item for item in route_results if item["width"] == width}
                allergies = by_route["#/record/allergies"]["appText"]
                if "خفيفة" in allergies and "تفاعل أبلغ" in allergies:
                    findings.append(
                        finding(
                            "P0",
                            "ALLERGY_SEVERITY_FALSE_LOW",
                            "An unable-to-assess, patient-reported allergy is rendered as low severity.",
                            {"route": "#/record/allergies", "text": allergies},
                        )
                    )

                labs = by_route["#/record/labs"]["appText"]
                if "←" in labs:
                    findings.append(
                        finding(
                            "P1",
                            "RTL_TREND_ARROW",
                            "Lab chronology uses an unlabeled arrow in RTL.",
                            {"route": "#/record/labs", "text": labs},
                        )
                    )
                if "اختبار بلا مدى مرجعي" in labs and not any(
                    label in labs for label in ("غير قابل للحكم", "لا يمكن تقييم", "unjudgeable")
                ):
                    findings.append(
                        finding(
                            "P1",
                            "UNJUDGEABLE_UNLABELED",
                            "A result without a reference range has no explicit unjudgeable state.",
                            {"route": "#/record/labs", "text": labs},
                        )
                    )

                clinical = by_route["#/clinical"]["appText"]
                if "لقطة سريرية" in clinical:
                    findings.append(
                        finding(
                            "P0",
                            "BREAK_GLASS_NOT_ACTOR_BOUND",
                            "DR-OTHER can use a break-glass grant issued to DR-ER in the client access path.",
                            {"route": "#/clinical", "actor": CLINICIAN["id"], "grantActor": "DR-ER"},
                        )
                    )

                encounter = by_route["#/clinical/encounter"]["appText"]
                if "لقطة سريرية" in encounter and "سجّل زيارة" in encounter:
                    findings.append(
                        finding(
                            "P1",
                            "ENCOUNTER_ROUTE_MISWIRED",
                            "The Record a visit deep link returns to the snapshot and exposes no encounter workflow.",
                            {"route": "#/clinical/encounter"},
                        )
                    )

                page.goto(f"{BASE_URL}/#/")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(450)
                page.evaluate("openLocation()")
                dialog = page.evaluate(
                    """() => {
                      const el = document.querySelector('.sheet[role="dialog"]');
                      return el ? {
                        ariaLabel: el.getAttribute("aria-label"),
                        labelledBy: el.getAttribute("aria-labelledby")
                      } : null;
                    }"""
                )
                if dialog and not dialog["ariaLabel"] and not dialog["labelledBy"]:
                    findings.append(
                        finding(
                            "P2",
                            "DIALOG_UNLABELED",
                            "Bottom-sheet dialog has no accessible name.",
                            dialog,
                        )
                    )

                page.goto(f"{BASE_URL}/#/")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(450)
                page.evaluate("location.hash = '#/record'")
                page.wait_for_timeout(350)
                active_id = page.evaluate("document.activeElement && document.activeElement.id")
                if active_id != "app":
                    findings.append(
                        finding(
                            "P2",
                            "ROUTE_FOCUS",
                            "Hash navigation did not move focus to main content.",
                            {"activeId": active_id},
                        )
                    )

            context.close()

        browser.close()

    unexpected_console = [
        item
        for item in console_errors
        if "Failed to load resource" not in item["text"]
    ]
    if unexpected_console:
        findings.append(
            finding(
                "P1",
                "BROWSER_ERRORS",
                "Unexpected browser errors occurred during route coverage.",
                {"errors": unexpected_console},
            )
        )

    deduped = list({(f["level"], f["code"], f["message"]): f for f in findings}.values())
    report = {
        "baseUrl": BASE_URL,
        "widths": WIDTHS,
        "routes": ROUTES,
        "routeChecks": len(route_results),
        "findings": sorted(deduped, key=lambda f: (f["level"], f["code"])),
        "counts": {
            level: sum(1 for item in deduped if item["level"] == level)
            for level in ("P0", "P1", "P2")
        },
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["counts"], ensure_ascii=False))
    print(f"report: {OUTPUT}")
    return 1 if report["counts"]["P0"] or report["counts"]["P1"] else 0


if __name__ == "__main__":
    sys.exit(main())
