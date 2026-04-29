"use client";

import { useState, useEffect, useCallback, useLayoutEffect } from "react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { createPortal } from "react-dom";

// --- Inject heatmap entrance animation keyframes ---
if (typeof document !== "undefined" && !document.getElementById("heatmap-keyframes")) {
  const style = document.createElement("style");
  style.id = "heatmap-keyframes";
  style.textContent = `
    @keyframes heatmapFadeIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .heatmap-cell { animation: none !important; opacity: 1 !important; }
    }
  `;
  document.head.appendChild(style);
}

// --- Data Types ---

type HeatmapDay = { date: string; count: number; by_type: Record<string, number> };

interface ReadStats {
  today: {
    total: number;
    new_words: { total: number; trending: number; queries: number; github: number };
    info: { total: number; reddit: number; hn: number; technews: number; ph: number; hf: number; ih: number };
  };
  heatmap: HeatmapDay[];
  cumulative: { total_reads: number; streak: number; best_day: number };
  goals: { total: number; new_words: number; info: number };
}

function useIsMobile(breakpoint = 640) {
  const [mobile, setMobile] = useState(false);
  useLayoutEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);
  return mobile;
}

// --- StackedBar ---

function StackedBar({
  segments,
  goal,
  label,
}: {
  segments: { name: string; value: number; color: string }[];
  goal: number;
  label: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const pct = Math.min((total / goal) * 100, 100);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 510, color: total >= goal ? "var(--accent-green-bright)" : "var(--text-tertiary)" }}>
          {total}/{goal}
        </span>
      </div>
      <div
        title={segments.filter((s) => s.value > 0).map((s) => `${s.name}: ${s.value}`).join("\n")}
        style={{ height: 8, background: "var(--bg-elevated)", borderRadius: "var(--radius-full)", overflow: "hidden" }}
      >
        {total > 0 && (
          <div style={{ display: "flex", height: "100%", width: `${pct}%`, borderRadius: "var(--radius-full)", transition: "width 0.4s ease" }}>
            {segments.map((seg) =>
              seg.value > 0 ? (
                <div
                  key={seg.name}
                  style={{
                    flex: seg.value,
                    background: total >= goal ? "var(--accent-green-bright)" : seg.color,
                    transition: "background 0.3s ease",
                  }}
                  title={`${seg.name}: ${seg.value}`}
                />
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Progress Ring ---

function ProgressRing({
  size, strokeWidth, progress, strokeColor, trackColor, children,
}: {
  size: number; strokeWidth: number; progress: number;
  strokeColor: string; trackColor: string; children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference * (1 - Math.min(progress, 1));

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={strokeColor}
          strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
        />
      </svg>
      {children && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// --- Heatmap ---

const HEATMAP_LEVELS = [
  { min: 0, color: "var(--bg-elevated)", border: "var(--border-subtle)" },
  { min: 0.01, max: 0.25, color: "rgba(94, 106, 210, 0.15)" },
  { min: 0.26, max: 0.5, color: "rgba(94, 106, 210, 0.35)" },
  { min: 0.51, max: 0.99, color: "rgba(94, 106, 210, 0.6)" },
  { min: 1, color: "var(--accent-blue)" },
];

function getHeatLevel(count: number, goal: number) {
  if (count === 0) return HEATMAP_LEVELS[0];
  const r = goal > 0 ? count / goal : 0;
  if (r < 0.26) return HEATMAP_LEVELS[1];
  if (r < 0.51) return HEATMAP_LEVELS[2];
  if (r < 1) return HEATMAP_LEVELS[3];
  return HEATMAP_LEVELS[4];
}

const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const WEEKDAY_NAMES = ["一", "", "三", "", "五", "", ""];
const WEEKDAY_LABELS_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const TYPE_LABELS: Record<string, string> = {
  trending: "Trending", queries: "Queries", github: "GitHub",
  reddit: "Reddit", hn: "HN", technews: "TechNews",
  ph: "Product Hunt", hf: "HuggingFace", ih: "Indie Hackers",
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// --- HeatmapTooltip ---

function HeatmapTooltip({ cell, goal, x, y }: {
  cell: HeatmapDay & { row: number };
  goal: number;
  x: number;
  y: number;
}) {
  if (cell.count === 0) return null;

  const d = new Date(cell.date + "T00:00:00");
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;
  const weekday = WEEKDAY_LABELS_CN[d.getDay()];

  const activeTypes = Object.entries(cell.by_type)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${TYPE_LABELS[k] || k}: ${v}`)
    .join(" · ");

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y - 8,
        transform: "translate(-50%, -100%)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "6px 10px",
        fontSize: 12,
        lineHeight: 1.5,
        color: "var(--text-primary)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 1002,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 2 }}>
        {dateStr} {weekday} · <span style={{ color: cell.count >= goal ? "var(--accent-green-bright)" : "var(--text-secondary)" }}>{cell.count} 条已读</span>
      </div>
      {activeTypes && (
        <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{activeTypes}</div>
      )}
    </div>
  );
}

// --- Heatmap ---

function Heatmap({ data, goal }: { data: HeatmapDay[]; goal: number }) {
  const [tooltip, setTooltip] = useState<{ cell: HeatmapDay & { row: number }; x: number; y: number } | null>(null);

  const weeks: (HeatmapDay & { row: number })[][] = [];
  let cur: (HeatmapDay & { row: number })[] = [];
  for (const entry of data) {
    const dow = new Date(entry.date + "T00:00:00").getDay();
    cur.push({ ...entry, row: dow === 0 ? 6 : dow - 1 });
    if (cur.length === 7) { weeks.push(cur); cur = []; }
  }
  if (cur.length > 0) weeks.push(cur);

  // Compute month labels: show label when month changes
  const monthLabels: (string | null)[] = [];
  let lastMonth = -1;
  for (const week of weeks) {
    const firstDay = week.reduce((a, b) => a.row <= b.row ? a : b);
    const month = new Date(firstDay.date + "T00:00:00").getMonth();
    if (month !== lastMonth) {
      monthLabels.push(MONTH_NAMES[month]);
      lastMonth = month;
    } else {
      monthLabels.push(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginRight: 4 }}>
        <span style={{ height: 12, lineHeight: "12px" }} />
        {WEEKDAY_NAMES.map((label, ri) => (
          <span key={ri} style={{ fontSize: 9, fontFamily: "monospace", color: "var(--text-quaternary)", lineHeight: "11px", height: 11, display: "flex", alignItems: "center" }}>
            {label}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 2 }} onMouseLeave={() => setTooltip(null)}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ height: 12, lineHeight: "12px", fontSize: 9, color: "var(--text-quaternary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {monthLabels[wi]}
            </div>
            {Array.from({ length: 7 }).map((_, ri) => {
              const cell = week.find((c) => c.row === ri);
              const count = cell?.count ?? 0;
              const level = getHeatLevel(count, goal);
              return (
                <div
                  key={ri}
                  className="heatmap-cell"
                  onMouseEnter={(e) => {
                    if (cell) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({ cell, x: rect.left + rect.width / 2, y: rect.top });
                    }
                  }}
                  style={{
                    width: 11, height: 11, borderRadius: 2, background: level.color,
                    border: level.border ? `1px solid ${level.border}` : "1px solid transparent",
                    transition: "background 0.2s ease",
                    animation: "heatmapFadeIn 0.3s ease forwards",
                    animationDelay: `${wi * 20}ms`,
                    opacity: 0,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {tooltip && <HeatmapTooltip cell={tooltip.cell} goal={goal} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}

// --- AchievementSummary (exported pill) ---

export function AchievementSummary() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<ReadStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/read-stats");
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error("Failed to fetch read stats:", e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 60_000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  useEffect(() => { if (!open) fetchStats(); }, [open, fetchStats]);

  const total = stats?.today.total ?? 0;
  const goal = stats?.goals.total ?? 40;
  const progress = goal > 0 ? total / goal : 0;
  const goalMet = total >= goal;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "4px 12px 4px 4px", background: "var(--bg-card)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-full)",
          cursor: "pointer", color: "var(--text-secondary)", fontSize: 13,
          fontWeight: 510, lineHeight: 1, transition: "background 0.15s ease, border-color 0.15s ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.borderColor = "var(--border-prominent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-card)"; e.currentTarget.style.borderColor = "var(--border)"; }}
        aria-label={`今日阅读进度 ${total}/${goal}`}
      >
        <ProgressRing size={22} strokeWidth={3} progress={progress}
          strokeColor={goalMet ? "var(--accent-green-bright)" : "var(--accent-blue)"}
          trackColor="var(--border-subtle)" />
        <span>今日 {total}/{goal}</span>
      </button>

      {open && <DetailPanel stats={stats} onClose={() => setOpen(false)} onRefresh={fetchStats} />}
    </>
  );
}

// --- Detail Panel ---

function DetailPanel({ stats, onClose, onRefresh }: {
  stats: ReadStats | null; onClose: () => void; onRefresh: () => void;
}) {
  const isMobile = useIsMobile();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const total = stats?.today.total ?? 0;
  const goal = stats?.goals.total ?? 40;
  const nwGoal = stats?.goals.new_words ?? 20;
  const infoGoal = stats?.goals.info ?? 20;
  const progress = goal > 0 ? total / goal : 0;
  const goalMet = total >= goal;
  const nw = stats?.today.new_words;
  const info = stats?.today.info;
  const cumulative = stats?.cumulative;
  const heatmapData = stats?.heatmap ?? [];
  const heatmapGoal = stats?.goals.total ?? 40;

  const content = (
    <>
      {isMobile && (
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 16px auto" }} />
      )}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: isMobile ? 12 : 16, right: isMobile ? 12 : 16,
          width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          color: "var(--text-tertiary)", cursor: "pointer", borderRadius: "var(--radius-sm)",
          fontSize: 16, lineHeight: 1, padding: 0, transition: "color 0.15s ease", zIndex: 2,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
        aria-label="Close"
      >
        ✕
      </button>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <ProgressRing size={72} strokeWidth={5} progress={progress}
          strokeColor={goalMet ? "var(--accent-green-bright)" : "var(--accent-blue)"}
          trackColor="var(--border-subtle)">
          <span style={{ fontSize: 24, fontWeight: 590, color: "var(--text-primary)", lineHeight: 1 }}>{total}</span>
        </ProgressRing>
        <span style={{ fontSize: 13, color: "var(--text-tertiary)", fontWeight: 400 }}>/ {goal} 今日已读</span>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
          <StackedBar label="新词" segments={[
            { name: "trending", value: nw?.trending ?? 0, color: "var(--accent-blue)" },
            { name: "queries", value: nw?.queries ?? 0, color: "var(--accent-blue-hover)" },
            { name: "github", value: nw?.github ?? 0, color: "var(--accent-blue-muted)" },
          ]} goal={nwGoal} />
          <StackedBar label="资讯" segments={[
            { name: "reddit", value: info?.reddit ?? 0, color: "var(--accent-blue)" },
            { name: "hn", value: info?.hn ?? 0, color: "var(--accent-blue-hover)" },
            { name: "technews", value: info?.technews ?? 0, color: "var(--accent-blue-muted)" },
            { name: "ph", value: info?.ph ?? 0, color: "#da552f" },
            { name: "hf", value: info?.hf ?? 0, color: "#ffbd45" },
            { name: "ih", value: info?.ih ?? 0, color: "#34d399" },
          ]} goal={infoGoal} />
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)", margin: "0 0 20px 0" }} />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 12, fontWeight: 500 }}>近 12 周</div>
        <Heatmap data={heatmapData} goal={heatmapGoal} />
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)", margin: "0 0 16px 0" }} />

      <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
        过去 12 周共阅读 <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{cumulative?.total_reads ?? 0}</span> 条
        {" · "}最长连续 <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{cumulative?.streak ?? 0}</span> 天
        {" · "}最高单日 <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{cumulative?.best_day ?? 0}</span> 条
      </div>
    </>
  );

  const mobileJSX = (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)" }}
      />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1001,
        background: "var(--bg-secondary)", border: "1px solid var(--border)",
        borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
        maxWidth: 448, width: "100%", maxHeight: "85vh", overflowY: "auto",
        padding: "20px 20px 32px 20px", boxShadow: "var(--shadow-dialog)",
        margin: "0 auto",
      }}>
        {content}
      </div>
    </>
  );

  const desktopJSX = (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div style={{
        position: "relative", background: "var(--bg-secondary)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)", maxWidth: 448, width: "100%", maxHeight: "90vh",
        overflowY: "auto", padding: 24, boxShadow: "var(--shadow-dialog)",
      }}>
        {content}
      </div>
    </div>
  );

  // Portal to <body> to escape ancestor backdrop-filter containment
  return createPortal(isMobile ? mobileJSX : desktopJSX, document.body);
}
