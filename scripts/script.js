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
const INVALID_AUDIO = Audio.getPlaybackController("error_audio_2")

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
let flippedTiles = level.flippedTiles
let cloudPositions = level.cloudPositions

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
    Textures.findFirst("world3_icon")
]).then(results => {
    const button1 = results[0];
    const button2 = results[1];
    const button3 = results[2];
    
    const configuration = {
        selectedIndex: 0,
        items: [
            { image_texture: button1 },
            { image_texture: button2 },
            { image_texture: button3 }
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
    INVALID_AUDIO.setPlaying(false)

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

    // Hide level transition mover
    Scene.root.findFirst("mover").then(mover => mover.hidden = true)

    // Place ship
    Scene.root.findFirst("ship_light").then(ship => {
        ship.transform.x = -0.47207
        ship.transform.y = -0.84193
        ship.transform.z = 0.65243
        ship.transform.rotationY = 0
    })

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
    flippedTiles = level.flippedTiles
    cloudPositions = level.cloudPositions
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
        Materials.findFirst(`${currentWorld === 1 ? 'grass' : currentWorld === 2 ? 'snow' : 'desert'}_level${i + 1}_instruction`)
            .then(mat => {
                if (i + 1 <= currentLevel) {
                    mat.opacity = 1
                } else {
                    mat.opacity = 0.35
                }
            })
        Materials.findFirst(`${currentWorld === 1 ? 'grass' : currentWorld === 2 ? 'snow' : 'desert'}_complete`).then(mat => mat.opacity = 0)
    }

    // Place character on start tile
    Scene.root.findFirst("pirate")
        .then(agent => {
            let agentPosition = startTile.position
            let point = getMidPointFromIndex(agentPosition);
            timeouts['agentAppearBuffer'] = Time.setTimeout(() => {
                agent.transform.x = point[0];
                agent.transform.y = TOP_LEFT_Y + 0.11; // To check height
                agent.transform.z = point[1];

                // Update agent direction at start tile
                animateRotateAgent(agent, agentDirection)

                // Set agent animation clip to idle
                Patches.inputs.setScalar('pirate_animation', 0);
            }, 500)
            
            // Listen for tap on character
            pirateSubscription = TouchGestures.onTap(agent).subscribe(function (gesture) {
                timeouts['concurrentTapBuffer'] = Time.setTimeout(() => {
                    if (!ready && !tileIsAnimating) {
                        ready = true;
                        Diagnostics.log("Starting game");

                        // Unselect any selected tiles
                        selection ? animateTileSelect(selection, "blur") : ''

                        // Move agent
                        moveAgentIntervalID = Time.setInterval(() => {
                            if (!playerLost && (agentPosition[0] !== endTile.position[0] || agentPosition[1] !== endTile.position[1])) {
                                agentPosition = moveAgent(agent, agentPosition);
                            }
                        }, 1000);
                    }
                }, 100)
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
                                timeouts['concurrentTapBuffer2'] = Time.setTimeout(() => {
                                    if (!ready) {
                                        if (!tileIsAnimating) {
                                            tileIsAnimating = true
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
                                }, 100)
                            });
                            
                            tileSubscriptions.push(tileSubscription)
                        })
                    })
        
                    // Place obstacle tiles at fixed positions
                    obstacles && obstacles.forEach(obstacle => {
                        placeTile(obstacle, obstacle.position)

                        // For each tile, prepare listener for tap event
                        level.findFirst(obstacle.name)
                            .then(tileUi => {
                                let obstacleSubscription = TouchGestures.onTap(tileUi).subscribe(function () {
                                    if (!ready) {
                                        INVALID_AUDIO.setPlaying(true)
                                        INVALID_AUDIO.reset()
                                    }
                                })
                                tileSubscriptions.push(obstacleSubscription)
                            })
                    })

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
                        // Handle chevron opacity if concealed by cloud
                        if (cloudPositions && JSON.stringify(cloudPositions).includes(JSON.stringify(position))) {
                            Materials.findFirst("invisible_chevron")
                                .then(mat => {
                                    tileUi.findAll("Box001__0")
                                        .then(meshes => meshes.forEach(mesh => {
                                            mesh.material = mat
                                        }))
                                })
                        }

                        // Set tile position
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

    // Handle swapping concealed tiles
    tileUi.findAll("Box001__0")
        .then(meshes => meshes.forEach(mesh => {
            if (cloudPositions && JSON.stringify(cloudPositions).includes(JSON.stringify(position1))) {
                Materials.findFirst("invisible_chevron")
                    .then(mat => mesh.material = mat)
            } else {
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
                } else if (currentWorld === 3) {
                    if (level.flippedTiles && level.flippedTiles.includes(parseInt(tileUi.name.match(/\d/g).join('')))) {
                        Materials.findFirst('chevron_red')
                            .then(mat => {
                                mesh.material = mat
                            })
                    } else {
                        Materials.findFirst('chevron_yellow')
                            .then(mat => {
                                mesh.material = mat
                            })
                    }
                }
            }}))

    selection.findAll("Box001__0")
        .then(meshes => meshes.forEach(mesh => {
            if (cloudPositions && JSON.stringify(cloudPositions).includes(JSON.stringify(position2))) {
                Materials.findFirst("invisible_chevron")
                    .then(mat => mesh.material = mat)
            } else {
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
                } else if (currentWorld === 3) {
                    if (level.flippedTiles && level.flippedTiles.includes(parseInt(selection.name.match(/\d/g).join('')))) {
                        Materials.findFirst('chevron_red')
                            .then(mat => {
                                mesh.material = mat
                            })
                    } else {
                        Materials.findFirst('chevron_yellow')
                            .then(mat => {
                                mesh.material = mat
                            })
                    }
                }
            }}))

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

                    // Unsubscribe event listeners
                    Time.clearInterval(moveAgentIntervalID)
                    pirateSubscription.unsubscribe()
                    tileSubscriptions.map(subscription => subscription.unsubscribe())

                    // Show world completed display
                    Materials.findFirst(`${currentWorld === 1 ? 'grass' : currentWorld === 2 ? 'snow' : 'desert'}_complete`).then(mat => mat.opacity = 1)

                    // TODO: Game end animation
                    Scene.root.findFirst("mover")
                        .then(mover => {
                            animateMoveAgentAndPlatform(mover, agent, [3,8], 'right', [6,6], [7,6], 'right')
                            timeouts['gameEndTransition'] = Time.setTimeout(() => animateGameEnd(agent), 2500)
                        })
                } else {
                    // Advance to next level
                    currentLevel += 1

                    // Unsubscribe event listeners
                    Time.clearInterval(moveAgentIntervalID)
                    pirateSubscription.unsubscribe()
                    tileSubscriptions.map(subscription => subscription.unsubscribe())
                    
                    // TODO: Level transition
                    animateLevelTransition(agent)

                    timeouts['levelTransition'] = Time.setTimeout(() => initLevel(), 2500)
                }
            }, 4000)
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
    yValue = animation === "active" ? yValue + 0.02 : TOP_LEFT_Y;

    tile.transform.y = Animation.animate(
        tdTileMove,
        Animation.samplers.linear(tile.transform.y.pinLastValue(), yValue)
    );
    
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
    if (currentWorld === 3) {
        for (let i = 1; i <= 5; i++) {
            unanimateLevelVisitedTiles(i)
        }
    } else {
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
}

