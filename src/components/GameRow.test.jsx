import { describe, expect, it, vi } from "vitest";

import { Table } from "@mantine/core";

import GameRow from "@/components/GameRow";
import { renderWithMantine } from "@/test/utils";

const game = {
  name: "Root",
  id: "100",
  score: 45,
  image: "root.jpg",
  players: { alice: { name: "alice", rank: 1, score: 45 } },
};

const renderRow = (props) =>
  renderWithMantine(
    <Table>
      <Table.Tbody>
        <GameRow
          game={game}
          rank={1}
          selectedMax={100}
          individualMax={50}
          bounds={{ min: 2, max: 4 }}
          played={0}
          onInc={() => {}}
          onDec={() => {}}
          {...props}
        />
      </Table.Tbody>
    </Table>,
  );

describe("GameRow", () => {
  it("renders rank, name link, image, and player bounds", () => {
    const { getByRole, getByText } = renderRow();

    expect(getByText("1.")).toBeInTheDocument();
    expect(getByRole("link", { name: "Root" })).toHaveAttribute(
      "href",
      "/games/100",
    );
    expect(getByRole("img")).toHaveAttribute("src", "root.jpg");
    expect(getByText("2-4")).toBeInTheDocument();
  });

  it("omits the bounds cell when bounds is null", () => {
    const { queryByText } = renderRow({ bounds: null });
    expect(queryByText("2-4")).not.toBeInTheDocument();
  });

  it("forwards the played count and increment handler", () => {
    const onInc = vi.fn();
    const { getByText } = renderRow({ played: 3, onInc });
    expect(getByText("3")).toBeInTheDocument();
  });
});
