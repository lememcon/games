import { useState } from "react";

import { Button, Stack, Text, Title } from "@mantine/core";

import { signInWithDiscord } from "@/lib/auth";

const SignIn = () => {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setBusy(true);
    setFailed(false);
    try {
      window.location.href = await signInWithDiscord();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <Stack align="center" gap="xs" mt="xl" px="md">
      <Title order={2}>Sign in to LememCon</Title>
      <Text c="dimmed" ta="center">
        Sign in with Discord to see the scores.
      </Text>
      <Button onClick={handleSignIn} loading={busy}>
        Sign in with Discord
      </Button>
      {failed && (
        <Text c="red" role="alert">
          Couldn&apos;t start sign-in. Try again.
        </Text>
      )}
    </Stack>
  );
};

export default SignIn;
