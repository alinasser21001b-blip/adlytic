/* GENERATED FROM release-manifest.yaml — DO NOT EDIT BY HAND */
window.RELEASE = {
 "releaseId": "platform-1.5.0",
 "status": "candidate",
 "platform": "1.5.0",
 "policyVersion": "1.0.0",
 "adrs": [
  "ADR-014",
  "ADR-015",
  "ADR-016"
 ],
 "approvals": {
  "ux": "pending",
  "accessibility": "pending",
  "rtl": "pending",
  "clinical": "pending",
  "engineering": "pending",
  "evidence": "pending"
 },
 "knowledge": {
  "activeRelease": "2026.08.1",
  "evidenceSchema": "1.0.0"
 },
 "runtime": {
  "featureFlags": {
   "registryVersion": "1.0.0",
   "approvedSnapshot": "flags-2026-08-02-01",
   "values": {
    "reservation_live_eta_v2": false,
    "pharmacist_inbox_density_v2": true,
    "safety_alert_new_copy": false,
    "interaction_priority_rules_v3": false
   }
  },
  "configurationHash": "sha256:REPLACE_AT_BUILD"
 },
 "versions": [
  [
   "Platform",
   "1.5.x",
   "1.5.0",
   "1.5.0"
  ],
  [
   "UI System",
   "1.5.x",
   "1.5.0",
   "1.5.0"
  ],
  [
   "API Contracts",
   "1.3.x",
   "1.3.0",
   "1.3.0"
  ],
  [
   "interaction-check",
   "2.1.x",
   "2.1.0",
   "2.1.0"
  ],
  [
   "safety-alert",
   "3.0.x",
   "3.0.0",
   "3.0.0"
  ],
  [
   "dispense",
   "1.2.x",
   "1.2.0",
   "1.2.0"
  ],
  [
   "medication-timeline",
   "1.0.x",
   "1.0.0",
   "1.0.0"
  ],
  [
   "adherence",
   "1.1.x",
   "1.1.0",
   "1.1.0"
  ],
  [
   "inventory-observation",
   "1.0.x",
   "1.0.0",
   "1.0.0"
  ],
  [
   "Knowledge Base",
   "2026.08.1",
   "2026.08.1",
   "2026.08.1"
  ],
  [
   "Evidence Schema",
   "1.0.0",
   "1.0.0",
   "1.0.0"
  ]
 ],
 "contracts": [
  {
   "name": "interaction-check",
   "version": "2.1.0",
   "supported": "2.1.x",
   "breakingChange": false
  },
  {
   "name": "safety-alert",
   "version": "3.0.0",
   "supported": "3.0.x",
   "breakingChange": true
  },
  {
   "name": "dispense",
   "version": "1.2.0",
   "supported": "1.2.x",
   "breakingChange": false
  },
  {
   "name": "medication-timeline",
   "version": "1.0.0",
   "supported": "1.0.x",
   "breakingChange": false
  },
  {
   "name": "adherence",
   "version": "1.1.0",
   "supported": "1.1.x",
   "breakingChange": false
  },
  {
   "name": "inventory-observation",
   "version": "1.0.0",
   "supported": "1.0.x",
   "breakingChange": false
  }
 ],
 "flags": [
  {
   "name": "reservation_live_eta_v2",
   "category": "operational",
   "owner": "Product + Engineering",
   "clinicalImpact": "none",
   "default": false,
   "removeBy": "2.0.0",
   "current": false,
   "state": "ok"
  },
  {
   "name": "pharmacist_inbox_density_v2",
   "category": "presentation",
   "owner": "Design System",
   "clinicalImpact": "none",
   "default": false,
   "removeBy": "1.6.0",
   "current": true,
   "state": "ok"
  },
  {
   "name": "safety_alert_new_copy",
   "category": "clinical-adjacent",
   "owner": "Clinical + Product",
   "clinicalImpact": "review-required",
   "default": false,
   "removeBy": "1.6.0",
   "current": false,
   "state": "warn"
  },
  {
   "name": "interaction_priority_rules_v3",
   "category": "clinical-safety",
   "owner": "Clinical Governance",
   "clinicalImpact": "high",
   "default": false,
   "removeBy": "3.0.0",
   "current": false,
   "state": "warn"
  }
 ],
 "claims": [
  {
   "id": "CLM-INT-IBU-WARF-001",
   "title": "تداخل ibuprofen و warfarin",
   "state": "published",
   "evidenceQuality": "high",
   "contract": "interaction-check@2.1.0",
   "knowledgeRelease": "2026.08.1",
   "source": "BNF 2026.08",
   "reviewedAt": "2026-08-02",
   "reviewedBy": "clinical-reviewer:role-id",
   "nextReviewAt": "2027-02-02",
   "limitations": "لا يغني عن مراجعة الصيدلي أو التاريخ الدوائي الكامل."
  },
  {
   "id": "CLM-ALERT-INS-002",
   "title": "تنبيه حفظ insulin glargine",
   "state": "review-due",
   "evidenceQuality": "high",
   "contract": "safety-alert@3.0.0",
   "knowledgeRelease": "2026.08.1",
   "source": "Local MOH 2026.07",
   "reviewedAt": "2026-07-16",
   "reviewedBy": "clinical-reviewer:role-id",
   "nextReviewAt": "2026-07-16",
   "limitations": "قد تختلف تعليمات المنتج المحدد؛ يُراجع الملصق الدوائي."
  },
  {
   "id": "CLM-OTC-ASA-003",
   "title": "تصنيف aspirin منخفض الجرعة",
   "state": "withdrawn",
   "evidenceQuality": "moderate",
   "contract": "medication-timeline@1.0.0",
   "knowledgeRelease": "2026.06.1",
   "source": "BNF 2026.06",
   "reviewedAt": "2026-06-21",
   "reviewedBy": "clinical-reviewer:role-id",
   "nextReviewAt": "2026-12-21",
   "limitations": "سُحب بعد تحديث التصنيف المحلي."
  }
 ],
 "verification": [
  {
   "name": "accessibility",
   "status": "pass",
   "verifiedAt": "2026-08-02T00:02:00+03:00",
   "verifiedBy": "ci:ui-kit-verify@workflow-v1",
   "toolVersion": "playwright-chromium@1194",
   "evidence": "releases/1.5.0/accessibility.md",
   "evidenceHash": "sha256:93a86d6dff945a275d4806ecb2f29fdaa9cf911193b3ed4d582053cb821a00f4",
   "scope": {
    "viewport": [
     "320px",
     "390px"
    ],
    "textZoom": "200%",
    "flagsSnapshot": "flags-2026-08-02-01"
   },
   "badge": "ok"
  },
  {
   "name": "rtl",
   "status": "pass",
   "verifiedAt": "2026-08-02T00:03:00+03:00",
   "verifiedBy": "ci:ui-kit-verify@workflow-v1",
   "toolVersion": "playwright-chromium@1194",
   "evidence": "releases/1.5.0/rtl.md",
   "evidenceHash": "sha256:af8830100519951b899820327165e71ec7bda895abe0191bbf4ac53d0cb74be4",
   "scope": {
    "screens": 23,
    "mixedScript": "Arabic UI + Latin drug names + Arabic-Indic numerals"
   },
   "badge": "ok"
  },
  {
   "name": "keyboard",
   "status": "pending",
   "verifiedAt": null,
   "verifiedBy": null,
   "evidence": "releases/1.5.0/keyboard.md",
   "scope": {
    "screens": 23,
    "focusTrap": "sheet overlay"
   },
   "badge": "warn"
  },
  {
   "name": "clinical",
   "status": "pending",
   "verifiedAt": null,
   "verifiedBy": null,
   "evidence": "releases/1.5.0/clinical.md",
   "scope": {
    "clinicalContracts": [
     "interaction-check@2.1.0",
     "safety-alert@3.0.0"
    ],
    "knowledgeRelease": "2026.08.1"
   },
   "badge": "warn"
  },
  {
   "name": "security",
   "status": "pending",
   "verifiedAt": null,
   "verifiedBy": null,
   "evidence": "releases/1.5.0/security.md",
   "badge": "warn"
  },
  {
   "name": "performance",
   "status": "pending",
   "verifiedAt": null,
   "verifiedBy": null,
   "evidence": "releases/1.5.0/performance.md",
   "badge": "warn"
  },
  {
   "name": "adversarialReview",
   "status": "pending",
   "verifiedAt": null,
   "verifiedBy": null,
   "evidence": "releases/1.5.0/self-review.md",
   "badge": "warn"
  }
 ],
 "artifacts": {
  "changelog": "CHANGELOG.md",
  "compatibility": "releases/1.5.0/compatibility.md",
  "releaseNotes": "releases/1.5.0/RELEASE_NOTES.md",
  "migration": "docs/migrations/1.5.0.md",
  "verificationIndex": "releases/1.5.0/VERIFICATION.md",
  "evidenceReview": "releases/1.5.0/EVIDENCE_REVIEW.md"
 },
 "gateSummary": {
  "passing": 2,
  "applicable": 7
 }
};
