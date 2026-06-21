// src/engine/v2/contracts.ts
//
// V2 Brain Extension — Strict contracts for Layers 8 → 11.
// Phase 1: types only. No logic, no magic numbers, no I/O.
// These interfaces are the immutable boundary between V1 (stable) and V2 (incoming).

// ==========================================
// Layer 8: Market Pressure Engine (وعي السوق)
// ==========================================
export type MarketPressureStatus = 'CHEAP_AUCTION' | 'NORMAL' | 'BLOODBATH';

export interface MarketBaseline {
  recentAverageCPM: number; // متوسط السوق أو الحساب في آخر 48 ساعة
  recentAverageCPC: number;
}

export interface MarketPressureAnalysis {
  status: MarketPressureStatus;
  marketCpmDelta: number;        // الفرق النسبي بين المزاد الحالي والمتوسط التاريخي
  isAuctionBleeding: boolean;    // راية (Flag) تخبر الدماغ بتخفيف حساسية الإيقاف
}

// ==========================================
// Layer 9: Gold Standard Comparator (الحمض النووي)
// ==========================================
export type DnaMatchVerdict = 'LEGENDARY_DNA' | 'GOOD_MATCH' | 'POOR_MATCH';

export interface GoldStandardDNA {
  bestHistoricalCpm: number;
  bestHistoricalCtr: number;
  bestHistoricalCostPerMessage: number;
}

export interface GoldStandardAnalysis {
  dnaMatchPercentage: number;   // نسبة التطابق من 0 إلى 100
  verdict: DnaMatchVerdict;
  deviations: string[];         // مصفوفة تفصل أين يكمن الاختلاف
}

// ==========================================
// Layer 10: Intra-Day Velocity Tracker (حارس النزيف اللحظي)
// ==========================================
export type VelocityStatus = 'HEALTHY' | 'MICRO_BLEEDING' | 'HEMORRHAGE';

export interface HourlyVelocityData {
  hoursActiveToday: number;
  spendPerHour: number;
  messagesPerHour: number;
}

export interface VelocityAnalysis {
  status: VelocityStatus;
  burnRate: number;              // سرعة حرق الميزانية (Spend / Hour)
  emergencyOverride: boolean;    // إذا كانت True، يتجاوز النظام قرارات Layer 4 ويصدر أمر PAUSE فوري
}

// ==========================================
// Layer 11: Audience & Creative Resonance (صدى المنتج)
// ==========================================
export interface BreakdownData {
  topAgeGroup: string;
  topGender: string;
  bestPlacement: string;         // مثال: 'instagram_reels'
  peakTimeWindow: string;        // مثال: '21:00-01:00'
}

export interface VisionAIPayload {
  productType: string;           // ما هو المنتج؟ (عطور، ملابس، عقارات)
  visualHook: string;            // ما هو الطابع البصري؟ (إضاءة ليلية، تصوير UGC، رسمي)
}

export interface ResonanceAnalysis {
  audienceAlignmentScore: number;  // تقييم مدى توافق المنتج مع الجمهور الحالي
  creativeDirective: string;       // التوجيه الإبداعي النهائي الذي سيمرره Claude للتاجر
}

// ==========================================
// The Grand Orchestrator V2 Extension (العقل المتكامل)
// ==========================================
// هذا الهيكل سيتم دمجه (Merge) مع BrainTickResult القديم
// لإنشاء الشجرة المعرفية الكاملة التي سيقرأها Claude CMO.
export interface BrainV2Extension {
  marketPressure: MarketPressureAnalysis;
  goldStandard: GoldStandardAnalysis;
  velocity: VelocityAnalysis;
  resonance: ResonanceAnalysis;
}
