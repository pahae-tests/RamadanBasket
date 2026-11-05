import { fmtNumber } from "../lib/clientApi";

const ROW = 64;
const GAP = 12;
const WIDTH = 720;
const LEFT_W = 168;
const RIGHT_X = 468;
const RIGHT_W = WIDTH - RIGHT_X;

function clip(text, max) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default function SplitDiagram({ total, vendors }) {
  const rows = vendors.filter((v) => Number(v.qty) > 0);
  if (!rows.length || total <= 0) return null;
  const height = Math.max(rows.length * (ROW + GAP) - GAP, 140);
  const midY = height / 2;
  const leftH = Math.min(height, 120);
  const offset = (height - (rows.length * (ROW + GAP) - GAP)) / 2;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="h-auto w-full" role="img" aria-label="Schéma de la répartition des familles entre les vendeurs">
      <defs>
        <linearGradient id="splitFlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#118063" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#e0a12d" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="splitSource" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0a4a3b" />
          <stop offset="100%" stopColor="#118063" />
        </linearGradient>
      </defs>
      {rows.map((v, i) => {
        const cy = offset + i * (ROW + GAP) + ROW / 2;
        const w = Math.max(3, (Number(v.qty) / total) * leftH);
        const x1 = LEFT_W;
        const x2 = RIGHT_X;
        const cx = (x1 + x2) / 2;
        return <path key={`p-${v.id}`} d={`M ${x1} ${midY} C ${cx} ${midY}, ${cx} ${cy}, ${x2} ${cy}`} fill="none" stroke="url(#splitFlow)" strokeWidth={w} strokeLinecap="butt" opacity="0.55" />;
      })}
      <rect x="0" y={midY - leftH / 2} width={LEFT_W} height={leftH} rx="24" fill="url(#splitSource)" />
      <text x={LEFT_W / 2} y={midY - 4} textAnchor="middle" fill="#ffffff" fontSize="40" fontWeight="800">
        {fmtNumber(total)}
      </text>
      <text x={LEFT_W / 2} y={midY + 24} textAnchor="middle" fill="#bfeadb" fontSize="15" fontWeight="600">
        familles
      </text>
      {rows.map((v, i) => {
        const y = offset + i * (ROW + GAP);
        const share = Math.round((Number(v.qty) / total) * 100);
        return (
          <g key={`v-${v.id}`}>
            <rect x={RIGHT_X} y={y} width={RIGHT_W} height={ROW} rx="18" fill="#ffffff" stroke="#dbe5e1" />
            <rect x={RIGHT_X} y={y} width="6" height={ROW} rx="3" fill="#e0a12d" />
            <text x={RIGHT_X + 22} y={y + 27} fill="#052b23" fontSize="16" fontWeight="700">
              {clip(v.name, 20)}
            </text>
            <text x={RIGHT_X + 22} y={y + 48} fill="#78716c" fontSize="13">
              {share} % des familles
            </text>
            <text x={WIDTH - 20} y={y + 41} textAnchor="end" fill="#118063" fontSize="28" fontWeight="800">
              {fmtNumber(v.qty)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
