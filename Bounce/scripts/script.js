// Imports
const Scene = require('Scene');
const TouchGestures = require("TouchGestures");
const Reactive = require("Reactive");
const Animation = require("Animation");
const Time = require("Time");
export const Diagnostics = require('Diagnostics');

// Scene objects
const tiles = Scene.root.find("tiles");



// Tile dimensions
const unitLength = 0.15
const bottomLeftx = -0.463
const bottomLefty = -0.8
const bottomLeftz = -0.52

// Level variables
const levels = require("./levels");
let current_level = 1
let level = levels[current_level - 1]
let no_of_tiles = level.no_of_tiles
let tile_positions = level.tile_positions
let tile_patterns = level.tile_patterns

// Gameflow variables
let bomb_released = false
let selection = null


// Place each tile in a random position
tile_patterns.forEach(tile => {
    let randIndex = getRandomInt(tile_positions.length)
    let location = tile_positions[randIndex]
    tile_positions.splice(randIndex, 1)
    let tileObj = tiles.child(tile.name)
    tileObj.transform.x = getCoordinateXFromIndex(location[0])
    tileObj.transform.z = getCoordinateZFromIndex(location[1])

    // For each tile, prepare listener for tap event
    TouchGestures.onTap(tileObj).subscribe(function() {
        if (!bomb_released) {
            if (selection === null) {
                // if there is no active tile
                selection = tileObj
                animateTileSelect(tileObj, "active")
            } else {
                // if active tile is same as selection, de-select tile
                if (tileObj === selection) {
                    animateTileSelect(tileObj, "blur")
                    selection = null
                }
                // swap tiles
                else {
                    animateTileSwap(selection, tileObj)
                    animateTileSelect(selection, "blur")
                    selection = null
                }
            }
        }
    })
})



// Helper functions

function getCoordinateXFromIndex(index) {
    return bottomLeftx + (index * unitLength)
}

function getCoordinateZFromIndex(index) {
    return bottomLeftz + (index * unitLength)
}

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}


// Animations

function animateTileSelect(tile, animation) {
    const tdpTileMove = {
        durationMilliseconds: 100,
        loopCount: 1,
        mirror: false
    };

    const tdTileMove = Animation.timeDriver(tdpTileMove);

    const active = Animation.animate(
        tdTileMove,
        Animation.samplers.linear(
            tile.transform.y.pinLastValue(),
            tile.transform.y.pinLastValue() + 0.02
        )
    );

    const blur = Animation.animate(
        tdTileMove,
        Animation.samplers.linear(
            tile.transform.y.pinLastValue(),
            tile.transform.y.pinLastValue() - 0.02
        )
    );

    tile.transform.y = animation === "active" ? active : blur
    tdTileMove.start()
}

function animateTileSwap(tile1, tile2) {
    const tdpTileSwap = {
        durationMilliseconds: 100,
        loopCount: 1,
        mirror: false
    };

    const tdTileSwap = Animation.timeDriver(tdpTileSwap);

    const shiftx = (tile, destination) => Animation.animate(
        tdTileSwap,
        Animation.samplers.linear(
            tile.transform.x.pinLastValue(),
            destination
        )
    );

    const shiftz = (tile, destination) => Animation.animate(
        tdTileSwap,
        Animation.samplers.linear(
            tile.transform.z.pinLastValue(),
            destination
        )
    );

    let tile1x = tile1.transform.x.lastValue
    let tile1z = tile1.transform.z.lastValue
    tile1.transform.x = shiftx(tile1, tile2.transform.x.lastValue)
    tile1.transform.z = shiftz(tile1, tile2.transform.z.lastValue)
    tile2.transform.x = shiftx(tile2, tile1x)
    tile2.transform.z = shiftz(tile2, tile1z)
    tdTileSwap.start()
}