# -*- coding: utf-8 -*-
"""
============================================================
نظام جلب صور المنتجات الآلي — صيدلية در الشارقة
Automatic Product Image Acquisition Pipeline

التشغيل:
    python3 pharmacy/tools/image-pipeline.py            # معالجة كل المنتجات الناقصة
    python3 pharmacy/tools/image-pipeline.py --only ID  # منتج واحد

المدخل:  tools/image-candidates.json  (مرشّحو الصور لكل منتج، من
         harvest-candidates.py أو مضافون يدوياً)
المخرج:  images/<id>.webp (800px) + images/<id>-sm.webp (400px)
         تحديث img في products.js تلقائياً
         tools/IMAGE_REPORT.md (تقرير: وُجد / مفقود / مراجعة يدوية)

قواعد الجودة (لا تُكسر):
- الثقة تُحسب من: مستوى المصدر + تطابق الاسم/العلامة/التركيز في
  الرابط + الدقة + خلفية بيضاء.
- الثقة < 0.90  ⇒ لا يُعتمد تلقائياً، يذهب لقائمة المراجعة اليدوية.
  "صورة خاطئة أسوأ من صورة مفقودة."
- تُرفض: الدقة المنخفضة، النسب الغريبة، الصور الشاشية الصغيرة.
============================================================
"""
import io, json, os, re, sys, unicodedata, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # pharmacy/
IMAGES = os.path.join(ROOT, "images")
PRODUCTS_JS = os.path.join(ROOT, "js", "products.js")
CANDIDATES = os.path.join(ROOT, "tools", "image-candidates.json")
REPORT = os.path.join(ROOT, "tools", "IMAGE_REPORT.md")

MIN_SIDE = 450          # أقل بعد مقبول بالبكسل
CONFIDENCE_GATE = 0.90  # تحت هذا الحد ⇒ مراجعة يدوية
SIZES = [(800, ""), (400, "-sm")]

# مستويات المصادر الموثوقة (يقرأها harvest أيضاً)
TIER_SCORES = {1: 0.50, 2: 0.42, 3: 0.36, 4: 0.30}  # مصنّع/موزّع/صيدلية/كتالوج

def read_products():
    src = open(PRODUCTS_JS, encoding="utf-8").read()
    items = []
    for m in re.finditer(r'\{\s*\n\s*id:\s*"([^"]+)"(.*?)\n  \}', src, re.S):
        pid, body = m.group(1), m.group(2)
        def g(k):
            mm = re.search(k + r':\s*"([^"]*)"', body)
            return mm.group(1) if mm else ""
        items.append({"id": pid, "name": g("name"), "en": g("en"),
                      "brand": g("brand"), "img": g("img")})
    return src, items

def norm_tokens(s):
    s = unicodedata.normalize("NFKD", s or "").lower()
    return set(re.findall(r"[a-z0-9]+", s))

def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (product-image-pipeline)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def whiteness(img):
    """نسبة بياض حواف الصورة — مؤشر خلفية بيضاء/شفافة."""
    from PIL import Image
    im = img.convert("RGBA").resize((80, 80))
    px = im.load()
    border = [px[x, y] for x in range(80) for y in (0, 79)] + \
             [px[x, y] for y in range(80) for x in (0, 79)]
    ok = sum(1 for r, g, b, a in border if a < 10 or (r > 235 and g > 235 and b > 235))
    return ok / len(border)

def score(product, cand, img):
    """ثقة حتمية 0..1 — لا تخمين."""
    s = TIER_SCORES.get(int(cand.get("tier", 4)), 0.30)
    url_toks = norm_tokens(cand["url"])
    name_toks = norm_tokens(product["en"]) | norm_tokens(product["brand"])
    hits = len(url_toks & name_toks - {"the", "and", "for"})
    s += min(0.25, hits * 0.05)                       # تطابق اسم/علامة/تركيز
    w, h = img.size
    if min(w, h) >= 800: s += 0.10
    elif min(w, h) >= MIN_SIDE: s += 0.05
    s += 0.15 * whiteness(img)                        # خلفية بيضاء
    if cand.get("verified"): s = max(s, 0.95)         # مرشّح مُتحقق يدوياً
    return round(min(s, 1.0), 2)

def validate(img):
    w, h = img.size
    if min(w, h) < MIN_SIDE: return "دقة منخفضة (%dx%d)" % (w, h)
    ar = w / h
    if not 0.45 <= ar <= 2.2: return "نسبة أبعاد غير منطقية"
    return None

