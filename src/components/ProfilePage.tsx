import { useState } from "react";
import { Link } from "wouter";

import {
  Alert,
  Avatar,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";

import useDisplayName from "@/hooks/useDisplayName";
import useMyVetoes from "@/hooks/useMyVetoes";
import { MAX_DISPLAY_NAME, displayNameError } from "@/lib/profile";
import { gamePath } from "@/lib/routes";
import type { ApprovedUser } from "@/types";

interface ProfilePageProps {
  user: ApprovedUser;
  // Refreshes the account after a save so the header shows the new name.
  onSaved: () => void;
}

const ProfilePage = ({ user, onSaved }: ProfilePageProps) => {
  const [value, setValue] = useState(user.displayName ?? "");
  const [saved, setSaved] = useState(false);
  const { save, saving, error } = useDisplayName(onSaved);
  const invalid = displayNameError(value);
  const myVetoes = useMyVetoes();
  const years = [...new Set(myVetoes.vetoes.map((v) => v.year))];

  const submit = async (displayName: string | null) => {
    setSaved(false);
    const result = await save(displayName);
    if (result) {
      setValue(result.displayName ?? "");
      setSaved(true);
    }
  };

  return (
    <Stack mt="md" maw={480}>
      <Title order={2}>Your profile</Title>
      <Group>
        <Avatar src={user.image} name={user.name} />
        <Text c="dimmed" size="sm">
          Signed in with Discord as {user.discordName}
        </Text>
      </Group>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) submit(value.trim() || null);
        }}
      >
        <Stack gap="xs">
          <TextInput
            label="Display name"
            description={`Used in the header and admin list instead of your Discord name, and in score tables once an admin links you to a player. Up to ${MAX_DISPLAY_NAME} characters.`}
            value={value}
            onChange={(e) => {
              setSaved(false);
              setValue(e.currentTarget.value);
            }}
            error={invalid}
          />
          <Group>
            <Button type="submit" loading={saving} disabled={!!invalid}>
              Save
            </Button>
            <Button
              variant="default"
              disabled={saving || user.displayName === null}
              onClick={() => submit(null)}
            >
              Use Discord name
            </Button>
            <Link href={`/players/${user.discordId}`}>View public profile</Link>
          </Group>
        </Stack>
      </form>
      {saved && <Alert color="green">Saved.</Alert>}
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <Title order={3}>Games you&apos;ve vetoed</Title>
      <Text c="dimmed" size="sm">
        These are left out of suggestions for any group that includes you, for
        that year only.
      </Text>
      {myVetoes.error && (
        <Alert color="red" role="alert">
          {myVetoes.error}
        </Alert>
      )}
      {!myVetoes.loading && myVetoes.vetoes.length === 0 && (
        <Text size="sm">You haven&apos;t vetoed any games.</Text>
      )}
      {years.map((year) => (
        <Stack key={year} gap={4}>
          <Text fw={600}>{year}</Text>
          {myVetoes.vetoes
            .filter((v) => v.year === year)
            .map((v) => (
              <Group key={v.bggId} justify="space-between" wrap="nowrap">
                <Link href={gamePath(year, v.bggId)}>
                  {v.name ?? `Game ${v.bggId}`}
                </Link>
                <Button
                  size="xs"
                  variant="default"
                  aria-label={`Undo veto of ${v.name ?? `Game ${v.bggId}`} in ${year}`}
                  onClick={() => myVetoes.clear(year, v.bggId)}
                >
                  Undo
                </Button>
              </Group>
            ))}
        </Stack>
      ))}
    </Stack>
  );
};

export default ProfilePage;
