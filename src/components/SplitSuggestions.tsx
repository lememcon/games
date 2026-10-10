import { Fragment, useId } from "react";
import { Link } from "wouter";

import { Collapse, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

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

interface SplitCardProps {
  split: GameSplit;
  year: string;
  individualMax: number;
}

const Players = ({ players }: { players: string[] }) => (
  <>
    {players.map((name, i) => (
      <Fragment key={name}>
        {i > 0 && " + "}
        <PlayerName name={name} />
      </Fragment>
    ))}
  </>
);

// One suggested split. Collapsed it shows the headline, the per-player score and,
// for each group, its players and picked game; expanding the header reveals every
// group's full list of top games.
const SplitCard = ({ split, year, individualMax }: SplitCardProps) => {
  const [opened, { toggle }] = useDisclosure(false);
  const listId = useId();

  return (
    <div className="splits__card">
      <div className="splits__head">
        <UnstyledButton
          className="splits__toggle"
          aria-expanded={opened}
          aria-controls={listId}
          onClick={toggle}
        >
          <strong>
            <span className="splits__chevron" aria-hidden>
              &#9656;
            </span>
            {split.groups.map((g) => g.players.length).join(" + ")} ·{" "}
            {split.groups.map((g) => g.picked).join(" + ")}
          </strong>
          <span>
            {split.perPlayer.toFixed(1)} per player{" "}
            {split.delta !== null && (
              <span
                className={
                  split.delta < 0 ? "splits__delta--down" : "splits__delta--up"
                }
              >
                {formatDelta(split.delta)}
              </span>
            )}
          </span>
        </UnstyledButton>
      </div>
      {!opened && (
        <div className="splits__summary" data-testid="split-summary">
          {split.groups.map((group) => {
            const picked = group.games.find((g) => g.name === group.picked);
            return (
              <div
                key={group.players.join(",")}
                className="splits__summary-row"
              >
                <span>
                  <Players players={group.players} />
                </span>
                {picked && (
                  <>
                    <div className="tray-cover tray-cover--sm">
                      {picked.image ? (
                        <img src={picked.image} alt="" />
                      ) : (
                        <div className="tray-cover__blank" aria-hidden />
                      )}
                    </div>
                    <Link
                      href={gamePath(year, picked.id)}
                      className="tray-name"
                    >
                      {picked.name}
                    </Link>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Collapse expanded={opened} id={listId} transitionDuration={0}>
        {split.groups.map((group) => (
          <div key={group.players.join(",")} className="splits__group">
            <div className="splits__players">
              <Players players={group.players} />
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
                  aria-current={game.name === group.picked ? "true" : undefined}
                >
                  <div className="tray-cover tray-cover--sm">
                    {game.image ? (
                      <img src={game.image} alt={game.name} />
                    ) : (
                      <div className="tray-cover__blank" aria-hidden />
                    )}
                  </div>
                  <div className="tray-row__main">
                    <Link href={gamePath(year, game.id)} className="tray-name">
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
      </Collapse>
    </div>
  );
};

// Ways to divide the selected players into smaller groups. Each card headlines the
// plan that picks each group's best game without reusing one, scored per player
// against the best all-together game; it starts collapsed to the picked games and
// expands to every group's top games (a menu).
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
        <SplitCard
          key={split.groups.map((g) => g.players.join(",")).join("|")}
          split={split}
          year={year}
          individualMax={individualMax}
        />
      ))}
    </section>
  );
};

export default SplitSuggestions;
