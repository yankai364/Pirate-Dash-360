// Imports
const Scene = require('Scene');
const TouchGestures = require("TouchGestures");
// const Reactive = require("Reactive");
const Animation = require("Animation");
const Time = require("Time");
const Patches = require('Patches');
const Materials = require('Materials');
export const Diagnostics = require('Diagnostics');

// Tile dimensions
const UNIT_LENGTH = 0.15; // x length and z length
const TOP_LEFT_X = -1.513;
const TOP_LEFT_Y = -0.8;
const TOP_LEFT_Z = -0.22;

/**
Grid
(x, y, z) |-------|
          |_      |
          |l|_____|
**/

// World variables
const LEVELS = require("./levels");
let currentWorld = 1;
let currentLevel = 1;
let level = LEVELS[`world${currentWorld}`][`level${currentLevel}`]; // lv 1 is index 0
let tilePositions = level.tilePositions;
let tilePatterns = level.tilePatterns;
let obstacles = level.obstacleTilePositions;
let startTile = level.startTile;
let endTile = level.endTile;
let positionTilesMapping = {}
let tilesPositionMapping = {}
let positionVisited = {}

// Gameflow variables
let ready = false;
let agentDirection = "down"
let playerWin = false;
let playerLost = false;
let selection = null; // store any selected tile (for swapping)
let selectionPosition = null
let tileIsAnimating = false
let pirateSubscription = null
let tileSubscriptions = []
let moveAgentIntervalID = null

// Hide all levels before initialization
for (let i = 2; i <= 5; i++) {
    Scene.root.findFirst(`level${i}`)
        .then(level => level.hidden = true)
}

initLevel()

function initLevel() {

    // Update variables
    level = LEVELS[`world${currentWorld}`][`level${currentLevel}`];
    tilePositions = level.tilePositions;
    tilePatterns = level.tilePatterns;
    obstacles = level.obstacleTilePositions;
    startTile = level.startTile;
    endTile = level.endTile;
    agentDirection = startTile.direction
    ready = false;

    // Place start and end tile
    placeTile(startTile, startTile.position);
    placeTile(endTile, endTile.position); // Includes chest

    // Close treasure chest
    Patches.inputs.setScalar('chest_animation', 0);

    // Place character on start tile
    Scene.root.findFirst("pirate")
        .then(agent => {
            let agentPosition = startTile.position
            let point = getMidPointFromIndex(agentPosition);
            agent.transform.x = point[0];
            agent.transform.y = TOP_LEFT_Y + 0.11; // To check height
            agent.transform.z = point[1];

            // Update agent direction at start tile
            animateRotateAgent(agent, agentDirection)

            // Set agent animation clip to idle
            Patches.inputs.setScalar('pirate_animation', 0);
            
            // Listen for tap on character
            pirateSubscription = TouchGestures.onTap(agent).subscribe(function (gesture) {
                if (!ready) {
                    Diagnostics.log("Starting game");
                    ready = true;
                    moveAgentIntervalID = Time.setInterval(() => {
                        if (!playerLost && (agentPosition[0] !== endTile.position[0] || agentPosition[1] !== endTile.position[1])) {
                            agentPosition = moveAgent(agent, agentPosition);
                        }
                    }, 1000);
                }
            });

            Diagnostics.log("Agent loaded");
        })


    // Place directional and obstacle tiles
    Scene.root.findFirst(`level${currentLevel}`)
        .then(level => {
            // Show level
            level.hidden = false

            // Loop through directional tiles and place them at a random position
            tilePatterns.forEach(tilePattern => {
                level.findFirst(tilePattern.name)
                .then(tileUi => {
                    let randIndex = getRandomInt(tilePositions.length)
                    let position = tilePositions[randIndex]
                    tilePositions.splice(randIndex, 1)
                    
                    placeTile(tilePattern, position)

                    // For each tile, prepare listener for tap event
                    let tileSubscription = TouchGestures.onTap(tileUi).subscribe(function () {
                        if (!ready) {       
                            if (!tileIsAnimating) {
                                if (selection === null) {
                                    // if there is no active tile
                                    selection = tileUi
                                    selectionPosition = tilesPositionMapping[tilePattern.name]
                                    animateTileSelect(tileUi, "active")
                                } else {
                                    // if active tile is same as selection, de-select tile
                                    if (tileUi === selection) {
                                        animateTileSelect(tileUi, "blur")
                                        selection = null
                                        selectionPosition = null
                                    }
                                    // swap tiles
                                    else {
                                        swapTiles(selectionPosition, tilesPositionMapping[tilePattern.name], selection, tileUi)
                                        animateTileSelect(selection, "blur")
                                        selection = null
                                        selectionPosition = null
                                    }
                                }
                            }
                        }
                    });
                    
                    tileSubscriptions.push(tileSubscription)
                })
            })

            // Place obstacle tiles at fixed positions
            obstacles && obstacles.forEach(obstacle => placeTile(obstacle, obstacle.position))
        })
}




