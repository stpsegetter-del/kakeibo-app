/* =========================================================
   かんたん家計簿 - app.js
   React (CDN + Babel standalone) で動くメインアプリ
   ========================================================= */

const { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext, useLayoutEffect } = React;

/* ---------------------------------------------------------
   汎用ユーティリティ
--------------------------------------------------------- */
function pad2(n) { return String(n).padStart(2, '0'); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function todayYm() { return todayStr().slice(0, 7); }
function ymOf(dateStr) { return (dateStr || '').slice(0, 7); }
function daysInMonthOf(y, m) { return new Date(y, m, 0).getDate(); }
function addMonths(ym, delta) {
  let [y, m] = ym.split('-').map(Number);
  m += delta;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return `${y}-${pad2(m)}`;
}
function formatYmLabel(ym) {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}
function formatYmShort(ym) {
  const [, m] = ym.split('-');
  return `${Number(m)}月`;
}
function formatYen(n) {
  const v = Math.round(n || 0);
  return (v < 0 ? '-' : '') + '¥' + Math.abs(v).toLocaleString('ja-JP');
}
function formatDateJp(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日(${wd})`;
}
function nowIso() { return new Date().toISOString(); }
function cx(...list) { return list.filter(Boolean).join(' '); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

const ICON_CHOICES = ['🍚','🍜','🍔','☕','🧻','🛍️','🚃','🚗','⛽','🏠','🔧','💡','🔥','💧','📱','💻','🎉','🎁','🎮','✈️','📚','🏥','💊','🛡️','📦','💰','👛','✨','🐾','👶','⚽','🎵','🎨','🧾','💳'];
const COLOR_CHOICES = ['#FF9F43','#F6C453','#FFD23F','#4DA3FF','#3EC6C6','#8C7AE6','#9B6BFF','#FF6F91','#FF6B6B','#5FD08E','#3FAE75','#6C7A89','#B0B7C3','#4D96FF'];

/* ---------------------------------------------------------
   定期取引 → 未生成分のトランザクションを補完する
--------------------------------------------------------- */
function generateRecurringInstances(rules, existingTx) {
  const currentYm = todayYm();
  const newTx = [];
  const updatedRules = [];
  rules.forEach((ruleOrig) => {
    if (!ruleOrig.active) return;
    const rule = Object.assign({}, ruleOrig);
    let cursor = rule.lastGeneratedMonth ? addMonths(rule.lastGeneratedMonth, 1) : rule.startMonth;
    if (cursor < rule.startMonth) cursor = rule.startMonth;
    let changed = false;
    let guard = 0;
    while (cursor <= currentYm && (!rule.endMonth || cursor <= rule.endMonth) && guard < 600) {
      guard++;
      const alreadyExists = existingTx.some((t) => t.recurringId === rule.id && ymOf(t.date) === cursor);
      if (!alreadyExists) {
        const [y, m] = cursor.split('-').map(Number);
        const dim = daysInMonthOf(y, m);
        const day = Math.min(rule.dayOfMonth, dim);
        const dateStr = `${cursor}-${pad2(day)}`;
        newTx.push({
          id: uuid(), type: rule.type, date: dateStr, amount: rule.amount,
          majorCategoryId: rule.majorCategoryId, subCategoryId: rule.subCategoryId || null,
          memo: rule.memo || '', recurringId: rule.id, createdAt: nowIso(), updatedAt: nowIso()
        });
      }
      rule.lastGeneratedMonth = cursor;
      changed = true;
      cursor = addMonths(cursor, 1);
    }
    if (changed) updatedRules.push(rule);
  });
  return { newTx, updatedRules };
}

/* ---------------------------------------------------------
   Context
--------------------------------------------------------- */
const DataContext = createContext(null);
function useData() { return useContext(DataContext); }

/* ---------------------------------------------------------
   小さな共通部品
--------------------------------------------------------- */
function IconBtn({ children, onClick, label }) {
  return <button className="icon-btn" onClick={onClick} aria-label={label}>{children}</button>;
}

function MonthSwitcher({ ym, onChange, max }) {
  const disabledNext = max ? ym >= max : false;
  return (
    <div className="month-switcher">
      <button onClick={() => onChange(addMonths(ym, -1))} aria-label="前の月">‹</button>
      <div className="month-label">{formatYmLabel(ym)}</div>
      <button onClick={() => onChange(addMonths(ym, 1))} disabled={disabledNext} aria-label="次の月">›</button>
    </div>
  );
}

function Toast({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}
    </div>
  );
}

function ConfirmDialog({ state, onClose }) {
  if (!state) return null;
  return (
    <div className="sheet-overlay center" onClick={onClose}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="msg">{state.msg}</div>
        {state.detail && <div className="detail">{state.detail}</div>}
        <div className="btn-row">
          <button className="cancel" onClick={onClose}>キャンセル</button>
          <button className="ok" onClick={() => { state.onConfirm(); onClose(); }}>
            {state.okLabel || '削除する'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children, center }) {
  return (
    <div className={cx('sheet-overlay', center && 'center')} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {!center && <div className="sheet-handle"></div>}
        <div className="sheet-header">
          <h2>{title}</h2>
          <IconBtn onClick={onClose} label="閉じる">✕</IconBtn>
        </div>
        {children}
      </div>
    </div>
  );
}

function ToggleSwitch({ on, onClick }) {
  return (
    <button className={cx('toggle-switch', on && 'on')} onClick={onClick}>
      <span className="knob"></span>
    </button>
  );
}

function getCategoryById(categories, id) {
  return categories.find((c) => c.id === id) || { name: '(削除済みのカテゴリ)', icon: '❔', color: '#B0B7C3', subcategories: [] };
}
function getSubName(cat, subId) {
  if (!subId) return null;
  const s = (cat.subcategories || []).find((s) => s.id === subId);
  return s ? s.name : null;
}

/* ---------------------------------------------------------
   ドーナツチャート（SVG）
--------------------------------------------------------- */
function DonutChart({ segments, size = 140, thickness = 22 }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offsetAcc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-surface-alt)" strokeWidth={thickness} />
      {total > 0 && segments.map((s, i) => {
        const frac = s.value / total;
        const dash = frac * circumference;
        const gap = circumference - dash;
        const rotation = (offsetAcc / total) * 360 - 90;
        offsetAcc += s.value;
        return (
          <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${dash} ${gap}`} strokeLinecap="butt"
            style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${c}px ${c}px`, transition: 'stroke-dasharray .4s ease' }} />
        );
      })}
      <text x={c} y={c - 4} textAnchor="middle" fontSize="11" fill="var(--color-text-muted)" fontWeight="700">合計</text>
      <text x={c} y={c + 14} textAnchor="middle" fontSize="14" fill="var(--color-text)" fontWeight="800">{formatYen(total)}</text>
    </svg>
  );
}

/* ---------------------------------------------------------
   ローディング画面
--------------------------------------------------------- */
function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="emoji">💰</div>
      <div style={{ fontWeight: 800, color: 'var(--color-text-muted)' }}>読み込み中…</div>
    </div>
  );
}

/* ---------------------------------------------------------
   チュートリアル
--------------------------------------------------------- */
const TUTORIAL_STEPS = [
  { emoji: '👋', title: 'かんたん家計簿へようこそ', text: '毎日のお金の出入りを、かんたん・楽しく記録できる家計簿アプリです。まずは使い方を簡単にご案内します。' },
  { emoji: '➕', title: '入力はまんなかの＋ボタンから', text: '画面下のオレンジの＋ボタンをタップすると、支出・収入をすぐに記録できます。金額とカテゴリを選ぶだけでOK！' },
  { emoji: '🏠', title: 'ホームで今月をひと目チェック', text: 'ホーム画面では今月の収支サマリ、予算の残り、最近の記録をまとめて確認できます。' },
  { emoji: '📊', title: '分析でお金の流れを見える化', text: 'カテゴリ別の内訳や月ごとの推移をグラフで確認。使いすぎに気づきやすくなります。' },
  { emoji: '⚙️', title: '設定はあとからでも変更OK', text: 'カテゴリの追加・予算金額・定期支払い・バックアップは「設定」タブからいつでも変更できます。さっそく始めましょう！' },
];
function Tutorial({ onDone }) {
  const [step, setStep] = useState(0);
  const s = TUTORIAL_STEPS[step];
  const last = step === TUTORIAL_STEPS.length - 1;
  return (
    <div className="tutorial-overlay">
      <div className="tutorial-card">
        <div className="emoji">{s.emoji}</div>
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        <div className="tutorial-dots">
          {TUTORIAL_STEPS.map((_, i) => <div key={i} className={cx('dot', i === step && 'active')}></div>)}
        </div>
        <div className="tutorial-actions">
          {!last && <button className="skip" onClick={onDone}>スキップ</button>}
          <button className="btn-primary next mt-0" onClick={() => last ? onDone() : setStep(step + 1)}>
            {last ? 'はじめる' : 'つぎへ'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   ホーム画面
--------------------------------------------------------- */
function HomeView({ monthYm, setMonthYm, onEditTx }) {
  const { transactions, categories, budgets, setTab, setHistoryFilter } = useData();

  const monthTx = useMemo(() => transactions.filter((t) => ymOf(t.date) === monthYm), [transactions, monthYm]);
  const income = useMemo(() => monthTx.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0), [monthTx]);
  const expense = useMemo(() => monthTx.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0), [monthTx]);
  const balance = income - expense;

  const budgetRows = useMemo(() => {
    return budgets
      .filter((b) => b.amount > 0)
      .map((b) => {
        const cat = getCategoryById(categories, b.majorCategoryId);
        const used = monthTx.filter((t) => t.type === 'expense' && t.majorCategoryId === b.majorCategoryId)
          .reduce((a, t) => a + t.amount, 0);
        const pct = b.amount > 0 ? (used / b.amount) * 100 : 0;
        return { cat, used, amount: b.amount, pct };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [budgets, categories, monthTx]);

  const overBudget = budgetRows.filter((r) => r.pct >= 100);
  const nearBudget = budgetRows.filter((r) => r.pct >= 80 && r.pct < 100);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => { setBannerDismissed(false); }, [monthYm]);

  const recent = useMemo(() => {
    return transactions.slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 6);
  }, [transactions]);

  return (
    <div>
      <MonthSwitcher ym={monthYm} onChange={setMonthYm} max={todayYm()} />

      <div className="summary-card">
        <div className="balance-label">今月の収支</div>
        <div className="balance-value">{formatYen(balance)}</div>
        <div className="summary-row">
          <div className="summary-pill">
            <div className="label">収入</div>
            <div className="value">{formatYen(income)}</div>
          </div>
          <div className="summary-pill">
            <div className="label">支出</div>
            <div className="value">{formatYen(expense)}</div>
          </div>
        </div>
      </div>

      {!bannerDismissed && overBudget.length > 0 && (
        <div className="banner over">
          <span>⚠️ {overBudget.map((r) => r.cat.name).join('・')}が予算を超えました</span>
          <button className="dismiss" onClick={() => setBannerDismissed(true)}>✕</button>
        </div>
      )}
      {!bannerDismissed && overBudget.length === 0 && nearBudget.length > 0 && (
        <div className="banner warn">
          <span>👀 {nearBudget.map((r) => r.cat.name).join('・')}が予算の80%を超えています</span>
          <button className="dismiss" onClick={() => setBannerDismissed(true)}>✕</button>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <span>予算の残り</span>
          <span className="link" onClick={() => setTab('settings-budgets')}>設定する ›</span>
        </div>
        {budgetRows.length === 0 && <div className="budget-empty-hint">まだ予算が設定されていません。設定タブから予算を登録すると、使いすぎをお知らせします。</div>}
        {budgetRows.map((r) => (
          <div className="budget-item" key={r.cat.id}>
            <div className="budget-item-top">
              <span className="cat-name"><span>{r.cat.icon}</span>{r.cat.name}</span>
              <span className="amounts">{formatYen(r.used)} / {formatYen(r.amount)}</span>
            </div>
            <div className="budget-bar-track">
              <div className={cx('budget-bar-fill', r.pct >= 100 ? 'over' : r.pct >= 80 ? 'warn' : '')}
                style={{ width: clamp(r.pct, 0, 100) + '%' }}></div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">
          <span>最近の記録</span>
          <span className="link" onClick={() => setTab('history')}>すべて見る ›</span>
        </div>
        {recent.length === 0 && <div className="budget-empty-hint">まだ記録がありません。右下の＋から入力してみましょう。</div>}
        {recent.map((t) => {
          const cat = getCategoryById(categories, t.majorCategoryId);
          const subName = getSubName(cat, t.subCategoryId);
          return (
            <div className="tx-row" key={t.id} onClick={() => onEditTx(t)}>
              <div className="tx-icon" style={{ background: cat.color + '33' }}>{cat.icon}</div>
              <div className="tx-info">
                <div className="tx-cat">{cat.name}{subName ? ' / ' + subName : ''}</div>
                <div className="tx-memo">{formatDateJp(t.date)}{t.memo ? ' ・ ' + t.memo : ''}</div>
              </div>
              <div className={cx('tx-amount', t.type)}>{t.type === 'expense' ? '-' : '+'}{formatYen(t.amount)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   履歴画面
--------------------------------------------------------- */
function HistoryView({ onEditTx }) {
  const { transactions, categories } = useData();
  const [keyword, setKeyword] = useState('');
  const [period, setPeriod] = useState('thisMonth'); // thisMonth | lastMonth | all
  const [catFilter, setCatFilter] = useState(null);

  const periodRange = useMemo(() => {
    const ym = todayYm();
    if (period === 'thisMonth') return [ym, ym];
    if (period === 'lastMonth') { const p = addMonths(ym, -1); return [p, p]; }
    return null;
  }, [period]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (periodRange && (ymOf(t.date) < periodRange[0] || ymOf(t.date) > periodRange[1])) return false;
      if (catFilter && t.majorCategoryId !== catFilter) return false;
      if (keyword) {
        const cat = getCategoryById(categories, t.majorCategoryId);
        const sub = getSubName(cat, t.subCategoryId) || '';
        const hay = (cat.name + sub + (t.memo || '')).toLowerCase();
        if (!hay.includes(keyword.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  }, [transactions, periodRange, catFilter, keyword, categories]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((t) => {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date).push(t);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const usedCategories = useMemo(() => {
    const ids = new Set(transactions.map((t) => t.majorCategoryId));
    return categories.filter((c) => ids.has(c.id));
  }, [categories, transactions]);

  return (
    <div>
      <div className="view-title">履歴</div>
      <div className="search-bar">
        <span>🔍</span>
        <input placeholder="カテゴリ・メモで検索" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </div>
      <div className="filter-chip-row">
        {[['thisMonth', '今月'], ['lastMonth', '先月'], ['all', 'すべて']].map(([key, label]) => (
          <button key={key} className={cx('chip', period === key && 'active')} onClick={() => setPeriod(key)}>{label}</button>
        ))}
        <button className={cx('chip', !catFilter && 'active')} onClick={() => setCatFilter(null)}>全カテゴリ</button>
        {usedCategories.map((c) => (
          <button key={c.id} className={cx('chip', catFilter === c.id && 'active')} onClick={() => setCatFilter(c.id === catFilter ? null : c.id)}>
            {c.icon} {c.name}
          </button>
        ))}
      </div>

      {grouped.length === 0 && (
        <div className="empty-state">
          <div className="emoji">🧾</div>
          <div>記録が見つかりません</div>
          <div className="sub">条件を変えるか、＋ボタンから記録してみましょう</div>
        </div>
      )}

      {grouped.map(([date, list]) => {
        const dayTotal = list.reduce((a, t) => a + (t.type === 'expense' ? -t.amount : t.amount), 0);
        return (
          <div className="tx-date-group" key={date}>
            <div className="tx-date-heading">
              <span>{formatDateJp(date)}</span>
              <span>{formatYen(dayTotal)}</span>
            </div>
            {list.map((t) => {
              const cat = getCategoryById(categories, t.majorCategoryId);
              const subName = getSubName(cat, t.subCategoryId);
              return (
                <div className="tx-row" key={t.id} onClick={() => onEditTx(t)}>
                  <div className="tx-icon" style={{ background: cat.color + '33' }}>{cat.icon}</div>
                  <div className="tx-info">
                    <div className="tx-cat">{cat.name}{subName ? ' / ' + subName : ''}</div>
                    <div className="tx-memo">{t.memo || (t.recurringId ? '定期取引' : '')}</div>
                  </div>
                  <div className={cx('tx-amount', t.type)}>{t.type === 'expense' ? '-' : '+'}{formatYen(t.amount)}</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------
   分析画面
--------------------------------------------------------- */
function ReportsView({ monthYm, setMonthYm }) {
  const { transactions, categories } = useData();
  const [expandedCategoryId, setExpandedCategoryId] = useState(null);
  const [selectedTrendYm, setSelectedTrendYm] = useState(monthYm);
  useEffect(() => { setSelectedTrendYm(monthYm); }, [monthYm]);

  const monthTx = useMemo(() => transactions.filter((t) => ymOf(t.date) === monthYm), [transactions, monthYm]);
  const expenseByCategory = useMemo(() => {
    const map = new Map();
    monthTx.filter((t) => t.type === 'expense').forEach((t) => {
      map.set(t.majorCategoryId, (map.get(t.majorCategoryId) || 0) + t.amount);
    });
    return Array.from(map.entries())
      .map(([id, value]) => ({ cat: getCategoryById(categories, id), value }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx, categories]);
  const expenseTotal = expenseByCategory.reduce((a, s) => a + s.value, 0);

  const subBreakdown = useMemo(() => {
    if (!expandedCategoryId) return null;
    const cat = getCategoryById(categories, expandedCategoryId);
    const map = new Map();
    monthTx.filter((t) => t.type === 'expense' && t.majorCategoryId === expandedCategoryId).forEach((t) => {
      const key = t.subCategoryId || '__none__';
      map.set(key, (map.get(key) || 0) + t.amount);
    });
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    const rows = Array.from(map.entries()).map(([subId, value]) => ({
      subId,
      name: subId === '__none__' ? '小分類なし' : (getSubName(cat, subId) || '小分類なし'),
      value,
      pct: total > 0 ? Math.round((value / total) * 100) : 0,
    })).sort((a, b) => b.value - a.value);
    return { cat, total, rows };
  }, [expandedCategoryId, monthTx, categories]);

  const last6 = useMemo(() => {
    const arr = [];
    for (let i = 5; i >= 0; i--) arr.push(addMonths(monthYm, -i));
    return arr.map((ym) => {
      const tx = transactions.filter((t) => ymOf(t.date) === ym);
      const inc = tx.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
      const exp = tx.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
      return { ym, inc, exp };
    });
  }, [transactions, monthYm]);
  const maxVal = Math.max(1, ...last6.map((m) => Math.max(m.inc, m.exp)));
  const sixMonthNet = last6.reduce((a, m) => a + (m.inc - m.exp), 0);
  const selectedTrendMonth = last6.find((m) => m.ym === selectedTrendYm) || last6[last6.length - 1];
  function barHeightPct(value) {
    if (value <= 0) return 0;
    return Math.max(4, (value / maxVal) * 100);
  }

  const lastMonthYm = addMonths(monthYm, -1);
  const lastYearYm = addMonths(monthYm, -12);
  function totalExpenseOf(ym) {
    return transactions.filter((t) => ymOf(t.date) === ym && t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  }
  const curExpense = totalExpenseOf(monthYm);
  const vsLastMonth = curExpense - totalExpenseOf(lastMonthYm);
  const vsLastYear = curExpense - totalExpenseOf(lastYearYm);

  return (
    <div>
      <div className="view-title">分析</div>
      <MonthSwitcher ym={monthYm} onChange={setMonthYm} max={todayYm()} />

      <div className="card">
        <div className="card-title"><span>カテゴリ別の内訳（支出）</span></div>
        {expenseTotal === 0 ? (
          <div className="budget-empty-hint">この月の支出データがありません</div>
        ) : (
          <div className="donut-wrap">
            <DonutChart segments={expenseByCategory.map((s) => ({ value: s.value, color: s.cat.color }))} />
            <div className="donut-legend">
              {expenseByCategory.slice(0, 6).map((s) => {
                const isOpen = expandedCategoryId === s.cat.id;
                return (
                  <React.Fragment key={s.cat.id}>
                    <button
                      type="button"
                      className={cx('legend-row', 'clickable', isOpen && 'expanded')}
                      onClick={() => setExpandedCategoryId(isOpen ? null : s.cat.id)}
                    >
                      <span className="legend-dot" style={{ background: s.cat.color }}></span>
                      <span className="legend-name">{s.cat.icon} {s.cat.name}</span>
                      <span className="legend-pct">{Math.round((s.value / expenseTotal) * 100)}%</span>
                      <span className="legend-caret">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && subBreakdown && (
                      subBreakdown.rows.length === 0 ? (
                        <div className="sub-breakdown-empty">小分類ごとの記録がありません</div>
                      ) : (
                        <div className="sub-breakdown">
                          {subBreakdown.rows.map((r) => (
                            <div className="sub-breakdown-row" key={r.subId}>
                              <span className="sub-name">{r.name}</span>
                              <span className="sub-bar-track"><span className="sub-bar-fill" style={{ width: r.pct + '%', background: s.cat.color }}></span></span>
                              <span className="sub-amount">{formatYen(r.value)}</span>
                              <span className="sub-pct">{r.pct}%</span>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title"><span>月ごとの推移（過去6ヶ月）</span></div>
        <div className="bar-chart">
          {last6.map((m) => (
            <button type="button" key={m.ym} className={cx('bar-col', selectedTrendYm === m.ym && 'selected')} onClick={() => setSelectedTrendYm(m.ym)}>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: '100%' }}>
                <div className="bar-shape" style={{ height: '100%' }}>
                  <div className="fill-income" style={{ height: barHeightPct(m.inc) + '%' }}></div>
                </div>
                <div className="bar-shape" style={{ height: '100%' }}>
                  <div className="fill-expense" style={{ height: barHeightPct(m.exp) + '%' }}></div>
                </div>
              </div>
              <div className="bar-label">{formatYmShort(m.ym)}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 700 }}>
          <span><span style={{ color: 'var(--color-income)' }}>■</span> 収入</span>
          <span><span style={{ color: 'var(--color-expense)' }}>■</span> 支出</span>
        </div>
        {selectedTrendMonth && (
          <div className="trend-detail">
            {formatYmLabel(selectedTrendMonth.ym)}：収入 <b>{formatYen(selectedTrendMonth.inc)}</b> ・ 支出 <b>{formatYen(selectedTrendMonth.exp)}</b>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title"><span>前月・前年同月との比較（支出）</span></div>
        <div className="compare-grid">
          <div className="compare-tile">
            <div className="cmp-label">前月比</div>
            <div className={cx('cmp-diff', vsLastMonth > 0 ? 'up' : vsLastMonth < 0 ? 'down' : '')}>
              {vsLastMonth === 0 ? '±0' : (vsLastMonth > 0 ? '+' : '') + formatYen(vsLastMonth)}
            </div>
          </div>
          <div className="compare-tile">
            <div className="cmp-label">前年同月比</div>
            <div className={cx('cmp-diff', vsLastYear > 0 ? 'up' : vsLastYear < 0 ? 'down' : '')}>
              {vsLastYear === 0 ? '±0' : (vsLastYear > 0 ? '+' : '') + formatYen(vsLastYear)}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><span>収支バランス（過去6ヶ月）</span></div>
        <div style={{ textAlign: 'center', padding: '6px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 700 }}>この6ヶ月の収支</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: sixMonthNet >= 0 ? 'var(--color-income)' : 'var(--color-expense)', marginTop: 4 }}>
            {sixMonthNet >= 0 ? '+' : ''}{formatYen(sixMonthNet)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   入力・編集シート
--------------------------------------------------------- */
function TransactionSheet({ initial, onClose }) {
  const { categories, saveTransaction, deleteTransaction, askConfirm } = useData();
  const isEdit = !!(initial && initial.id);
  const [type, setType] = useState(initial ? initial.type : 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [date, setDate] = useState(initial ? initial.date : todayStr());
  const [majorId, setMajorId] = useState(initial ? initial.majorCategoryId : null);
  const [subId, setSubId] = useState(initial ? initial.subCategoryId : null);
  const [memo, setMemo] = useState(initial ? (initial.memo || '') : '');

  const catsForType = categories.filter((c) => c.type === type).sort((a, b) => a.order - b.order);
  useEffect(() => {
    if (!catsForType.find((c) => c.id === majorId)) {
      setMajorId(catsForType[0] ? catsForType[0].id : null);
      setSubId(null);
    }
    // eslint-disable-next-line
  }, [type]);

  const activeCat = catsForType.find((c) => c.id === majorId);

  function handleSave() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { alert('金額を入力してください'); return; }
    if (!majorId) { alert('カテゴリを選んでください'); return; }
    const tx = {
      id: initial && initial.id ? initial.id : uuid(),
      type, amount: amt, date, majorCategoryId: majorId, subCategoryId: subId || null,
      memo: memo.trim(), recurringId: initial ? initial.recurringId : null,
      createdAt: initial ? initial.createdAt : nowIso(), updatedAt: nowIso()
    };
    saveTransaction(tx);
    onClose();
  }
  function handleDelete() {
    askConfirm({
      msg: 'この記録を削除しますか？',
      detail: '削除すると元に戻せません。',
      onConfirm: () => { deleteTransaction(initial.id); onClose(); }
    });
  }

  return (
    <Sheet title={isEdit ? '記録を編集' : '新しく記録する'} onClose={onClose}>
      <div className="type-toggle">
        <button className={cx(type === 'expense' && 'active expense')} onClick={() => setType('expense')}>支出</button>
        <button className={cx(type === 'income' && 'active income')} onClick={() => setType('income')}>収入</button>
      </div>

      <div className="amount-input-wrap">
        <span className="yen">¥</span>
        <input
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
          autoFocus
        />
      </div>

      <div className="field-label">日付</div>
      <input type="date" className="text-input" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />

      <div className="field-label">カテゴリ</div>
      <div className="cat-grid">
        {catsForType.map((c) => (
          <button key={c.id} type="button" className={cx('cat-tile', majorId === c.id && 'active')}
            onClick={() => { setMajorId(c.id); setSubId(null); }}>
            <span className="emoji">{c.icon}</span>
            <span className="name">{c.name}</span>
          </button>
        ))}
      </div>

      {activeCat && activeCat.subcategories && activeCat.subcategories.length > 0 && (
        <div className="sub-chip-row">
          <button className={cx('chip', !subId && 'active')} onClick={() => setSubId(null)}>指定なし</button>
          {activeCat.subcategories.map((s) => (
            <button key={s.id} className={cx('chip', subId === s.id && 'active')} onClick={() => setSubId(s.id)}>{s.name}</button>
          ))}
        </div>
      )}

      <div className="field-label">メモ（任意）</div>
      <input className="text-input" placeholder="例：スーパーで買い物" value={memo} onChange={(e) => setMemo(e.target.value)} />

      <button className="btn-primary" onClick={handleSave}>{isEdit ? '更新する' : '保存する'}</button>
      {isEdit && <button className="btn-text-danger" onClick={handleDelete}>この記録を削除</button>}
    </Sheet>
  );
}

/* ---------------------------------------------------------
   設定：カテゴリ管理
--------------------------------------------------------- */
function CategoryAddEdit({ type, editing, onClose }) {
  const { saveCategory } = useData();
  const [name, setName] = useState(editing ? editing.name : '');
  const [icon, setIcon] = useState(editing ? editing.icon : ICON_CHOICES[0]);
  const [color, setColor] = useState(editing ? editing.color : COLOR_CHOICES[0]);

  function handleSave() {
    if (!name.trim()) { alert('カテゴリ名を入力してください'); return; }
    const cat = editing ? Object.assign({}, editing, { name: name.trim(), icon, color })
      : { id: uuid(), type, name: name.trim(), icon, color, order: 999, isDefault: false, subcategories: [] };
    saveCategory(cat);
    onClose();
  }

  return (
    <Sheet title={editing ? 'カテゴリを編集' : '新しいカテゴリ'} onClose={onClose} center>
      <div className="field-label">名前</div>
      <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：ペット費" />
      <div className="field-label">アイコン</div>
      <div className="cat-grid">
        {ICON_CHOICES.map((ic) => (
          <button key={ic} type="button" className={cx('cat-tile', icon === ic && 'active')} onClick={() => setIcon(ic)}>
            <span className="emoji">{ic}</span>
          </button>
        ))}
      </div>
      <div className="field-label">カラー</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {COLOR_CHOICES.map((c) => (
          <button key={c} onClick={() => setColor(c)} style={{
            width: 34, height: 34, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--color-text)' : '3px solid transparent'
          }}></button>
        ))}
      </div>
      <button className="btn-primary" onClick={handleSave}>保存する</button>
    </Sheet>
  );
}

function CategoryManageSheet({ onClose }) {
  const { categories, saveCategory, deleteCategory, transactions, askConfirm } = useData();
  const [addForm, setAddForm] = useState(null); // {type, editing}
  const [newSubFor, setNewSubFor] = useState(null);
  const [newSubName, setNewSubName] = useState('');

  function renderGroup(type, label) {
    const list = categories.filter((c) => c.type === type).sort((a, b) => a.order - b.order);
    return (
      <div className="settings-group" key={type}>
        <div className="settings-group-title">{label}</div>
        {list.map((c) => {
          const usedCount = transactions.filter((t) => t.majorCategoryId === c.id).length;
          return (
            <div className="cat-manage-item" key={c.id}>
              <div className="cat-manage-top">
                <div className="emoji-badge" style={{ background: c.color + '33' }}>{c.icon}</div>
                <div className="name">{c.name}</div>
                <button className="icon-action-btn" onClick={() => setAddForm({ type, editing: c })}>✏️</button>
                <button className="icon-action-btn" onClick={() => askConfirm({
                  msg: `「${c.name}」を削除しますか？`,
                  detail: usedCount > 0 ? `このカテゴリを使った記録が${usedCount}件あります。記録は残りますが「削除済み」として表示されます。` : '',
                  onConfirm: () => deleteCategory(c.id)
                })}>🗑️</button>
              </div>
              <div className="cat-manage-subs">
                {(c.subcategories || []).map((s) => (
                  <div className="mini-chip" key={s.id}>
                    {s.name}
                    <button onClick={() => {
                      const updated = Object.assign({}, c, { subcategories: c.subcategories.filter((x) => x.id !== s.id) });
                      saveCategory(updated);
                    }}>✕</button>
                  </div>
                ))}
                {newSubFor === c.id ? (
                  <input className="text-input" style={{ width: 110, padding: '5px 10px', fontSize: 12 }} autoFocus
                    value={newSubName} placeholder="小分類名"
                    onChange={(e) => setNewSubName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newSubName.trim()) {
                        saveCategory(Object.assign({}, c, { subcategories: [...(c.subcategories || []), { id: uuid(), name: newSubName.trim() }] }));
                        setNewSubName(''); setNewSubFor(null);
                      }
                    }}
                    onBlur={() => { setNewSubFor(null); setNewSubName(''); }}
                  />
                ) : (
                  <button className="add-mini-chip" onClick={() => setNewSubFor(c.id)}>＋ 小分類を追加</button>
                )}
              </div>
            </div>
          );
        })}
        <button className="btn-secondary" onClick={() => setAddForm({ type, editing: null })}>＋ 新しい{label}カテゴリ</button>
      </div>
    );
  }

  return (
    <Sheet title="カテゴリ管理" onClose={onClose}>
      {renderGroup('expense', '支出')}
      {renderGroup('income', '収入')}
      {addForm && <CategoryAddEdit type={addForm.type} editing={addForm.editing} onClose={() => setAddForm(null)} />}
    </Sheet>
  );
}

/* ---------------------------------------------------------
   設定：予算管理
--------------------------------------------------------- */
function BudgetManageSheet({ onClose }) {
  const { categories, budgets, saveBudget } = useData();
  const expenseCats = categories.filter((c) => c.type === 'expense').sort((a, b) => a.order - b.order);
  const [values, setValues] = useState(() => {
    const init = {};
    expenseCats.forEach((c) => {
      const b = budgets.find((b) => b.majorCategoryId === c.id);
      init[c.id] = b ? String(b.amount) : '';
    });
    return init;
  });

  function handleSaveAll() {
    expenseCats.forEach((c) => {
      const amt = Number(values[c.id] || 0);
      saveBudget({ id: c.id, majorCategoryId: c.id, amount: amt });
    });
    onClose();
  }

  return (
    <Sheet title="カテゴリ別 月間予算" onClose={onClose}>
      <div className="budget-empty-hint" style={{ marginBottom: 10 }}>金額を入力したカテゴリだけ、ホーム画面で予算バーが表示されます。</div>
      {expenseCats.map((c) => (
        <div className="settings-row" key={c.id}>
          <div className="row-left"><span>{c.icon}</span><span>{c.name}</span></div>
          <input
            className="text-input"
            style={{ width: 130, textAlign: 'right' }}
            inputMode="numeric"
            placeholder="未設定"
            value={values[c.id]}
            onChange={(e) => setValues(Object.assign({}, values, { [c.id]: e.target.value.replace(/[^0-9]/g, '') }))}
          />
        </div>
      ))}
      <button className="btn-primary" onClick={handleSaveAll}>保存する</button>
    </Sheet>
  );
}

/* ---------------------------------------------------------
   設定：定期取引
--------------------------------------------------------- */
function RecurringAddEdit({ editing, onClose }) {
  const { categories, saveRecurring } = useData();
  const [type, setType] = useState(editing ? editing.type : 'expense');
  const [name, setName] = useState(editing ? editing.name : '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const catsForType = categories.filter((c) => c.type === type).sort((a, b) => a.order - b.order);
  const [majorId, setMajorId] = useState(editing ? editing.majorCategoryId : (catsForType[0] ? catsForType[0].id : null));
  const [subId, setSubId] = useState(editing ? editing.subCategoryId : null);
  const [day, setDay] = useState(editing ? editing.dayOfMonth : 1);
  const [startMonth, setStartMonth] = useState(editing ? editing.startMonth : todayYm());
  const [memo, setMemo] = useState(editing ? (editing.memo || '') : '');
  const activeCat = catsForType.find((c) => c.id === majorId);

  useEffect(() => {
    if (!catsForType.find((c) => c.id === majorId)) {
      setMajorId(catsForType[0] ? catsForType[0].id : null);
      setSubId(null);
    }
    // eslint-disable-next-line
  }, [type]);

  function handleSave() {
    const amt = Number(amount);
    if (!name.trim()) { alert('名前を入力してください'); return; }
    if (!amt || amt <= 0) { alert('金額を入力してください'); return; }
    if (!majorId) { alert('カテゴリを選んでください'); return; }
    const rule = {
      id: editing ? editing.id : uuid(),
      name: name.trim(), type, amount: amt,
      majorCategoryId: majorId, subCategoryId: subId || null, memo: memo.trim(),
      dayOfMonth: Number(day), startMonth, endMonth: editing ? editing.endMonth : null,
      active: editing ? editing.active : true,
      lastGeneratedMonth: editing ? editing.lastGeneratedMonth : null
    };
    saveRecurring(rule);
    onClose();
  }

  return (
    <Sheet title={editing ? '定期取引を編集' : '新しい定期取引'} onClose={onClose} center>
      <div className="type-toggle">
        <button className={cx(type === 'expense' && 'active expense')} onClick={() => setType('expense')}>支出</button>
        <button className={cx(type === 'income' && 'active income')} onClick={() => setType('income')}>収入</button>
      </div>
      <div className="field-label">名前</div>
      <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：家賃" />
      <div className="field-label">金額</div>
      <input className="text-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
      <div className="field-label">カテゴリ</div>
      <div className="cat-grid">
        {catsForType.map((c) => (
          <button key={c.id} type="button" className={cx('cat-tile', majorId === c.id && 'active')} onClick={() => { setMajorId(c.id); setSubId(null); }}>
            <span className="emoji">{c.icon}</span><span className="name">{c.name}</span>
          </button>
        ))}
      </div>
      {activeCat && activeCat.subcategories && activeCat.subcategories.length > 0 && (
        <div className="sub-chip-row">
          <button className={cx('chip', !subId && 'active')} onClick={() => setSubId(null)}>指定なし</button>
          {activeCat.subcategories.map((s) => (
            <button key={s.id} className={cx('chip', subId === s.id && 'active')} onClick={() => setSubId(s.id)}>{s.name}</button>
          ))}
        </div>
      )}
      <div className="field-label">毎月の支払日</div>
      <select className="select-input" value={day} onChange={(e) => setDay(e.target.value)}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}日</option>)}
      </select>
      <div className="field-label">開始月</div>
      <input type="month" className="text-input" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
      <div className="field-label">メモ（任意）</div>
      <input className="text-input" value={memo} onChange={(e) => setMemo(e.target.value)} />
      <button className="btn-primary" onClick={handleSave}>保存する</button>
    </Sheet>
  );
}

function RecurringManageSheet({ onClose }) {
  const { recurringRules, categories, saveRecurring, deleteRecurring, askConfirm } = useData();
  const [form, setForm] = useState(null); // {editing}|null, use 'new' string for new

  return (
    <Sheet title="定期取引（固定費）" onClose={onClose}>
      <div className="budget-empty-hint" style={{ marginBottom: 10 }}>家賃やサブスクなど、毎月決まった支払いを登録すると自動で記録されます。</div>
      {recurringRules.length === 0 && <div className="empty-state"><div className="emoji">🔁</div><div>まだ定期取引がありません</div></div>}
      {recurringRules.map((r) => {
        const cat = getCategoryById(categories, r.majorCategoryId);
        return (
          <div className="list-item-card" key={r.id} onClick={() => setForm({ editing: r })}>
            <div className="tx-icon" style={{ background: cat.color + '33' }}>{cat.icon}</div>
            <div className="main">
              <div className="title">{r.name} {!r.active && '（停止中）'}</div>
              <div className="sub">毎月{r.dayOfMonth}日・{cat.name}</div>
            </div>
            <div className="amount">{r.type === 'expense' ? '-' : '+'}{formatYen(r.amount)}</div>
          </div>
        );
      })}
      <button className="btn-secondary" onClick={() => setForm({ editing: null })}>＋ 新しい定期取引</button>

      {form && form.editing && (
        <div style={{ marginTop: 4 }}>
          <div className="settings-row">
            <div className="row-left">有効にする</div>
            <ToggleSwitch on={form.editing.active} onClick={() => saveRecurring(Object.assign({}, form.editing, { active: !form.editing.active }))} />
          </div>
          <button className="btn-text-danger" onClick={() => askConfirm({
            msg: `「${form.editing.name}」を削除しますか？`,
            detail: '過去に記録された分は履歴に残ります。今後の自動記録が停止します。',
            onConfirm: () => { deleteRecurring(form.editing.id); setForm(null); }
          })}>この定期取引を削除</button>
        </div>
      )}

      {form && <RecurringAddEdit editing={form.editing} onClose={() => setForm(null)} />}
    </Sheet>
  );
}

/* ---------------------------------------------------------
   設定：データ管理
--------------------------------------------------------- */
function DataManageSheet({ onClose }) {
  const { reloadAll, showToast, askConfirm } = useData();
  const fileInputRef = useRef(null);
  const [importMode, setImportMode] = useState(null); // holds parsed payload awaiting mode choice

  async function handleExportJson() {
    const payload = await KakeiboDB.exportAll();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const filename = `kakeibo-backup-${todayStr()}.json`;
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename)] })) {
      try {
        await navigator.share({ files: [new File([blob], filename, { type: 'application/json' })], title: '家計簿バックアップ' });
        return;
      } catch (e) { /* fallthrough to download */ }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast('JSONファイルを書き出しました');
  }

  async function handleExportCsv() {
    const tx = await KakeiboDB.getAll('transactions');
    const cats = await KakeiboDB.getAll('categories');
    const rows = [['日付', '種別', '大分類', '小分類', '金額', 'メモ']];
    tx.sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => {
      const cat = getCategoryById(cats, t.majorCategoryId);
      const sub = getSubName(cat, t.subCategoryId) || '';
      rows.push([t.date, t.type === 'expense' ? '支出' : '収入', cat.name, sub, t.amount, (t.memo || '').replace(/\n/g, ' ')]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `kakeibo-${todayStr()}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('CSVファイルを書き出しました');
  }

  function handleFileChosen(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        setImportMode(payload);
      } catch (err) {
        alert('ファイルの読み込みに失敗しました。正しいバックアップファイルか確認してください。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function doImport(mode) {
    await KakeiboDB.importAll(importMode, mode);
    setImportMode(null);
    await reloadAll();
    showToast('データを読み込みました');
    onClose();
  }

  return (
    <Sheet title="データ管理" onClose={onClose}>
      <div className="settings-group">
        <div className="settings-group-title">バックアップ</div>
        <div className="settings-row button" onClick={handleExportJson}><div className="row-left">📤 JSONをエクスポート</div><span className="chevron">›</span></div>
        <div className="settings-row button" onClick={handleExportCsv}><div className="row-left">📊 CSVをエクスポート（Excel用）</div><span className="chevron">›</span></div>
        <div className="settings-row button" onClick={() => fileInputRef.current.click()}><div className="row-left">📥 JSONを読み込む</div><span className="chevron">›</span></div>
        <input ref={fileInputRef} type="file" accept="application/json" className="hidden-input" onChange={handleFileChosen} />
      </div>
      <div className="settings-group">
        <div className="settings-group-title">危険な操作</div>
        <div className="settings-row danger" onClick={() => askConfirm({
          msg: '全データを削除しますか？',
          detail: 'すべての記録・カテゴリ・予算・定期取引が削除されます。この操作は元に戻せません。事前にバックアップをおすすめします。',
          okLabel: '削除する',
          onConfirm: async () => { await KakeiboDB.clearAll(); await KakeiboSeed.seedIfNeeded(); await reloadAll(); showToast('データを削除しました'); onClose(); }
        })}><div className="row-left">🗑️ 全データを削除</div></div>
      </div>

      {importMode && (
        <div className="sheet-overlay center" onClick={() => setImportMode(null)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="msg">読み込み方法を選んでください</div>
            <div className="detail">「置き換え」は今のデータを消して上書きします。「追加」は今のデータに新しい項目だけ足します。</div>
            <div className="btn-row">
              <button className="cancel" onClick={() => doImport('merge')}>追加する</button>
              <button className="ok" onClick={() => doImport('replace')}>置き換える</button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------
   設定：このアプリについて
--------------------------------------------------------- */
function AboutSheet({ onClose, onShowTutorial }) {
  return (
    <Sheet title="このアプリについて" onClose={onClose} center>
      <div style={{ textAlign: 'center', padding: '10px 0' }}>
        <div style={{ fontSize: 44 }}>💰</div>
        <div style={{ fontWeight: 800, fontSize: 17, marginTop: 8 }}>かんたん家計簿</div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>Version 1.0.0</div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.7, marginTop: 14 }}>
          データはすべてこの端末の中だけに保存されます。サーバーには送信されません。機種変更のときは「設定 &gt; データ管理」からJSONファイルをエクスポートし、新しい端末で読み込んでください。
        </p>
      </div>
      <button className="btn-primary" onClick={() => { onShowTutorial(); onClose(); }}>使い方ガイドをもう一度見る</button>
    </Sheet>
  );
}

/* ---------------------------------------------------------
   設定画面（トップ）
--------------------------------------------------------- */
function SettingsView({ onOpenPanel, theme, setTheme }) {
  return (
    <div>
      <div className="view-title">設定</div>

      <div className="settings-group">
        <div className="settings-group-title">見た目</div>
        <div className="settings-row">
          <div className="row-left">テーマ</div>
          <div className="theme-switch">
            {[['light', 'ライト'], ['dark', 'ダーク'], ['system', '自動']].map(([k, l]) => (
              <button key={k} className={cx(theme === k && 'active')} onClick={() => setTheme(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">家計簿の設定</div>
        <div className="settings-row button" onClick={() => onOpenPanel('categories')}>
          <div className="row-left">🏷️ カテゴリ管理</div><span className="chevron">›</span>
        </div>
        <div className="settings-row button" onClick={() => onOpenPanel('budgets')}>
          <div className="row-left">🎯 予算の設定</div><span className="chevron">›</span>
        </div>
        <div className="settings-row button" onClick={() => onOpenPanel('recurring')}>
          <div className="row-left">🔁 定期取引（固定費）</div><span className="chevron">›</span>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">データ</div>
        <div className="settings-row button" onClick={() => onOpenPanel('data')}>
          <div className="row-left">💾 バックアップ・復元</div><span className="chevron">›</span>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">その他</div>
        <div className="settings-row button" onClick={() => onOpenPanel('about')}>
          <div className="row-left">ℹ️ このアプリについて</div><span className="chevron">›</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   ボトムナビ
--------------------------------------------------------- */
function BottomNav({ tab, setTab, onAdd }) {
  const items = [
    { key: 'home', label: 'ホーム', emoji: '🏠' },
    { key: 'history', label: '履歴', emoji: '🧾' },
    { key: 'fab' },
    { key: 'reports', label: '分析', emoji: '📊' },
    { key: 'settings', label: '設定', emoji: '⚙️' },
  ];
  return (
    <nav className="bottom-nav">
      {items.map((it) => it.key === 'fab' ? (
        <button key="fab" className="nav-fab" onClick={onAdd} aria-label="記録を追加">＋</button>
      ) : (
        <button key={it.key} className={cx('nav-btn', tab === it.key && 'active')} onClick={() => setTab(it.key)}>
          <span className="nav-emoji">{it.emoji}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ---------------------------------------------------------
   ルートアプリ
--------------------------------------------------------- */
function App() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recurringRules, setRecurringRules] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [theme, setThemeState] = useState('system');
  const [tutorialSeen, setTutorialSeen] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);

  const [tab, setTabRaw] = useState('home');
  const [monthYm, setMonthYm] = useState(todayYm());
  const [sheet, setSheet] = useState(null); // {kind:'tx', tx} | null
  const [panel, setPanel] = useState(null); // 'categories'|'budgets'|'recurring'|'data'|'about'
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  function setTab(next) {
    if (next === 'settings-budgets') { setTabRaw('settings'); setPanel('budgets'); return; }
    setTabRaw(next);
  }

  const showToast = useCallback((msg) => {
    const id = uuid();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);
  const askConfirm = useCallback((opts) => setConfirmState(opts), []);

  const reloadAll = useCallback(async () => {
    const [tx, cats, rules, budgs, settingsArr] = await Promise.all([
      KakeiboDB.getAll('transactions'),
      KakeiboDB.getAll('categories'),
      KakeiboDB.getAll('recurringRules'),
      KakeiboDB.getAll('budgets'),
      KakeiboDB.getAll('settings'),
    ]);
    setTransactions(tx);
    setCategories(cats.sort((a, b) => a.order - b.order));
    setRecurringRules(rules);
    setBudgets(budgs);
    const settingsMap = {};
    settingsArr.forEach((s) => { settingsMap[s.key] = s.value; });
    setThemeState(settingsMap.theme || 'system');
    setTutorialSeen(!!settingsMap.tutorialSeen);
    return { tx, cats, rules, budgs };
  }, []);

  useEffect(() => {
    (async () => {
      await KakeiboSeed.seedIfNeeded();
      let tx = await KakeiboDB.getAll('transactions');
      let rules = await KakeiboDB.getAll('recurringRules');
      const { newTx, updatedRules } = generateRecurringInstances(rules, tx);
      if (newTx.length) await KakeiboDB.bulkPut('transactions', newTx);
      if (updatedRules.length) await KakeiboDB.bulkPut('recurringRules', updatedRules);
      await reloadAll();
      const settingsArr = await KakeiboDB.getAll('settings');
      const seenFlag = settingsArr.find((s) => s.key === 'tutorialSeen');
      if (!seenFlag || !seenFlag.value) setShowTutorial(true);
      setLoading(false);
    })();
  }, []);

  // テーマ適用
  useEffect(() => {
    function apply() {
      let resolved = theme;
      if (theme === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', resolved);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#1D1A17' : '#FFF8EE');
    }
    apply();
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  function setTheme(next) {
    setThemeState(next);
    KakeiboDB.put('settings', { key: 'theme', value: next });
  }
  function dismissTutorial() {
    setShowTutorial(false);
    KakeiboDB.put('settings', { key: 'tutorialSeen', value: true });
  }

  const saveTransaction = useCallback(async (tx) => {
    await KakeiboDB.put('transactions', tx);
    setTransactions((list) => {
      const exists = list.some((t) => t.id === tx.id);
      return exists ? list.map((t) => (t.id === tx.id ? tx : t)) : [...list, tx];
    });
    showToast('記録しました');
  }, [showToast]);
  const deleteTransaction = useCallback(async (id) => {
    await KakeiboDB.delete('transactions', id);
    setTransactions((list) => list.filter((t) => t.id !== id));
    showToast('削除しました');
  }, [showToast]);
  const saveCategory = useCallback(async (cat) => {
    await KakeiboDB.put('categories', cat);
    setCategories((list) => {
      const exists = list.some((c) => c.id === cat.id);
      const next = exists ? list.map((c) => (c.id === cat.id ? cat : c)) : [...list, cat];
      return next.sort((a, b) => a.order - b.order);
    });
  }, []);
  const deleteCategory = useCallback(async (id) => {
    await KakeiboDB.delete('categories', id);
    await KakeiboDB.delete('budgets', id);
    setCategories((list) => list.filter((c) => c.id !== id));
    setBudgets((list) => list.filter((b) => b.majorCategoryId !== id));
    showToast('カテゴリを削除しました');
  }, [showToast]);
  const saveBudget = useCallback(async (b) => {
    await KakeiboDB.put('budgets', b);
    setBudgets((list) => {
      const exists = list.some((x) => x.id === b.id);
      return exists ? list.map((x) => (x.id === b.id ? b : x)) : [...list, b];
    });
  }, []);
  const saveRecurring = useCallback(async (r) => {
    // 保存直後に「今月分まで」を即時生成し、次回リロードを待たずに反映する
    const currentTx = await KakeiboDB.getAll('transactions');
    const { newTx, updatedRules } = generateRecurringInstances([r], currentTx);
    const finalRule = updatedRules[0] || r;
    await KakeiboDB.put('recurringRules', finalRule);
    if (newTx.length) await KakeiboDB.bulkPut('transactions', newTx);
    setRecurringRules((list) => {
      const exists = list.some((x) => x.id === finalRule.id);
      return exists ? list.map((x) => (x.id === finalRule.id ? finalRule : x)) : [...list, finalRule];
    });
    if (newTx.length) setTransactions((list) => [...list, ...newTx]);
  }, []);
  const deleteRecurring = useCallback(async (id) => {
    await KakeiboDB.delete('recurringRules', id);
    setRecurringRules((list) => list.filter((r) => r.id !== id));
    showToast('削除しました');
  }, [showToast]);

  const ctxValue = {
    transactions, categories, recurringRules, budgets,
    saveTransaction, deleteTransaction, saveCategory, deleteCategory,
    saveBudget, saveRecurring, deleteRecurring,
    reloadAll, showToast, askConfirm, setTab,
  };

  if (loading) return <LoadingScreen />;

  const headerTitles = { home: 'かんたん家計簿', history: 'かんたん家計簿', reports: 'かんたん家計簿', settings: 'かんたん家計簿' };

  return (
    <DataContext.Provider value={ctxValue}>
      <header className="app-header">
        <h1>💰 かんたん家計簿</h1>
      </header>
      <main className="app-main">
        {tab === 'home' && <HomeView monthYm={monthYm} setMonthYm={setMonthYm} onEditTx={(tx) => setSheet({ tx })} />}
        {tab === 'history' && <HistoryView onEditTx={(tx) => setSheet({ tx })} />}
        {tab === 'reports' && <ReportsView monthYm={monthYm} setMonthYm={setMonthYm} />}
        {tab === 'settings' && <SettingsView onOpenPanel={setPanel} theme={theme} setTheme={setTheme} />}
      </main>
      <BottomNav tab={tab} setTab={setTabRaw} onAdd={() => setSheet({ tx: null })} />

      {sheet && <TransactionSheet initial={sheet.tx} onClose={() => setSheet(null)} />}
      {panel === 'categories' && <CategoryManageSheet onClose={() => setPanel(null)} />}
      {panel === 'budgets' && <BudgetManageSheet onClose={() => setPanel(null)} />}
      {panel === 'recurring' && <RecurringManageSheet onClose={() => setPanel(null)} />}
      {panel === 'data' && <DataManageSheet onClose={() => setPanel(null)} />}
      {panel === 'about' && <AboutSheet onClose={() => setPanel(null)} onShowTutorial={() => setShowTutorial(true)} />}

      {showTutorial && <Tutorial onDone={dismissTutorial} />}
      <Toast toasts={toasts} />
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </DataContext.Provider>
  );
}

/* ---------------------------------------------------------
   マウント & Service Worker 登録
--------------------------------------------------------- */
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* file://等では失敗しても無視 */ });
  });
}
