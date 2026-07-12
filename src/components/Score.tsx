import { useMantineTheme } from "@mantine/core";

import { normalized_score, score_color, score_icon } from "@/util";

const Score = ({ score, max }: { score: number; max: number }) => {
  const theme = useMantineTheme();
  const normalized = normalized_score(score, max);
  const Icon = score_icon(normalized);
  const color = score_color(theme, normalized);

  return (
    <div style={{ display: "flex" }}>
      <Icon strokeWidth={3} style={{ color }} />
      {normalized_score(score, max)}
    </div>
  );
};

export default Score;
