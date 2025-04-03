// Get the canvas element
const canvas = document.getElementById("renderCanvas");

// Create the Babylon.js engine
const engine = new BABYLON.Engine(canvas, true); // Enable anti-aliasing

// --- Constants ---
const LANE_WIDTH = 8;
const LANE_HEIGHT = 0.1;
const LANE_DEPTH = 30;
const LANE_POS_Y = 0;

const PIN_HEIGHT = 1.0;
const PIN_DIAMETER_TOP = 0.2;
const PIN_DIAMETER_BOTTOM = 0.4;
const PIN_MASS = 0.5;
const PIN_RESTITUTION = 0.8;
const PIN_FRICTION = 0.2;
const PIN_FALLEN_THRESHOLD = 0.7; // Dot product threshold (lower = more tilted to count)

const BALL_DIAMETER = 0.8;
const BALL_MASS = 5;
const BALL_RESTITUTION = 0.5;
const BALL_FRICTION = 0.4;
const MIN_LAUNCH_FORCE = 20; // Minimum force when tapping spacebar
const MAX_LAUNCH_FORCE = 150; // Maximum force after full charge
const MAX_CHARGE_TIME = 1500; // Milliseconds to reach max power

const ARROW_OSCILLATION_SPEED = 1.5;
const ARROW_MAX_ANGLE = Math.PI / 6; // Max swing angle (30 degrees each way)
const ARROW_LENGTH_MIN = 1.5;
const ARROW_LENGTH_MAX = 4.0;

// --- Calculated Positions ---
const LANE_TOP_Y = LANE_POS_Y + (LANE_HEIGHT / 2);
const PIN_BASE_OFFSET_Y = PIN_HEIGHT / 2;
const PIN_START_Y = LANE_TOP_Y + PIN_BASE_OFFSET_Y;

const BALL_RADIUS = BALL_DIAMETER / 2;
const BALL_START_Y = LANE_TOP_Y + BALL_RADIUS;

// --- Global Variables ---
let bowlingBall;
let pins = [];
let directionArrow;
let score = 0;
let scoreText; // GUI TextBlock for score
let fallenPinIndicesThisThrow = new Set(); // Tracks pins fallen in the current throw

// Game States
const GameState = {
    AIMING: 0,
    CHARGING: 1,
    BALL_ROLLING: 2,
    RESETTING: 3, // Used during full reset
    ENDED: 4 // Optional: If you add turns/frames
};
let currentGameState = GameState.AIMING;

// Aiming & Power Variables
let currentAimAngle = 0;
let chargeStartTime = 0;
let launchPower = MIN_LAUNCH_FORCE;
let lastFrameTime = 0; // For delta time calculation

// Define pin starting positions using calculated Y
const pinPositions = [
     // Row 4 (back)
     new BABYLON.Vector3(-1.5, PIN_START_Y, 20), new BABYLON.Vector3(-0.5, PIN_START_Y, 20), new BABYLON.Vector3(0.5, PIN_START_Y, 20), new BABYLON.Vector3(1.5, PIN_START_Y, 20),
     // Row 3
     new BABYLON.Vector3(-1, PIN_START_Y, 19), new BABYLON.Vector3(0, PIN_START_Y, 19), new BABYLON.Vector3(1, PIN_START_Y, 19),
     // Row 2
     new BABYLON.Vector3(-0.5, PIN_START_Y, 18), new BABYLON.Vector3(0.5, PIN_START_Y, 18),
     // Row 1 (front)
     new BABYLON.Vector3(0, PIN_START_Y, 17)
];
// Define ball starting position using calculated Y
const BALL_START_POS = new BABYLON.Vector3(0, BALL_START_Y, -5);

// --- Helper Functions ---

