// --- START OF FILE game.js ---

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

// --- Texture Properties ---
const BALL_TEXTURE_U_SCALE = 4; // Horizontal tiling
const BALL_TEXTURE_V_SCALE = 4; // Vertical tiling
// <<<=== ADDED: Define texture rotation angle (180 degrees = PI radians)
const BALL_TEXTURE_W_ANGLE = Math.PI;

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

// --- Texture Paths ---
const ballTexturePaths = [
    "resources/textures/herta.jpg",
    "resources/textures/mutsuki.jpg",
    "resources/textures/paimon.jpg",
    "resources/textures/robin.jpg"
];

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
    // Lane Material
    const woodMaterial = new BABYLON.StandardMaterial("woodMat", scene);
    woodMaterial.diffuseColor = new BABYLON.Color3(0.7, 0.5, 0.3);

    // Pin Material
    const pinMaterial = new BABYLON.StandardMaterial("pinMat", scene);
    pinMaterial.diffuseColor = new BABYLON.Color3(0.95, 0.95, 1);
    pinMaterial.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);

    // Ball Material (Initial Setup)
    const ballMaterial = new BABYLON.StandardMaterial("ballMat", scene);
    ballMaterial.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    ballMaterial.specularPower = 32;

    // Load the *first* texture as the initial default
    if (ballTexturePaths.length > 0) {
        const defaultBallTexturePath = ballTexturePaths[0];
        try {
            const ballTexture = new BABYLON.Texture(defaultBallTexturePath, scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
                () => { // onLoad success
                    // Apply Tiling
                    ballTexture.uScale = BALL_TEXTURE_U_SCALE;
                    ballTexture.vScale = BALL_TEXTURE_V_SCALE;
                    // <<<=== MODIFIED: Apply Rotation
                    ballTexture.wAng = BALL_TEXTURE_W_ANGLE; // Rotate texture

                    ballMaterial.diffuseTexture = ballTexture;
                    ballMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1); // White base for texture
                    console.log("Initial ball texture loaded, tiled, and rotated:", defaultBallTexturePath);
                },
                (message, exception) => { // onError
                    console.error("Failed to load initial ball texture:", defaultBallTexturePath, message, exception);
                    ballMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.6); // Fallback color
                    console.warn("Falling back to solid color for bowling ball initially.");
                }
            );
        } catch (e) {
            console.error("Error initiating initial texture load:", defaultBallTexturePath, e);
            ballMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.6); // Fallback color
        }
    } else {
        console.warn("ballTexturePaths array is empty. Using solid color for ball.");
        ballMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.6); // Fallback color
    }

    // Arrow Material
    const arrowMaterial = new BABYLON.StandardMaterial("arrowMat", scene);
    arrowMaterial.diffuseColor = BABYLON.Color3.Green(); // Start green
    arrowMaterial.emissiveColor = new BABYLON.Color3(0, 0.4, 0); // Give it some glow
    arrowMaterial.disableLighting = true; // Make it always visible regardless of light

    return { woodMaterial, pinMaterial, ballMaterial, arrowMaterial };
}

function createGUI(scene) {
    const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

    // --- Score Text (Top Left) ---
    scoreText = new BABYLON.GUI.TextBlock("scoreText", "Score: 0");
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
    const controlsString = "Right Mouse: Rotate/Pan\nMouse Wheel: Zoom\nSpacebar: Aim/Charge/Throw\nR: Reset Game";
    const controlsText = new BABYLON.GUI.TextBlock("controlsText", controlsString);
    controlsText.color = "white";
    controlsText.fontSize = 16;
    controlsText.outlineWidth = 2;
    controlsText.outlineColor = "black";
    controlsText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    controlsText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    controlsText.textWrapping = true;
    controlsText.paddingTop = "10px";
    controlsText.paddingRight = "10px";
    advancedTexture.addControl(controlsText);
}

function updateScoreDisplay() {
    if (scoreText) {
        scoreText.text = "Score: " + score;
    }
}

function createDirectionArrow(scene, materials) {
    const body = BABYLON.MeshBuilder.CreateCylinder("arrowBody", { height: 1, diameter: 0.08 }, scene);
    const head = BABYLON.MeshBuilder.CreateCylinder("arrowHead", { height: 0.2, diameterTop: 0, diameterBottom: 0.2 }, scene);
    head.position.y = 0.5 + 0.1;

    const arrowMesh = BABYLON.Mesh.MergeMeshes([body, head], true, true, undefined, false, true);
    if (!arrowMesh) {
        console.error("Failed to merge arrow meshes");
        return null;
    }
    arrowMesh.name = "directionArrow";
    arrowMesh.material = materials.arrowMaterial;
    arrowMesh.rotation.x = Math.PI / 2;
    arrowMesh.scaling.y = ARROW_LENGTH_MIN;
    arrowMesh.setPivotPoint(new BABYLON.Vector3(0, -0.5, 0));
    arrowMesh.position = BALL_START_POS.clone();
    arrowMesh.position.z += BALL_RADIUS + 0.2;
    arrowMesh.position.y += 0.1;
    arrowMesh.isVisible = false;
    return arrowMesh;
}

