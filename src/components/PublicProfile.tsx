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
import usePageMeta from "@/hooks/usePageMeta";
import useProfile from "@/hooks/useProfile";
import { pageMeta, playerMeta } from "@/lib/pageMeta";
import { recapPath } from "@/lib/routes";

const PublicProfile = ({ discordId }: { discordId: string }) => {
  const state = useProfile(discordId);
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

  const { name, image, stats, gamesPlayed } = state.profile;

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
          <TopGamesByYear topByYear={stats.topByYear} />
        </>
      ) : (
        <Text c="dimmed">No scores are linked to this member yet.</Text>
      )}
    </Stack>
  );
};

export default PublicProfile;
