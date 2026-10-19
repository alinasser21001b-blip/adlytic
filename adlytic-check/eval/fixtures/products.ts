// Simple, original SVG product illustrations for synthetic fixtures (no third-party imagery).
export type ProductKind = "sofa" | "table" | "wardrobe" | "dress" | "shirt" | "burger" | "cake" | "perfume" | "cream" | "watch" | "bag" | "glasses" | "case" | "wrench" | "phone" | "abstract";

export function productSvg(kind: ProductKind, accent = "#8a5a3b"): string {
  const s = (body: string) => `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${body}</svg>`;
  switch (kind) {
    case "sofa":
      return s(`<rect x="40" y="110" width="320" height="110" rx="28" fill="${accent}"/><rect x="20" y="140" width="60" height="100" rx="22" fill="${accent}" opacity=".85"/><rect x="320" y="140" width="60" height="100" rx="22" fill="${accent}" opacity=".85"/><rect x="70" y="170" width="260" height="55" rx="14" fill="#fff" opacity=".18"/><rect x="60" y="240" width="14" height="30" fill="#333"/><rect x="326" y="240" width="14" height="30" fill="#333"/>`);
    case "table":
      return s(`<rect x="50" y="110" width="300" height="28" rx="6" fill="${accent}"/><rect x="80" y="138" width="16" height="120" fill="${accent}"/><rect x="304" y="138" width="16" height="120" fill="${accent}"/><rect x="20" y="150" width="40" height="90" rx="6" fill="${accent}" opacity=".6"/><rect x="340" y="150" width="40" height="90" rx="6" fill="${accent}" opacity=".6"/>`);
    case "wardrobe":
      return s(`<rect x="110" y="30" width="180" height="240" rx="8" fill="${accent}"/><line x1="200" y1="40" x2="200" y2="260" stroke="#fff" stroke-width="4" opacity=".5"/><circle cx="188" cy="150" r="6" fill="#fff"/><circle cx="212" cy="150" r="6" fill="#fff"/>`);
    case "dress":
      return s(`<path d="M170 40 L230 40 L245 90 L215 110 L290 270 L110 270 L185 110 L155 90 Z" fill="${accent}"/><path d="M185 110 L215 110" stroke="#fff" stroke-width="5" opacity=".5"/>`);
    case "shirt":
      return s(`<path d="M150 50 L250 50 L320 100 L290 140 L265 120 L265 270 L135 270 L135 120 L110 140 L80 100 Z" fill="${accent}"/><path d="M180 50 Q200 80 220 50" fill="none" stroke="#fff" stroke-width="5" opacity=".6"/>`);
    case "burger":
      return s(`<path d="M90 140 Q200 30 310 140 Z" fill="#d9993b"/><rect x="85" y="140" width="230" height="22" rx="8" fill="#5a8f29"/><rect x="80" y="160" width="240" height="30" rx="10" fill="#6b3a1f"/><rect x="85" y="188" width="230" height="16" rx="6" fill="#f2c230"/><path d="M90 205 L310 205 Q300 245 200 245 Q100 245 90 205 Z" fill="#d9993b"/>`);
    case "cake":
      return s(`<rect x="100" y="150" width="200" height="100" rx="10" fill="#5b3420"/><rect x="100" y="140" width="200" height="22" rx="10" fill="#f4e1c6"/><rect x="130" y="90" width="140" height="60" rx="8" fill="#6b3d26"/><rect x="130" y="84" width="140" height="14" rx="7" fill="#f4e1c6"/><rect x="195" y="50" width="10" height="34" fill="#e8c547"/><circle cx="200" cy="45" r="8" fill="#ff8a00"/>`);
    case "perfume":
      return s(`<rect x="150" y="100" width="100" height="160" rx="18" fill="${accent}" opacity=".9"/><rect x="180" y="60" width="40" height="44" rx="6" fill="#c9a227"/><rect x="165" y="150" width="70" height="40" rx="4" fill="#fff" opacity=".5"/>`);
    case "cream":
      return s(`<rect x="130" y="150" width="140" height="100" rx="20" fill="#f1ece4" stroke="${accent}" stroke-width="6"/><rect x="120" y="120" width="160" height="40" rx="12" fill="${accent}"/>`);
    case "watch":
      return s(`<rect x="175" y="20" width="50" height="260" rx="14" fill="#3b3b3b"/><circle cx="200" cy="150" r="70" fill="#c0c4c8" stroke="#555" stroke-width="10"/><line x1="200" y1="150" x2="200" y2="105" stroke="#222" stroke-width="6"/><line x1="200" y1="150" x2="235" y2="160" stroke="#222" stroke-width="5"/>`);
    case "bag":
      return s(`<path d="M150 110 Q150 50 200 50 Q250 50 250 110" fill="none" stroke="${accent}" stroke-width="14"/><rect x="110" y="105" width="180" height="160" rx="18" fill="${accent}"/><rect x="185" y="150" width="30" height="18" rx="4" fill="#c9a227"/>`);
    case "glasses":
      return s(`<circle cx="140" cy="150" r="55" fill="#2b2b2b" stroke="#111" stroke-width="8"/><circle cx="260" cy="150" r="55" fill="#2b2b2b" stroke="#111" stroke-width="8"/><path d="M195 145 Q200 135 205 145" stroke="#111" stroke-width="8" fill="none"/>`);
    case "case":
      return s(`<rect x="140" y="80" width="120" height="150" rx="40" fill="${accent}"/><circle cx="200" cy="130" r="8" fill="#fff" opacity=".7"/>`);
    case "wrench":
      return s(`<rect x="60" y="120" width="280" height="80" rx="10" fill="#e6eef2" stroke="#8aa3ad" stroke-width="5"/><path d="M90 150 h220" stroke="#8aa3ad" stroke-width="5"/><path d="M240 230 l60 -60 a30 30 0 1 1 20 20 l-60 60 z" fill="${accent}"/>`);
    case "phone":
      return s(`<rect x="150" y="40" width="100" height="210" rx="16" fill="#222"/><rect x="160" y="60" width="80" height="160" rx="6" fill="#4aa3df"/><path d="M165 70 L235 210" stroke="#fff" stroke-width="3" opacity=".7"/>`);
    case "abstract":
      return s(`<circle cx="120" cy="120" r="90" fill="${accent}" opacity=".35"/><circle cx="270" cy="170" r="110" fill="${accent}" opacity=".25"/><rect x="170" y="60" width="90" height="90" rx="20" fill="${accent}" opacity=".3"/>`);
  }
}
