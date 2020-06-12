// Imports
const Scene = require('Scene');
const TouchGestures = require("TouchGestures");
// const Reactive = require("Reactive");
const Animation = require("Animation");
const Time = require("Time");
const Patches = require('Patches')
export const Diagnostics = require('Diagnostics');

// Tile dimensions
const unit_length = 0.15; // x length and z length
const top_left_x = -0.463;
const top_left_y = -0.8;
const top_left_z = -0.52;

/**
Grid
(x, y, z) |-------|
          |_      |
          |l|_____|
**/

// Level variables
const levels = require("./levels");
let current_level = 1;
let level = levels[current_level - 1]; // lv 1 is index 0
let no_of_tiles = level.no_of_tiles;
let tile_positions = level.tile_positions;
let tile_patterns = level.tile_patterns;
let start_tile = level.start_tile;
let end_tile = level.end_tile;
let position_tiles = {}
let tiles_position = {}
let position_visited = {}

// Gameflow variables
let ready = false;
let player_direction = "down"
let player_win = false;
let player_lost = false;
let selection = null; // store any selected tile (for swapping)
let selection_position = null
let tile_is_animating = false

// Place start and end tile
placeTile(start_tile, start_tile.position);
placeTile(end_tile, end_tile.position); // Includes chest

// Place character on start tile
Scene.root.findFirst("pirate")
    .then(agent => {
        let agentPosition = start_tile.position
        let point = getMidPointFromIndex(agentPosition);
        agent.transform.x = point[0];
        agent.transform.y = top_left_y + 0.11; // To check height
        agent.transform.z = point[1];

        // Set agent animation clip to idle
        Patches.inputs.setScalar('pirate_animation', 0)

        // Listen for tap on character
        TouchGestures.onTap(agent).subscribe(function (gesture) {
            Diagnostics.log("Starting game");
            ready = true;
            Time.setInterval(() => {
                if (!player_lost && (agentPosition[0] !== end_tile.position[0] || agentPosition[1] !== end_tile.position[1])) {
                    agentPosition = moveAgent(agent, agentPosition);
                }
            }, 1000);
        });

        Diagnostics.log("Agent loaded");
    })

// Place each tile in a random position
Scene.root.findFirst("level" + current_level)
    .then(level => {
        // Loop through tiles
        tile_patterns.forEach(tile_pattern => {
            level.findFirst(tile_pattern.name)
            .then(tile_UI => {
                let randIndex = getRandomInt(tile_positions.length)
                let position = tile_positions[randIndex]
                tile_positions.splice(randIndex, 1)
    
                placeTile(tile_pattern, position)
    
                // For each tile, prepare listener for tap event
                TouchGestures.onTap(tile_UI).subscribe(function () {
                    if (!ready) {       
                        if (!tile_is_animating) {
                            if (selection === null) {
                                // if there is no active tile
                                selection = tile_UI
                                selection_position = tiles_position[tile_pattern.name]
                                animateTileSelect(tile_UI, "active")
                            } else {
                                // if active tile is same as selection, de-select tile
                                if (tile_UI === selection) {
                                    animateTileSelect(tile_UI, "blur")
                                    selection = null
                                    selection_position = null
                                }
                                // swap tiles
                                else {
                                    swapTiles(selection_position, tiles_position[tile_pattern.name], selection, tile_UI)
                                    animateTileSelect(selection, "blur")
                                    selection = null
                                    selection_position = null
                                }
                            }
                        }
                    }
                });
            })
        })
    })

// Prepare ready button
Scene.root.findFirst("ready")
    .then(ready_btn => {
        TouchGestures.onTap(ready_btn).subscribe(function () {
            ready = true
        })
    })




// Helper functions
async function getTileUI(name) {
    const level = await Scene.root.findFirst("level" + current_level)
    return level.findFirst(name)
}

async function placeTile(tile_pattern, position) {
    
    // Place tile in position_tiles and tiles_position
    position_tiles[position] = tile_pattern
    tiles_position[tile_pattern.name] = position

    if (Object.keys(position_tiles).length === (tile_patterns.length + 2)) {
        // All tiles placed
        Diagnostics.log("All tiles loaded");
    }

    // Place tile in UI (no animation)
    const tile_UI = await getTileUI(tile_pattern.name)
    tile_UI.transform.x = getCoordinateXFromIndex(position[0]);
    tile_UI.transform.z = getCoordinateZFromIndex(position[1]);
}

