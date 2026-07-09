// Cognitive gate: generic templates must never surface as useful merchant insights.

import {
  isGenericInsightNarration,
  buildDeterministicNarration,
  selectUsefulFeedItems,
  scoreInsightQuality,
  upgradeGenericNarration,
  insightBodyFingerprint,
} from './src/lib/insightQualityGate';
import type { CmoFeedItemDTO } from './src/types/cmoFeed';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`);
  }
}

console.log('\ninsightQualityGate');

check(
  'detects legacy Arabic generic title+body',
  isGenericInsightNarration(
    'تحديث أداء الحملة',
    'راجعنا أداء حملتك وصدرت توصية جديدة بناءً على البيانات الحالية. راجع تفاصيل الحملة في لوحة التحكم.',
  ),
);

check(
  'detects titled variant with campaign suffix',
  isGenericInsightNarration('تحديث أداء الحملة — وعي 37', 'راجعنا أداء حملتك وصدرت توصية جديدة بناءً على البيانات الحالية.'),
);

check(
  'accepts action-specific copy',
  !isGenericInsightNarration(
    'إيقاف فوري لحماية الميزانية',
    'أوقفنا حملة «وعي 37» لأن الإنفاق يرتفع دون نتائج كافية. راجع الإبداع والاستهداف قبل إعادة التشغيل.',
  ),
);

const pause = buildDeterministicNarration(
  { decision: { action: 'PAUSE_CAMPAIGN' }, campaignName: 'وعي 37' },
  { campaignName: 'وعي 37', action: 'PAUSE_CAMPAIGN' },
);
check('pause title is specific', pause.arabicTitle.includes('إيقاف') || pause.arabicTitle.includes('يُفضّل'));
check('pause body names campaign', pause.arabicNarration.includes('وعي 37'));
check('pause is not generic', !isGenericInsightNarration(pause.arabicTitle, pause.arabicNarration));

const scale = buildDeterministicNarration({}, { campaignName: 'عروض رمضان', action: 'SCALE_BUDGET' });
const refresh = buildDeterministicNarration({}, { campaignName: 'وعي 2', action: 'REFRESH_CREATIVE' });
check(
  'different actions produce different fingerprints',
  insightBodyFingerprint(pause.arabicTitle, pause.arabicNarration) !==
    insightBodyFingerprint(scale.arabicTitle, scale.arabicNarration),
);
check(
  'refresh differs from scale',
  insightBodyFingerprint(refresh.arabicTitle, refresh.arabicNarration) !==
    insightBodyFingerprint(scale.arabicTitle, scale.arabicNarration),
);

const upgraded = upgradeGenericNarration(
  {
    arabicTitle: 'تحديث أداء الحملة',
    arabicNarration: 'راجعنا أداء حملتك وصدرت توصية جديدة بناءً على البيانات الحالية.',
  },
  { decision: { action: 'EMERGENCY_PAUSE' } },
  'حملة الميزانية',
  'EMERGENCY_PAUSE',
);
check('upgrade marks upgraded', upgraded.upgraded === true);
check('upgrade replaces title', !isGenericInsightNarration(upgraded.narration.arabicTitle, upgraded.narration.arabicNarration));

const genericItem = (id: string, name: string): CmoFeedItemDTO => ({
  id,
  campaignId: id,
  campaignName: name,
  insightType: 'HOLD_AND_MONITOR',
  date: '2026-07-08',
  title: 'تحديث أداء الحملة',
  body: 'راجعنا أداء حملتك وصدرت توصية جديدة بناءً على البيانات الحالية. راجع تفاصيل الحملة في لوحة التحكم.',
  severity: 'NORMAL',
  dedupeKey: `${id}:HOLD:2026-07-08`,
  generatedAt: '2026-07-08T12:00:00.000Z',
});

const usefulPause: CmoFeedItemDTO = {
  id: 'p1',
  campaignId: 'c-pause',
  campaignName: 'وعي 37',
  insightType: 'PAUSE_CAMPAIGN',
  date: '2026-07-08',
  title: pause.arabicTitle,
  body: pause.arabicNarration,
  severity: 'CRITICAL',
  dedupeKey: 'c-pause:PAUSE:2026-07-08',
  generatedAt: '2026-07-08T12:00:00.000Z',
};

const usefulScale: CmoFeedItemDTO = {
  id: 's1',
  campaignId: 'c-scale',
  campaignName: 'عروض رمضان',
  insightType: 'SCALE_BUDGET',
  date: '2026-07-08',
  title: scale.arabicTitle,
  body: scale.arabicNarration,
  severity: 'HIGH',
  dedupeKey: 'c-scale:SCALE:2026-07-08',
  generatedAt: '2026-07-08T12:00:00.000Z',
};

const learning: CmoFeedItemDTO = {
  id: 'l1',
  campaignId: 'c-learn',
  campaignName: 'تجربة',
  insightType: 'KEEP_COLLECTING',
  date: '2026-07-08',
  title: 'نراقب ونبني خط الأساس',
  body: 'حملة «تجربة» ما زالت في مرحلة جمع البيانات. نتابع الأداء وسننبّهك عند ظهور قرار واضح.',
  severity: 'NORMAL',
  dedupeKey: 'c-learn:KEEP:2026-07-08',
  generatedAt: '2026-07-08T12:00:00.000Z',
};

const learning2: CmoFeedItemDTO = { ...learning, id: 'l2', campaignId: 'c-learn-2', campaignName: 'تجربة 2', dedupeKey: 'c-learn-2:KEEP:2026-07-08' };

const selected = selectUsefulFeedItems(
  [genericItem('g1', 'A'), genericItem('g2', 'B'), usefulPause, usefulScale, learning, learning2],
  5,
);

check('drops generic twins when useful exist', selected.every((i) => !isGenericInsightNarration(i.title, i.body)));
check('keeps pause + scale', selected.some((i) => i.id === 'p1') && selected.some((i) => i.id === 's1'));
check('caps learning-phase to 1', selected.filter((i) => i.insightType === 'KEEP_COLLECTING').length <= 1);

const onlyGenerics = selectUsefulFeedItems(
  [genericItem('g1', 'A'), genericItem('g2', 'B'), genericItem('g3', 'C')],
  5,
);
check('body-fingerprint collapses identical generics', onlyGenerics.length <= 1);

const q = scoreInsightQuality({
  title: usefulPause.title,
  body: usefulPause.body,
  action: 'PAUSE_CAMPAIGN',
  generatedAt: usefulPause.generatedAt,
});
check('actionable pause scores useful', q.isUseful && q.score >= 45, q);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
