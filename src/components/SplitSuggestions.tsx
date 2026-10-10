import { Fragment } from "react";
import { Link } from "wouter";

import PlayerName from "@/components/PlayerName";
import ScorePopover from "@/components/ScorePopover";
import { gamePath } from "@/lib/routes";
import type { GameSplit } from "@/types";

interface SplitSuggestionsProps {
  splits: GameSplit[];
  year: string;
  individualMax: number;
}

const formatDelta = (delta: number) =>
  `${delta < 0 ? "-" : "+"}${Math.abs(delta).toFixed(1)}`;

// Ways to divide the selected players into smaller groups. Each card lists every
// group's top games (a menu) and headlines the plan that picks each group's best
// game without reusing one, scored per player against the best all-together game.
const SplitSuggestions = ({
  splits,
  year,
  individualMax,
}: SplitSuggestionsProps) => {
  if (splits.length === 0) return null;

  return (
    <section className="splits">
      <h3 className="splits__title">Suggested splits</h3>
      {splits.map((split) => (
        <div
          key={split.groups.map((g) => g.players.join(",")).join("|")}
          className="splits__card"
        >
          <div className="splits__head">
            <strong>
              {split.groups.map((g) => g.players.length).join(" + ")} ·{" "}
              {split.groups.map((g) => g.picked).join(" + ")}
            </strong>
            <span>
              {split.perPlayer.toFixed(1)} per player{" "}
              {split.delta !== null && (
                <span
                  className={
                    split.delta < 0
                      ? "splits__delta--down"
                      : "splits__delta--up"
                  }
                >
                  {formatDelta(split.delta)}
                </span>
              )}
            </span>
          </div>
          {split.groups.map((group) => (
            <div key={group.players.join(",")} className="splits__group">
              <div className="splits__players">
                {group.players.map((name, i) => (
                  <Fragment key={name}>
                    {i > 0 && " + "}
                    <PlayerName name={name} />
                  </Fragment>
                ))}
              </div>
              <div className="tray-rows">
                {group.games.map((game) => (
                  <div
                    key={game.name}
                    className={
                      game.name === group.picked
                        ? "tray-row splits__row--chosen"
                        : "tray-row"
                    }
                    aria-current={
                      game.name === group.picked ? "true" : undefined
                    }
                  >
                    <div className="tray-cover tray-cover--sm">
                      {game.image ? (
                        <img src={game.image} alt={game.name} />
                      ) : (
                        <div className="tray-cover__blank" aria-hidden />
                      )}
                    </div>
                    <div className="tray-row__main">
                      <Link
                        href={gamePath(year, game.id)}
                        className="tray-name"
                      >
                        {game.name}
                      </Link>
                    </div>
                    <div className="tray-row__score">
                      <ScorePopover
                        score={game.score}
                        players={game.players}
                        selectedMax={individualMax * group.players.length}
                        individualMax={individualMax}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
};

export default SplitSuggestions;
