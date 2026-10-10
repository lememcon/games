import { Badge } from "@mantine/core";

import PlayerRange from "@/components/PlayerRange";
import { formatBounds } from "@/lib/games";
import type { Bounds } from "@/types";

const BGG_URL = "https://boardgamegeek.com/boardgame/";

interface GameDetailHeaderProps {
  name: string;
  bounds: Bounds | null;
  // BGG's range when an admin restricted this game.
  original?: Bounds | null;
  id: string;
  image?: string | null;
}

const GameDetailHeader = ({
  name,
  bounds,
  original,
  id,
  image,
}: GameDetailHeaderProps) => (
  <div
    style={{
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: "1em",
      alignItems: "flex-start",
    }}
  >
    <div>
      <h1>{name}</h1>
      <p>
        {bounds && (
          <>
            <strong>Players:</strong>
            &nbsp;
            <PlayerRange bounds={bounds} />
            {original && (
              <>
                &nbsp;
                <Badge variant="outline" color="orange" size="sm">
                  Restricted
                </Badge>
                <br />
                <small className="player-range__bgg">
                  BGG lists {formatBounds(original)}
                </small>
              </>
            )}
          </>
        )}
      </p>
      <a href={`${BGG_URL}${id}/`} target="_blank" rel="noopener noreferrer">
        BGG Page
      </a>
    </div>
    {image && <img src={image} width="200" />}
  </div>
);

export default GameDetailHeader;
