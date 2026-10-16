import { useState } from "react";
import { Link } from "wouter";

import {
  Alert,
  Avatar,
  Button,
  Group,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";

import ColorPicker from "@/components/ColorPicker";
import ProfileOverrides from "@/components/ProfileOverrides";
import ProfilePlayed from "@/components/ProfilePlayed";
import ProfileVetoes from "@/components/ProfileVetoes";
import ProfileYearVetoes from "@/components/ProfileYearVetoes";
import useDisplayName from "@/hooks/useDisplayName";
import useGames from "@/hooks/useGames";
import usePageMeta from "@/hooks/usePageMeta";
import { pageMeta } from "@/lib/pageMeta";
import { MAX_DISPLAY_NAME, displayNameError } from "@/lib/profile";
import type { ApprovedUser } from "@/types";

interface ProfilePageProps {
  user: ApprovedUser;
  // Refreshes the account after a save so the header shows the new name.
  onSaved: () => void;
  // Whether the floating covers show; saved on this device only.
  showBackdrop: boolean;
  onShowBackdropChange: (show: boolean) => void;
}

const META = pageMeta({ title: "Your profile" });

const ProfilePage = ({
  user,
  onSaved,
  showBackdrop,
  onShowBackdropChange,
}: ProfilePageProps) => {
  const [value, setValue] = useState(user.displayName ?? "");
  usePageMeta(META);
  const [saved, setSaved] = useState(false);
  const { save, saving, error } = useDisplayName(onSaved);
  const games = useGames();
  const invalid = displayNameError(value);

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
      <ColorPicker color={user.color ?? null} onSaved={onSaved} />
      <Switch
        label="Show floating game covers"
        description="Saved on this device only"
        checked={showBackdrop}
        onChange={(e) => onShowBackdropChange(e.currentTarget.checked)}
      />
      {saved && <Alert color="green">Saved.</Alert>}
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <ProfileOverrides discordId={user.discordId} games={games} />
      <ProfileVetoes games={games} />
      <ProfileYearVetoes games={games} />
      <ProfilePlayed />
    </Stack>
  );
};

export default ProfilePage;
