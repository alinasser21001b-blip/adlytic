# Product metrics — استعلامات D1

لا توجد لوحة إدارة ولا endpoint عام لبيانات الزوار. شغّل الاستعلامات من جهاز
مصادَق عليه:

```bash
npx wrangler d1 execute adlytic-check-db --remote --command "<SQL>"
```

الأحداث المسجّلة من **الخادم** (لا تُفقد ولا تتكرر بسبب الواجهة):
`check_started` · `check_completed` · `check_failed` · `share_created` · `share_revoked`.
من **الواجهة** (allowlist): `copy_clicked` · `new_check_started` · `share_link_copied`.
لا يُخزَّن نص إعلان أو صورة في الأحداث.

استبدل `:since` بـ epoch ms لبداية الفترة، مثلاً آخر 7 أيام:
`(CAST(strftime('%s','now') AS INTEGER) - 7*86400) * 1000`.

```sql
-- زوار بدؤوا فحصاً
SELECT COUNT(DISTINCT visitor_id) AS visitors_started FROM product_events
WHERE name = 'check_started' AND created_at >= :since;

-- نسبة الاكتمال
SELECT
  SUM(name = 'check_completed') * 1.0 / NULLIF(SUM(name = 'check_started'), 0) AS completion_rate,
  SUM(name = 'check_failed') AS failures
FROM product_events WHERE created_at >= :since;

-- نسبة نسخ النص المحسّن (تحليلات مكتملة نُسخ نصها مرة على الأقل)
SELECT COUNT(DISTINCT c.analysis_id) * 1.0 / NULLIF((SELECT COUNT(*) FROM product_events WHERE name = 'check_completed' AND created_at >= :since), 0) AS copy_rate
FROM product_events c WHERE c.name = 'copy_clicked' AND c.created_at >= :since;

-- نسبة إنشاء مشاركة
SELECT COUNT(DISTINCT analysis_id) * 1.0 / NULLIF((SELECT COUNT(*) FROM product_events WHERE name = 'check_completed' AND created_at >= :since), 0) AS share_rate
FROM product_events WHERE name = 'share_created' AND created_at >= :since;

-- زوار عادوا لتحليل ثانٍ (أكثر من تحليل مكتمل)
SELECT COUNT(*) AS returning_visitors FROM (
  SELECT visitor_id FROM analyses WHERE status = 'completed' AND created_at >= :since
  GROUP BY visitor_id HAVING COUNT(*) >= 2);

-- زمن التحليل، الفشل حسب السبب، واستهلاك المزوّد
SELECT ROUND(AVG(latency_ms)) AS avg_ms, MAX(latency_ms) AS max_ms FROM analyses WHERE status = 'completed' AND created_at >= :since;
SELECT error_code, COUNT(*) FROM analyses WHERE status = 'failed' AND created_at >= :since GROUP BY error_code ORDER BY 2 DESC;
SELECT day, provider_calls FROM daily_usage ORDER BY day DESC LIMIT 14;
SELECT model, SUM(provider_calls) AS calls, SUM(input_tokens) AS in_tok, SUM(output_tokens) AS out_tok
FROM analyses WHERE created_at >= :since GROUP BY model;
```

## تقدير التكلفة
احسبها من `in_tok` و`out_tok` أعلاه مضروبة في أسعار النموذج المستخدم **من صفحة
أسعار Anthropic الحالية وقت الحساب**. لم نضمّن سعراً ثابتاً في الكود لأن الأسعار
تتغير. التكلفة لكل تحليل ناجح = التكلفة الكلية ÷ عدد `check_completed` (تشمل كلفة
المحاولات الفاشلة ومحاولات الإصلاح).
