import { useEffect, useState, type CSSProperties } from "react";

import { pickFloaters } from "@/lib/floaters";

const COUNT = 10;

interface FloatingCoversProps {
  /** Cover URL by BGG id. */
  covers: Readonly<Record<string, string>>;
  /** BGG ids to draw from; defaults to every cover. */
  pool?: readonly string[];
  /** BGG ids to show first. */
  preferred?: readonly string[];
  /** Raw score by BGG id; weights how often each preferred cover is drawn. */
  weights?: Readonly<Record<string, number>>;
}

/** Decorative drifting game covers behind the sign-in card and the app. */
const FloatingCovers = ({
  covers,
  pool,
  preferred = [],
  weights,
}: FloatingCoversProps) => {
  const ids = pool ?? Object.keys(covers);
  // Re-pick only when the contents change, not the array identities.
  const key = `${ids.join("|")}#${preferred
    .map((k) => `${k}:${weights?.[k] ?? ""}`)
    .join("|")}`;
  const [picked, setPicked] = useState(() => ({
    key,
    floaters: pickFloaters(ids, COUNT, Math.random, preferred, weights),
  }));
  let floaters = picked.floaters;
  if (picked.key !== key) {
    floaters = pickFloaters(ids, COUNT, Math.random, preferred, weights);
    setPicked({ key, floaters });
  }
  const [mounted, setMounted] = useState(false);
  // Mount after the first paint so the card is never held up by the covers.
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!mounted) return null;

  return (
    <div className="floaters" aria-hidden="true">
      {floaters.map((f, i) => (
        <img
          key={`${i}:${f.id}`}
          src={covers[f.id]}
          alt=""
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          style={
            {
              "--left": `${f.left}%`,
              "--top": `${f.top}%`,
              "--size": `${f.size}px`,
              "--dur": `${f.duration}s`,
              "--delay": `${f.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
};

export default FloatingCovers;
