import { useState } from "react";

import {
  Badge,
  Button,
  Center,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import FloatingCovers from "@/components/FloatingCovers";
import usePageMeta from "@/hooks/usePageMeta";
import { signOut } from "@/lib/auth";
import { pageMeta } from "@/lib/pageMeta";

interface PendingApprovalProps {
  name: string;
  onCheckAgain: () => void;
  checking?: boolean;
}

const META = pageMeta({ title: "Waiting for approval" });

const PendingApproval = ({
  name,
  onCheckAgain,
  checking,
}: PendingApprovalProps) => {
  const [failed, setFailed] = useState(false);
  usePageMeta(META);

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
    <div className="cover-page">
      <FloatingCovers />
      <Center mih="100vh" px="md">
        <Paper
          className="cover-card"
          withBorder
          shadow="md"
          radius="lg"
          p="xl"
          w="100%"
          maw={480}
        >
          <Stack align="center" gap="md">
            <Title order={2} ta="center">
              You&apos;re signed in, waiting for approval
            </Title>
            <Text c="dimmed" ta="center">
              Hi {name}. An admin needs to approve your account before you can
              see the scores. Ask Kelsin or Waymost on Discord.
            </Text>
            <Badge>Pending approval</Badge>
            <Group>
              <Button
                variant="light"
                onClick={onCheckAgain}
                disabled={checking}
              >
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
        </Paper>
      </Center>
    </div>
  );
};

export default PendingApproval;
