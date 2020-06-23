// Imports
const Scene = require('Scene');
const TouchGestures = require("TouchGestures");
// const Reactive = require("Reactive");
const Animation = require("Animation");
const Time = require("Time");
const Patches = require('Patches');
const Materials = require('Materials');
const Textures = require('Textures');
const NativeUI = require('NativeUI');
const Audio = require('Audio');
export const Diagnostics = require('Diagnostics');

// Audio
const PIRATE_JUMP_AUDIO = Audio.getPlaybackController("pirate_jump_audio")
const PIRATE_WALK_AUDIO = Audio.getPlaybackController("pirate_walk_audio")
const CELEBRATE_AUDIO = Audio.getPlaybackController("celebrate_audio")
const FALL_AUDIO = Audio.getPlaybackController("fall_audio")
const SPIKE_AUDIO = Audio.getPlaybackController("spike_audio")
const BOMB_AUDIO = Audio.getPlaybackController("bomb_audio")

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
let positionTilesMapping = {}
let tilesPositionMapping = {}
let positionVisited = {}

// Level variables
let level = LEVELS[`world${currentWorld}`][`level${currentLevel}`]; // lv 1 is index 0
let tilePositions = level.tilePositions;
let tilePatterns = level.tilePatterns;
let obstacles = level.obstacleTilePositions;
let startTile = level.startTile;
let endTile = level.endTile;

// Gameflow variables
let ready = false;
let agentDirection = "down"
let playerWin = false;
let playerLost = false;
let selection = null; // store any selected tile (for swapping)
let selectionPosition = null
let tileIsAnimating = false

// Event subscriptions, timeouts and intervals
let pirateSubscription = null
let tileSubscriptions = []
let timeouts = {}
let moveAgentIntervalID = null


// Native UI Picker
Promise.all([
    Textures.findFirst("world1_icon"),
    Textures.findFirst("world2_icon"),
]).then(results => {
    const button1 = results[0];
    const button2 = results[1];
    
    const configuration = {
        selectedIndex: 0,
        items: [
            { image_texture: button1 },
            { image_texture: button2 }
        ]
    };

    function toggleVisibility(selectedWorldIndex) {
        currentWorld = selectedWorldIndex + 1
        initWorld()
    }

    // By default, first world is selected
    toggleVisibility(0);
    const picker = NativeUI.picker;
    picker.configure(configuration);
    picker.visible = true;
    Diagnostics.log("Picker loaded");

    picker.selectedIndex.monitor().subscribe(index => toggleVisibility(index.newValue));
});


