import { createElement } from "react";

import { useMantineTheme } from "@mantine/core";

import { normalized_score, score_color, score_icon, score_label } from "@/util";

const Score = ({ score, max }: { score: number; max: number }) => {
  const theme = useMantineTheme();
  const normalized = normalized_score(score, max);
  const color = score_color(theme, normalized);
  const label = score_label(normalized);

  return (
    <div
      aria-label={`${label}, ${normalized} out of 100`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "var(--mantine-font-family-monospace)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {createElement(score_icon(normalized), {
        size: 16,
        strokeWidth: 3,
        style: { color },
        "aria-hidden": true,
      })}
      <span
        style={{
          color,
          fontWeight: 700,
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      <span
        aria-hidden
        style={{
          flex: 1,
          minWidth: 48,
          height: 8,
          borderRadius: 4,
          background: "rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${Math.min(100, normalized)}%`,
            background: color,
            borderRadius: 4,
          }}
        />
      </span>
      <span>{normalized}</span>
    </div>
  );
};

export default Score;
