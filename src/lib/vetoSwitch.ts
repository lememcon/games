// What a veto scope offers for one game; both resolve true when the change saved.
export interface VetoScope {
  veto: (bggId: number) => Promise<boolean>;
  unveto: (bggId: number) => Promise<boolean>;
}

// Moves a game's veto from one scope to another. Adds in the new scope first
// and removes the old one only if that saved, so a failure never leaves the
// game unvetoed. Resolves true only when both steps saved.
export const switchVeto = async (
  from: VetoScope,
  to: VetoScope,
  bggId: number,
): Promise<boolean> => {
  if (!(await to.veto(bggId))) return false;
  return from.unveto(bggId);
};
