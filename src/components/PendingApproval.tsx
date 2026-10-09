import { useState } from "react";

import { Badge, Button, Group, Stack, Text, Title } from "@mantine/core";

import { signOut } from "@/lib/auth";

interface PendingApprovalProps {
  name: string;
  onCheckAgain: () => void;
  checking?: boolean;
}

const PendingApproval = ({
  name,
  onCheckAgain,
  checking,
}: PendingApprovalProps) => {
  const [failed, setFailed] = useState(false);

  const handleSignOut = async () => {
    setFailed(false);
    try {
      await signOut();
      window.location.reload();
    } catch {
      setFailed(true);
    }
  };

  return (
    <Stack align="center" gap="xs" mt="xl" px="md">
      <Title order={2}>You&apos;re signed in, waiting for approval</Title>
      <Text c="dimmed" ta="center">
        Hi {name}. An admin needs to approve your account before you can see the
        scores. Ask Kelsin or Waymost on Discord.
      </Text>
      <Badge>Pending approval</Badge>
      <Group>
        <Button variant="light" onClick={onCheckAgain} disabled={checking}>
          Check again
        </Button>
        <Button variant="subtle" onClick={handleSignOut}>
          Sign out
        </Button>
      </Group>
      {failed && (
        <Text c="red" role="alert">
          Couldn&apos;t sign out. Try again.
        </Text>
      )}
    </Stack>
  );
};

export default PendingApproval;
