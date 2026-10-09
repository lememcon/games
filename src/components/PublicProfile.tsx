import { Link } from "wouter";

import {
  Alert,
  Avatar,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import StatTile from "@/components/StatTile";
import useProfile from "@/hooks/useProfile";
import { formatAvgRank, formatWinRate, ordinal } from "@/lib/profile";

const PublicProfile = ({ discordId }: { discordId: string }) => {
  const state = useProfile(discordId);

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

  const { name, image, stats } = state.profile;

  return (
    <Stack mt="md">
      <Group>
        <Avatar src={image} name={name} size="lg" />
        <Title order={2}>{name}</Title>
      </Group>
      {stats ? (
        <>
          <SimpleGrid cols={{ base: 2, sm: 5 }}>
            <StatTile label="games" value={`${stats.games}`} />
            <StatTile label="wins" value={`${stats.wins}`} />
            <StatTile label="win rate" value={formatWinRate(stats.winRate)} />
            <StatTile label="avg rank" value={formatAvgRank(stats.avgRank)} />
            <StatTile label="podiums" value={`${stats.podiums}`} />
          </SimpleGrid>
          <Title order={4}>Most played</Title>
          {stats.mostPlayed.map((g) => (
            <Text key={g.bggId}>
              <Link href={`/games/${g.bggId}`}>{g.game}</Link> {g.plays} plays,
              best {ordinal(g.bestRank)} ({g.bestScore})
            </Text>
          ))}
        </>
      ) : (
        <Text c="dimmed">No scores are linked to this member yet.</Text>
      )}
    </Stack>
  );
};

export default PublicProfile;
