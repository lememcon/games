import { Paper, Text } from "@mantine/core";

const StatTile = ({ label, value }: { label: string; value: string }) => (
  <Paper withBorder p="sm" ta="center">
    <Text fw={700} size="xl">
      {value}
    </Text>
    <Text size="xs" c="dimmed">
      {label}
    </Text>
  </Paper>
);

export default StatTile;