// Helper functions

function placeTile(tilePattern, position) {
    
    // Place tile in positionTilesMapping and tilesPositionMapping
    positionTilesMapping[position] = tilePattern
    tilesPositionMapping[tilePattern.name] = position

    if (Object.keys(positionTilesMapping).length === (tilePatterns.length + 2)) {
        // All tiles placed
        Diagnostics.log("All tiles loaded");
    }

    // Place tile in UI (no animation)
    Scene.root.findFirst(`level${currentLevel}`)
        .then(level => level.findFirst(tilePattern.name)
            .then(tileUi => {
                tileUi.transform.x = getCoordinateXFromIndex(position[0]);
                tileUi.transform.y = 2;
                tileUi.transform.z = getCoordinateZFromIndex(position[1]);

                // If current level is 1 or tile is tileStart, don't animate tile drop
                if (currentLevel === 1 || tileUi.name === 'tileStart') 
                    tileUi.transform.y = TOP_LEFT_Y
                else 
                    Time.setTimeout(() => animatePlaceTile(tileUi), 500)
            }
        ))
}

function swapTiles(position1, position2, selection, tileUi) {
    let tilePattern1 = positionTilesMapping[position1]
    let tilePattern2 = positionTilesMapping[position2]
    
    // Swap tiles
    positionTilesMapping[position1] = tilePattern2
    tilesPositionMapping[tilePattern2.name] = position1
    positionTilesMapping[position2] = tilePattern1
    tilesPositionMapping[tilePattern1.name] = position2

    animateTileSwap(selection, tileUi)
}

function moveAgent(agent, agentPosition) {
    let direction = positionTilesMapping[agentPosition].direction;
    
    // Handle visited tile
    positionVisited[agentPosition] = true;
    Scene.root.findFirst(`level${currentLevel}`)
        .then(level => level.findFirst(positionTilesMapping[agentPosition].name)
            .then(visitedTile => visitedTile.findFirst("Box001__0")
                .then(mesh => animateTileVisited(mesh))))
                
    
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

    if (destinationPosition == null || positionTilesMapping[destinationPosition] == null) {
        Diagnostics.log("Invalid move");
        playerLost = true;

        Time.setTimeout(() => {
            // Position to move toward is invalid - change to crash animation clip
            Patches.inputs.setScalar('pirate_animation', 2);
        }, 500)

        return agentPosition;
    } else if (positionVisited[destinationPosition]) {
        Diagnostics.log("Moved backwards");
        playerLost = true;
        
        // Dead - Change to crash animation clip
        Time.setTimeout(() => {
            Patches.inputs.setScalar('pirate_animation', 2);
        }, 500)

        return agentPosition;
    }

    // Check for win state
    if (destinationPosition[0] === endTile.position[0] && destinationPosition[1] === endTile.position[1]) {
        Diagnostics.log("Reached chest!");

        // Animate chest open and player win animation
        animateChestOpen()
        Time.setTimeout(() => {
            animateRotateAgent(agent, "down", true)

            Time.setTimeout(() => {
                if (currentLevel === 5) { 
                    Diagnostics.log("World completed!")
                    // TODO: Game end animation
    
                } else {
                    // Advance to next level
                    currentLevel += 1

                    // Unsubscribe event listeners
                    Time.clearInterval(moveAgentIntervalID)
                    pirateSubscription.unsubscribe()
                    tileSubscriptions.map(subscription => subscription.unsubscribe())
                    
                    // TODO: Level transition
                    

                    initLevel()
                }
            }, 2000)
        }, 700)
    }

    return destinationPosition;
}

