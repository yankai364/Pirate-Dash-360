module.exports = [
    {
        no_of_tiles: 8,
        tile_positions: [
            [2,4], [3,4], [4,4], [5,4], [3,5], [4,5], [5,5], [3,6], [4,6], [5,6],[6,6]
        ],
        start_tile: {
            name: "tileStart"
            position: [2,4]
        },
        end_tile:{
            name: "tileEnd"
            position: [6,6]
        },
        tile_patterns: [
            {
                name: "tileOne",
                direction: "right",
                units: 1
            },
            {
                name: "tileTwo",
                direction: "right",
                units: 1
            },
            {
                name: "tileThree",
                direction: "up",
                units: 1
            },
            {
                name: "tileFour",
                direction: "up",
                units: 1
            },
            {
                name: "tileFive",
                direction: "left",
                units: 1
            },
            {
                name: "tileSix",
                direction: "left",
                units: 1
            },
            {
                name: "tileSeven",
                direction: "right",
                units: 1
            },
            {
                name: "tileEight",
                direction: "right",
                units: 1
            },
            {
                name: "tileNine",
                direction: "right",
                units: 1
            },
        ]
    },
]