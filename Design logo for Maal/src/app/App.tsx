// Maal — Fintech brand showcase

type Cell = [col: number, row: number, shade: 'outer' | 'mid' | 'bright'];

const CELLS: Cell[] = [
  [0,0,'outer'],[6,0,'outer'],
  [0,1,'outer'],[1,1,'bright'],[5,1,'bright'],[6,1,'outer'],
  [0,2,'outer'],[2,2,'mid'],[4,2,'mid'],[6,2,'outer'],
  [0,3,'outer'],[3,3,'mid'],[6,3,'outer'],
  [0,4,'outer'],[6,4,'outer'],
  [0,5,'outer'],[6,5,'outer'],
  [0,6,'outer'],[6,6,'outer'],
];

// Green + gold = premium financial
const LIGHT = { outer: '#0A2918', mid: '#166534', bright: '#C9A84C', word: '#0A2918' };
const DARK  = { outer: '#1A4D2E', mid: '#22C55E', bright: '#E2C06A', word: '#F5F0E8' };

type Palette = typeof LIGHT;

function Mark({ cell, p }: { cell: number; p: Palette }) {
  const size = 7 * cell;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      {CELLS.map(([col, row, shade], i) => (
        <rect key={i} x={col * cell} y={row * cell} width={cell} height={cell} fill={p[shade]} />
      ))}
    </svg>
  );
}

function Lockup({ cell, fontSize, p }: { cell: number; fontSize: number; p: Palette }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(fontSize * 0.4) }}>
      <Mark cell={cell} p={p} />
      <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize, fontWeight: 500, color: p.word, letterSpacing: '-0.025em', lineHeight: 1 }}>
        maal
      </span>
    </div>
  );
}

