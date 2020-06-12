// Imports
const Scene = require('Scene');
const TouchGestures = require("TouchGestures");
// const Reactive = require("Reactive");
const Animation = require("Animation");
const Time = require("Time");
const CameraInfo = require('CameraInfo');
export const Diagnostics = require('Diagnostics');

// Tile dimensions
const unitLength = 0.15; // x length and z length
const topLeftx = -0.463;
const topLefty = -0.8;
const topLeftz = -0.52;

/**
Grid
(x, y, z) |-------|
          |_      |
          |l|_____|
**/

// Level variables
const levels = require("./levels");
let currentLevel = 1;
let level = levels[currentLevel - 1]; // lv 1 is index 0
let no_of_tiles = level.no_of_tiles;
let tile_positions = level.tile_positions;
let tile_patterns = level.tile_patterns;
let start_tile = level.start_tile;
let end_tile = level.end_tile;
let position_direction = {}

// Gameflow variables
let ready = false;
let selection = null; // store any selected tile (for swapping)

// Place start and end tile
Scene.root.findFirst(start_tile.name)
    .then(tile => {
        placeTile(tile, start_tile.position);
    });

Scene.root.findFirst(end_tile.name)
    .then(tile => {
        placeTile(tile, end_tile.position); // Includes chest
    });

// Place character on start tile
Scene.root.findFirst("character")
    .then(agent => {
        let agentPosition = start_tile.position
        let point = getMidPointFromIndex(agentPosition);
        agent.transform.x = point[0];
        agent.transform.y = topLefty + 0.15; // To check height
        agent.transform.z = point[1];

        Time.setInterval(() => {
            ready = true;
            if (ready) {
                agentPosition = animateAgent(agent, agentPosition);
            }
        }, 1000);

        Diagnostics.log("Agent loaded");
    })

// Place each tile in a random position
Scene.root.findFirst("level" + currentLevel)
.then(level => {
    // Loop through tiles
    for (let i = 1; i <= no_of_tiles; i++) {
        level.findFirst("tile" + i)
        .then(tile => {
            let randIndex = getRandomInt(tile_positions.length)
            let position = tile_positions[randIndex]
            tile_positions.splice(randIndex, 1)

            placeTile(tile, position)

            // For each tile, prepare listener for tap event
            TouchGestures.onTap(tile).subscribe(function () {
                if (!ready) {
                    if (selection === null) {
                        // if there is no active tile
                        selection = tile
                        animateTileSelect(tile, "active")
                    } else {
                        // if active tile is same as selection, de-select tile
                        if (tile === selection) {
                            animateTileSelect(tile, "blur")
                            selection = null
                        }
                        // swap tiles
                        else {
                            animateTileSwap(selection, tile)
                            animateTileSelect(selection, "blur")
                            selection = null
                        }
                    }
                }
            });

        });
    }
});

// TODO: Track position of player and the tile direction

// TODO: Movement animation
// while (ready && !arrivedAtEndTile(agent)) {
//     animateCharacter(agent)
// }

// Helper functions
function placeTile(tileObj, position) {
    tileObj.transform.x = getCoordinateXFromIndex(position[0]);
    tileObj.transform.z = getCoordinateZFromIndex(position[1]);

    if (tileObj.name === "start_tile") {
        position_direction[position] = start_tile.direction;
    } else if (tileObj.name === "end_tile") {
        position_direction[position] = end_tile.direction;
    } else {
        position_direction[position] = tile_patterns.filter((tile) => tile.name === tileObj.name)[0].direction;
    }

    if (Object.keys(position_direction).length === (tile_patterns.length + 2)) {
        // All tiles placed
        Diagnostics.log("All tiles loaded");
    }
}

function getMidPointFromIndex(position) {
    return [
        getCoordinateXFromIndex(position[0]) - (unitLength / 2),
        getCoordinateZFromIndex(position[1]) + (unitLength / 2)
    ]
}

function getCoordinateXFromIndex(index) {
    return topLeftx + (index * unitLength)
}

function getCoordinateZFromIndex(index) {
    return topLeftz + (index * unitLength)
}

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}


// Animations
function getTimeDriver(duration = 200, loopCount = 1, mirror = false) {
    return Animation.timeDriver({
        durationMilliseconds: duration,
        loopCount: loopCount,
        mirror: mirror
    });
}

function animateTileSelect(tile, animation) {
    const tdTileMove = getTimeDriver();

    let y_value = tile.transform.y.pinLastValue();
    y_value = animation === "active" ? y_value + 0.02 : y_value - 0.02;

    tile.transform.y = Animation.animate(
        tdTileMove,
        Animation.samplers.linear(tile.transform.y.pinLastValue(), y_value)
    );

    tdTileMove.start();
}

const shiftx = (td, obj, destination) =>
    Animation.animate(td, Animation.samplers.linear(obj.transform.x.pinLastValue(), destination));

const shiftz = (td, obj, destination) =>
    Animation.animate(td, Animation.samplers.linear(obj.transform.z.pinLastValue(), destination));

function animateTileSwap(tile1, tile2) {
    const tdTileSwap = getTimeDriver();

    let tile1x = tile1.transform.x.lastValue;
    let tile1z = tile1.transform.z.lastValue;
    tile1.transform.x = shiftx(tdTileSwap, tile1, tile2.transform.x.lastValue);
    tile1.transform.z = shiftz(tdTileSwap, tile1, tile2.transform.z.lastValue);
    tile2.transform.x = shiftx(tdTileSwap, tile2, tile1x);
    tile2.transform.z = shiftz(tdTileSwap, tile2, tile1z);
    tdTileSwap.start();
}

function animateAgent(agent, agentPosition) {
    let direction = position_direction[agentPosition];
    
    // Diagnostics.watch("Current Position", agentPosition.toString());
    // Diagnostics.watch("Direction", direction);
    
    let destinationPosition = null;

    if (direction == "left") {
        destinationPosition = [agentPosition[0] - 1, agentPosition[1]];
    } else if (direction == "right") {
        destinationPosition = [agentPosition[0] + 1, agentPosition[1]];
    } else if (direction == "up") {
        destinationPosition = [agentPosition[0], agentPosition[1] - 1];
    } else if (direction == "down") {
        destinationPosition = [agentPosition[0], agentPosition[1] + 1];
    }

    if (destinationPosition == null || position_direction[destinationPosition] == null) {
        // Position to move toward is invalid
        Diagnostics.log("Invalid move");
        return agentPosition;
    } //else (isVisited(destinationPosition)) {
        // Dead
    //}

    // Diagnostics.watch("Destination Position", destinationPosition.toString());

    const tdAgentMove = getTimeDriver(500);
    const point = getMidPointFromIndex(destinationPosition);

    agent.transform.x = shiftx(tdAgentMove, agent, point[0]);
    agent.transform.z = shiftz(tdAgentMove, agent, point[1]);
    tdAgentMove.start();

    return destinationPosition;
}