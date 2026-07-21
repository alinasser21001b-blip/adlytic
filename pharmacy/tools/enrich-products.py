# -*- coding: utf-8 -*-
"""
============================================================
Product Enrichment — إثراء المنتج الجديد بالبيانات العلمية

عند إضافة منتج جديد (اسم فقط)، يجلب النظام آلياً من مصادر
حكومية مفتوحة ما أمكن:

  ✅ الشركة المصنّعة        ✅ المادة الفعّالة
  ✅ الجرعة / التركيز        ✅ الشكل الدوائي
  ✅ التحذيرات               ✅ الموانع
  ✅ الفئة العلاجية           ✅ الأكواد (UPC/NDC إن وُجدت)

المصادر (مجانية، بلا مفاتيح):
  1. NIH DSLD (قاعدة ملصقات المكملات الغذائية الأمريكية)
     https://api.ods.od.nih.gov/dsld/v9/search-filter
  2. openFDA (ملصقات الأدوية والتحذيرات)
     https://api.fda.gov/drug/label.json

المخرج: tools/enrichment.json  — يمر على مرحلتين:
  status="auto"   : بيانات من مصدر حكومي، موثوقة الحقول.
  status="review" : ناقصة أو متضاربة ⇒ مراجعة الصيدلي قبل عرضها.
  ⚠ لا يُعرض للزبون أي حقل طبي (تحذير/مانع) قبل مراجعته —
    نفس مبدأ الصور: معلومة خاطئة أسوأ من ناقصة.

التشغيل (شبكة مفتوحة):
    python3 pharmacy/tools/enrich-products.py
والعقل (advisor-brain.js) يقرأ enrichment.json إن وُجد فيربط
المواد الفعّالة المكتشفة تلقائياً بمحرك التوصية.
============================================================ """
import json, os, re, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRODUCTS_JS = os.path.join(ROOT, "js", "products.js")
OUT = os.path.join(ROOT, "tools", "enrichment.json")

DSLD = "https://api.ods.od.nih.gov/dsld/v9/search-filter?q=%s&size=3"
OPENFDA = "https://api.fda.gov/drug/label.json?search=openfda.brand_name:%s&limit=2"

def read_products():
    src = open(PRODUCTS_JS, encoding="utf-8").read()
    out = []
    for m in re.finditer(r'\{\s*\n\s*id:\s*"([^"]+)"(.*?)\n  \}', src, re.S):
        pid, body = m.group(1), m.group(2)
        def g(k):
            mm = re.search(k + r':\s*"([^"]*)"', body)
            return mm.group(1) if mm else ""
        out.append({"id": pid, "en": g("en"), "brand": g("brand"), "name": g("name")})
    return out

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pharmacy-enrichment"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)

def enrich_dsld(p):
    """مكملات غذائية: ملصق DSLD الرسمي."""
    q = urllib.parse.quote(p["en"] or p["name"])
    data = get_json(DSLD % q)
    hits = data.get("hits", [])
    if not hits: return None
    src = hits[0].get("_source", {})
    ings = [i.get("name") for i in src.get("ingredientRows", []) if i.get("name")]
    return {
        "source": "NIH DSLD", "sourceId": str(hits[0].get("_id", "")),
        "manufacturer": src.get("brandName") or p["brand"],
        "activeIngredients": ings[:12],
        "dosageForm": src.get("physicalState", {}).get("langualCodeDescription", ""),
        "servingSize": src.get("servingSizes", [{}])[0].get("minQuantity", ""),
        "therapeuticCategory": "مكمل غذائي",
        "upc": src.get("upcSku", ""),
        "warningsRaw": [], "matchScore": 0.0,
    }

def enrich_openfda(p):
    """أدوية OTC: ملصق openFDA."""
    q = urllib.parse.quote('"%s"' % (p["en"].split("—")[0].strip() or p["brand"]))
    data = get_json(OPENFDA % q)
    res = data.get("results", [])
    if not res: return None
    r = res[0]; of = r.get("openfda", {})
    return {
        "source": "openFDA", "sourceId": (of.get("spl_id") or [""])[0],
        "manufacturer": (of.get("manufacturer_name") or [p["brand"]])[0],
        "activeIngredients": of.get("substance_name", [])[:12],
        "dosageForm": (of.get("dosage_form") or [""])[0],
        "route": (of.get("route") or [""])[0],
        "therapeuticCategory": (of.get("pharm_class_epc") or [""])[0],
        "ndc": (of.get("product_ndc") or [""])[0],
        "warningsRaw": (r.get("warnings") or [])[:2],
        "contraindicationsRaw": (r.get("contraindications") or [])[:2],
        "matchScore": 0.0,
    }

def match_score(p, e):
    """ثقة تطابق الاسم — تحت 0.9 يذهب للمراجعة."""
    toks = set(re.findall(r"[a-z0-9]+", (p["en"] + " " + p["brand"]).lower()))
    etoks = set(re.findall(r"[a-z0-9]+", json.dumps(e, ensure_ascii=False).lower()))
    hits = len(toks & etoks)
    return round(min(1.0, 0.5 + hits * 0.08), 2) if toks else 0.5

def main():
    existing = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    enriched = reviewed = failed = 0
    for p in read_products():
        pid = p["id"]
        if existing.get(pid, {}).get("status") in ("auto", "approved"):
            continue
        rec = None
        for fn in (enrich_dsld, enrich_openfda):
            try:
                rec = fn(p)
                if rec: break
            except Exception as e:
                pass
        if not rec:
            existing[pid] = {"status": "missing", "note": "لا نتيجة من DSLD/openFDA — يُدخل الصيدلي البيانات يدوياً"}
            failed += 1
            continue
        rec["matchScore"] = match_score(p, rec)
        # التحذيرات/الموانع الخام لا تُنشر قبل مراجعة الصيدلي وترجمتها
        rec["status"] = "auto" if rec["matchScore"] >= 0.9 and not rec.get("warningsRaw") else "review"
        existing[pid] = rec
        enriched += rec["status"] == "auto"
        reviewed += rec["status"] == "review"
    json.dump(existing, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"✔ اعتُمد آلياً: {enriched} · للمراجعة: {reviewed} · بلا نتيجة: {failed}")
    print("المخرج:", OUT)

if __name__ == "__main__":
    main()