function initWorld() {

    // Hide container for loading
    Scene.root.findFirst('container').then(container => container.hidden = true)

    // Reset world variables
    positionTilesMapping = {}
    tilesPositionMapping = {}
    positionVisited = {}
    playerWin = false;
    playerLost = false;
    selection = null;
    selectionPosition = null
    unanimateAllVisitedTiles()
    unanimateAllChests()

    // Kill intervals and timeouts, stop audio and unsubscribe event listeners to prevent glitches/bugs
    moveAgentIntervalID && Time.clearInterval(moveAgentIntervalID)
    Object.values(timeouts).forEach(timeoutID => Time.clearTimeout(timeoutID))
    pirateSubscription && pirateSubscription.unsubscribe()
    tileSubscriptions && tileSubscriptions.map(subscription => subscription.unsubscribe())
    PIRATE_JUMP_AUDIO.setPlaying(false)
    PIRATE_WALK_AUDIO.setPlaying(false)
    CELEBRATE_AUDIO.setPlaying(false)
    FALL_AUDIO.setPlaying(false)
    SPIKE_AUDIO.setPlaying(false)
    BOMB_AUDIO.setPlaying(false)

    // Hide worlds and levels
    for (let i = 1; i <= Object.keys(LEVELS).length; i++) {
        Scene.root.findFirst(`world${i}`)
            .then(world => {

                // Hide world if not current world
                if (i !== currentWorld) {
                    world.hidden = true
                } else {
                    world.hidden = false
                }

                // Hide levels
                for (let j = 1; j <= Object.keys(LEVELS[`world${i}`]).length; j++) {
                    world.findFirst(`level${j}`)
                        .then(level => {
                            if (i === currentWorld && j === 1) {
                                // Update level variable and initialize level 1
                                currentLevel = 1
                                initLevel()
                            } else {
                                // Hide all levels except level 1 of current world
                                level.hidden = true
                            }
                        })
                }
            })
    }

    // Buffer for loading
    timeouts['showContainer'] = Time.setTimeout(() => {
        Scene.root.findFirst('container').then(container => container.hidden = false)
    }, 300)
}

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
    Patches.inputs.setScalar(`chest_${currentLevel}_animation`, 0);

    // Hide bomb fire
    Scene.root.findFirst("fire").then(fire => fire.hidden = true)

    // Increase opacity of instructions/level display for levels above current
    for (let i = 0; i < Object.keys(LEVELS[`world${currentWorld}`]).length; i++) {
        Materials.findFirst(`${currentWorld === 1 ? 'grass' : 'snow'}_level${i + 1}_instruction`)
            .then(mat => {
                if (i + 1 <= currentLevel) {
                    mat.opacity = 1
                } else {
                    mat.opacity = 0.35
                }
            })
        Materials.findFirst(`${currentWorld === 1 ? 'grass' : 'snow'}_complete`).then(mat => mat.opacity = 0)
    }

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

                    // Unselect any selected tiles
                    selection ? animateTileSelect(selection, "blur") : ''

                    // Move agent
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
    Scene.root.findFirst(`world${currentWorld}`)
        .then(world => {
            world.findFirst(`level${currentLevel}`)
                .then(level => {
                    // Hide level for loading
                    level.hidden = true
                    let tilePositionsCopy = tilePositions.slice()
        
                    // Loop through directional tiles and place them at a random position
                    tilePatterns.forEach(tilePattern => {
                        level.findFirst(tilePattern.name)
                        .then(tileUi => {
                            let randIndex = getRandomInt(tilePositionsCopy.length)
                            let position = tilePositionsCopy[randIndex]
                            tilePositionsCopy.splice(randIndex, 1)
                            
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

                    // Buffer for loading
                    timeouts['showLevel'] = Time.setTimeout(() => {
                        level.hidden = false
                    }, 200)
                })
        })
}

function restartLevel() {
    timeouts['restartLevel'] = Time.setTimeout(() => {
        
        // Kill intervals and timeouts, stop audio and unsubscribe event listeners to prevent glitches/bugs
        moveAgentIntervalID && Time.clearInterval(moveAgentIntervalID)
        Object.values(timeouts).forEach(timeoutID => Time.clearTimeout(timeoutID))
        pirateSubscription && pirateSubscription.unsubscribe()
        tileSubscriptions && tileSubscriptions.map(subscription => subscription.unsubscribe())

        // Clear variables and restart level
        positionVisited = {}
        playerWin = false;
        playerLost = false;
        unanimateLevelVisitedTiles()
        initLevel()
    }, 3000)
}


// Helper functions

function placeTile(tilePattern, position) {
    
    // Place tile in positionTilesMapping and tilesPositionMapping
    positionTilesMapping[position] = tilePattern
    tilesPositionMapping[tilePattern.name] = position

    if (Object.keys(positionTilesMapping).length === (tilePatterns.length + obstacles.length + 2)) {
        // All tiles placed
        Diagnostics.log("All tiles loaded");
    }

    // Place tile in UI (no animation)
    Scene.root.findFirst(`world${currentWorld}`)
        .then(world => {
            world.findFirst(`level${currentLevel}`)
                .then(level => level.findFirst(tilePattern.name)
                    .then(tileUi => {
                        tileUi.transform.x = getCoordinateXFromIndex(position[0]);
                        tileUi.transform.y = 2;
                        tileUi.transform.z = getCoordinateZFromIndex(position[1]);
        
                        // If current level is 1 or tile is tileStart, don't animate tile drop
                        if (currentLevel === 1 || tileUi.name === 'tileStart') 
                            tileUi.transform.y = TOP_LEFT_Y
                        else 
                            timeouts['placeTile'] = Time.setTimeout(() => animatePlaceTile(tileUi), 500)
                    }
                ))
        })
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
    // Fixed tiles will have direction stored in type property
    let direction = positionTilesMapping[agentPosition].direction || positionTilesMapping[agentPosition].type;
    let units = positionTilesMapping[agentPosition].units;
    
    // Handle visited tile
    positionVisited[agentPosition] = true;
    Scene.root.findFirst(`world${currentWorld}`)
        .then(world => {
            world.findFirst(`level${currentLevel}`)
                .then(level => level.findFirst(positionTilesMapping[agentPosition].name)
                    .then(visitedTile => visitedTile.findAll("Box001__0")
                        .then(meshes => meshes.forEach(mesh => animateTileVisited(mesh)))
                    )
                )
        })      
    
    let destinationPosition = null;
    if (direction == "left") {
        destinationPosition = [agentPosition[0] - units, agentPosition[1]];
    } else if (direction == "right") {
        destinationPosition = [agentPosition[0] + units, agentPosition[1]];
    } else if (direction == "up") {
        destinationPosition = [agentPosition[0], agentPosition[1] - units];
    } else if (direction == "down") {
        destinationPosition = [agentPosition[0], agentPosition[1] + units];
    }

    animateMoveAgent(agent, destinationPosition, direction, units)

    if (destinationPosition == null || positionTilesMapping[destinationPosition] == null) {
        Diagnostics.log("Invalid move");
        playerLost = true;

        timeouts['invalidMove'] = Time.setTimeout(() => {
            // Position to move toward is invalid - change to crash animation clip
            Patches.inputs.setScalar('pirate_animation', 2);
            FALL_AUDIO.setPlaying(true)
            FALL_AUDIO.reset()

            // Animate agent falling
            animateObjectFall(agent)
            
            restartLevel()
        }, 500)

        return agentPosition;
    } else if (positionVisited[destinationPosition]) {
        Diagnostics.log("Moved backwards");
        playerLost = true;
        
        // Dead - Change to crash animation clip
        timeouts['movedBackwards'] = Time.setTimeout(() => {
            Patches.inputs.setScalar('pirate_animation', 2);
            FALL_AUDIO.setPlaying(true)
            FALL_AUDIO.reset()

            // Animate tile and agent falling
            Scene.root.findFirst(`world${currentWorld}`)
                .then(world => {
                    world.findFirst(`level${currentLevel}`)
                        .then(level => level.findFirst(positionTilesMapping[destinationPosition].name)
                            .then(tile => animateObjectFall(tile)))
                })
            timeouts['agentFall'] = Time.setTimeout(() => animateObjectFall(agent), 100)
            
            restartLevel()
        }, 500)

        return agentPosition;
    } else if (["bomb", "spike"].includes(positionTilesMapping[destinationPosition].type)) {
        Diagnostics.log("Hit obstacle")
        playerLost = true;

        timeouts['hitObstacle'] = Time.setTimeout(() => {
            // Position to move toward is invalid - change to crash animation clip
            Patches.inputs.setScalar('pirate_animation', 2);

            switch (positionTilesMapping[destinationPosition].type) {
                case 'spike':
                    SPIKE_AUDIO.setPlaying(true)
                    SPIKE_AUDIO.reset()
                    FALL_AUDIO.setPlaying(true)
                    FALL_AUDIO.reset()
                    break
                case 'bomb':
                    BOMB_AUDIO.setPlaying(true)
                    BOMB_AUDIO.reset()
                    FALL_AUDIO.setPlaying(true)
                    FALL_AUDIO.reset()

                    // Show fire
                    Scene.root.findFirst(`fire`)
                        .then(fire => {
                            const firePosition = getMidPointFromIndex(destinationPosition)
                            fire.transform.x = firePosition[0]
                            fire.transform.z = firePosition[1]
                            fire.transform.y = -0.71
                            fire.hidden = false
                        })
                    break
                default:
            }

            restartLevel()
        }, 500)
    }

    // Check for win state
    if (destinationPosition[0] === endTile.position[0] && destinationPosition[1] === endTile.position[1]) {
        Diagnostics.log("Reached chest!");

        // Animate chest open and player win animation
        animateChestOpen()
        CELEBRATE_AUDIO.setPlaying(true)
        CELEBRATE_AUDIO.reset()
        timeouts['rotateAgent'] = Time.setTimeout(() => {
            animateRotateAgent(agent, "down", true)
            timeouts['victoryRotate'] = Time.setTimeout(() => {
                animateVictoryRotate(agent)
                timeouts['victoryJump'] = Time.setTimeout(() => {
                    animateVictoryJump(agent)
                }, 400)
            }, 200)


            timeouts['nextLevel'] = Time.setTimeout(() => {
                if (currentLevel === 5) { 
                    Diagnostics.log("World completed!")

                    // Show world completed display
                    Materials.findFirst(`${currentWorld === 1 ? 'grass' : 'snow'}_complete`).then(mat => mat.opacity = 1)

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
            }, 5000)
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

function calculateMinAngle(currentDeg, DestDeg1, DestDeg2) {
    if (Math.abs(currentDeg - degreesToRadians(DestDeg1)) > Math.abs(currentDeg - degreesToRadians(DestDeg2)))
        return degreesToRadians(DestDeg2)
    else
        return degreesToRadians(DestDeg1)
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

    let tile1x = tile1.transform.x.pinLastValue();
    let tile1z = tile1.transform.z.pinLastValue();
    tile1.transform.x = shiftx(tdTileSwap, tile1, tile2.transform.x.pinLastValue());
    tile1.transform.z = shiftz(tdTileSwap, tile1, tile2.transform.z.pinLastValue());
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
        "up": calculateMinAngle(agent.transform.rotationY.pinLastValue(), 180, -180),
        "down": calculateMinAngle(agent.transform.rotationY.pinLastValue(), 0, 360),
        "right": calculateMinAngle(agent.transform.rotationY.pinLastValue(), 90, -270),
        "left": calculateMinAngle(agent.transform.rotationY.pinLastValue(), 270, -90),
    }

    let facePlayerRotation = {
        1: calculateMinAngle(agent.transform.rotationY.pinLastValue(), 0, 360),
        2: calculateMinAngle(agent.transform.rotationY.pinLastValue(), 270, -90),
        3: calculateMinAngle(agent.transform.rotationY.pinLastValue(), 270, -90),
        4: calculateMinAngle(agent.transform.rotationY.pinLastValue(), 180, -180),
        5: calculateMinAngle(agent.transform.rotationY.pinLastValue(), 90, -270),
    }

    agent.transform.rotationY = Animation.animate(
        tdRotateAgent,
        Animation.samplers.linear(agent.transform.rotationY.pinLastValue(), win ? facePlayerRotation[currentLevel] : angles[direction])
    )
    tdRotateAgent.start()
}

function animateMoveAgent(agent, destinationPosition, direction, units) {
    
    /* 
    Set animation controller in patch editor by passing int as scalarValue
    0: idle
    1: walk
    2: crash
    3: jump
    4: run
    */
    
    // Rotate agent to face direction
    if (direction !== agentDirection) {
        animateRotateAgent(agent, direction)
        agentDirection = direction
    }

    if (units > 1) {
        // Animate jump
        Patches.inputs.setScalar('pirate_animation', 3)
        PIRATE_JUMP_AUDIO.setPlaying(true);
        PIRATE_JUMP_AUDIO.reset();

        const tdAgentJump = getTimeDriver(250, 2, true);

        agent.transform.y = Animation.animate(
            tdAgentJump, 
            Animation.samplers.easeInOutBounce(agent.transform.y.pinLastValue(), 
                units === 2 
                ? agent.transform.y.pinLastValue() + 0.06
                : agent.transform.y.pinLastValue() + 0.1)
        )
        tdAgentJump.start()
    } else {
        // Animate walk
        Patches.inputs.setScalar('pirate_animation', 1)
        PIRATE_WALK_AUDIO.setPlaying(true);
        PIRATE_WALK_AUDIO.reset();
    }

    // Animate agent towards direction
    const tdAgentMove = getTimeDriver(500);
    const point = getMidPointFromIndex(destinationPosition);

    agent.transform.x = shiftx(tdAgentMove, agent, point[0]);
    agent.transform.z = shiftz(tdAgentMove, agent, point[1]);
    tdAgentMove.start();
    timeouts['stopAgent'] = Time.setTimeout(() => {
        // Set back to idle after each step
        if (!playerLost) {
            Patches.inputs.setScalar('pirate_animation', 0)
        }
    }, 500)
}

function animateVictoryJump(agent) {
    Patches.inputs.setScalar('pirate_animation', 3)

    const tdAgentJump = getTimeDriver(500, 6, true);

    agent.transform.y = Animation.animate(
        tdAgentJump, 
        Animation.samplers.linear(agent.transform.y.pinLastValue() - 0.02, agent.transform.y.pinLastValue() + 0.05)
    )
    tdAgentJump.start()
}

function animateVictoryRotate(agent) {
    const tdAgentRotate = getTimeDriver(300, 2, true);

    agent.transform.rotationY = Animation.animate(
        tdAgentRotate, 
        Animation.samplers.linear(agent.transform.rotationY.pinLastValue(), agent.transform.rotationY.pinLastValue() + degreesToRadians(360))
    )
    tdAgentRotate.start()
}

function animateTileVisited(tile) {
    Materials.findFirst('chevron_gray')
        .then(mat => {
            tile.material = mat
        })
}

function unanimateAllVisitedTiles() {
    Scene.root.findFirst(`world${currentWorld}`)
        .then(world => {
            world.findAll("Box001__0")
                .then(meshes => meshes.forEach(mesh => {
                    if (currentWorld === 1) {
                        Materials.findFirst('chevron_yellow')
                            .then(mat => {
                                mesh.material = mat
                            })
                    } 
                    else if (currentWorld === 2) {
                        Materials.findFirst('dirt')
                            .then(mat => {
                                mesh.material = mat
                            })
                    }
                }))
        })
}

function unanimateLevelVisitedTiles() {
    Scene.root.findFirst(`world${currentWorld}`)
        .then(world => {
            world.findFirst(`level${currentLevel}`)
                .then(level => {
                    level.findAll("Box001__0")
                        .then(meshes => meshes.forEach(mesh => {
                            if (currentWorld === 1) {
                                Materials.findFirst('chevron_yellow')
                                    .then(mat => {
                                        mesh.material = mat
                                    })
                            } 
                            else if (currentWorld === 2) {
                                Materials.findFirst('dirt')
                                    .then(mat => {
                                        mesh.material = mat
                                    })
                            }
                        }))
                })
        })
}

function animateChestOpen() {
    Scene.root.findFirst(`world${currentWorld}`)
        .then(world => {
            world.findFirst(`level${currentLevel}`)
                .then(level => level.findFirst("tileEnd")
                    .then(tileUi => tileUi.findFirst("treasure")
                        .then(treasure => {
                            const tdChestOpen = getTimeDriver(300)
                            treasure.transform.y = shifty(tdChestOpen, treasure, treasure.transform.y.pinLastValue() + 1.8)
                            tdChestOpen.start()
                            // Open treasure chest
                            Patches.inputs.setScalar(`chest_${currentLevel}_animation`, 1);
                        })
                ))
        })
}

function unanimateAllChests() {
    Scene.root.findAll("treasure")
        .then(treasures => treasures.forEach(treasure => {
            if (treasure.transform.y.pinLastValue() > 2) {
                treasure.transform.y = treasure.transform.y.pinLastValue() - 1.8
            }
        }))
}

function animateObjectFall(obj) {
    const tdObjFall = getTimeDriver(300)

    obj.transform.y = Animation.animate(
        tdObjFall,
        Animation.samplers.linear(obj.transform.y.pinLastValue(), obj.transform.y.pinLastValue() - 3)
    )
    tdObjFall.start()
}