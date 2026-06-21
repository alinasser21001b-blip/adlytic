// src/engine/v2/VelocityTrackerEngine.ts
//
// الطبقة العاشرة: حارس النزيف اللحظي
// المحرك الوحيد في كامل الدماغ الذي يمتلك صلاحية رفع راية الطوارئ
// (emergencyOverride) لتجاوز قرار Layer 4 وفرض إيقاف الحملة.
//
// Pure function: depends only on inputs. No I/O, no clocks.
// Consumes `bestHistoricalCostPerMessage` — canonical field from Layer 9's
// GoldStandardDNA contract.

import { VelocityAnalysis, VelocityStatus } from './contracts';
import { VELOCITY_CONFIG } from './velocityConfig';

export interface DetailedHourlyVelocity {
  hoursActiveToday: number;
  totalSpendToday: number;
  totalMessagesToday: number;
  dailyBudget: number;
  bestHistoricalCostPerMessage: number; // ينتمي إلى عقد GoldStandardDNA
}

export function evaluateVelocity(data: DetailedHourlyVelocity): VelocityAnalysis {

  const burnRate = data.hoursActiveToday > 0
    ? data.totalSpendToday / data.hoursActiveToday
    : 0;

  // 1. حارس البدايات: لا حكم قبل مرور وقت كافٍ، ولا حكم بدون ميزانية صحيحة.
  if (data.hoursActiveToday < VELOCITY_CONFIG.MIN_HOURS_ACTIVE_TO_JUDGE || data.dailyBudget <= 0) {
    return {
      status: 'HEALTHY',
      burnRate: Math.round(burnRate * 100) / 100,
      emergencyOverride: false,
    };
  }

  const spendPercent = (data.totalSpendToday / data.dailyBudget) * 100;
  let status: VelocityStatus = 'HEALTHY';
  let emergencyOverride = false;

  // 2. فحص حالة "الإنفاق بدون أي نتائج" (Zero-Conversion Bleed)
  if (data.totalMessagesToday === 0) {
    if (spendPercent >= VELOCITY_CONFIG.HEMORRHAGE_SPEND_PERCENT_NO_RESULTS) {
      status = 'HEMORRHAGE';
      emergencyOverride = true; // تفعيل الطوارئ: إيقاف فوري لتجاوز القرار اليومي
    } else if (spendPercent >= VELOCITY_CONFIG.MICRO_BLEED_SPEND_PERCENT_NO_RESULTS) {
      status = 'MICRO_BLEEDING';
    }
  }
  // 3. فحص حالة "الإنفاق مع نتائج كارثية" (Insane CPA Bleed)
  else if (data.bestHistoricalCostPerMessage > 0) {
    const currentIntraDayCpa = data.totalSpendToday / data.totalMessagesToday;
    const hemorrhageCpaThreshold = data.bestHistoricalCostPerMessage * VELOCITY_CONFIG.HEMORRHAGE_CPA_MULTIPLIER;

    if (
      currentIntraDayCpa >= hemorrhageCpaThreshold &&
      spendPercent >= VELOCITY_CONFIG.HEMORRHAGE_CPA_MIN_SPEND_PERCENT
    ) {
      status = 'HEMORRHAGE';
      emergencyOverride = true;
    }
  }

  return {
    status,
    burnRate: Math.round(burnRate * 100) / 100,
    emergencyOverride,
  };
}
