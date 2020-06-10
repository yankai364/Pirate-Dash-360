let lv_1_start_position = [2, 1]; // start_tile
let lv_1_end_position = [7, 2]; // end_tile
let lv_1_positions = [ // NO 0-INDEXING
  [3, 1],
  [3, 2],
  [4, 1],
  [4, 2],
  [5, 1],
  [5, 2],
  [6, 1],
  [6, 2]
];
let lv_1_directions = ["left", "left", "...", "left"]; // DIRECTIONS FOR tile1 to tileN MUST BE IN SEQUENCE

/** 
module.exports = [
  generateLevel(...),
  generateLevel(...)
]
**/

function generateLevel(startPos, endPos, positions, directions) {
  let tilePatterns = [];

  for (let i = 0; i < positions.length; i++) {
    tilePatterns.append({
      name: "tile" + (i + 1),
      direction: directions[i + 1],
      units: 1
    });
  }

  return {
    no_of_tiles: positions.length + 2,
    start_tile: {
      name: "start_tile",
      direction: "right",
      units: 1,
      position: startPos
    },
    end_tile: {
      name: "end_tile",
      position: endPos
    },
    tile_positions: positions,
    tile_patterns: tilePatterns
    // start_position: start_pos,
    // end_position: end_pos,
  };
}

module.exports = [
  {
    no_of_tiles: 8,
    tile_positions: [
      [3, 1],
      [3, 2],
      [4, 1],
      [4, 2],
      [5, 1],
      [5, 2],
      [6, 1],
      [6, 2]
    ],
    start_tile: {
        name: "start_tile",
        direction: "right",
        units: 1,
        position: [2,1]
      },
    end_tile: {
        name: "end_tile",
        position: [7,2]
      },
    tile_patterns: [
      {
        name: "tile1",
        direction: "left",
        units: 1
      },
      {
        name: "tile2",
        direction: "left",
        units: 1
      },
      {
        name: "tile3",
        direction: "left",
        units: 1
      },
      {
        name: "tile4",
        direction: "left",
        units: 1
      },
      {
        name: "tile5",
        direction: "right",
        units: 1
      },
      {
        name: "tile6",
        direction: "right",
        units: 1
      },
      {
        name: "tile7",
        direction: "right",
        units: 1
      },
      {
        name: "tile8",
        direction: "right",
        units: 1
      }
    ]
  }
];
