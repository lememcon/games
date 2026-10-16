import { useLocation } from "wouter";

import FloatingCovers from "@/components/FloatingCovers";
import useBackdropCovers from "@/hooks/useBackdropCovers";
import type { ApprovedUser } from "@/types";

/** Drifting game covers behind every signed-in page. */
const PageBackdrop = ({ user }: { user: ApprovedUser }) => {
  const [location] = useLocation();
  const { pool, preferred } = useBackdropCovers(location, user.discordId);
  return <FloatingCovers pool={pool} preferred={preferred} />;
};

export default PageBackdrop;
