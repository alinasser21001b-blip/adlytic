# -*- coding: utf-8 -*-
"""
============================================================
حاصد مرشّحي الصور — يبحث آلياً عن صور المنتجات من مصادر موثوقة
Harvest image candidates from trusted pharmaceutical sources

التشغيل (يحتاج شبكة مفتوحة — جهازك أو GitHub Actions):
    pip install duckduckgo_search pillow
    python3 pharmacy/tools/harvest-candidates.py

يبحث فقط في نطاقات موثوقة مرتّبة بالأولوية:
  Tier 1: موقع الشركة المصنّعة الرسمي
  Tier 2: الموزّع الرسمي
  Tier 3: مواقع صيدليات رسمية
  Tier 4: كتالوجات دوائية عالية الجودة
ويستبعد: صور بأشخاص/لايف ستايل/إعلانات (فلترة بالكلمات) — والدقة
والعلامة المائية تُفحصان لاحقاً في image-pipeline.py.

يكتب/يدمج: tools/image-candidates.json  (لا يحذف مرشّحين يدويين)
============================================================
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANDIDATES = os.path.join(ROOT, "tools", "image-candidates.json")
PRODUCTS_JS = os.path.join(ROOT, "js", "products.js")

# النطاقات الموثوقة حسب المستوى — وسّعها بحرية، المحرك لا يتغير
TRUSTED = [
    # (tier, domains)
    (1, ["vitabiotics.com", "acm-laboratoire.com", "ecrinal.com", "abbott.com",
         "ensure.com", "bioderma.com", "eau-thermale-avene.com", "skin1004.com",
         "medicube.com", "kahi.com", "numbuzin.com"]),
    (2, ["nahdionline.com", "aldawaeya.com", "adamonline.com"]),
    (3, ["pharmacy2u.co.uk", "chemistwarehouse.com.au", "boots.com",
         "thehealthpharmacy.co.uk", "care-pharmacy.com"]),
    (4, ["medino.com", "farmaline.be", "newpharma.be", "shop-pharmacie.fr",
         "marjanemall.ma", "1mg.com"]),
]
BLOCKLIST_WORDS = ["lifestyle", "model", "person", "hand", "banner", "ad_",
                   "advert", "screenshot", "watermark", "stock-photo"]

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

def main():
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        print("⚠ ثبّت أولاً: pip install duckduckgo_search"); sys.exit(1)

    existing = json.load(open(CANDIDATES, encoding="utf-8")) if os.path.exists(CANDIDATES) else {}
    products = read_products()
    ddgs = DDGS()

    for p in products:
        pid = p["id"]
        if os.path.exists(os.path.join(ROOT, "images", pid + ".webp")):
            continue
        # الاستعلام: الاسم الإنجليزي الكامل (يتضمن التركيز/الشكل) + العلامة
        query = ("%s %s product pack" % (p["brand"], p["en"] or p["name"])).strip()
        merged = {c["url"]: c for c in existing.get(pid, [])}
        for tier, domains in TRUSTED:
            for dom in domains:
                try:
                    hits = ddgs.images(f"{query} site:{dom}", max_results=3)
                except Exception:
                    continue
                for h in hits or []:
                    url = h.get("image", "")
                    low = url.lower()
                    if not url or any(w in low for w in BLOCKLIST_WORDS):
                        continue
                    if url not in merged:
                        merged[url] = {"url": url, "tier": tier, "source": dom}
            if len(merged) >= 4:
                break   # يكفي — الأولوية للمستوى الأعلى
        if merged:
            existing[pid] = list(merged.values())
            print(f"{pid}: {len(merged)} مرشّح")

    json.dump(existing, open(CANDIDATES, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("✔ كُتب:", CANDIDATES)
    print("التالي: python3 pharmacy/tools/image-pipeline.py")

if __name__ == "__main__":
    main()