function getMidPointFromIndex(position) {
    return [
        getCoordinateXFromIndex(position[0]) - (UNIT_LENGTH / 2),
        getCoordinateZFromIndex(position[1]) + (UNIT_LENGTH / 2)
    ]
}

function getCoordinateXFromIndex(index) {
    return TOP_LEFT_X + (index * UNIT_LENGTH)
}

function getCoordinateZFromIndex(index) {
    return TOP_LEFT_Z + (index * UNIT_LENGTH)
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

function animatePlaceTile(tile) {
    const tdPlaceTile = getTimeDriver(getRandomInt(200) + 100)
    
    tile.transform.y = Animation.animate(
        tdPlaceTile, 
        Animation.samplers.easeOutBounce(tile.transform.y.pinLastValue(), TOP_LEFT_Y))
    tdPlaceTile.start()
}

function animateTileSelect(tile, animation) {
    const tdTileMove = getTimeDriver();

    let yValue = tile.transform.y.pinLastValue();
    yValue = animation === "active" ? yValue + 0.02 : yValue - 0.02;

    tile.transform.y = Animation.animate(
        tdTileMove,
        Animation.samplers.linear(tile.transform.y.pinLastValue(), yValue)
    );

    tileIsAnimating = true
    tdTileMove.start();
    tdTileMove.onCompleted().subscribe(function() {
        tileIsAnimating = false
    })
}

const shiftx = (td, obj, destination) =>
    Animation.animate(td, Animation.samplers.linear(obj.transform.x.pinLastValue(), destination));

const shifty = (td, obj, destination) =>
    Animation.animate(td, Animation.samplers.easeInQuad(obj.transform.y.pinLastValue(), destination));

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
    tileIsAnimating = true
    tdTileSwap.start();
    tdTileSwap.onCompleted().subscribe(function() {
        tileIsAnimating = false
    })
}

function animateRotateAgent(agent, direction, win = false) {
    const tdRotateAgent = getTimeDriver()
    let angles = {
        "up": degreesToRadians(180),
        "down": degreesToRadians(0),
        "right": degreesToRadians(90),
        "left": degreesToRadians(270)
    }

    agent.transform.rotationY = Animation.animate(
        tdRotateAgent,
        Animation.samplers.linear(angles[agentDirection], win ? degreesToRadians(-360) : angles[direction])
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
    if (direction !== agentDirection) {
        animateRotateAgent(agent, direction)
        agentDirection = direction
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
        if (!playerLost) {
            Patches.inputs.setScalar('pirate_animation', 0)
        }
    }, 500)
}

function animateTileVisited(tile) {
    Materials.findFirst('chevron_gray')
        .then(mat => {
            tile.material = mat
        })
}

function animateChestOpen() {
    Scene.root.findFirst(`level${currentLevel}`)
        .then(level => level.findFirst("tileEnd")
            .then(tileUi => tileUi.findFirst("treasure")
                .then(treasure => {
                    const tdChestOpen = getTimeDriver(300)
                    treasure.transform.y = shifty(tdChestOpen, treasure, treasure.transform.y.pinLastValue() + 1.5)
                    tdChestOpen.start()
                    // Open treasure chest
                    Patches.inputs.setScalar('chest_animation', 1);
                })
        ))
}