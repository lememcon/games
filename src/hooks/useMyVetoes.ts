import useMyVetoList from "@/hooks/useMyVetoList";
import { vetoesApi } from "@/lib/vetoesApi";
import type { MyVeto } from "@/types";

const pick = (api: ReturnType<typeof vetoesApi>) => api.listMine;

// The signed-in member's vetoes, which apply to every year, with add and undo. Not
// optimistic: the list is refetched after each change.
const useMyVetoes = (fetchImpl: typeof fetch = fetch) => {
  const { mutate, ...rest } = useMyVetoList<MyVeto>(fetchImpl, pick);
  // Unlike the year hook, these resolve with nothing.
  const add = async (bggId: number) => {
    await mutate(() => vetoesApi(fetchImpl).set(bggId));
  };
  const clear = async (bggId: number) => {
    await mutate(() => vetoesApi(fetchImpl).clear(bggId));
  };
  return { ...rest, add, clear };
};

export type MyVetoesState = ReturnType<typeof useMyVetoes>;

export default useMyVetoes;
