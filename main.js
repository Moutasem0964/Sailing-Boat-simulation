import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer, controls, water, sun, boat;
const clock = new THREE.Clock();

const GRAVITY_ACCELERATION = 9.81; // Gravity acceleration
let windDirection = new THREE.Vector3(1, 0, 0); // Default wind direction
let sailAngle = Math.PI / 2; // Default sail angle (90°)

class Forces {
    constructor(mass, volumeDisplaced, fluidDensity, dragCoefficient = 0.1, windForce = new THREE.Vector3(0, 0, 0)) {
        this.mass = mass;
        this.volumeDisplaced = volumeDisplaced; // Volume displaced
        this.fluidDensity = fluidDensity; // Fluid density
        this.gravity = new THREE.Vector3(0, -GRAVITY_ACCELERATION * this.mass, 0); // Gravity force
        this.buoyancy = this.computeBuoyancy(); // Buoyancy force
        this.dragCoefficient = dragCoefficient; // Drag coefficient
        this.windForce = windForce; // Wind force
    }

    computeBuoyancy() {
        return new THREE.Vector3(0, this.fluidDensity * this.volumeDisplaced * GRAVITY_ACCELERATION, 0);
    }

    computeAirResistance(velocity) {
        return velocity.clone().multiplyScalar(-this.dragCoefficient);
    }

    computeWaterResistance(velocity) {
        return velocity.clone().multiplyScalar(-this.dragCoefficient * 2); // Assuming water resistance is twice air resistance
    }

    computeWindForce(windDirection, sailAngle) {
        sailAngle = Math.max(0, Math.min(sailAngle, Math.PI / 2)); // Clamp angle between 0 and 90 degrees
        const windEffectiveness = Math.abs(Math.sin(sailAngle)); // Use sin for better range
        console.log(`Sail Angle: ${sailAngle}, Wind Effectiveness: ${windEffectiveness}`); // Debug log
        return windDirection.clone().multiplyScalar(windEffectiveness);
    }

    computeNetForce(velocity, windDirection, sailAngle) {
        const airResistance = this.computeAirResistance(velocity);
        const waterResistance = this.computeWaterResistance(velocity);
        const windForce = this.computeWindForce(windDirection, sailAngle);

        const netForce = new THREE.Vector3();
        netForce.add(this.gravity).add(this.buoyancy).add(windForce).add(airResistance).add(waterResistance);
        console.log(`Net Force: ${netForce.toArray()}`); // Log detailed net force
        return netForce;
    }

    computeAcceleration(netForce) {
        return netForce.clone().divideScalar(this.mass);
    }

    isAtRest(velocity) {
        const netForce = this.computeNetForce(velocity, windDirection, sailAngle);
        return netForce.length() === 0 && velocity.length() === 0;
    }
}

class Boat {
    constructor() {
        this.mass = 500; // Boat mass
        this.volumeDisplaced = 2; // Displaced volume
        this.fluidDensity = 1000; // Water density (approx.)
        this.forces = new Forces(this.mass, this.volumeDisplaced, this.fluidDensity);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.rotationSpeed = 0;
        this.boat = null;
        const loader = new GLTFLoader();
        loader.load("assets/boat/board_hight/scene.gltf", (gltf) => {
            scene.add(gltf.scene);
            gltf.scene.scale.set(1, 1, 1);
            gltf.scene.position.set(0, 0, 0);
            gltf.scene.rotation.y = Math.PI;
            this.boat = gltf.scene;
            console.log("Boat loaded and added to scene");

            // Ensure boat starts at rest
            if (this.forces.isAtRest(this.velocity)) {
                this.velocity.set(0, 0, 0);
                console.log("Boat is at rest");
            }
        }, undefined, (error) => {
            console.error("Error loading boat:", error);
        });
    }