function createMaterials(scene) {
    const woodMaterial = new BABYLON.StandardMaterial("woodMat", scene);
    woodMaterial.diffuseColor = new BABYLON.Color3(0.7, 0.5, 0.3);

    const pinMaterial = new BABYLON.StandardMaterial("pinMat", scene);
    pinMaterial.diffuseColor = new BABYLON.Color3(0.95, 0.95, 1);
    pinMaterial.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);

    const ballMaterial = new BABYLON.StandardMaterial("ballMat", scene);
    ballMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.6);
    ballMaterial.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    ballMaterial.specularPower = 32;

    const arrowMaterial = new BABYLON.StandardMaterial("arrowMat", scene);
    arrowMaterial.diffuseColor = BABYLON.Color3.Green(); // Start green
    arrowMaterial.emissiveColor = new BABYLON.Color3(0, 0.4, 0); // Give it some glow
    arrowMaterial.disableLighting = true; // Make it always visible regardless of light

    return { woodMaterial, pinMaterial, ballMaterial, arrowMaterial };
}

function createGUI(scene) {
    const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

    // --- Score Text (Top Left) ---
    scoreText = new BABYLON.GUI.TextBlock("scoreText", "Score: 0"); // Give it a name/ID
    scoreText.color = "white";
    scoreText.fontSize = 24;
    scoreText.outlineWidth = 2;
    scoreText.outlineColor = "black";
    scoreText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    scoreText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    scoreText.paddingTop = "10px";
    scoreText.paddingLeft = "10px";
    advancedTexture.addControl(scoreText);

    // --- Controls Text (Top Right) ---
    const controlsString = "Right Mouse: Rotate/Pan\nMouse Wheel: Zoom\nSpacebar: Aim/Charge/Throw\nR: Reset Game"; // Use \n for new lines

    const controlsText = new BABYLON.GUI.TextBlock("controlsText", controlsString); // Give it a name/ID
    controlsText.color = "white";
    controlsText.fontSize = 16;
    controlsText.outlineWidth = 2;
    controlsText.outlineColor = "black";
    controlsText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT; // Align Right
    controlsText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;     // Align Top
    controlsText.textWrapping = true;
    controlsText.paddingTop = "10px";
    controlsText.paddingRight = "10px"; // Use paddingRight for right alignment
    advancedTexture.addControl(controlsText); // Add this new text block
}

function updateScoreDisplay() {
    if (scoreText) {
        scoreText.text = "Score: " + score;
    }
}

function createDirectionArrow(scene, materials) {
    // Create arrow shape (thin cylinder + cone tip)
    const body = BABYLON.MeshBuilder.CreateCylinder("arrowBody", { height: 1, diameter: 0.08 }, scene); // Height will be scaled
    const head = BABYLON.MeshBuilder.CreateCylinder("arrowHead", { height: 0.2, diameterTop: 0, diameterBottom: 0.2 }, scene);
    head.position.y = 0.5 + 0.1; // Position tip at the end of the body's initial height

    // Merge into a single mesh for easier handling
    const arrowMesh = BABYLON.Mesh.MergeMeshes([body, head], true, true, undefined, false, true);
    if (!arrowMesh) {
        console.error("Failed to merge arrow meshes");
        return null;
    }
    arrowMesh.name = "directionArrow";
    arrowMesh.material = materials.arrowMaterial;
    arrowMesh.rotation.x = Math.PI / 2; // Rotate to point forward (along Z)
    arrowMesh.scaling.y = ARROW_LENGTH_MIN; // Initial length corresponds to scaling Y because of the rotation

    // Set pivot point for rotation at the base of the arrow (relative to its local coords)
    arrowMesh.setPivotPoint(new BABYLON.Vector3(0, -0.5, 0)); // Pivot at the bottom center

    // Position arrow relative to ball start
    arrowMesh.position = BALL_START_POS.clone();
    arrowMesh.position.z += BALL_RADIUS + 0.2; // Place slightly in front of the ball
    arrowMesh.position.y += 0.1; // Slightly above the lane

    arrowMesh.isVisible = false; // Start hidden, show only when aiming
    return arrowMesh;
}

