"use client";

import { useState, useEffect, useCallback, useLayoutEffect } from "react";

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useLayoutEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

// --- Data Types ---

interface ReadStats {
  today: {
    total: number;
    new_words: { total: number; trending: number; queries: number; github: number };
    info: { total: number; reddit: number; hn: number; technews: number };
  };
  heatmap: { date: string; count: number }[];
  cumulative: { total_reads: number; streak: number; best_day: number };
  goals: { total: number; new_words: number; info: number };
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-secondary)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 510,
            color: total >= goal ? "var(--accent-green-bright)" : "var(--text-tertiary)",
          }}
        >
          {total}/{goal}
        </span>
      </div>
      <div
        title={segments
          .filter((s) => s.value > 0)
          .map((s) => `${s.name}: ${s.value}`)
          .join("\n")}
        style={{
          height: 8,
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-full)",
          overflow: "hidden",
        }}
      >
        {total > 0 && (
          <div
            style={{
              display: "flex",
              height: "100%",
              width: `${pct}%`,
              borderRadius: "var(--radius-full)",
              transition: "width 0.4s ease",
            }}
          >
            {segments.map((seg) =>
              seg.value > 0 ? (
                <div
                  key={seg.name}
                  style={{
                    flex: seg.value,
                    background:
                      total >= goal
                        ? "var(--accent-green-bright)"
                        : seg.color,
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

// --- Progress Ring (SVG) ---

function ProgressRing({
  size,
  strokeWidth,
  progress,
  strokeColor,
  trackColor,
  children,
}: {
  size: number;
  strokeWidth: number;
  progress: number; // 0-1
  strokeColor: string;
  trackColor: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference * (1 - Math.min(progress, 1));

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease" }}
        />
      </svg>
      {children && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// --- Heatmap ---

const WEEKDAY_LABELS = ["", "一", "二", "三", "四", "五", "六"];
const HEATMAP_LEVELS = [
  { min: 0, color: "var(--bg-elevated)", border: "var(--border-subtle)" },
  { min: 0.01, max: 0.25, color: "rgba(94, 106, 210, 0.15)" },
  { min: 0.26, max: 0.5, color: "rgba(94, 106, 210, 0.35)" },
  { min: 0.51, max: 0.99, color: "rgba(94, 106, 210, 0.6)" },
  { min: 1, color: "var(--accent-blue)" },
];

function getHeatLevel(count: number, goal: number) {
  const ratio = goal > 0 ? count / goal : 0;
  if (count === 0) return HEATMAP_LEVELS[0];
  if (ratio < 0.26) return HEATMAP_LEVELS[1];
  if (ratio < 0.51) return HEATMAP_LEVELS[2];
  if (ratio < 1) return HEATMAP_LEVELS[3];
  return HEATMAP_LEVELS[4];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function Heatmap({
  data,
  goal,
}: {
  data: { date: string; count: number }[];
  goal: number;
}) {
  const weeks: { date: string; count: number; row: number }[][] = [];
  let currentWeek: { date: string; count: number; row: number }[] = [];

  for (const entry of data) {
    const dow = new Date(entry.date + "T00:00:00").getDay();
    const row = dow === 0 ? 6 : dow - 1;
    currentWeek.push({ ...entry, row });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 2,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            height: 7 * 11 + 6 * 2,
            justifyContent: "space-between",
            marginRight: 4,
          }}
        >
          {[1, 3, 5].map((rowIdx) => (
            <span
              key={rowIdx}
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                color: "var(--text-quaternary)",
                lineHeight: "11px",
                height: 11,
                display: "flex",
                alignItems: "center",
              }}
            >
              {WEEKDAY_LABELS[rowIdx]}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 2 }}>
          {weeks.map((week, wi) => (
            <div
              key={wi}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {Array.from({ length: 7 }).map((_, rowIdx) => {
                const cell = week.find((c) => c.row === rowIdx);
                const count = cell?.count ?? 0;
                const level = getHeatLevel(count, goal);
                const dateLabel = cell ? formatDateLabel(cell.date) : "";

                return (
                  <div
                    key={rowIdx}
                    title={count > 0 ? `${dateLabel} · ${count}条` : dateLabel}
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 2,
                      background: level.color,
                      border:
                        level.border
                          ? `1px solid ${level.border}`
                          : "1px solid transparent",
                      transition: "background 0.2s ease",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- AchievementSummary (exported pill bar) ---

export function AchievementSummary() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<ReadStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/read-stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Failed to fetch read stats:", e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => {
    if (!open) fetchStats();
  }, [open, fetchStats]);

  const total = stats?.today.total ?? 0;
  const goal = stats?.goals.total ?? 40;
  const progress = goal > 0 ? total / goal : 0;
  const goalMet = total >= goal;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px 4px 4px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-full)",
          cursor: "pointer",
          color: "var(--text-secondary)",
          fontSize: 13,
          fontWeight: 510,
          lineHeight: 1,
          transition: "background 0.15s ease, border-color 0.15s ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-elevated)";
          e.currentTarget.style.borderColor = "var(--border-prominent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--bg-card)";
          e.currentTarget.style.borderColor = "var(--border)";
        }}
        aria-label={`今日阅读进度 ${total}/${goal}`}
      >
        <ProgressRing
          size={22}
          strokeWidth={3}
          progress={progress}
          strokeColor={
            goalMet ? "var(--accent-green-bright)" : "var(--accent-blue)"
          }
          trackColor="var(--border-subtle)"
        />
        <span>今日 {total}/{goal}</span>
      </button>

      {open && (
        <DetailPanel
          stats={stats}
          onClose={() => setOpen(false)}
          onRefresh={fetchStats}
        />
      )}
    </>
  );
}

// --- Detail Panel (modal) ---

function DetailPanel({
  stats,
  onClose,
  onRefresh,
}: {
  stats: ReadStats | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const isMobile = useIsMobile();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Lock body scroll when open
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

  return (
    <>
      {/* Backdrop — separate fixed element, always covers full viewport */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(0, 0, 0, 0.7)",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: isMobile ? "fixed" : "fixed",
          top: isMobile ? "auto" : 0,
          bottom: isMobile ? 0 : 0,
          left: 0,
          right: 0,
          zIndex: 1001,
          display: "flex",
          alignItems: isMobile ? "flex-end" : "center",
          justifyContent: "center",
          padding: isMobile ? 0 : 16,
        }}
      >
        <div
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderTopLeftRadius: isMobile ? 16 : "var(--radius-xl)",
            borderTopRightRadius: isMobile ? 16 : "var(--radius-xl)",
            borderBottomLeftRadius: isMobile ? 0 : "var(--radius-xl)",
            borderBottomRightRadius: isMobile ? 0 : "var(--radius-xl)",
            maxWidth: 448,
            width: "100%",
            maxHeight: isMobile ? "85vh" : "90vh",
            overflowY: "auto",
            padding: isMobile ? "20px 20px 32px 20px" : 24,
            boxShadow: "var(--shadow-dialog)",
          }}
        >
          {/* Mobile drag handle */}
          {isMobile && (
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: "var(--border)",
                margin: "0 auto 16px auto",
              }}
            />
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: isMobile ? 12 : 16,
              right: isMobile ? 12 : 16,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              borderRadius: "var(--radius-sm)",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
              transition: "color 0.15s ease",
              zIndex: 2,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-tertiary)";
            }}
            aria-label="Close"
          >
            ✕
          </button>

          {/* Section A — Today's Progress */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <ProgressRing
              size={72}
              strokeWidth={5}
              progress={progress}
              strokeColor={
                goalMet ? "var(--accent-green-bright)" : "var(--accent-blue)"
              }
              trackColor="var(--border-subtle)"
            >
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 590,
                  color: "var(--text-primary)",
                  lineHeight: 1,
                }}
              >
                {total}
              </span>
            </ProgressRing>
            <span
              style={{
                fontSize: 13,
                color: "var(--text-tertiary)",
                fontWeight: 400,
              }}
            >
              / {goal} 今日已读
            </span>

            <div
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <StackedBar
                label="新词"
                segments={[
                  { name: "trending", value: nw?.trending ?? 0, color: "var(--accent-blue)" },
                  { name: "queries", value: nw?.queries ?? 0, color: "var(--accent-blue-hover)" },
                  { name: "github", value: nw?.github ?? 0, color: "var(--accent-blue-muted)" },
                ]}
                goal={nwGoal}
              />
              <StackedBar
                label="资讯"
                segments={[
                  { name: "reddit", value: info?.reddit ?? 0, color: "var(--accent-blue)" },
                  { name: "hn", value: info?.hn ?? 0, color: "var(--accent-blue-hover)" },
                  { name: "technews", value: info?.technews ?? 0, color: "var(--accent-blue-muted)" },
                ]}
                goal={infoGoal}
              />
            </div>
          </div>

          <div
            style={{
              height: 1,
              background: "var(--border-subtle)",
              margin: "0 0 20px 0",
            }}
          />

          {/* Section B — Heatmap */}
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-tertiary)",
                marginBottom: 12,
                fontWeight: 500,
              }}
            >
              近 12 周
            </div>
            <Heatmap data={heatmapData} goal={heatmapGoal} />
          </div>

          <div
            style={{
              height: 1,
              background: "var(--border-subtle)",
              margin: "0 0 20px 0",
            }}
          />

          {/* Section C — Cumulative Stats */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {[
              { value: cumulative?.total_reads ?? 0, label: "总已读" },
              { value: cumulative?.streak ?? 0, label: "连续天数" },
              { value: cumulative?.best_day ?? 0, label: "最高单日" },
            ].map((metric, idx) => (
              <div
                key={idx}
                style={{
                  flex: 1,
                  textAlign: "center",
                  borderRight:
                    idx < 2 ? "1px solid var(--border-subtle)" : "none",
                }}
              >
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    lineHeight: 1.2,
                  }}
                >
                  {metric.value}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-quaternary)",
                    marginTop: 2,
                  }}
                >
                  {metric.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
