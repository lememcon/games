import { Collapse, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import useUnplayedGames from "@/hooks/useUnplayedGames";

// Games nobody has scored in any year. Quiet by design: hidden until there is
// something to show, and a failed fetch just leaves it hidden.
const UnplayedShelf = () => {
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
            <Text key={g.bgg_id} size="sm">
              {g.name}
            </Text>
          ))}
        </Stack>
      </Collapse>
    </Paper>
  );
};

export default UnplayedShelf;
