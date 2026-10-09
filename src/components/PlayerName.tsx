import { useContext } from "react";
import { Link } from "wouter";

import { Avatar } from "@mantine/core";

import { PALETTE } from "@/lib/colors";
import { PlayerColorContext } from "@/lib/playerColors";

interface PlayerNameProps {
  name: string;
  // When set (approved viewers, linked players only), the name links to the
  // member's public profile.
  discordId?: string;
  // Avatar URL of the linked member; shown before the name of linked players.
  image?: string;
}

// A player's name in their assigned identity color.
const PlayerName = ({ name, discordId, image }: PlayerNameProps) => {
  const color = useContext(PlayerColorContext)[name] ?? PALETTE[0];
  const style = { color, fontWeight: 700 };
  if (!discordId) return <span style={style}>{name}</span>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      <Avatar src={image} name={name} alt="" size={20} radius="xl" />
      <Link
        href={`/players/${discordId}`}
        style={{
          ...style,
          textDecoration: "underline dotted",
          textUnderlineOffset: 3,
        }}
      >
        {name}
      </Link>
    </span>
  );
};

export default PlayerName;