def save_webp(img, pid):
    from PIL import Image
    img = img.convert("RGBA")
    # خلفية بيضاء إن كانت شفافة (اتساق العرض)
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    img = Image.alpha_composite(bg, img).convert("RGB")
    for side, suffix in SIZES:
        im = img.copy(); im.thumbnail((side, side))
        im.save(os.path.join(IMAGES, pid + suffix + ".webp"), "WEBP", quality=85)

def set_img_field(src, pid, path):
    """تحديث/إدراج img للمنتج داخل products.js (يزيل التكرارات)."""
    block = re.search(r'(\{\s*\n\s*id:\s*"%s".*?\n  \})' % re.escape(pid), src, re.S)
    if not block: return src
    b = block.group(1)
    nb = re.sub(r'\s*img:\s*"[^"]*",\n', "\n", b)                    # إزالة القديم
    nb = nb.replace('id: "%s",' % pid, 'id: "%s",\n    img: "%s",' % (pid, path), 1)
    return src.replace(b, nb)

def main():
    from PIL import Image
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    cands = json.load(open(CANDIDATES, encoding="utf-8")) if os.path.exists(CANDIDATES) else {}
    src, products = read_products()
    found, missing, review, skipped = [], [], [], []

    for p in products:
        pid = p["id"]
        if only and pid != only: continue
        if os.path.exists(os.path.join(IMAGES, pid + ".webp")):
            skipped.append(pid); continue
        best = None
        for cand in cands.get(pid, []):
            try:
                data = fetch(cand["url"])
                img = Image.open(io.BytesIO(data)); img.load()
            except Exception as e:
                cand["_err"] = str(e)[:80]; continue
            bad = validate(img)
            if bad: cand["_err"] = bad; continue
            conf = score(p, cand, img)
            if not best or conf > best[0]: best = (conf, cand, img)
        if not best:
            missing.append((pid, p["name"], [c.get("_err", "?") for c in cands.get(pid, [])]))
            continue
        conf, cand, img = best
        if conf < CONFIDENCE_GATE:
            review.append((pid, p["name"], cand["url"], conf))
            continue
        save_webp(img, pid)
        src = set_img_field(src, pid, "images/%s.webp" % pid)
        found.append((pid, p["name"], cand["url"], conf))

    if found:
        open(PRODUCTS_JS, "w", encoding="utf-8").write(src)

    # ---------- التقرير ----------
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write("# تقرير صور المنتجات\n\n")
        f.write("| البند | العدد |\n|---|---|\n")
        f.write("| صور محلية موجودة مسبقاً | %d |\n" % len(skipped))
        f.write("| اعتُمدت آلياً (ثقة ≥ %.0f%%) | %d |\n" % (CONFIDENCE_GATE*100, len(found)))
        f.write("| تحتاج مراجعة يدوية (ثقة أقل) | %d |\n" % len(review))
        f.write("| بلا صورة (لا مرشّح صالح) | %d |\n\n" % len(missing))
        if found:
            f.write("## ✅ اعتُمدت آلياً\n")
            for pid, name, url, c in found:
                f.write("- `%s` — %s (ثقة %.0f%%)\n  - %s\n" % (pid, name, c*100, url))
        if review:
            f.write("\n## ⚠️ مراجعة يدوية (لم تُعتمد — الثقة تحت البوابة)\n")
            f.write("أضف `\"verified\": true` للمرشّح في image-candidates.json بعد التأكد بالعين.\n")
            for pid, name, url, c in review:
                f.write("- `%s` — %s (ثقة %.0f%%)\n  - %s\n" % (pid, name, c*100, url))
        if missing:
            f.write("\n## ❌ بلا صورة\n")
            for pid, name, errs in missing:
                f.write("- `%s` — %s%s\n" % (pid, name,
                        (" — أسباب: " + "؛ ".join(e for e in errs if e)) if errs else ""))
        f.write("\n> صورة خاطئة أسوأ من صورة مفقودة — البوابة %.0f%% ثابتة.\n" % (CONFIDENCE_GATE*100))

    print("✔ اعتُمد: %d · مراجعة: %d · مفقود: %d · موجود مسبقاً: %d"
          % (len(found), len(review), len(missing), len(skipped)))
    print("التقرير: pharmacy/tools/IMAGE_REPORT.md")

if __name__ == "__main__":
    main()
