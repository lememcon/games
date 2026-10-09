import { useState } from "react";

import { Alert, Button, Stack, Text, Title } from "@mantine/core";

import { signInWithDiscord } from "@/lib/auth";
import { describeAuthError } from "@/lib/authError";

interface SignInProps {
  /** Code from a failed OAuth redirect (`?error=`), shown above the button. */
  errorCode?: string | null;
  onDismissError?: () => void;
}

const SignIn = ({ errorCode = null, onDismissError }: SignInProps) => {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const showAuthError = errorCode !== null && !dismissed && !failed;
  const authError = showAuthError ? describeAuthError(errorCode) : null;

  const handleSignIn = async () => {
    setBusy(true);
    setFailed(false);
    setDismissed(true);
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
      {authError && (
        <Alert
          color="red"
          role="alert"
          title={authError.title}
          withCloseButton
          closeButtonLabel="Dismiss"
          onClose={() => {
            setDismissed(true);
            onDismissError?.();
          }}
        >
          {authError.message}
        </Alert>
      )}
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
