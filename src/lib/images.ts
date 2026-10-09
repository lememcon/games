// Cover images bundled with the app, keyed by "/src/assets/games/<id><ext>".
const images = import.meta.glob("@/assets/games/*", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export default images;
