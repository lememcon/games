import useMyVetoList from "@/hooks/useMyVetoList";
import { vetoesApi } from "@/lib/vetoesApi";
import type { MyYearVeto } from "@/types";

const pick = (api: ReturnType<typeof vetoesApi>) => api.listMineYear;
const MESSAGES = { unknown_year: "That year has no data." };

// The signed-in member's single-year vetoes, with add and undo. Not optimistic:
// the list is refetched after each change.
const useMyYearVetoes = (fetchImpl: typeof fetch = fetch) => {
  const { mutate, ...rest } = useMyVetoList<MyYearVeto>(
    fetchImpl,
    pick,
    MESSAGES,
  );
  const add = (year: number, bggId: number) =>
    mutate(() => vetoesApi(fetchImpl).setYear(String(year), bggId));
  const clear = (year: number, bggId: number) =>
    mutate(() => vetoesApi(fetchImpl).clearYear(String(year), bggId));
  return { ...rest, add, clear };
};

export default useMyYearVetoes;