function unanimateLevelVisitedTiles(level = currentLevel) {
    Scene.root.findFirst(`world${currentWorld}`)
        .then(world => {
            world.findFirst(`level${level}`)
                .then(levelObj => {
                    levelObj.findAll("Box001__0")
                        .then(meshes => {
                            meshes.forEach(mesh => {
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
                                } else if (currentWorld === 3) {
                                    Materials.findFirst('chevron_yellow')
                                        .then(mat => {
                                            mesh.material = mat
                                        })
                                }
                            })

                            // If reversed tile, restore red chevron
                            LEVELS[`world${currentWorld}`][`level${level}`].flippedTiles.forEach(tileNo => {
                                levelObj.findFirst(`tile${tileNo}`)
                                    .then(tileUi => tileUi.findAll("Box001__0")
                                        .then(meshes => meshes.forEach(mesh => {
                                            Materials.findFirst('chevron_red')
                                                .then(mat => {
                                                    mesh.material = mat
                                                })
                                        }))
                                    )
                            })
                        })
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

function animateLevelTransition(agent) {

    Scene.root.findFirst("mover")
        .then(mover => {
            switch (currentLevel) {
                case 2:
                    animateMoveAgentAndPlatform(mover, agent, [13,5], 'down', [15,6], [15,7], 'down')
                    break
                case 3:
                    if (currentWorld === 1)
                        animateMoveAgentAndPlatform(mover, agent, [16,11], 'left', [15,13], [15,14], 'down')
                    else if (currentWorld === 2 || currentWorld === 3)
                        animateMoveAgentAndPlatform(mover, agent, [17,12], 'left', [15,13], [15,14], 'down')
                    break
                case 4:
                    animateMoveAgentAndPlatformTwoSteps(mover, agent, [17,19], 'left', [13,19], [13,16], [13,15], 'up')
                    break
                case 5:
                    animateMoveAgentAndPlatform(mover, agent, [7,18], 'up', [6,15], [6,14], 'up')
                    break
                default:
            }
        })
}

function animateMoveAgentAndPlatform(mover, agent, moverPosition, hopOnDirection, moverDestination, newStartPosition, hopOffDirection) {
    const tdMoverFall = getTimeDriver(300)
    const tdMoverMove = getTimeDriver(1000)

    // Drop mover from sky
    mover.hidden = false
    mover.transform.x = getCoordinateXFromIndex(moverPosition[0])
    mover.transform.z = getCoordinateZFromIndex(moverPosition[1])
    mover.transform.y = Animation.animate(
        tdMoverFall,
        Animation.samplers.easeInOutBounce(2, -0.7588)
    )
    tdMoverFall.start()
    
    timeouts['levelTransitionAgentMoveOn'] = Time.setTimeout(() => {
        // Move agent onto platform
        animateMoveAgent(agent, moverPosition, hopOnDirection, 2)

        timeouts['levelTransitionPlatformMove'] = Time.setTimeout(() => {
            // Move platform to new start tile
            mover.transform.x = Animation.animate(
                tdMoverMove,
                Animation.samplers.linear(mover.transform.x.pinLastValue(), getCoordinateXFromIndex(moverDestination[0]))
            )
            mover.transform.z = Animation.animate(
                tdMoverMove,
                Animation.samplers.linear(mover.transform.z.pinLastValue(), getCoordinateZFromIndex(moverDestination[1]))
            )

            // Move agent with platform
            const midpoints = getMidPointFromIndex(moverDestination)
            agent.transform.x = Animation.animate(
                tdMoverMove,
                Animation.samplers.linear(agent.transform.x.pinLastValue(), midpoints[0])
            )
            agent.transform.z = Animation.animate(
                tdMoverMove,
                Animation.samplers.linear(agent.transform.z.pinLastValue(), midpoints[1])
            )
            tdMoverMove.start()
            
            timeouts['levelTransitionAgentMoveOff'] = Time.setTimeout(() => {
                // Move agent off platform
                animateMoveAgent(agent, newStartPosition, hopOffDirection, 2)
            }, 1000)
        }, 1000)
    }, 300)
}

function animateMoveAgentAndPlatformTwoSteps(mover, agent, moverPosition, hopOnDirection, moverDestination1, moverDestination2, newStartPosition, hopOffDirection) {
    const tdMoverFall = getTimeDriver(300)
    const tdMoverMove1 = getTimeDriver(500)
    const tdMoverMove2 = getTimeDriver(500)

    // Drop mover from sky
    mover.hidden = false
    mover.transform.x = getCoordinateXFromIndex(moverPosition[0])
    mover.transform.z = getCoordinateZFromIndex(moverPosition[1])
    mover.transform.y = Animation.animate(
        tdMoverFall,
        Animation.samplers.easeInOutBounce(2, -0.7588)
    )
    tdMoverFall.start()
    
    timeouts['levelTransitionAgentMoveOn'] = Time.setTimeout(() => {
        // Move agent onto platform
        animateMoveAgent(agent, moverPosition, hopOnDirection, 2)

        timeouts['levelTransitionPlatformMove'] = Time.setTimeout(() => {
            // Move platform to midpoint
            mover.transform.x = Animation.animate(
                tdMoverMove1,
                Animation.samplers.linear(mover.transform.x.pinLastValue(), getCoordinateXFromIndex(moverDestination1[0]))
            )
            mover.transform.z = Animation.animate(
                tdMoverMove1,
                Animation.samplers.linear(mover.transform.z.pinLastValue(), getCoordinateZFromIndex(moverDestination1[1]))
            )

            // Move agent with platform
            let midpoints = getMidPointFromIndex(moverDestination1)
            agent.transform.x = Animation.animate(
                tdMoverMove1,
                Animation.samplers.linear(agent.transform.x.pinLastValue(), midpoints[0])
            )
            agent.transform.z = Animation.animate(
                tdMoverMove1,
                Animation.samplers.linear(agent.transform.z.pinLastValue(), midpoints[1])
            )
            tdMoverMove1.start()

            timeouts['levelTransitionAgentMoveOff'] = Time.setTimeout(() => {
                // Begin second half of movement
                // Move platform to new start tile
                mover.transform.x = Animation.animate(
                    tdMoverMove2,
                    Animation.samplers.linear(mover.transform.x.pinLastValue(), getCoordinateXFromIndex(moverDestination2[0]))
                )
                mover.transform.z = Animation.animate(
                    tdMoverMove2,
                    Animation.samplers.linear(mover.transform.z.pinLastValue(), getCoordinateZFromIndex(moverDestination2[1]))
                )

                // Move agent with platform
                midpoints = getMidPointFromIndex(moverDestination2)
                agent.transform.x = Animation.animate(
                    tdMoverMove2,
                    Animation.samplers.linear(agent.transform.x.pinLastValue(), midpoints[0])
                )
                agent.transform.z = Animation.animate(
                    tdMoverMove2,
                    Animation.samplers.linear(agent.transform.z.pinLastValue(), midpoints[1])
                )
                tdMoverMove2.start()
            }, 500)
            
            timeouts['levelTransitionAgentMoveOff'] = Time.setTimeout(() => {
                // Move agent off platform
                animateMoveAgent(agent, newStartPosition, hopOffDirection, 2)
            }, 1000)
        }, 1000)
    }, 300)
}

function animateGameEnd(agent) {
    const tdReverse = getTimeDriver(1000)
    const tdRotate = getTimeDriver(1000)
    const tdMove = getTimeDriver(2000)

    // Reverse ship and player
    Scene.root.findFirst("ship_light")
        .then(ship => {
            ship.transform.z = Animation.animate(
                tdReverse,
                Animation.samplers.easeInOutExpo(ship.transform.z.pinLastValue(), ship.transform.z.pinLastValue() - 0.85)
            )
            agent.transform.z = Animation.animate(
                tdReverse,
                Animation.samplers.easeInOutExpo(agent.transform.z.pinLastValue(), agent.transform.z.pinLastValue() - 0.85)
            )

            tdReverse.start()

            timeouts['shipRotate'] = Time.setTimeout(() => {
                ship.transform.rotationY = Animation.animate(
                    tdRotate,
                    Animation.samplers.easeInOutExpo(ship.transform.rotationY.pinLastValue(), degreesToRadians(180))
                )
                agent.transform.x = Animation.animate(
                    tdRotate,
                    Animation.samplers.linear(agent.transform.x.pinLastValue(), agent.transform.x.pinLastValue() + 0.075)
                )

                tdRotate.start()

                timeouts['shipMoveOff'] = Time.setTimeout(() => {
                    ship.transform.z = Animation.animate(
                        tdMove,
                        Animation.samplers.easeInOutExpo(ship.transform.z.pinLastValue(), ship.transform.z.pinLastValue() - 17.8)
                    )
                    agent.transform.z = Animation.animate(
                        tdMove,
                        Animation.samplers.easeInOutExpo(agent.transform.z.pinLastValue(), agent.transform.z.pinLastValue() - 17.8)
                    )

                    tdMove.start()
                }, 1000)
            }, 1000)
        })
}