function updateArrowAiming(arrow, time) {
    currentAimAngle = Math.sin(time * ARROW_OSCILLATION_SPEED) * ARROW_MAX_ANGLE;
    arrow.rotation.z = currentAimAngle;
}

function updateArrowCharging(arrow, chargedTime) {
    const chargeRatio = Math.min(chargedTime / MAX_CHARGE_TIME, 1.0);
    launchPower = MIN_LAUNCH_FORCE + (MAX_LAUNCH_FORCE - MIN_LAUNCH_FORCE) * chargeRatio;
    arrow.scaling.y = ARROW_LENGTH_MIN + (ARROW_LENGTH_MAX - ARROW_LENGTH_MIN) * chargeRatio;
    const color = BABYLON.Color3.Lerp(BABYLON.Color3.Green(), BABYLON.Color3.Red(), chargeRatio);
    if (arrow.material instanceof BABYLON.StandardMaterial) {
        arrow.material.diffuseColor = color;
        arrow.material.emissiveColor = color.scale(0.4);
    }
}

function checkFallenPins() {
    let pinsDownThisCheck = 0;
    pins.forEach((pin, index) => {
        if (pin && pin.physicsImpostor && !fallenPinIndicesThisThrow.has(index)) {
            const localUp = pin.rotationQuaternion ?
                            BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y, pin.computeWorldMatrix(true)) :
                            pin.getDirection(BABYLON.Axis.Y);
            const dotProduct = BABYLON.Vector3.Dot(localUp.normalize(), BABYLON.Axis.Y);
            if (dotProduct < PIN_FALLEN_THRESHOLD) {
                score++;
                pinsDownThisCheck++;
                fallenPinIndicesThisThrow.add(index);
            }
        }
    });
    if (pinsDownThisCheck > 0) {
        updateScoreDisplay();
    }
}

function isBallStopped() {
    if (!bowlingBall || !bowlingBall.physicsImpostor) return true;
    const linVel = bowlingBall.physicsImpostor.getLinearVelocity();
    const angVel = bowlingBall.physicsImpostor.getAngularVelocity();
    const threshold = 0.1;
    return linVel && angVel &&
           linVel.lengthSquared() < threshold &&
           angVel.lengthSquared() < threshold;
}

function resetForNextThrow() {
    console.log("Resetting for next throw...");
    currentGameState = GameState.RESETTING;

    if (bowlingBall && bowlingBall.physicsImpostor) {
        bowlingBall.physicsImpostor.setLinearVelocity(BABYLON.Vector3.Zero());
        bowlingBall.physicsImpostor.setAngularVelocity(BABYLON.Vector3.Zero());
    }
    if (bowlingBall) {
        bowlingBall.position = BALL_START_POS.clone();
        bowlingBall.computeWorldMatrix(true);
    }

    if (directionArrow) {
        directionArrow.rotation.z = 0;
        directionArrow.scaling.y = ARROW_LENGTH_MIN;
        if (directionArrow.material instanceof BABYLON.StandardMaterial) {
             directionArrow.material.diffuseColor = BABYLON.Color3.Green();
             directionArrow.material.emissiveColor = BABYLON.Color3.Green().scale(0.4);
        }
        directionArrow.isVisible = true;
        directionArrow.position = BALL_START_POS.clone();
        directionArrow.position.z += BALL_RADIUS + 0.2;
        directionArrow.position.y += 0.1;
    }

    fallenPinIndicesThisThrow.clear();
    launchPower = MIN_LAUNCH_FORCE;
    currentAimAngle = 0;

    setTimeout(() => {
         if (currentGameState === GameState.RESETTING) {
             currentGameState = GameState.AIMING;
         }
    }, 100);
}