function updateArrowAiming(arrow, time) {
    // Oscillate angle between -ARROW_MAX_ANGLE and +ARROW_MAX_ANGLE
    currentAimAngle = Math.sin(time * ARROW_OSCILLATION_SPEED) * ARROW_MAX_ANGLE;
    // Rotate around its local Z axis (which points up/down in world space after the initial X rotation)
    arrow.rotation.z = currentAimAngle;
}

function updateArrowCharging(arrow, chargedTime) {
    const chargeRatio = Math.min(chargedTime / MAX_CHARGE_TIME, 1.0); // Clamp between 0 and 1
    launchPower = MIN_LAUNCH_FORCE + (MAX_LAUNCH_FORCE - MIN_LAUNCH_FORCE) * chargeRatio;

    // Update arrow length (scaling)
    arrow.scaling.y = ARROW_LENGTH_MIN + (ARROW_LENGTH_MAX - ARROW_LENGTH_MIN) * chargeRatio;

    // Update arrow color (Green -> Yellow -> Red)
    const color = BABYLON.Color3.Lerp(BABYLON.Color3.Green(), BABYLON.Color3.Red(), chargeRatio);
    if (arrow.material instanceof BABYLON.StandardMaterial) { // Type check for safety
        arrow.material.diffuseColor = color;
        arrow.material.emissiveColor = color.scale(0.4); // Maintain some glow
    }
}

function checkFallenPins() {
    let pinsDownThisCheck = 0;
    pins.forEach((pin, index) => {
        // Check if pin exists, has physics, and hasn't been counted yet in this throw
        if (pin && pin.physicsImpostor && !fallenPinIndicesThisThrow.has(index)) {
            // Get the pin's local up vector (Y-axis) in world space
            // Using rotationQuaternion is more reliable if available
            const localUp = pin.rotationQuaternion ?
                            BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y, pin.computeWorldMatrix(true)) :
                            pin.getDirection(BABYLON.Axis.Y);

            // Calculate the dot product with the world up vector
            const dotProduct = BABYLON.Vector3.Dot(localUp.normalize(), BABYLON.Axis.Y);

            // If the dot product is below the threshold, the pin is significantly tilted
            if (dotProduct < PIN_FALLEN_THRESHOLD) {
                score++;
                pinsDownThisCheck++;
                fallenPinIndicesThisThrow.add(index); // Mark as fallen for this throw
                // Optional: Change pin color or hide it
                // if (pin.material instanceof BABYLON.StandardMaterial) {
                //    pin.material.emissiveColor = BABYLON.Color3.Red();
                // }
            }
        }
    });

    if (pinsDownThisCheck > 0) {
        updateScoreDisplay();
    }
}

function isBallStopped() {
    if (!bowlingBall || !bowlingBall.physicsImpostor) return true; // No ball or physics

    const linVel = bowlingBall.physicsImpostor.getLinearVelocity();
    const angVel = bowlingBall.physicsImpostor.getAngularVelocity();
    const threshold = 0.1; // Velocity threshold to consider stopped

    // Check if velocities are defined and below threshold
    return linVel && angVel &&
           linVel.lengthSquared() < threshold &&
           angVel.lengthSquared() < threshold;
}