    update(deltaTime) {
        if (this.boat) {
            const netForce = this.forces.computeNetForce(this.velocity, windDirection, sailAngle);
            this.acceleration = this.forces.computeAcceleration(netForce);

            if (!this.forces.isAtRest(this.velocity)) {
                this.velocity.add(this.acceleration.clone().multiplyScalar(deltaTime));
            }

            // Compute resultant force
            const resultantForce = netForce.clone();
            console.log("Resultant Force (ΣF):", resultantForce.toArray()); // Log detailed resultant force

            // Update boat position and rotation
            const direction = new THREE.Vector3();
            this.boat.getWorldDirection(direction);
            direction.multiplyScalar(this.velocity.length() * deltaTime);
            this.boat.position.add(direction);
            this.boat.rotation.y += this.rotationSpeed * deltaTime;
        }
    }

    setVelocity(speed) {
        this.velocity.set(0, 0, speed);
    }

    setRotationSpeed(speed) {
        this.rotationSpeed = speed;
    }
}

function init() {
    // Scene and camera setup
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(-100, 50, 200);

    // Renderer setup
    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Sun and sky setup
    sun = new THREE.Vector3();
    const sky = new Sky();
    sky.scale.setScalar(10000);
    scene.add(sky);

    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 10;
    skyUniforms['rayleigh'].value = 2;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.8;

    const parameters = {
        elevation: 2,
        azimuth: 180
    };

    function updateSun() {
        const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
        const theta = THREE.MathUtils.degToRad(parameters.azimuth);

        sun.setFromSphericalCoords(1, phi, theta);
        sky.material.uniforms['sunPosition'].value.copy(sun);
    }

    updateSun();

    // Water setup
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: new THREE.TextureLoader().load('assets/see.jpg', function(texture) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            console.log("Water texture loaded");
        }),
        sunDirection: new THREE.Vector3(),
        sunColor: 0xffffff,
        waterColor: 0x001e0f,
        distortionScale: 3.7,
        fog: scene.fog !== undefined
    });
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 100, 100).normalize();
    scene.add(directionalLight);

    // Controls setup
    controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(0, 10, 0);
    controls.minDistance = 40.0;
    controls.maxDistance = 200.0;
    controls.update();

    window.addEventListener('resize', onWindowResize);

    console.log("Scene and camera initialized");

    // Create boat
    boat = new Boat();

    // Event listeners for key presses
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
}

function handleKeyDown(event) {
    switch (event.key) {
        case 'w':
            boat.setVelocity(100); // Move boat forward
            break;
        case 's':
            boat.setVelocity(-100); // Move boat backward
            break;
        case 'a':
            boat.setRotationSpeed(1); // Rotate boat left
            break;
        case 'd':
            boat.setRotationSpeed(-1); // Rotate boat right
            break;
        case 'ArrowLeft':
            windDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 18); // Rotate wind direction left
            console.log('Wind direction after left arrow press:', windDirection); // Debug log
            break;
        case 'ArrowRight':
            windDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 18); // Rotate wind direction right
            console.log('Wind direction after right arrow press:', windDirection); // Debug log
            break;
        case 'ArrowUp':
            sailAngle = Math.min(sailAngle + Math.PI / 18, Math.PI / 2); // Increase sail angle to 90°
            console.log('Sail angle increased:', sailAngle); // Debug log
            break;
        case 'ArrowDown':
            sailAngle = Math.max(sailAngle - Math.PI / 18, 0); // Decrease sail angle to 0°
            console.log('Sail angle decreased:', sailAngle); // Debug log
            break;
    }
}

function handleKeyUp(event) {
    switch (event.key) {
        case 'w':
        case 's':
            boat.setVelocity(0); // Stop boat movement
            break;
        case 'a':
        case 'd':
            boat.setRotationSpeed(0); // Stop boat rotation
            break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta(); // Calculate deltaTime
    if (boat) boat.update(deltaTime);
    water.material.uniforms['time'].value += deltaTime; // Update water animation
    render();
}

function render() {
    renderer.render(scene, camera);
}

init();
animate();
