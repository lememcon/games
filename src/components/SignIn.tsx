import { useState } from "react";

import {
  Alert,
  Button,
  Center,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import logo from "@/assets/logo.png";
import { signInWithDiscord } from "@/lib/auth";
import { describeAuthError } from "@/lib/authError";

const DiscordIcon = () => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M20 4.5A17 17 0 0 0 15.8 3l-.5 1a15 15 0 0 0-4.6 0l-.5-1A17 17 0 0 0 4 4.5C1.3 8.5.6 12.4 1 16.2a17 17 0 0 0 5.2 2.6l1.1-1.8-1.7-.8.4-.3a12 12 0 0 0 10.2 0l.4.3-1.7.8 1.1 1.8a17 17 0 0 0 5.2-2.6c.5-4.4-.8-8.3-3.2-11.7ZM8.5 14c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
  </svg>
);

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
    <Center mih="70vh" px="md">
      <Paper withBorder shadow="md" radius="lg" p="xl" w="100%" maw={400}>
        <Stack align="center" gap="md">
          <img src={logo} width={120} height={136} alt="" />
          <Title order={2} ta="center">
            Sign in to LememCon
          </Title>
          <Text c="dimmed" ta="center">
            Sign in with Discord to see the scores.
          </Text>
          {authError && (
            <Alert
              w="100%"
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
          <Button
            fullWidth
            size="md"
            color="#5865F2"
            leftSection={<DiscordIcon />}
            onClick={handleSignIn}
            loading={busy}
          >
            Sign in with Discord
          </Button>
          {failed && (
            <Text c="red" role="alert">
              Couldn&apos;t start sign-in. Try again.
            </Text>
          )}
        </Stack>
      </Paper>
    </Center>
  );
};

export default SignIn;
