import { useLocation } from "wouter";

import FloatingCovers from "@/components/FloatingCovers";
import useBackdropCovers from "@/hooks/useBackdropCovers";

/** Drifting game covers behind every signed-in page. */
const PageBackdrop = () => {
  const [location] = useLocation();
  const { pool, preferred, weights, covers } = useBackdropCovers(location);
  return (
    <FloatingCovers
      covers={covers}
      pool={pool}
      preferred={preferred}
      weights={weights}
    />
  );
};

export default PageBackdrop;