function resetForNextThrow() {
    console.log("Resetting for next throw...");
    currentGameState = GameState.RESETTING; // Briefly indicate resetting state

    // Reset ball physics and position
    if (bowlingBall && bowlingBall.physicsImpostor) {
        bowlingBall.physicsImpostor.setLinearVelocity(BABYLON.Vector3.Zero());
        bowlingBall.physicsImpostor.setAngularVelocity(BABYLON.Vector3.Zero());
        // Force sleep state might help stability in some physics engines
        // bowlingBall.physicsImpostor.sleep();
    }
    if (bowlingBall) {
        bowlingBall.position = BALL_START_POS.clone();
        // Force update of transforms after manual position change
        bowlingBall.computeWorldMatrix(true);
    }

    // Reset arrow state
    if (directionArrow) {
        directionArrow.rotation.z = 0;
        directionArrow.scaling.y = ARROW_LENGTH_MIN;
        if (directionArrow.material instanceof BABYLON.StandardMaterial) {
             directionArrow.material.diffuseColor = BABYLON.Color3.Green();
             directionArrow.material.emissiveColor = BABYLON.Color3.Green().scale(0.4);
        }
        directionArrow.isVisible = true;
        directionArrow.position = BALL_START_POS.clone(); // Ensure it's back at start
        directionArrow.position.z += BALL_RADIUS + 0.2;
        directionArrow.position.y += 0.1;
    }

    // Reset aiming/charging state
    fallenPinIndicesThisThrow.clear(); // Clear fallen pins for the new throw
    launchPower = MIN_LAUNCH_FORCE;
    currentAimAngle = 0;

     // Optional: Make remaining pins non-emissive if they were marked
    pins.forEach((pin, index) => {
        if (pin && pin.material instanceof BABYLON.StandardMaterial && !fallenPinIndicesThisThrow.has(index)) {
           // pin.material.emissiveColor = BABYLON.Color3.Black(); // Reset color if changed
        }
    });

    // Allow slight delay before switching back to aiming, helps physics settle
    setTimeout(() => {
         if (currentGameState === GameState.RESETTING) { // Only switch if still in resetting state
             currentGameState = GameState.AIMING;
         }
    }, 100); // 100ms delay

}

function resetGame(scene) {
    console.log("Resetting game...");
    currentGameState = GameState.RESETTING; // Indicate resetting

    // --- Dispose existing physics and meshes ---
    // Order matters: Dispose impostors first!
    if (bowlingBall && bowlingBall.physicsImpostor) {
        bowlingBall.physicsImpostor.dispose();
    }
    if (bowlingBall) {
        bowlingBall.dispose();
    }
    bowlingBall = null; // Clear reference

    pins.forEach(pin => {
        if (pin && pin.physicsImpostor) {
            pin.physicsImpostor.dispose();
        }
        if (pin) {
            pin.dispose();
        }
    });
    pins = []; // Clear the array

    if (directionArrow) {
        // Arrow doesn't have physics impostor, just dispose mesh
        directionArrow.dispose();
        directionArrow = null; // Clear reference
    }

    // --- Recreate elements ---
    // Get existing materials by name (safer than assuming they exist globally)
    const materials = {
        woodMaterial: scene.getMaterialByName("woodMat"),
        pinMaterial: scene.getMaterialByName("pinMat"),
        ballMaterial: scene.getMaterialByName("ballMat"),
        arrowMaterial: scene.getMaterialByName("arrowMat")
    };

    // Recreate Pins
    pinPositions.forEach((pos, index) => {
        const pin = BABYLON.MeshBuilder.CreateCylinder(`pin${index}`, {
            height: PIN_HEIGHT, diameterTop: PIN_DIAMETER_TOP, diameterBottom: PIN_DIAMETER_BOTTOM, tessellation: 24
        }, scene);
        pin.position = pos.clone();
        pin.material = materials.pinMaterial;
        // Optional: Ensure emissive is off on reset
        // if (pin.material instanceof BABYLON.StandardMaterial) {
        //     pin.material.emissiveColor = BABYLON.Color3.Black();
        // }
        pin.physicsImpostor = new BABYLON.PhysicsImpostor(pin, BABYLON.PhysicsImpostor.CylinderImpostor, {
            mass: PIN_MASS, restitution: PIN_RESTITUTION, friction: PIN_FRICTION
        }, scene);
        pins.push(pin); // Add new pin to the array
    });

    // Recreate Ball
    bowlingBall = BABYLON.MeshBuilder.CreateSphere("bowlingBall", {
        diameter: BALL_DIAMETER, segments: 32
    }, scene);
    bowlingBall.position = BALL_START_POS.clone();
    bowlingBall.material = materials.ballMaterial;
    bowlingBall.physicsImpostor = new BABYLON.PhysicsImpostor(bowlingBall, BABYLON.PhysicsImpostor.SphereImpostor, {
        mass: BALL_MASS, restitution: BALL_RESTITUTION, friction: BALL_FRICTION
    }, scene);

    // Recreate Arrow
    directionArrow = createDirectionArrow(scene, materials); // Use the creation function

    // Reset Score and State
    score = 0;
    updateScoreDisplay();
    resetForNextThrow(); // Sets state back towards AIMING, resets arrow etc.

    console.log("Game reset complete.");
}


