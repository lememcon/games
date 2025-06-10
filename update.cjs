#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const R = require("ramda");
const { XMLParser } = require("fast-xml-parser");

const DATA_URL = "https://data.lememcon.com/data.json";
const BGG_URL = "https://boardgamegeek.com/xmlapi2/thing?type=boardgame&id=";
const GAMES_FILE = "./src/assets/games.json";

const game_data = require(GAMES_FILE);

const ensureArray = (value) => {
  if (Array.isArray(value)) {
    return value; // Already an array
  } else if (value == null) {
    return []; // Handle null or undefined values
  } else {
    return [value]; // Wrap single value in an array
  }
};

const parse_games_from_bgg = (ids) => {
  const options = {
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  };
  const parser = new XMLParser(options);

  const id_query = ids.join(",");
  const url = `${BGG_URL}${id_query}`;

  console.log("Fetching:", url);
  return fetch(url)
    .then((response) => response.text())
    .then((text) => parser.parse(text))
    .then((xml) => {
      return R.reduce(
        (games, game) => {
          const data = {
            players: {
              min: parseInt(game.minplayers["@_value"]),
              max: parseInt(game.maxplayers["@_value"]),
            },
          };

          if (game.image) {
            const ext = path.extname(game.image);
            data["image"] = game.image;
            data["ext"] = ext;
          }

          return {
            [game["@_id"]]: data,
            ...games,
          };
        },
        {},
        ensureArray(xml.items.item),
      );
    });
};

const sleep = () => {
  return new Promise((resolve) => setTimeout(resolve, 5000));
};

const load_groups_helper = (head, tail, current) => {
  return parse_games_from_bgg(head).then((games) => {
    const result = {
      ...current,
      ...games,
    };

    if (tail.length > 0) {
      return sleep().then(() => {
        return load_groups_helper(R.head(tail), R.tail(tail), result);
      });
    }

    return result;
  });
};

const load_groups = (groups) => {
  if (groups.length === 0) {
    return {};
  }

  const head = R.head(groups);
  const tail = R.tail(groups);

  return load_groups_helper(head, tail, {});
};

// Grab the current data file
fetch(DATA_URL)
  .then((response) => response.json())
  .then((data) => {
    // Collect a set of bgg_ids that we need
    return new Set(data.player_game_scores.map((score) => `${score.bgg_id}`));
  })
  .then((game_ids) => {
    loaded_ids = new Set(Object.keys(game_data));
    console.log("Loaded:", loaded_ids.size);
    console.log("Games:", game_ids.size);

    needed_ids = game_ids.difference(loaded_ids);
    console.log("Need:", needed_ids.size);

    const groups = R.splitEvery(20, [...needed_ids]);
    console.log("Groups:", groups.length);
    return groups;
  })
  .then(load_groups)
  .then((new_games) => {
    const all_games = {
      ...game_data,
      ...new_games,
    };

    // Write out new game data with old game data
    fs.writeFileSync(GAMES_FILE, JSON.stringify(all_games, null, 2));

    return all_games;
  })
  .then((all_games) => {
    // Look for images that we don't have
    const ids = Object.keys(all_games);
    R.map((id) => {
      if (all_games[id].image) {
        const remote = all_games[id].image;
        const ext = path.extname(remote);
        const local = `./src/assets/games/${id}${ext}`;
        if (!fs.existsSync(local)) {
          // Fetch image
          console.log("Fetching:", all_games[id].image, "as", ext);
          fetch(remote)
            .then((response) => response.arrayBuffer())
            .then((buf) => fs.writeFileSync(local, Buffer.from(buf)));
        }
      }
    }, ids);
  });
