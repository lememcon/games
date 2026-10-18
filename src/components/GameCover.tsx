import { useState } from "react";

import { resolveImage } from "@/lib/games";

interface GameCoverProps {
  bggId: number | string;
  image?: string | null;
  ext?: string | null;
  cover?: string | null;
}

// A 40px decorative cover, or a blank square when there is none or it fails.
const GameCover = ({ image, ext, cover: mirrored }: GameCoverProps) => {
  const [failed, setFailed] = useState(false);
  const cover = resolveImage({ image, ext, cover: mirrored ?? undefined });
  return (
    <div className="tray-cover tray-cover--xs">
      {cover && !failed ? (
        <img
          src={cover}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="tray-cover__blank" aria-hidden />
      )}
    </div>
  );
};

export default GameCover;