async function swapTiles(position_1, position_2, selection, tile_UI) {
    let tile_pattern_1 = position_tiles[position_1]
    let tile_pattern_2 = position_tiles[position_2]
    
    // Swap tiles
    position_tiles[position_1] = tile_pattern_2
    tiles_position[tile_pattern_2.name] = position_1
    position_tiles[position_2] = tile_pattern_1
    tiles_position[tile_pattern_1.name] = position_2

    animateTileSwap(selection, tile_UI)
}

function moveAgent(agent, agentPosition) {
    let direction = position_tiles[agentPosition].direction;
    // Diagnostics.watch("Current Position", agentPosition.toString());
    // Diagnostics.watch("Direction", direction);
    position_visited[agentPosition] = true;
    
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

    animateMoveAgent(agent, destinationPosition, direction)

    if (destinationPosition == null || position_tiles[destinationPosition] == null) {
        Diagnostics.log("Invalid move");
        player_lost = true;

        Time.setTimeout(() => {
            // Position to move toward is invalid - change to crash animation clip
            Patches.inputs.setScalar('pirate_animation', 2);
        }, 500)

        return agentPosition;
    } else if (position_visited[destinationPosition]) {
        Diagnostics.log("Moved backwards");
        player_lost = true;
        
        // Dead - Change to crash animation clip
        Time.setTimeout(() => {
            Patches.inputs.setScalar('pirate_animation', 2);
        }, 500)

        return agentPosition;
    }
    // Diagnostics.watch("Destination Position", destinationPosition.toString());

    // Check for win state
    if (destinationPosition[0] === end_tile.position[0] && destinationPosition[1] === end_tile.position[1]) {
        Diagnostics.log("Reached chest!");
    }

    return destinationPosition;
}

function getMidPointFromIndex(position) {
    return [
        getCoordinateXFromIndex(position[0]) - (unit_length / 2),
        getCoordinateZFromIndex(position[1]) + (unit_length / 2)
    ]
}

function getCoordinateXFromIndex(index) {
    return top_left_x + (index * unit_length)
}

function getCoordinateZFromIndex(index) {
    return top_left_z + (index * unit_length)
}

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

function degreesToRadians(degrees) {
    let pi = Math.PI;
    return degrees * (pi / 180);
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

    tile_is_animating = true
    tdTileMove.start();
    tdTileMove.onCompleted().subscribe(function() {
        tile_is_animating = false
    })
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
    tile_is_animating = true
    tdTileSwap.start();
    tdTileSwap.onCompleted().subscribe(function() {
        tile_is_animating = false
    })
}

function animateRotateAgent(agent, direction) {
    const tdRotateAgent = getTimeDriver()
    let angles = {
        "up": degreesToRadians(180),
        "down": degreesToRadians(0),
        "right": degreesToRadians(90),
        "left": degreesToRadians(270)
    }

    agent.transform.rotationY = Animation.animate(
        tdRotateAgent,
        Animation.samplers.linear(angles[player_direction], angles[direction])
    )
    tdRotateAgent.start()
}

function animateMoveAgent(agent, destinationPosition, direction) {
    
    /* 
    Set animation controller in patch editor by passing int as scalarValue
    0: idle
    1: walk
    */
    Patches.inputs.setScalar('pirate_animation', 1)

    // Rotate agent to face direction
    if (direction !== player_direction) {
        animateRotateAgent(agent, direction)
        player_direction = direction
    }

    // Diagnostics.log(destinationPosition);

    // Animate agent towards direction
    const tdAgentMove = getTimeDriver(500);
    const point = getMidPointFromIndex(destinationPosition);

    agent.transform.x = shiftx(tdAgentMove, agent, point[0]);
    agent.transform.z = shiftz(tdAgentMove, agent, point[1]);
    tdAgentMove.start();
    Time.setTimeout(() => {
        // Set back to idle after each step
        if (!player_lost) {
            Patches.inputs.setScalar('pirate_animation', 0)
        }
    }, 500)
}