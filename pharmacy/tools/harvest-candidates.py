# -*- coding: utf-8 -*-
"""
============================================================
المرحلة 1 — محرك البحث عن الصور (Image Search Engine)
يملأ image-candidates.json آلياً بالكامل — لا إدخال يدوي.

المصادر (مرتبة بالموثوقية، كلها بلا مفاتيح وتعمل من GitHub Actions):

  1) Open Beauty Facts  — قاعدة بيانات مفتوحة لمنتجات التجميل/العناية
     (بيوديرما، أفين، الكوري skin1004/medicube، مزيلات العرق…)
     صور أمامية رسمية بخلفية بيضاء + حقول منظّمة (اسم/علامة/باركود).
  2) Open Food Facts    — نفس المنصّة للمكملات الغذائية والتغذية
     (أوميغا3، B12، D3، إنشور، بريجناكير…)
  3) DuckDuckGo Images  — احتياط أخير فقط (كثيراً ما يُحجب من CI).

لماذا هذه أفضل من بحث الصور العام؟
  نطابق على الحقول المنظّمة للـAPI (اسم المنتج + العلامة) لا على
  الرابط أو تخمين بصري — فإذا تطابقت العلامة + كلمة مميّزة من الاسم
  اعتبرنا الصورة موثوقة (verified) وتُعتمد آلياً. المطابقة الضعيفة
  تبقى مرشّحاً للمراجعة اليدوية. "صورة خاطئة أسوأ من مفقودة."

    products.js ← يقرأ الأسماء/العلامة
        ↓  يبني استعلامات (علامة + اسم إنجليزي)
    OBF + OFF (+ DDG احتياط) ← نتائج بصور أمامية
        ↓  مطابقة على الحقول المنظّمة ← verified/مراجعة
    يكتب tools/image-candidates.json
        ↓
    المرحلة 2+3: image-pipeline.py (ثقة/جودة ← WebP ← products.js)

التشغيل:
    python3 pharmacy/tools/harvest-candidates.py
============================================================
"""
import json, os, re, sys, threading, urllib.parse, urllib.request
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANDIDATES = os.path.join(ROOT, "tools", "image-candidates.json")
PRODUCTS_JS = os.path.join(ROOT, "js", "products.js")

KEEP_PER_PRODUCT = 8        # أفضل المرشّحين بعد التصنيف
API_TIMEOUT = 20            # ثانية لكل استعلام API
DDG_TIMEOUT = 15            # ثانية لبحث DuckDuckGo (احتياط)
API_PAGE_SIZE = 12          # نتائج لكل استعلام Facts

# نطاقات موثوقة معروفة (تُستخدم لتصنيف نتائج DDG الاحتياطية)
# المستوى ≤ TRUSTED_VERIFY_TIER ⇒ مصدر تجاري رسمي موثوق ⇒ اعتماد آلي.
TRUSTED_VERIFY_TIER = 3
DOMAIN_TIERS = {
    # Tier 1 — مصنّعون رسميون
    "vitabiotics.com": 1, "acm-laboratoire.com": 1, "ecrinal.com": 1,
    "abbott.com": 1, "ensure.com": 1, "bioderma.com": 1,
    "eau-thermale-avene.com": 1, "avene.com": 1, "skin1004.com": 1,
    "medicube.com": 1, "kahi.com": 1, "numbuzin.com": 1, "asepta.com": 1,
    "vichy.com": 1, "laroche-posay.com": 1, "cerave.com": 1,
    "maddoxpharmaswiss.com": 1, "maddoxswiss.com": 1,
    # Tier 2 — موزّعون رسميون خليجيون/عرب
    "nahdionline.com": 2, "aldawaeya.com": 2, "adamonline.com": 2,
    "al-dawaa.com": 2, "aldawaa.com": 2, "seif-online.com": 2,
    "whites.com.eg": 2, "elezaby.com": 2, "care-pharmacy.com": 2,
    "beautytocare.com": 2, "trustbeautykuwait.com": 2, "goldpharma.com": 2,
    # Tier 3 — صيدليات رسمية عالمية
    "boots.com": 3, "pharmacy2u.co.uk": 3, "chemistwarehouse.com.au": 3,
    "lloydspharmacy.com": 3, "unitedpharmacies.com": 3, "well.co.uk": 3,
    "rowlandspharmacy.co.uk": 3, "pharmica.co.uk": 3, "dokteronline.com": 3,
    # Tier 4 — كتالوجات دوائية (لا تُعتمد آلياً — للمراجعة)
    "medino.com": 4, "newpharma.be": 4, "shop-pharmacie.fr": 4,
    "marjanemall.ma": 4, "1mg.com": 4, "cocooncenter.com": 4,
    "egyptdwa.com": 4, "iherb.com": 4, "amazon.com": 4,
}
BLOCK_URL_WORDS = ["lifestyle", "model", "person", "hands", "banner", "advert",
                   "promo", "screenshot", "watermark", "gettyimages", "shutterstock",
                   "istockphoto", "alamy", "dreamstime", "midjourney", "dall-e",
                   "generated", "stock-photo", "unsplash", "pexels"]
