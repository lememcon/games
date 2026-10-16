import {
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import GameCover from "@/components/GameCover";
import useUnplayedGames from "@/hooks/useUnplayedGames";
import type { GamesData } from "@/types";

// Games nobody has scored in any year. Quiet by design: hidden until there is
// something to show, and a failed fetch just leaves it hidden.
const UnplayedShelf = ({ games: gamesData }: { games: GamesData }) => {
  const games = useUnplayedGames();
  const [opened, { toggle }] = useDisclosure(false);
  if (games.length === 0) return null;

  return (
    <Paper withBorder p="sm" mt="md">
      <UnstyledButton onClick={toggle} aria-expanded={opened} w="100%">
        <Text fw={600}>Never played ({games.length})</Text>
      </UnstyledButton>
      <Collapse expanded={opened} transitionDuration={0}>
        <Stack gap="xs" mt="xs">
          {games.map((g) => (
            <Group key={g.bgg_id} gap="xs" wrap="nowrap">
              <GameCover
                bggId={g.bgg_id}
                image={gamesData[String(g.bgg_id)]?.image}
                ext={gamesData[String(g.bgg_id)]?.ext}
                cover={gamesData[String(g.bgg_id)]?.cover}
              />
              <Text
                size="sm"
                flex={1}
                miw={0}
                style={{ overflowWrap: "anywhere" }}
              >
                {g.name}
              </Text>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Paper>
  );
};

export default UnplayedShelf;
