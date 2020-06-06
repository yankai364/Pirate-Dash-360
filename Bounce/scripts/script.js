/**
 * (c) Facebook, Inc. and its affiliates. Confidential and proprietary.
 */

//==============================================================================
// Welcome to scripting in Spark AR Studio! Helpful links:
//
// Scripting Basics - https://fb.me/spark-scripting-basics
// Reactive Programming - https://fb.me/spark-reactive-programming
// Scripting Object Reference - https://fb.me/spark-scripting-reference
// Changelogs - https://fb.me/spark-changelog
//
// For projects created with v87 onwards, JavaScript is always executed in strict mode.
//==============================================================================

// How to load in modules
const Scene = require('Scene');
const TouchGestures = require("TouchGestures");
const Reactive = require("Reactive");
const Animation = require("Animation");
const Time = require("Time");

// Use export keyword to make a symbol available in scripting debug console
export const Diagnostics = require('Diagnostics');

// To use variables and functions across files, use export/import keyword
// export const animationDuration = 10;

// Use import keyword to import a symbol from another file
// import { animationDuration } from './script.js'

// To access scene objects
// const directionalLight = Scene.root.find('directionalLight0');
const blocks = Scene.root.find("blocks");
const bomb = Scene.root.find("bomb");
const readyBtn = Scene.root.find("ready");
let ready = false

let selection = null

const tdpBlockMove = {
    durationMilliseconds: 100,
    loopCount: 1,
    mirror: false
};

const tdpBombMove = {
    durationMilliseconds: 800,
    loopCount: 1,
    mirror: false
};

const tdpBombBounce = {
    durationMilliseconds: 399,
    loopCount: Infinity,
    mirror: true
};

const tdBlockMove = Animation.timeDriver(tdpBlockMove);
const tdBombBounce = Animation.timeDriver(tdpBombBounce);

const shiftBombY = Animation.animate(
    tdBombBounce,
    Animation.samplers.easeOutQuad(
        -0.6833,
        -0.6833 + 0.3
    )
);

TouchGestures.onTap(readyBtn).subscribe(function() {
    ready = true
})


for (let i = 1; i <= 8; i++) {
    let block = blocks.child("block" + i);

    const active = Animation.animate(
        tdBlockMove,
        Animation.samplers.linear(
            block.transform.y.pinLastValue(),
            block.transform.y.pinLastValue() + 0.02
        )
    );

    const blur = Animation.animate(
        tdBlockMove,
        Animation.samplers.linear(
            block.transform.y.pinLastValue() + 0.02,
            block.transform.y.pinLastValue()
        )
    );

    const shiftx = (destination) => Animation.animate(
        tdBlockMove,
        Animation.samplers.linear(
            block.transform.x.pinLastValue(),
            destination
        )
    );

    const shiftz = (destination) => Animation.animate(
        tdBlockMove,
        Animation.samplers.linear(
            block.transform.z.pinLastValue(),
            destination
        )
    );

    TouchGestures.onTap(block).subscribe(function() {
        const tdBombMove = Animation.timeDriver(tdpBombMove);

        const shiftBombX = (destination) => Animation.animate(
            tdBombMove,
            Animation.samplers.linear(
                bomb.transform.x.pinLastValue(),
                destination - 0.09
            )
        );
        const shiftBombZ = (destination) => Animation.animate(
            tdBombMove,
            Animation.samplers.linear(
                bomb.transform.z.pinLastValue(),
                destination + 0.09
            )
        );

        if (ready) {
            tdBombBounce.start()
            bomb.transform.y = shiftBombY
            tdBombMove.start()
            bomb.transform.x = shiftBombX(block.transform.x.lastValue)
            bomb.transform.z = shiftBombZ(block.transform.z.lastValue)
        } else {
            if (selection === null) {
                selection = block
                tdBlockMove.start()
                block.transform.y = active
            } else {
                // swap
                if (block === selection) {
                    block.transform.y = blur
                    selection = null
                } else {
                    block.transform.y = active
                    let block1x = selection.transform.x.lastValue
                    let block1z = selection.transform.z.lastValue
                    selection.transform.x = shiftx(block.transform.x.lastValue)
                    selection.transform.z = shiftz(block.transform.z.lastValue)
                    block.transform.x = shiftx(block1x)
                    block.transform.z = shiftz(block1z)
                    block.transform.y = blur
                    selection.transform.y = blur
                    selection = null
                }
            }
        }
    })
}

tdBombBounce.onAfterIteration().subscribe(() => {
    // bomb.transform.x = bomb.transform.x.lastValue
    //check which block bomb is on
    // if (bomb.transform.y.lastValue < -0.4833) {
    //     Diagnostics.log(bomb.transform.x.lastValue)
    // }
    // Diagnostics.log(bomb.transform.z.lastValue)
    // Diagnostics.log(bomb.transform.y.lastValue)
    //disable block
    //obtain next block coordinates
    //move to new coordinates
})

// To access class properties
// const directionalLightIntensity = directionalLight.intensity;

// To log messages to the console
// Diagnostics.log('Console message logged from the script.');