BLOCK_DOMAINS = ["pinterest.", "facebook.", "instagram.", "tiktok.", "youtube.",
                 "gettyimages.", "shutterstock.", "istockphoto.", "alamy.",
                 "dreamstime.", "freepik.", "ebay."]

# كلمات عامة لا تُحسب كلمة "مميّزة" عند المطابقة
GENERIC = {"the", "and", "for", "with", "plus", "care", "hair", "skin", "body",
           "gel", "cream", "mask", "spray", "drink", "oil", "set", "pack",
           "range", "collection", "complete", "nutrition", "daily", "one",
           "formula", "complex", "vitamin", "support", "beauty", "original",
           "junior", "extra", "boost", "eau", "no", "ml", "iu"}


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


def ascii_tokens(s):
    """كلمات لاتينية/رقمية فقط (نتجاهل العربي في المطابقة الإنجليزية)."""
    return [t for t in re.findall(r"[a-z0-9]+", (s or "").lower()) if len(t) >= 2]


def get_json(url, timeout=API_TIMEOUT):
    req = urllib.request.Request(url, headers={
        "User-Agent": "duralshariqh-pharmacy-image-bot/1.0 (+contact via repo)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


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
    return 5


def blocked(url):
    low = url.lower()
    d = domain_of(url)
    return any(w in low for w in BLOCK_URL_WORDS) or \
        any(d.startswith(b) or b in d for b in BLOCK_DOMAINS)


# ----------------------- المصدر 1+2: Open *Facts -----------------------

def facts_query_terms(p):
    """أفضل نص بحث: العلامة اللاتينية + الاسم الإنجليزي (بلا عربي)."""
    brand = " ".join(ascii_tokens(p["brand"]))
    en = p["en"].strip()
    en_toks = set(ascii_tokens(en))
    terms = []
    # لا نكرّر العلامة إن كانت مضمّنة أصلاً في الاسم الإنجليزي
    if brand and en and not set(ascii_tokens(brand)).issubset(en_toks):
        terms.append(f"{brand} {en}")
    if en:
        terms.append(en)
    if brand and not terms:
        terms.append(brand)
    # إزالة التكرار مع الحفاظ على الترتيب
    seen, out = set(), []
    for t in terms:
        k = t.lower()
        if t and k not in seen:
            seen.add(k); out.append(t)
    return out


def match_strength(p, api_name, api_brand):
    """
    قوة تطابق المنتج مع سجلّ الـAPI المنظّم.
    يرجع: 'strong' (علامة + كلمة مميّزة) / 'moderate' (كلمتان) / None.
    """
    our_name = set(ascii_tokens(p["en"]))
    our_brand = set(ascii_tokens(p["brand"]))
    api = set(ascii_tokens(api_name)) | set(ascii_tokens(api_brand))
    if not api:
        return None
    brand_ok = bool(our_brand and (our_brand & api))
    distinctive = (our_name & api) - GENERIC
    name_overlap = len(our_name & api)
    if brand_ok and distinctive:
        return "strong"
    if name_overlap >= 2:
        return "moderate"
    return None


def full_res(url):
    """
    ترقية رابط صورة Open Facts من نسخة العرض (100/200/400px) إلى
    النسخة الكاملة (full) لتتجاوز حدّ الدقة 450px.
    مثال: .../front_en.3.400.jpg ⇒ .../front_en.3.full.jpg
    """
    return re.sub(r"\.(100|200|400)\.jpg$", ".full.jpg", url or "")


def search_facts(p, base, category_tier):
    """
    يستعلم Open Beauty/Food Facts ويرجع مرشّحين بصور أمامية.
    base: 'world.openbeautyfacts.org' أو 'world.openfoodfacts.org'
    """
    out = []
    for term in facts_query_terms(p):
        url = (f"https://{base}/cgi/search.pl?search_terms="
               f"{urllib.parse.quote(term)}&search_simple=1&action=process"
               f"&json=1&page_size={API_PAGE_SIZE}"
               f"&fields=product_name,brands,image_front_url,image_url")
        try:
            data = get_json(url)
        except Exception as e:
            print(f"    [{base.split('.')[1]}] فشل: {str(e)[:60]}")
            continue
        for prod in data.get("products", []):
            img = full_res(prod.get("image_front_url") or prod.get("image_url"))
            if not img:
                continue
            strength = match_strength(p, prod.get("product_name", ""),
                                      prod.get("brands", ""))
            if not strength:
                continue
            cand = {
                "url": img,
                "tier": category_tier if strength == "strong" else 4,
                "source": base,
                "apiName": (prod.get("product_name") or "")[:80],
            }
            if strength == "strong":
                cand["verified"] = True     # تطابق منظّم قوي ⇒ اعتماد آلي
            out.append(cand)
        if out:
            break   # أول استعلام ناجح يكفي
    return out


# ----------------------- المصدر 3: DuckDuckGo (احتياط) -----------------------

def ddg_search_with_timeout(ddgs, query, timeout_sec=DDG_TIMEOUT):
    result = [None]
    def run():
        try:
            result[0] = ddgs.images(query, max_results=20) or []
        except Exception:
            result[0] = []
    th = threading.Thread(target=run, daemon=True)
    th.start(); th.join(timeout=timeout_sec)
    return result[0] or []


def name_matches_url(p, url, title):
    """
    تأكيد أن نتيجة مصدر موثوق تخصّ هذا المنتج فعلاً — عبر الرابط أو
    عنوان النتيجة. يكفي أحد أمرين:
      • العلامة + كلمة مميّزة، أو
      • كلمتان مميّزتان (لأن روابط بعض المتاجر مشفّرة بلا اسم).
    """
    hay = (url + " " + (title or "")).lower()
    hay_toks = set(re.findall(r"[a-z0-9]+", hay))
    brand = set(ascii_tokens(p["brand"]))
    name = set(ascii_tokens(p["en"]))
    brand_ok = bool(brand and (brand & hay_toks))
    distinctive = (name & hay_toks) - GENERIC
    return (brand_ok and bool(distinctive)) or len(distinctive) >= 2


def search_ddg(p, ddgs):
    if ddgs is None:
        return []
    brand = " ".join(ascii_tokens(p["brand"]))
    en = p["en"].strip()
    # عدة صيغ للبحث لرفع فرصة العثور على مصدر موثوق
    queries = [q for q in [
        f"{brand} {en} product package".strip(),
        f"{brand} {en} pharmacy".strip(),
        f"{en} box".strip(),
    ] if q]
    seen, scored = set(), []
    for q in queries:
        for h in ddg_search_with_timeout(ddgs, q):
            u = h.get("image", "")
            if not u or u in seen or blocked(u):
                continue
            seen.add(u)
            tier = tier_of(u)
            cand = {"url": u, "tier": tier, "source": domain_of(u),
                    "w": int(h.get("width", 0) or 0),
                    "title": (h.get("title") or "")[:80]}
            # مصدر تجاري رسمي موثوق (مصنّع/موزّع/صيدلية) + تأكيد الاسم
            # في الرابط/العنوان ⇒ اعتماد آلي (نثق بالمصدر بدل رؤية الصورة).
            if tier <= TRUSTED_VERIFY_TIER and name_matches_url(p, u, h.get("title")):
                cand["verified"] = True
            scored.append(cand)
        # إن وجدنا مرشّحاً موثوقاً، لا داعي لاستنزاف بقية الصيغ
        if any(c.get("verified") for c in scored):
            break
    scored.sort(key=lambda c: (0 if c.get("verified") else 1,
                               c["tier"], -c.get("w", 0)))
    return scored


# ----------------------------- التشغيل -----------------------------

def main():
    try:
        from duckduckgo_search import DDGS
        ddgs = DDGS()
    except Exception:
        ddgs = None   # الاحتياط غير متاح — لا بأس، المصادر الأساسية تكفي

    existing = json.load(open(CANDIDATES, encoding="utf-8")) if os.path.exists(CANDIDATES) else {}
    products = read_products()
    stats = {"products": 0, "auto": 0, "review": 0, "empty": 0}

    for idx, p in enumerate(products, 1):
        pid = p["id"]
        if os.path.exists(os.path.join(ROOT, "images", pid + ".webp")):
            continue
        stats["products"] += 1
        print(f"[{idx}/{len(products)}] {pid}: {p['brand']} — {p['en']}")

        # نحفظ المرشّحين الموجودين (خصوصاً verified اليدويين)
        merged = {c["url"]: c for c in existing.get(pid, [])}

        found = []
        # 1) Open Beauty Facts (تجميل/عناية) — tier 2 عند التطابق القوي
        found += search_facts(p, "world.openbeautyfacts.org", 2)
        # 2) Open Food Facts (مكملات/تغذية) — tier 3 عند التطابق القوي
        found += search_facts(p, "world.openfoodfacts.org", 3)
        # 3) احتياط أخير: DuckDuckGo (قد يُحجب من CI)
        if not any(c.get("verified") for c in found):
            found += search_ddg(p, ddgs)

        for c in found:
            if c["url"] not in merged:
                merged[c["url"]] = c
            elif c.get("verified") and not merged[c["url"]].get("verified"):
                merged[c["url"]] = c   # ترقية مرشّح سابق إلى موثوق عند إعادة التشغيل

        if merged:
            existing[pid] = list(merged.values())
            v = sum(1 for c in merged.values() if c.get("verified"))
            if v:
                stats["auto"] += 1
                print(f"  ✓ {len(merged)} مرشّح — منها {v} موثوق (اعتماد آلي)")
            else:
                stats["review"] += 1
                print(f"  ~ {len(merged)} مرشّح (مراجعة يدوية)")
        else:
            stats["empty"] += 1
            print("  ✗ لا مرشّح")

    json.dump(existing, open(CANDIDATES, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(f"\n✔ منتجات بلا صورة: {stats['products']} · "
          f"موثوق (آلي): {stats['auto']} · مراجعة: {stats['review']} · "
          f"بلا مرشّح: {stats['empty']}")
    print("التالي: python3 pharmacy/tools/image-pipeline.py")


if __name__ == "__main__":
    main()