// --- Create Scene Function ---
const createScene = function () {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3(0.8, 0.9, 1);

    // --- Physics ---
    const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
    // Use the legacy CannonJSPlugin constructor signature for older Babylon versions if needed
    // const physicsPlugin = new BABYLON.CannonJSPlugin(true, 10, cannon); // requires global cannon object
    const physicsPlugin = new BABYLON.CannonJSPlugin(); // Simpler constructor for recent versions
    scene.enablePhysics(gravityVector, physicsPlugin);
    // Optional: Increase physics substeps for stability, especially with fast objects
    // scene.getPhysicsEngine().setTimeStep(1 / 120); // Default is 1/60


    // --- Camera ---
    const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3.5, 40, new BABYLON.Vector3(0, 5, 0), scene);
    // Default ArcRotateCamera Controls: Left=Rotate, Right/Ctrl+Left=Pan, Wheel=Zoom
    camera.attachControl(canvas, true); // true = prevent default browser actions on canvas
    camera.lowerRadiusLimit = 15;
    camera.upperRadiusLimit = 60;
    camera.wheelPrecision = 50; // Controls zoom sensitivity
    camera.panningSensibility = 1000; // Controls panning sensitivity (lower = faster)
    camera.target = new BABYLON.Vector3(0, 0, 10); // Initial camera focus

    // --- Light ---
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.8;
    const light2 = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 5, -10), scene);
    light2.intensity = 0.5;

    // --- Materials ---
    // Create materials once, they will be reused in resetGame by name
    createMaterials(scene);

    // --- GUI ---
    createGUI(scene); // Creates score and controls text

    // --- Ground (Lane) ---
    const lane = BABYLON.MeshBuilder.CreateBox("lane", { width: LANE_WIDTH, height: LANE_HEIGHT, depth: LANE_DEPTH }, scene);
    lane.position = new BABYLON.Vector3(0, LANE_POS_Y, 10);
    lane.material = scene.getMaterialByName("woodMat");
    lane.physicsImpostor = new BABYLON.PhysicsImpostor(lane, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);

    // --- Initial Setup ---
    // resetGame now handles creating the initial ball, pins, and arrow
    resetGame(scene);

    // --- Scene Ready Actions ---
     scene.onReadyObservable.addOnce(() => {
        console.log("Scene is ready!");
        // Start the game loop timing and ensure correct initial state
         lastFrameTime = performance.now();
         // resetGame should leave the state as AIMING after its internal setTimeout
         // currentGameState = GameState.AIMING; // Explicitly set if needed
         if (directionArrow) directionArrow.isVisible = true; // Ensure arrow visible at start
    });

    return scene;
};

// --- Create and Render ---
let currentScene = createScene(); // Initialize the scene

