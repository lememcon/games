import { useState } from "react";

import {
  Alert,
  Button,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import MyPlayerRange from "@/components/MyPlayerRange";
import useGames from "@/hooks/useGames";
import usePlayerOverrides from "@/hooks/usePlayerOverrides";
import {
  formatBounds,
  gameLabel,
  gameOptions,
  realBounds,
  validateMemberOverride,
} from "@/lib/games";

interface ProfileOverridesProps {
  discordId: string;
}

// The member's own player count overrides, with edit, reset and add.
const ProfileOverrides = ({ discordId }: ProfileOverridesProps) => {
  const games = useGames();
  const overrides = usePlayerOverrides();
  const [picked, setPicked] = useState<string | null>(null);
  const [min, setMin] = useState<number | string>("");
  const [max, setMax] = useState<number | string>("");

  const mine = overrides.all[discordId] ?? {};
  const ids = Object.keys(mine);
  const allowed = picked ? realBounds(games.games[picked]) : null;
  const checked = allowed ? validateMemberOverride(min, max, allowed) : null;
  const invalid = checked && "error" in checked ? checked.error : null;
  const range = checked && "range" in checked ? checked.range : null;

  const pick = (value: string | null) => {
    setPicked(value);
    const bounds = value ? realBounds(games.games[value]) : null;
    setMin(bounds?.min ?? "");
    setMax(bounds?.max ?? "");
  };

  const add = async () => {
    if (!picked || !range) return;
    await overrides.save(Number(picked), range);
    pick(null);
  };

  return (
    <Stack gap="xs">
      <Title order={3}>Your player counts</Title>
      <Text c="dimmed" size="sm">
        Games you only want suggested for certain group sizes. You can narrow a
        game&apos;s range, not widen it.
      </Text>
      {games.error && (
        <Alert color="red" role="alert">
          Couldn&apos;t load the game list.
        </Alert>
      )}
      {overrides.error && (
        <Alert color="red" role="alert">
          {overrides.error}
        </Alert>
      )}
      {(games.loading || overrides.loading) && <Loader size="sm" />}
      {!games.loading && !overrides.loading && !games.error && (
        <>
          {ids.length === 0 && (
            <Text size="sm">No player count overrides yet.</Text>
          )}
          {ids.map((id) => {
            const stored = mine[id];
            const name = gameLabel(games.games, id);
            const bounds = realBounds(games.games[id]);
            return (
              <Group key={id} justify="space-between" wrap="nowrap">
                <Text>{name}</Text>
                {bounds ? (
                  <MyPlayerRange
                    // Remount after a save or reset so the inputs show server state.
                    key={`${id}:${stored.min}-${stored.max}-${bounds.min}-${bounds.max}`}
                    compact
                    gameName={name}
                    allowed={bounds}
                    stored={stored}
                    saving={overrides.saving}
                    error={null}
                    onSave={(r) => overrides.save(Number(id), r)}
                    onReset={() => overrides.reset(Number(id))}
                  />
                ) : (
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm">{formatBounds(stored)}</Text>
                    <Button
                      size="xs"
                      variant="default"
                      aria-label={`Reset ${name}`}
                      disabled={overrides.saving}
                      onClick={() => overrides.reset(Number(id))}
                    >
                      Reset
                    </Button>
                  </Group>
                )}
              </Group>
            );
          })}
          <Group gap="xs" align="flex-start" wrap="nowrap">
            <Select
              aria-label="Game to override"
              placeholder="Search games..."
              searchable
              data={gameOptions(games.games, ids, true)}
              value={picked}
              onChange={pick}
              disabled={overrides.saving}
            />
            <NumberInput
              aria-label="New minimum players"
              w={70}
              min={1}
              max={99}
              allowDecimal={false}
              allowNegative={false}
              hideControls
              disabled={!picked}
              value={min}
              onChange={setMin}
            />
            <Text span pt={6}>
              -
            </Text>
            <NumberInput
              aria-label="New maximum players"
              w={70}
              min={1}
              max={99}
              allowDecimal={false}
              allowNegative={false}
              hideControls
              disabled={!picked}
              value={max}
              onChange={setMax}
            />
            <Button loading={overrides.saving} disabled={!range} onClick={add}>
              Add
            </Button>
          </Group>
          {invalid && (
            <Text size="xs" c="red">
              {invalid}
            </Text>
          )}
        </>
      )}
    </Stack>
  );
};

export default ProfileOverrides;
