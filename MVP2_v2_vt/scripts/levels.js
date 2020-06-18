// let lv_1_start_position = [2, 1]; // startTile
// let lv_1_end_position = [7, 2]; // endTile
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
//     numTiles: positions.length + 2,
//     startTile: {
//       name: "startTile",
//       direction: "right",
//       units: 1,
//       position: startPos
//     },
//     endTile: {
//       name: "endTile",
//       position: endPos
//     },
//     tilePositions: positions,
//     tilePatterns: tilePatterns
//     // start_position: start_pos,
//     // end_position: end_pos,
//   };
// }


module.exports = [
    {
        numTiles: 9,
        tilePositions: [
            [3,8], [4,8], [5,8], [3,7], [4,7], [5,7], [3,6], [4,6], [5,6]
        ],
        startTile: {
            name: "tileStart",
            direction: "right",
            units : 1,
            position: [2,8]
        },
        endTile:{
            name: "tileEnd",
            position: [6,6]
        },
        tilePatterns: [
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