// let lv_1_start_position = [2, 1]; // start_tile
// let lv_1_end_position = [7, 2]; // end_tile
// let lv_1_positions = [ // NO 0-INDEXING
//   [3, 1],
//   [3, 2],
//   [4, 1],
//   [4, 2],
//   [5, 1],
//   [5, 2],
//   [6, 1],
//   [6, 2]
// ];
// let lv_1_directions = ["left", "left", "...", "left"]; // DIRECTIONS FOR tile1 to tileN MUST BE IN SEQUENCE

/** 
module.exports = [
  generateLevel(...),
  generateLevel(...)
]
**/

// function generateLevel(startPos, endPos, positions, directions) {
//   let tilePatterns = [];

//   for (let i = 0; i < positions.length; i++) {
//     tilePatterns.append({
//       name: "tile" + (i + 1),
//       direction: directions[i + 1],
//       units: 1
//     });
//   }

//   return {
//     no_of_tiles: positions.length + 2,
//     start_tile: {
//       name: "start_tile",
//       direction: "right",
//       units: 1,
//       position: startPos
//     },
//     end_tile: {
//       name: "end_tile",
//       position: endPos
//     },
//     tile_positions: positions,
//     tile_patterns: tilePatterns
//     // start_position: start_pos,
//     // end_position: end_pos,
//   };
// }


module.exports = [
    {
        no_of_tiles: 9,
        tile_positions: [
            [3,8], [4,8], [5,8], [3,7], [4,7], [5,7], [3,6], [4,6], [5,6]
        ],
        start_tile: {
            name: "tileStart",
            direction: "right",
            units : 1,
            position: [2,8]
        },
        end_tile:{
            name: "tileEnd",
            position: [6,6]
        },
        tile_patterns: [
            {
                name: "tile1",
                direction: "right",
                units: 1
            },
            {
                name: "tile2",
                direction: "right",
                units: 1
            },
            {
                name: "tile3",
                direction: "up",
                units: 1
            },
            {
                name: "tile4",
                direction: "up",
                units: 1
            },
            {
                name: "tile5",
                direction: "left",
                units: 1
            },
            {
                name: "tile6",
                direction: "left",
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
            },
            {
                name: "tile9",
                direction: "right",
                units: 1
            },
        ]
    }
]