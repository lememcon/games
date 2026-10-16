import { Link } from "wouter";

import { Stack, Text, Title, VisuallyHidden } from "@mantine/core";

import BackButton from "@/components/BackButton";
import PlayerName from "@/components/PlayerName";
import { resolveImage } from "@/lib/games";
import images from "@/lib/images";
import type { PlayedMap } from "@/lib/played";
import { gamePath, yearPath } from "@/lib/routes";
import { buildTopPicks } from "@/lib/topPicks";
import type {
  GamesData,
  PlayerGameScore,
  UnplayedPick,
  UnplayedPickOwner,
} from "@/types";

interface TopPicksProps {
  year: string;
  scores: PlayerGameScore[];
  allPlayed: Record<string, PlayedMap>;
  games: GamesData;
}

const list = {
  listStyle: "none",
  margin: 0,
  padding: 0,
} as const;

const Owner = ({ owner }: { owner: UnplayedPickOwner }) => (
  <li
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "calc(var(--mantine-spacing-xs) / 2)",
      fontSize: "0.8rem",
      maxWidth: "100%",
      ...(owner.played && {
        textDecoration: "line-through",
        opacity: 0.55,
      }),
    }}
  >
    <span
      aria-hidden
      style={{
        fontFamily: "var(--mantine-font-family-monospace)",
        fontVariantNumeric: "tabular-nums",
        color: "#7a736a",
      }}
    >
      #{owner.rank}
    </span>
    <PlayerName
      name={owner.name}
      discordId={owner.discordId}
      image={owner.discordImage}
    />
    <VisuallyHidden>
      {`${owner.name}'s #${owner.rank}${owner.played ? ", played" : ""}`}
    </VisuallyHidden>
  </li>
);

const TopPickRow = ({
  pick,
  year,
  image,
}: {
  pick: UnplayedPick;
  year: string;
  image: string | undefined;
}) => (
  <li className="tray-row" style={{ alignItems: "flex-start" }}>
    <div className="tray-cover tray-cover--sm">
      {image ? (
        <img src={image} alt="" />
      ) : (
        <div className="tray-cover__blank" aria-hidden />
      )}
    </div>
    <div className="tray-row__main">
      <Link href={gamePath(year, pick.bggId)} className="tray-name">
        {pick.game}
      </Link>
      <ul
        aria-label="Picked by"
        style={{
          ...list,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "calc(var(--mantine-spacing-xs) / 2) var(--mantine-spacing-sm)",
          marginTop: "0.25rem",
        }}
      >
        {pick.owners.map((o) => (
          <Owner key={o.discordId} owner={o} />
        ))}
      </ul>
    </div>
  </li>
);

// Games in a member's top picks that the member has not played, grouped by the
// best rank an unplayed member gives them.
const TopPicks = ({ year, scores, allPlayed, games }: TopPicksProps) => {
  const linked = scores.some((r) => r.discord_id);
  const tiers = buildTopPicks({ scores, allPlayed, games });

  return (
    <div>
      <BackButton href={yearPath(year)} label={`Back to ${year}`} />
      <Title order={2} mt="md" mb="xs">
        Top picks still unplayed
      </Title>
      {!linked ? (
        <Text c="dimmed">Sign in as an approved member to see top picks</Text>
      ) : tiers.length === 0 ? (
        <Text c="dimmed">No unplayed top picks</Text>
      ) : (
        <Stack gap="lg">
          {tiers.map((tier) => (
            <section key={tier.rank} aria-labelledby={`tier-${tier.rank}`}>
              <Title order={4} id={`tier-${tier.rank}`} mb="xs">
                {tier.rank === 1 ? "#1 picks" : `Top ${tier.rank}`}
              </Title>
              <ul className="tray-rows" style={list}>
                {tier.games.map((pick) => (
                  <TopPickRow
                    key={pick.bggId}
                    pick={pick}
                    year={year}
                    image={resolveImage(
                      String(pick.bggId),
                      games[String(pick.bggId)],
                      images,
                    )}
                  />
                ))}
              </ul>
            </section>
          ))}
        </Stack>
      )}
    </div>
  );
};

export default TopPicks;