function resetGame(scene) {
    console.log("Resetting game...");
    currentGameState = GameState.RESETTING;

    // --- Dispose existing physics and meshes ---
    if (bowlingBall && bowlingBall.physicsImpostor) bowlingBall.physicsImpostor.dispose();
    if (bowlingBall) bowlingBall.dispose();
    bowlingBall = null;

    pins.forEach(pin => {
        if (pin && pin.physicsImpostor) pin.physicsImpostor.dispose();
        if (pin) pin.dispose();
    });
    pins = [];

    if (directionArrow) {
        directionArrow.dispose();
        directionArrow = null;
    }

    // --- Get Materials ---
    let materials = {
        woodMaterial: scene.getMaterialByName("woodMat"),
        pinMaterial: scene.getMaterialByName("pinMat"),
        ballMaterial: scene.getMaterialByName("ballMat"),
        arrowMaterial: scene.getMaterialByName("arrowMat")
    };
    if (!materials.ballMaterial) {
        console.error("Ball material ('ballMat') not found during reset! Recreating materials.");
        materials = createMaterials(scene);
    }
    if (!materials.woodMaterial || !materials.pinMaterial || !materials.arrowMaterial) {
        console.warn("Some non-ball materials missing during reset.");
    }


    // <<<=== RANDOMIZE, TILE & ROTATE BALL TEXTURE ===>>>
    const ballMaterial = materials.ballMaterial;
    if (ballMaterial instanceof BABYLON.StandardMaterial && ballTexturePaths.length > 0) {
        const randomIndex = Math.floor(Math.random() * ballTexturePaths.length);
        const randomTexturePath = ballTexturePaths[randomIndex];
        console.log(`Applying random ball texture: ${randomTexturePath}`);

        try {
            if (ballMaterial.diffuseTexture && ballMaterial.diffuseTexture.dispose) {
                console.log("Disposing old ball texture:", ballMaterial.diffuseTexture.name);
                ballMaterial.diffuseTexture.dispose();
                ballMaterial.diffuseTexture = null;
            }

            const newTexture = new BABYLON.Texture(randomTexturePath, scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
                () => { // Success callback
                    // Apply Tiling
                    newTexture.uScale = BALL_TEXTURE_U_SCALE;
                    newTexture.vScale = BALL_TEXTURE_V_SCALE;
                    // <<<=== MODIFIED: Apply Rotation
                    newTexture.wAng = BALL_TEXTURE_W_ANGLE; // Rotate texture

                    ballMaterial.diffuseTexture = newTexture;
                    ballMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1); // Ensure no tint
                    console.log("Successfully applied, tiled, and rotated random texture:", randomTexturePath);
                },
                (message, exception) => { // Error callback
                    console.error("Failed to load random texture:", randomTexturePath, message, exception);
                    ballMaterial.diffuseTexture = null;
                    ballMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.6);
                }
            );
        } catch (e) {
            console.error("Error initiating random texture load for:", randomTexturePath, e);
            ballMaterial.diffuseTexture = null;
            ballMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.6); // Fallback
        }
    } else if (!ballMaterial) {
         console.error("Ball material ('ballMat') is unexpectedly missing!");
    } else if (ballTexturePaths.length === 0) {
         console.warn("ballTexturePaths array is empty, cannot randomize texture.");
    }
    // <<<=== END RANDOMIZE, TILE & ROTATE BALL TEXTURE ===>>>


    // Recreate Pins
    pinPositions.forEach((pos, index) => {
        const pin = BABYLON.MeshBuilder.CreateCylinder(`pin${index}`, {
            height: PIN_HEIGHT, diameterTop: PIN_DIAMETER_TOP, diameterBottom: PIN_DIAMETER_BOTTOM, tessellation: 24
        }, scene);
        pin.position = pos.clone();
        pin.material = materials.pinMaterial;
        pin.physicsImpostor = new BABYLON.PhysicsImpostor(pin, BABYLON.PhysicsImpostor.CylinderImpostor, {
            mass: PIN_MASS, restitution: PIN_RESTITUTION, friction: PIN_FRICTION
        }, scene);
        pins.push(pin);
    });

    // Recreate Ball (will use the updated ballMaterial)
    bowlingBall = BABYLON.MeshBuilder.CreateSphere("bowlingBall", {
        diameter: BALL_DIAMETER, segments: 32
    }, scene);
    bowlingBall.position = BALL_START_POS.clone();
    bowlingBall.material = ballMaterial; // Assign the material (texture was updated above)
    bowlingBall.physicsImpostor = new BABYLON.PhysicsImpostor(bowlingBall, BABYLON.PhysicsImpostor.SphereImpostor, {
        mass: BALL_MASS, restitution: BALL_RESTITUTION, friction: BALL_FRICTION
    }, scene);

    // Recreate Arrow
    directionArrow = createDirectionArrow(scene, materials);

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
    const physicsPlugin = new BABYLON.CannonJSPlugin();
    scene.enablePhysics(gravityVector, physicsPlugin);

    // --- Camera ---
    const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3.5, 40, new BABYLON.Vector3(0, 5, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 15;
    camera.upperRadiusLimit = 60;
    camera.wheelPrecision = 50;
    camera.panningSensibility = 1000;
    camera.target = new BABYLON.Vector3(0, 0, 10);

    // --- Light ---
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.8;
    const light2 = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 5, -10), scene);
    light2.intensity = 0.5;

    // --- Materials ---
    // createMaterials now sets up the initial ball texture, tiling, and rotation.
    createMaterials(scene);

    // --- GUI ---
    createGUI(scene);

    // --- Ground (Lane) ---
    const lane = BABYLON.MeshBuilder.CreateBox("lane", { width: LANE_WIDTH, height: LANE_HEIGHT, depth: LANE_DEPTH }, scene);
    lane.position = new BABYLON.Vector3(0, LANE_POS_Y, 10);
    lane.material = scene.getMaterialByName("woodMat");
    lane.physicsImpostor = new BABYLON.PhysicsImpostor(lane, BABYLON.PhysicsImpostor.BoxImpostor, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);

    // --- Initial Setup ---
    resetGame(scene); // Applies initial random texture, tiling & rotation

    // --- Scene Ready Actions ---
     scene.onReadyObservable.addOnce(() => {
        console.log("Scene is ready!");
        lastFrameTime = performance.now();
        if (!scene.metadata) {
            scene.metadata = {}; // Ensure metadata object exists
        }
         if (currentGameState !== GameState.AIMING && currentGameState !== GameState.RESETTING) {
             console.warn("Unexpected game state after scene ready, forcing AIMING.");
             currentGameState = GameState.AIMING;
         }
         if (directionArrow) directionArrow.isVisible = (currentGameState === GameState.AIMING);
    });

    return scene;
};

