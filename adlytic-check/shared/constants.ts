// Plain constants shared by the Worker and the browser bundle — no zod here.
export const INDUSTRIES = [
  { value: "furniture", labelAr: "أثاث" },
  { value: "clothing", labelAr: "ملابس" },
  { value: "accessories", labelAr: "إكسسوارات" },
  { value: "restaurants", labelAr: "مطاعم" },
  { value: "beauty", labelAr: "تجميل غير طبي" },
  { value: "services", labelAr: "خدمات" },
  { value: "other", labelAr: "أخرى" },
] as const;

export const GOALS = [
  { value: "messages", labelAr: "رسائل واستفسارات" },
  { value: "orders", labelAr: "طلبات شراء" },
  { value: "visits", labelAr: "زيارات" },
  { value: "awareness", labelAr: "تعريف بالعلامة" },
] as const;

export type Industry = (typeof INDUSTRIES)[number]["value"];
export type Goal = (typeof GOALS)[number]["value"];

export const LIMITS = {
  adCopy: 2000,
  audience: 200,
  additionalContext: 500,
  imageBytes: 3 * 1024 * 1024,
  /** Whole multipart body: image + fields + boundaries. */
  requestBytes: 3 * 1024 * 1024 + 64 * 1024,
} as const;

export const CLIENT_EVENT_NAMES = ["copy_clicked", "new_check_started", "share_link_copied"] as const;
export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];
