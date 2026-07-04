// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/lib/format.ts
//
//  Client-side formatting helpers for the dashboard. Exported as a JS
//  string that gets interpolated inside the page's IIFE `<script>` block.
//
//  Provides: escHtml(s), fmtNum(n, d), fmtPctLocal(n), recentAsc(arr, n),
//            initialsOf(name)
// ════════════════════════════════════════════════════════════════════════

export const formatHelpersJs = `
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmtNum(n, d) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return d != null ? n.toFixed(d) : String(n);
  }
  function fmtPctLocal(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toFixed(2) + '%';
  }
  // recentAsc: DailyStats arrive date-DESC. Take the first N (= most recent N),
  // then reverse so charts render oldest → newest left-to-right.
  function recentAsc(arr, n) {
    if (!Array.isArray(arr)) return [];
    var head = arr.slice(0, n);
    return head.slice().reverse();
  }
  function initialsOf(name) {
    if (!name) return '?';
    return name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0, 2);
  }
`;