// Render loop - Use engine's deltaTime for smoother physics/animations
engine.runRenderLoop(function () {
    if (!currentScene) return;

    const deltaTime = engine.getDeltaTime() / 1000.0; // Delta time in seconds
    const now = performance.now();
    const timeSeconds = now / 1000.0; // Absolute time in seconds for oscillation

    switch (currentGameState) {
        case GameState.AIMING:
            if (directionArrow) {
                directionArrow.isVisible = true; // Ensure visible
                updateArrowAiming(directionArrow, timeSeconds);
            }
            break;

        case GameState.CHARGING:
            if (directionArrow) {
                const chargedTime = now - chargeStartTime;
                updateArrowCharging(directionArrow, chargedTime);
            }
            break;

        case GameState.BALL_ROLLING:
            if (directionArrow) directionArrow.isVisible = false; // Hide arrow
            checkFallenPins(); // Check score while rolling

            // Check if ball has stopped after physics has simulated for a frame
            if (isBallStopped()) {
                 // Add a small delay before resetting to let physics fully settle
                 // and prevent immediate re-launch issues
                 if (!currentScene.metadata?.resetTimer) { // Prevent setting multiple timers
                     currentScene.metadata = currentScene.metadata || {}; // Ensure metadata exists
                     currentScene.metadata.resetTimer = setTimeout(() => {
                         console.log("Ball stopped, initiating reset.");
                         resetForNextThrow();
                         currentScene.metadata.resetTimer = null; // Clear the timer handle
                     }, 500); // 0.5 second delay after stopping
                 }
            } else {
                 // If ball starts moving again, cancel any pending reset timer
                 if (currentScene.metadata?.resetTimer) {
                    clearTimeout(currentScene.metadata.resetTimer);
                    currentScene.metadata.resetTimer = null;
                 }
            }
            break;

         case GameState.RESETTING:
             // Game is paused during reset or waiting for timeout
             break;
    }

    currentScene.render(deltaTime); // Pass deltaTime to render function if needed by scene components
});

// Handle window resize
window.addEventListener("resize", function () {
    engine.resize();
});

// --- Input Handling ---
window.addEventListener("keydown", function (event) {
    // Don't handle keydown if user is typing in an input field etc.
    // if (event.target !== document.body && event.target !== canvas) return;

    if (event.key === " " || event.code === "Space") {
        event.preventDefault(); // Prevent scrolling page on space press

        if (currentGameState === GameState.AIMING) {
            // Stop aiming, start charging
            currentGameState = GameState.CHARGING;
            chargeStartTime = performance.now(); // Record start time
            console.log("Charging power...");
            if(directionArrow) {
                // Freeze arrow direction at currentAimAngle, start power indicator
                 updateArrowCharging(directionArrow, 0); // Set to min power visually
            }
        }
    }
});

window.addEventListener("keyup", function (event) {
    // if (event.target !== document.body && event.target !== canvas) return;

     if (event.key === " " || event.code === "Space") {
         event.preventDefault();

         if (currentGameState === GameState.CHARGING) {
             // Launch the ball!
             currentGameState = GameState.BALL_ROLLING;
             console.log(`Launching with power: ${launchPower.toFixed(2)} at angle: ${(currentAimAngle * 180 / Math.PI).toFixed(1)} deg`);

             if (bowlingBall && bowlingBall.physicsImpostor) {
                 // Calculate direction based on final aim angle (Use -sin for correct visual match)
                 const launchDirection = new BABYLON.Vector3(
                     -Math.sin(currentAimAngle), // Inverted X component
                     0,
                     Math.cos(currentAimAngle)
                 ).normalize();

                 // Make sure ball physics isn't sleeping
                 bowlingBall.physicsImpostor.wakeUp();

                 const contactPoint = bowlingBall.getAbsolutePosition();

                 bowlingBall.physicsImpostor.applyImpulse(
                     launchDirection.scale(launchPower), // Scale direction by final power
                     contactPoint
                 );
             }
             if (directionArrow) {
                 directionArrow.isVisible = false; // Hide arrow after launch
             }
         }
     }

    // Reset game on 'R' key press
    if (event.key === "r" || event.key === "R") {
        // Allow reset from most states, except during another reset
        if(currentGameState !== GameState.RESETTING) {
             // Clear any pending auto-reset timer if 'R' is pressed
             if (currentScene?.metadata?.resetTimer) {
                 clearTimeout(currentScene.metadata.resetTimer);
                 currentScene.metadata.resetTimer = null;
             }
             resetGame(currentScene);
        }
    }
});