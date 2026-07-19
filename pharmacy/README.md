# CarePlus Pharmacy — WhatsApp Catalog Website

A zero-backend digital catalog whose entire purpose is converting visitors into
**WhatsApp conversations**. No cart, no checkout, no accounts — every path on
every page leads to a pre-filled WhatsApp message.

## Run it

Pure static site — open `index.html` in a browser, or serve the folder:

```bash
npx serve pharmacy
```

Deployable as-is to Netlify, Vercel, GitHub Pages, Cloudflare Pages, or any host.

## Configure

Everything lives in `js/products.js`:

- `STORE_CONFIG.whatsappNumber` — your number in international format, digits only (e.g. `9647701234567`).
- `STORE_CONFIG.name / currency / tagline`
- `PRODUCTS` — add a product object and it automatically appears in the catalog,
  gets its own product page (`product.html?id=...`), and shows up in
  recommendation rails. No HTML edits needed.

Product images are currently emoji placeholders (`images: ["🍊", …]`) so the site
works with zero assets — swap the render in `productCard()` / gallery for `<img>`
tags when real photos are ready.

## The buying journey

1. Customer discovers a product (search, category chips, or a recommendation rail).
2. Opens the product page — summary, description, benefits, ingredients, usage,
   suitable-for, warnings, FAQ, reviews.
3. Clicks **Order via WhatsApp** (main button, card buttons, or the sticky mobile bar).
4. WhatsApp opens with:

```
Hello, I would like to order:

Product: {{Product Name}}
Product Link: {{Current Page URL}}

Please let me know the availability.
```

## Conversion features and why they exist

| Feature | Why it converts |
|---|---|
| **Sticky mobile CTA bar** | The order button never leaves the screen on mobile — where most pharmacy traffic is. |
| **Floating WhatsApp bubble** | A general "ask a pharmacist" entry point on every page; questions become conversations, conversations become orders. |
| **"Frequently Bought Together"** | Pairs like Vitamin C + Zinc raise average order value in a single chat. |
| **"You May Also Need" (related)** | Keeps browsers on-site when the current product isn't quite right. |
| **"Best Alternatives"** | An out-of-stock or too-expensive item becomes a redirect, not a lost sale. |
| **"Customers Also Viewed"** | Built from real local view history (localStorage) — personal without any backend. |
| **"Top Pharmacist Picks" / "Trending"** | Authority + social proof; undecided visitors follow the expert. |
| **FAQ accordions + "Ask on WhatsApp"** | Answers objections in-page, and unanswered questions convert into chats. |
| **Live-reply pulse note** | "A pharmacist replies within minutes" reduces hesitation to send the message. |
| **Trust bar** | Licensed / original products / delivery — pharmacy purchases are trust purchases. |
| **Reviews with names** | Social proof at the decision moment. |
| **Share button** (Web Share API + clipboard fallback) | Customers become distribution — sharing straight into family WhatsApp groups. |
| **Save/Favorite** ❤️ | Future-ready wishlist via localStorage; return visitors resume where they left off. |
| **Empty search → WhatsApp** | "We probably have it in store — ask us" turns a dead end into a conversation. |
| **JSON-LD Product schema** | Rich results (stars, price) in Google — free trust before the click. |

## Files

```
pharmacy/
├── index.html      # Home: search, category chips, product grid, rails
├── product.html    # Data-driven product page (?id=…) + sticky CTA
├── css/style.css   # All styling, mobile-first
└── js/
    ├── products.js # STORE_CONFIG + product catalog (edit this)
    └── app.js      # WhatsApp engine, cards, favorites, viewed-history, share
```