// Mini sparkline SVG
function Sparkline({ up, color }: { up: boolean; color: string }) {
  const pts = up
    ? '0,28 8,24 16,26 24,18 32,20 40,12 48,8'
    : '0,8 8,14 16,10 24,20 32,16 40,24 48,28';
  return (
    <svg width={48} height={32} viewBox="0 0 48 32" fill="none">
      <polyline points={pts} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// Mini bar chart
function MiniBar({ heights, color }: { heights: number[]; color: string }) {
  const max = 40;
  return (
    <svg width={heights.length * 8} height={max + 2} viewBox={`0 0 ${heights.length * 8} ${max + 2}`} fill="none">
      {heights.map((h, i) => (
        <rect key={i} x={i * 8} y={max - h} width={5} height={h} fill={color} opacity={0.7 + i * 0.06} rx={1} />
      ))}
    </svg>
  );
}

const holdings = [
  { name: 'ASX 200', ticker: 'XJO', value: '$18,420', change: '+2.4%', up: true },
  { name: 'US Equity', ticker: 'SPY', value: '$9,310', change: '+0.8%', up: true },
  { name: 'Gold ETF', ticker: 'GLD', value: '$4,870', change: '-0.3%', up: false },
  { name: 'Cash', ticker: 'AUD', value: '$1,900', change: '+0.0%', up: true },
];

const transactions = [
  { label: 'Salary deposit', date: 'Today', amount: '+$4,200', up: true },
  { label: 'Rent', date: 'Yesterday', amount: '-$1,800', up: false },
  { label: 'ETF purchase', date: 'Mon', amount: '-$500', up: false },
  { label: 'Dividend received', date: 'Fri', amount: '+$84', up: true },
];

export default function App() {
  const GOLD = '#C9A84C';
  const FOREST = '#0A2918';
  const GREEN = '#166534';
  const NIGHT = '#060D08';
  const OFFWHITE = '#F9F6EF';

  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', background: '#fff', minHeight: '100vh', color: FOREST }}>

      {/* ── HERO ── */}
      <section style={{ background: NIGHT, padding: '56px 48px 64px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        <p style={{ fontSize: 10, letterSpacing: '0.18em', color: '#1A4D2E', textTransform: 'uppercase', marginBottom: 40, fontWeight: 500 }}>
          hellomaal.com · Financial Wellbeing
        </p>
        <Lockup cell={13} fontSize={52} p={DARK} />
        <p style={{ fontSize: 14, color: '#4ADE8055', marginTop: 24, letterSpacing: '0.04em', fontWeight: 400 }}>
          Grow your wealth, ethically.
        </p>
      </section>

      {/* ── MARKET TICKER STRIP ── */}
      <div style={{ background: '#0D1A12', borderBottom: '1px solid #1A3D28', padding: '10px 48px', display: 'flex', gap: 40, overflowX: 'auto' }}>
        {[
          { sym: 'BTC', val: '$98,420', chg: '+3.2%', up: true },
          { sym: 'ETH', val: '$3,810', chg: '+1.7%', up: true },
          { sym: 'ASX 200', val: '8,341', chg: '-0.4%', up: false },
          { sym: 'GOLD', val: '$3,287', chg: '+0.6%', up: true },
          { sym: 'AUD/USD', val: '0.6441', chg: '-0.2%', up: false },
          { sym: 'S&P 500', val: '5,912', chg: '+0.9%', up: true },
        ].map(({ sym, val, chg, up }) => (
          <div key={sym} style={{ display: 'flex', gap: 10, alignItems: 'center', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#4ADE80', letterSpacing: '0.06em' }}>{sym}</span>
            <span style={{ fontSize: 11, color: '#F5F0E8' }}>{val}</span>
            <span style={{ fontSize: 11, color: up ? '#4ADE80' : '#F87171' }}>{chg}</span>
          </div>
        ))}
      </div>

      {/* ── APP DASHBOARD MOCKUP ── */}
      <section style={{ background: OFFWHITE, padding: '40px 48px' }}>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 20 }}>
          Product context · Dashboard
        </p>

        {/* App shell */}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, overflow: 'hidden', maxWidth: 900 }}>

          {/* App top bar */}
          <div style={{ background: NIGHT, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Lockup cell={6} fontSize={24} p={DARK} />
            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#4ADE8066', fontWeight: 400 }}>
              {['Portfolio', 'Markets', 'Goals', 'Learn'].map(n => (
                <span key={n} style={{ cursor: 'pointer' }}>{n}</span>
              ))}
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: NIGHT }}>A</span>
            </div>
          </div>

          {/* Dashboard body */}
          <div style={{ padding: '28px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Net worth card */}
            <div style={{ background: NIGHT, borderRadius: 12, padding: 24, gridColumn: '1 / -1' }}>
              <p style={{ fontSize: 11, color: '#1A4D2E', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                Total Portfolio
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 40, fontWeight: 600, color: OFFWHITE, letterSpacing: '-0.03em', lineHeight: 1 }}>
                    $34,500<span style={{ fontSize: 20, color: '#4ADE8055', fontWeight: 400 }}>.00</span>
                  </p>
                  <p style={{ fontSize: 13, color: '#4ADE80', marginTop: 8 }}>↑ +$1,240 &nbsp;+3.7% this month</p>
                </div>
                {/* Mini area chart placeholder */}
                <svg width={160} height={56} viewBox="0 0 160 56" fill="none">
                  <polyline
                    points="0,48 20,40 40,44 60,30 80,34 100,20 120,22 140,10 160,4"
                    stroke={GOLD} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
                  />
                  <path
                    d="M0,48 20,40 40,44 60,30 80,34 100,20 120,22 140,10 160,4 V56 H0Z"
                    fill={GOLD} opacity={0.06}
                  />
                </svg>
              </div>
            </div>

            {/* Holdings */}
            <div style={{ background: '#F9F6EF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 16 }}>Holdings</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {holdings.map(({ name, ticker, value, change, up }) => (
                  <div key={ticker} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: up ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: up ? GREEN : '#DC2626' }}>{ticker.slice(0,3)}</span>
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: FOREST }}>{name}</p>
                        <p style={{ fontSize: 11, color: '#9CA3AF' }}>{ticker}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{value}</p>
                      <p style={{ fontSize: 11, color: up ? '#16A34A' : '#DC2626' }}>{change}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transactions */}
            <div style={{ background: '#F9F6EF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 16 }}>Recent</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {transactions.map(({ label, date, amount, up }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: up ? GOLD : '#9CA3AF', marginTop: 1 }} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 400, color: FOREST }}>{label}</p>
                        <p style={{ fontSize: 11, color: '#9CA3AF' }}>{date}</p>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: up ? '#16A34A' : FOREST }}>{amount}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Allocation donut (SVG) */}
            <div style={{ background: NIGHT, borderRadius: 12, padding: 20, gridColumn: '1 / -1', display: 'flex', gap: 32, alignItems: 'center' }}>
              {/* Simple donut rings */}
              <svg width={100} height={100} viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="none" stroke="#1A3D28" strokeWidth="16"/>
                <circle cx="50" cy="50" r="38" fill="none" stroke={GOLD} strokeWidth="16"
                  strokeDasharray={`${0.53 * 238.76} ${238.76}`} strokeDashoffset="0" strokeLinecap="butt"
                  transform="rotate(-90 50 50)"/>
                <circle cx="50" cy="50" r="38" fill="none" stroke="#22C55E" strokeWidth="16"
                  strokeDasharray={`${0.27 * 238.76} ${238.76}`} strokeDashoffset={`${-0.53 * 238.76}`} strokeLinecap="butt"
                  transform="rotate(-90 50 50)"/>
                <circle cx="50" cy="50" r="38" fill="none" stroke="#4ADE8066" strokeWidth="16"
                  strokeDasharray={`${0.14 * 238.76} ${238.76}`} strokeDashoffset={`${-0.80 * 238.76}`} strokeLinecap="butt"
                  transform="rotate(-90 50 50)"/>
                <text x="50" y="54" textAnchor="middle" fontSize="12" fontWeight="600" fill={OFFWHITE} fontFamily="DM Sans, sans-serif">53%</text>
              </svg>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1A4D2E', marginBottom: 12 }}>Allocation</p>
                {[
                  { label: 'ASX 200', pct: '53%', color: GOLD },
                  { label: 'US Equity', pct: '27%', color: '#22C55E' },
                  { label: 'Gold ETF', pct: '14%', color: '#4ADE8066' },
                  { label: 'Cash', pct: '6%', color: '#1A4D2E' },
                ].map(({ label, pct, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#4ADE8088', flex: 1 }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: OFFWHITE }}>{pct}</span>
                  </div>
                ))}
              </div>
              {/* Bar sparklines per asset */}
              <div style={{ display: 'flex', gap: 24 }}>
                {[
                  { label: 'ASX', data: [18,22,20,28,26,34,32], color: GOLD },
                  { label: 'US', data: [24,20,28,26,30,28,36], color: '#22C55E' },
                ].map(({ label, data, color }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <MiniBar heights={data} color={color} />
                    <p style={{ fontSize: 10, color: '#1A4D2E', marginTop: 6, letterSpacing: '0.06em' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ICON SIZES ── */}
      <section style={{ background: '#fff', padding: '40px 48px', display: 'flex', gap: 48, alignItems: 'flex-end' }}>
        {[
          { label: 'Primary', cell: 12, fontSize: 48 },
          { label: 'Medium', cell: 8, fontSize: 32 },
          { label: 'Small', cell: 6, fontSize: 24 },
        ].map(({ label, cell, fontSize }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <Lockup cell={cell} fontSize={fontSize} p={LIGHT} />
            <p style={{ fontSize: 10, color: '#9CA3AF', marginTop: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</p>
          </div>
        ))}
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: NIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mark cell={8} p={DARK} />
          </div>
          <p style={{ fontSize: 10, color: '#9CA3AF', marginTop: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>App icon</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: NIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mark cell={5} p={DARK} />
          </div>
          <p style={{ fontSize: 10, color: '#9CA3AF', marginTop: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Favicon</p>
        </div>
      </section>

      {/* ── PALETTE ── */}
      <section style={{ background: OFFWHITE, padding: '40px 48px 64px', borderTop: '1px solid #E5E7EB' }}>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 20 }}>Palette</p>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { hex: '#0A2918', name: 'Forest', role: 'Primary' },
            { hex: '#166534', name: 'Emerald', role: 'Secondary' },
            { hex: '#C9A84C', name: 'Gold', role: 'Accent · wealth' },
            { hex: '#060D08', name: 'Night', role: 'Dark surface' },
            { hex: '#F9F6EF', name: 'Parchment', role: 'Light surface' },
          ].map(({ hex, name, role }) => (
            <div key={hex} style={{ flex: 1 }}>
              <div style={{ height: 48, borderRadius: 8, background: hex, border: '1px solid #00000011' }} />
              <p style={{ fontSize: 12, fontWeight: 500, color: FOREST, marginTop: 10 }}>{name}</p>
              <p style={{ fontSize: 10, color: '#9CA3AF' }}>{hex}</p>
              <p style={{ fontSize: 10, color: '#9CA3AF' }}>{role}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
