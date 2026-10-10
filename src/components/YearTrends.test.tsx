import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import YearTrends from "@/components/YearTrends";
import { renderWithMantine } from "@/test/utils";
import type { YearTotal } from "@/types";

const t = (bgg_id: number, year: number, total: number): YearTotal => ({
  bgg_id,
  year,
  total,
});
const names = { "1": "Wingspan", "2": "Azul" };

describe("YearTrends", () => {
  it("renders nothing without trends", () => {
    renderWithMantine(
      <YearTrends totals={[t(1, 2026, 5)]} year={2026} names={names} />,
    );
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("shows both panels with links and details", () => {
    const totals = [
      t(1, 2023, 90),
      t(1, 2026, 40),
      t(2, 2025, 10),
      t(2, 2026, 30),
    ];
    renderWithMantine(<YearTrends totals={totals} year={2026} names={names} />);
    expect(
      screen.getByRole("heading", { name: "Returning favorites" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Rising games" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wingspan" })).toHaveAttribute(
      "href",
      "/2026/games/1",
    );
    expect(screen.getByText("90 in 2023")).toBeInTheDocument();
    expect(screen.getByText("+20 (10 to 30)")).toBeInTheDocument();
  });

  it("hides a panel that is empty or has no named games", () => {
    const totals = [
      t(1, 2023, 90),
      t(1, 2026, 40),
      t(3, 2025, 1),
      t(3, 2026, 9),
    ];
    renderWithMantine(<YearTrends totals={totals} year={2026} names={names} />);
    expect(
      screen.getByRole("heading", { name: "Returning favorites" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Rising games" })).toBeNull();
  });

  it("fills the panel with named games past unnamed ones", () => {
    const many = { ...names, "10": "Ark Nova" };
    const totals = [1, 2, 3, 4, 5, 6].flatMap((id) => [
      t(id, 2025, 1),
      t(id, 2026, id === 10 ? 1 : 100 - id),
    ]);
    totals.push(t(10, 2025, 1), t(10, 2026, 2));
    renderWithMantine(<YearTrends totals={totals} year={2026} names={many} />);
    expect(screen.getByRole("link", { name: "Ark Nova" })).toBeInTheDocument();
  });
});
