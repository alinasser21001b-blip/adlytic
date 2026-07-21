# -*- coding: utf-8 -*-
"""
============================================================
المرحلة 1 — محرك البحث عن الصور (Image Search Engine)
يملأ image-candidates.json آلياً بالكامل — لا إدخال يدوي.

    products.js ← يقرأ الأسماء/العلامة/التركيز
        ↓
    يبني 3 استعلامات لكل منتج (دقيق ← علامة ← عام)
        ↓
    يجمع 20–50 نتيجة صورة لكل منتج من الإنترنت
        ↓
    يصنّفها حسب مستوى المصدر:
      Tier 1 مصنّع رسمي · Tier 2 موزّع · Tier 3 صيدلية رسمية
      Tier 4 كتالوج دوائي · Tier 5 غير مصنّف (احتياط أخير)
        ↓
    يكتب tools/image-candidates.json
        ↓
    المرحلة 2+3: image-pipeline.py (ثقة/جودة ← WebP ← products.js)

التشغيل (شبكة مفتوحة — جهازك أو GitHub Actions):
    pip install duckduckgo_search
    python3 pharmacy/tools/harvest-candidates.py
============================================================
"""
import json, os, re, sys
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANDIDATES = os.path.join(ROOT, "tools", "image-candidates.json")
PRODUCTS_JS = os.path.join(ROOT, "js", "products.js")

RESULTS_PER_QUERY = 20      # 3 استعلامات ⇒ حتى ~50 نتيجة خام لكل منتج
KEEP_PER_PRODUCT = 8        # أفضل المرشّحين بعد التصنيف

# خريطة المصادر الموثوقة: نطاق ← مستوى (وسّعها بحرية)
DOMAIN_TIERS = {
    # Tier 1 — مصنّعون رسميون
    "vitabiotics.com": 1, "acm-laboratoire.com": 1, "ecrinal.com": 1,
    "abbott.com": 1, "ensure.com": 1, "bioderma.com": 1,
    "eau-thermale-avene.com": 1, "avene.com": 1, "skin1004.com": 1,
    "medicube.com": 1, "kahi.com": 1, "numbuzin.com": 1, "asepta.com": 1,
    # Tier 2 — موزّعون رسميون
    "nahdionline.com": 2, "aldawaeya.com": 2, "adamonline.com": 2,
    # Tier 3 — صيدليات رسمية
    "boots.com": 3, "pharmacy2u.co.uk": 3, "chemistwarehouse.com.au": 3,
    "thehealthpharmacy.co.uk": 3, "care-pharmacy.com": 3, "rowlandspharmacy.co.uk": 3,
    "lloydspharmacy.com": 3, "unitedpharmacies.com": 3,
    # Tier 4 — كتالوجات دوائية عالية الجودة
    "medino.com": 4, "farmaline.be": 4, "newpharma.be": 4,
    "shop-pharmacie.fr": 4, "marjanemall.ma": 4, "1mg.com": 4,
    "pharmacie-du-polygone.com": 4, "cocooncenter.com": 4, "santediscount.com": 4,
}
# ما يُستبعد فوراً (لايف ستايل/إعلانات/مخازن صور/ذكاء اصطناعي)
BLOCK_URL_WORDS = ["lifestyle", "model", "person", "hands", "banner", "advert",
                   "promo", "screenshot", "watermark", "gettyimages", "shutterstock",
                   "istockphoto", "alamy", "dreamstime", "midjourney", "dall-e",
                   "generated", "stock-photo", "unsplash", "pexels"]
BLOCK_DOMAINS = ["pinterest.", "facebook.", "instagram.", "tiktok.", "youtube.",
                 "gettyimages.", "shutterstock.", "istockphoto.", "alamy.",
                 "dreamstime.", "freepik.", "ebay."]

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

def domain_of(url):
    try:
        host = urlparse(url).netloc.lower()
        return host[4:] if host.startswith("www.") else host
    except Exception:
        return ""

def tier_of(url):
    d = domain_of(url)
    for known, t in DOMAIN_TIERS.items():
        if d.endswith(known):
            return t
    return 5  # غير مصنّف — احتياط أخير فقط

def blocked(url):
    low = url.lower()
    d = domain_of(url)
    return any(w in low for w in BLOCK_URL_WORDS) or any(d.startswith(b) or b in d for b in BLOCK_DOMAINS)

def queries_for(p):
    """3 استعلامات: من الأدق (يشمل التركيز/الشكل) إلى الأعم."""
    en, brand, name = p["en"].strip(), p["brand"].strip(), p["name"].strip()
    q = []
    if en:    q.append(f"{brand} {en} product package".strip())
    if brand: q.append(f"{brand} {en or name} box white background".strip())
    q.append(f"{en or name} pharmacy product".strip())
    return [x for i, x in enumerate(q) if x and x not in q[:i]]

def main():
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        print("⚠ ثبّت أولاً: pip install duckduckgo_search"); sys.exit(1)

    existing = json.load(open(CANDIDATES, encoding="utf-8")) if os.path.exists(CANDIDATES) else {}
    products = read_products()
    ddgs = DDGS()
    stats = {"products": 0, "raw": 0, "kept": 0}

    for p in products:
        pid = p["id"]
        if os.path.exists(os.path.join(ROOT, "images", pid + ".webp")):
            continue
        stats["products"] += 1
        # مرشّحون موجودون (يدويون/سابقون) يُحفظون — خصوصاً verified
        merged = {c["url"]: c for c in existing.get(pid, [])}

        raw = []
        for q in queries_for(p):
            try:
                hits = ddgs.images(q, max_results=RESULTS_PER_QUERY) or []
            except Exception as e:
                print(f"  بحث فشل ({pid}): {e}"); hits = []
            raw.extend(hits)
        stats["raw"] += len(raw)

        # تصفية + تصنيف
        scored = []
        seen = set()
        for h in raw:
            url = h.get("image", "")
            if not url or url in seen or blocked(url):
                continue
            seen.add(url)
            t = tier_of(url)
            w = int(h.get("width", 0) or 0)
            scored.append({"url": url, "tier": t, "source": domain_of(url),
                           "w": w, "title": (h.get("title") or "")[:80]})
        # الترتيب: المستوى الأوثق أولاً ثم الدقة الأعلى
        scored.sort(key=lambda c: (c["tier"], -c["w"]))
        for c in scored[:KEEP_PER_PRODUCT]:
            if c["url"] not in merged:
                merged[c["url"]] = c
        if merged:
            existing[pid] = list(merged.values())
            stats["kept"] += len(merged)
            t1 = sum(1 for c in merged.values() if c.get("tier") == 1)
            print(f"{pid}: {len(merged)} مرشّح (منها {t1} من مصنّع رسمي)")

    json.dump(existing, open(CANDIDATES, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(f"\n✔ منتجات بلا صورة: {stats['products']} · نتائج خام: {stats['raw']} · مرشّحون معتمدون: {stats['kept']}")
    print("التالي: python3 pharmacy/tools/image-pipeline.py")

if __name__ == "__main__":
    main()
