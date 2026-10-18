import { Link } from "wouter";

import {
  Alert,
  Anchor,
  Avatar,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import StatTile from "@/components/StatTile";
import TopGamesByYear from "@/components/TopGamesByYear";
import VetoRow from "@/components/VetoRow";
import useGames from "@/hooks/useGames";
import usePageMeta from "@/hooks/usePageMeta";
import useProfile from "@/hooks/useProfile";
import { pageMeta, playerMeta } from "@/lib/pageMeta";
import { groupYearVetoes } from "@/lib/profile";
import { recapPath } from "@/lib/routes";

const PublicProfile = ({ discordId }: { discordId: string }) => {
  const state = useProfile(discordId);
  const games = useGames();
  usePageMeta(
    state.status === "ready"
      ? playerMeta(state.profile.name, discordId)
      : pageMeta({
          title: state.status === "not_found" ? "Profile not found" : "Player",
        }),
  );

  if (state.status === "loading") return <Loader mt="md" />;
  if (state.status === "not_found") {
    return (
      <Alert color="gray" mt="md" title="Profile not found">
        There is no member with that profile.
      </Alert>
    );
  }
  if (state.status === "error") {
    return (
      <Alert color="red" mt="md" title="Couldn't load this profile">
        Refresh the page to try again.
      </Alert>
    );
  }

  const {
    name,
    image,
    stats,
    gamesPlayed,
    vetoes = [],
    yearVetoes = [],
  } = state.profile;

  return (
    <Stack mt="md">
      <Group>
        <Avatar src={image} name={name} size="lg" />
        <Title order={2} flex={1} miw={0} style={{ overflowWrap: "anywhere" }}>
          {name}
        </Title>
      </Group>
      <SimpleGrid cols={2}>
        {stats && <StatTile label="years of data" value={`${stats.years}`} />}
        <StatTile label="games played" value={`${gamesPlayed}`} />
      </SimpleGrid>
      {stats ? (
        <>
          {stats.topByYear.length > 0 && (
            <Stack gap="xs">
              <Title order={4}>Year in review</Title>
              <Group>
                {stats.topByYear.map(({ year }) => (
                  <Anchor
                    key={year}
                    component={Link}
                    href={recapPath(discordId, year)}
                  >
                    {year} in review
                  </Anchor>
                ))}
              </Group>
            </Stack>
          )}
          <TopGamesByYear topByYear={stats.topByYear} games={games.games} />
        </>
      ) : (
        <Text c="dimmed">No scores are linked to this member yet.</Text>
      )}
      {vetoes.length > 0 && (
        <Stack gap="calc(var(--mantine-spacing-xs) / 2)">
          <Title order={4}>Vetoed games</Title>
          {vetoes.map((v) => (
            <VetoRow
              key={v.bggId}
              bggId={v.bggId}
              name={v.name}
              image={v.image}
              cover={games.games[String(v.bggId)]?.cover}
            />
          ))}
        </Stack>
      )}
      {groupYearVetoes(yearVetoes).map(({ year, vetoes: rows }) => (
        <Stack key={year} gap="calc(var(--mantine-spacing-xs) / 2)">
          <Title order={4}>Vetoed in {year}</Title>
          {rows.map((v) => (
            <VetoRow
              key={v.bggId}
              bggId={v.bggId}
              year={year}
              name={v.name}
              image={v.image}
              cover={games.games[String(v.bggId)]?.cover}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  );
};

export default PublicProfile;