// --- Create and Render ---
let currentScene = createScene();

// Render loop
engine.runRenderLoop(function () {
    if (!currentScene) return;

    const now = performance.now();
    const timeSeconds = now / 1000.0;

    switch (currentGameState) {
        case GameState.AIMING:
            if (directionArrow) {
                directionArrow.isVisible = true;
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
            if (directionArrow) directionArrow.isVisible = false;
            checkFallenPins();

            if (isBallStopped()) {
                 if (!currentScene.metadata?.resetTimer) {
                     currentScene.metadata.resetTimer = setTimeout(() => {
                         console.log("Ball stopped, initiating reset for next throw.");
                         resetForNextThrow();
                         if(currentScene.metadata) currentScene.metadata.resetTimer = null;
                     }, 500);
                 }
            } else {
                 if (currentScene.metadata?.resetTimer) {
                    clearTimeout(currentScene.metadata.resetTimer);
                     if(currentScene.metadata) currentScene.metadata.resetTimer = null;
                 }
            }
            break;

         case GameState.RESETTING:
             // Waiting for reset timeout or full reset operation
             break;
    }

    currentScene.render();
});

// Handle window resize
window.addEventListener("resize", function () {
    engine.resize();
});

// --- Input Handling ---
window.addEventListener("keydown", function (event) {
    if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (currentGameState === GameState.AIMING) {
            currentGameState = GameState.CHARGING;
            chargeStartTime = performance.now();
            console.log("Charging power...");
            if(directionArrow) {
                 updateArrowCharging(directionArrow, 0);
            }
        }
    }
});

window.addEventListener("keyup", function (event) {
     if (event.key === " " || event.code === "Space") {
         event.preventDefault();
         if (currentGameState === GameState.CHARGING) {
             currentGameState = GameState.BALL_ROLLING;
             console.log(`Launching with power: ${launchPower.toFixed(2)} at angle: ${(currentAimAngle * 180 / Math.PI).toFixed(1)} deg`);

             if (bowlingBall && bowlingBall.physicsImpostor) {
                 const launchDirection = new BABYLON.Vector3(
                     -Math.sin(currentAimAngle),
                     0,
                     Math.cos(currentAimAngle)
                 ).normalize();
                 bowlingBall.physicsImpostor.wakeUp();
                 const contactPoint = bowlingBall.getAbsolutePosition();
                 bowlingBall.physicsImpostor.applyImpulse(
                     launchDirection.scale(launchPower),
                     contactPoint
                 );
             }
             if (directionArrow) {
                 directionArrow.isVisible = false;
             }
         }
     }

    if (event.key === "r" || event.key === "R") {
        if(currentGameState !== GameState.RESETTING) {
             if (currentScene?.metadata?.resetTimer) {
                 clearTimeout(currentScene.metadata.resetTimer);
                 if(currentScene.metadata) currentScene.metadata.resetTimer = null;
             }
             resetGame(currentScene); // Trigger full game reset
        }
    }
});

// --- END OF FILE game.js ---