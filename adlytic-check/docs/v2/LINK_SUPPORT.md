# Link support — what a pasted link can and cannot do

Endpoint: `POST /api/import-link {url}` (session + same-origin; 20 imports per guest per hour).
It returns the media bytes (states SUPPORTED / PREVIEW_ONLY) or `{state, reason}`. Nothing
fetched is stored; the bytes go straight back to the owner's browser and are then handled like an
upload (images re-encoded, videos sampled on the device).

## Capability matrix

| Link | State | What happens | Why |
|---|---|---|---|
| Instagram post / reel / profile (`instagram.com`, `instagr.am`) | **AUTH_REQUIRED** | Explained; owner saves the media from the app and uploads it | Official access needs an approved Meta app and the account owner's authorisation (oEmbed Read needs App Review and no longer returns thumbnails; Business Discovery needs a user token with `instagram_basic`, `pages_read_engagement`…) — research S20. No scraping, no passwords, no cookies. |
| Facebook / Threads / Messenger / `fb.watch` | **AUTH_REQUIRED** | Same | Same (Meta platform) |
| TikTok, YouTube, Snapchat, X, Telegram, WhatsApp (`wa.me`) | **UNSUPPORTED** | Explained; upload instead | No official import used by this product |
| Direct image file on the web (JPEG/PNG/WebP ≤ 3 MiB) | **SUPPORTED** | Imported as an image | Type decided by magic bytes, not by the header or extension |
| Direct video file (MP4/WebM ≤ 25 MiB) | **SUPPORTED** | Imported, then sampled on the device like an upload | 25 MiB keeps the Worker's single in-memory copy far below 128 MB |
| A shop's web page with `og:image` | **PREVIEW_ONLY** | The preview image is imported, with a note that it may not be the ad | The page's preview is a different thing from the ad |
| Page without preview image, text files, oversize files | **UNSUPPORTED** | Explained | — |
| 4xx/5xx, DNS failure, timeout | **UNAVAILABLE** / UNSUPPORTED | Explained | — |

## SSRF controls (research S17, tested in `tests/unit/links.test.ts` and `tests/integration/links.test.ts`)
- `https:` on port 443 only; no `user:pass@`; URLs are parsed with the WHATWG parser (so
  `https://2130706433/` and `https://0x7f.0.0.1/` normalise to 127.0.0.1 and are refused).
- Refused names: single-label hosts, `localhost`, `.local`, `.internal`, `.lan`, `.home`, `.corp`,
  `.arpa`, `.test`, `.invalid`, `.example`, and the service's own host.
- Refused addresses: IPv4 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24,
  192.0.2/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4 and above; IPv6 `::`,
  `::1`, fc00::/7, fe80::/10, ff00::/8, 2001:db8::/32, and any IPv4 embedded through
  `::ffff:` (mapped), `::a.b.c.d`, `64:ff9b::/96` (NAT64) or `2002::/16` (6to4). Zone ids refused.
- DNS rebinding: the name's A and AAAA answers (DNS-over-HTTPS) must all be public before any
  connection; the check runs again on **every redirect hop** (max 3, `redirect: "manual"`).
  Residual risk: the fetch resolves the name again (time-of-check/time-of-use); Workers' outbound
  `fetch` does not reach private networks, which is the second layer.
- Byte caps are enforced while streaming (declared `Content-Length` is only an early exit);
  10 s per hop; no cookies or auth headers are sent; a fixed user agent identifies the importer.
- Test hook: outside production only, `LINK_TEST_ORIGIN` exempts one exact origin (the local test
  double). The production instance in the test suite proves it is ignored there.
