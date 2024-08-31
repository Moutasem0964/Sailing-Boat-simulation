import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as dat from 'dat.gui';

let camera, scene, renderer, controls, water;
const loader = new GLTFLoader();
const g = 9.8; 

class Boat 
{
    constructor() {
        this.mass = 3000;
        this.volume = 1.5;
        this.waterDensity = 1000;
        this.inertia = (1 / 12) * this.mass * (Math.pow(2, 2) + Math.pow(2, 2));
        this.angularVelocity = 0;
        this.torque = 0;
        this.thrust = 0;
        this.rotationSpeed = 0;
        this.radius = 5; 
        this.collided = false;

        loader.load("assets/boat/board_hight/scene.gltf", (gltf) => {
            this.boat = gltf.scene;
            this.boat.scale.set(0.2, 0.2, 0.2);
            this.boat.position.set(-10, -4, -10);
            this.velocity = new THREE.Vector3(0, 0, 0);
            this.acceleration = new THREE.Vector3(0, 0, 0);
            scene.add(this.boat);
        });
    }

    checkCollision(otherObject) {
        const distance = this.boat.position.distanceTo(otherObject.object.position);
        const collisionDistance = this.radius+50 + otherObject.radius;
        if (distance < collisionDistance) {
            this.collided = true;
            this.handleCollision(otherObject);
        } else {
            this.collided = false;
        }
    }

    handleCollision(otherObject) {
        const normal = new THREE.Vector3().subVectors(this.boat.position, otherObject.object.position).normalize();
        const relativeVelocity = new THREE.Vector3().subVectors(this.velocity, otherObject.velocity);

        const velocityAlongNormal = relativeVelocity.dot(normal);

        if (velocityAlongNormal > 0) return;

        const restitution = 0.7; 

        const impulseScalar = -(1 + restitution) * velocityAlongNormal / (1 / this.mass + 1 / otherObject.mass);
        const impulse = normal.multiplyScalar(impulseScalar);

        this.velocity.add(impulse.divideScalar(this.mass));
        otherObject.velocity.sub(impulse.divideScalar(otherObject.mass));
    }

    update(deltaTime) {
        if (!this.boat) return;

        const gravityForce = new THREE.Vector3(0, -this.mass * g, 0);
        const submergedVolume = Math.max(0, this.volume * (1 - this.boat.position.y / 2));
        const buoyancyForce = new THREE.Vector3(0, this.waterDensity * submergedVolume * g, 0);
        const dragCoefficient = 0.1;
        const dragForce = this.velocity.clone().multiplyScalar(-dragCoefficient * this.velocity.length());
        const thrustForce = new THREE.Vector3(0, 0, this.thrust).applyQuaternion(this.boat.quaternion);
        const totalForce = new THREE.Vector3().add(gravityForce).add(buoyancyForce).add(dragForce).add(thrustForce);

        this.acceleration.copy(totalForce).divideScalar(this.mass);
        this.velocity.add(this.acceleration.clone().multiplyScalar(deltaTime));

        const linearDamping = 0.98;
        if (this.thrust === 0) {
            this.velocity.multiplyScalar(linearDamping);
        }

        this.boat.position.add(this.velocity.clone().multiplyScalar(deltaTime));

        if (this.boat.position.y < -4) {
            this.boat.position.y = -4;
            this.velocity.y = 0;
        }

        const armLength = 1;
        this.torque = this.thrust * armLength * Math.sin(this.rotationSpeed);
        const angularAcceleration = this.torque / this.inertia;

        this.angularVelocity += angularAcceleration * deltaTime;
        const angularDampingFactor = 0.95;
        this.angularVelocity *= angularDampingFactor;

        this.boat.rotation.y += this.angularVelocity * deltaTime;

        const coordinatesElement = document.getElementById('coordinates');
        if (coordinatesElement) {
            const { x, y, z } = this.boat.position;
            coordinatesElement.textContent = `Coordinates: (x: ${x.toFixed(2)}, y: ${y.toFixed(2)}, z: ${z.toFixed(2)})`;
        }
        const accelerationElement = document.getElementById('acceleration');
        if (accelerationElement) {
            const { x, y, z } = this.acceleration;
            accelerationElement.textContent = `acceleration: (x: ${x.toFixed(2)}, y: ${y.toFixed(2)}, z: ${z.toFixed(2)})`;
        }
        const velocityElement = document.getElementById('velocity');
        if (velocityElement) {
            const { x, y, z } = this.velocity;
            velocityElement.textContent = `velocity: (x: ${x.toFixed(2)}, y: ${y.toFixed(2)}, z: ${z.toFixed(2)})`;
        }
    }

    setVolume(newVolume) {
        this.volume = newVolume;
        this.boat.scale.set(newVolume, newVolume, newVolume);
    }

    setMass(newMass) {
        this.mass = newMass;
        this.inertia = (1 / 12) * this.mass * (Math.pow(2, 2) + Math.pow(2, 2));
    }
}

class Sphere {
    constructor(position, radius, mass) {
        this.radius = radius;
        this.mass = mass;
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.object = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        this.object.position.copy(position);
        scene.add(this.object);
    }

    update(deltaTime) {
        this.velocity.add(this.acceleration.clone().multiplyScalar(deltaTime));
        this.object.position.add(this.velocity.clone().multiplyScalar(deltaTime));

        this.acceleration.set(0, 0, 0);
    }
}

const boat = new Boat();

function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    document.body.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 3000);
    camera.position.set(-40, 30, 100);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 50, 50);
    scene.add(directionalLight);

    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: new THREE.TextureLoader().load('assets/see.jpg', function (texture) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }),
        sunDirection: new THREE.Vector3(),
        sunColor: 0xffffff,
        waterColor: 0x001e0f,
        distortionScale: 3.7,
        fog: scene.fog !== undefined
    });
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    const sky = new Sky();
    sky.scale.setScalar(2000);
    scene.add(sky);

    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 10;
    skyUniforms['rayleigh'].value = 2;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.8;

    const sunPosition = new THREE.Vector3();
    sunPosition.setFromSphericalCoords(1, Math.PI / 2, Math.PI / 4);
    sky.material.uniforms['sunPosition'].value.copy(sunPosition);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.update();

    const gui = new dat.GUI();
    const boatSettings = {
        thrust: 50.0,
        rotationSpeed: 0.05,
        mass: boat.mass,
        volume: boat.volume
    };

    gui.add(boatSettings, 'thrust', 0, 500).name('Thrust').onChange((value) => {
        boat.thrust = value;
    });
    gui.add(boatSettings, 'rotationSpeed', -0.5, 0.5).name('Rotation Speed').onChange((value) => {
        boat.rotationSpeed = value;
    });
    gui.add(boatSettings, 'mass', 500, 5000).name('Mass').onChange((value) => {
        boat.setMass(value);
    });
    gui.add(boatSettings, 'volume', 0.1, 5).name('Volume').onChange((value) => {
        boat.setVolume(value);
    });

    const sphere = new Sphere(new THREE.Vector3(0, 0, 100), 20, 500);
     
     const sphereCoordinatesElement = document.createElement('div');
     sphereCoordinatesElement.id = 'sphere-coordinates';
     sphereCoordinatesElement.style.position = 'absolute';
     sphereCoordinatesElement.style.top = '300px'; 
     sphereCoordinatesElement.style.left = '10px';
     sphereCoordinatesElement.style.color = 'white';
    
     document.body.appendChild(sphereCoordinatesElement);
 


    function animate() {
        requestAnimationFrame(animate);

        const now = Date.now();
        const deltaTime = (now - then) / 1000;
        then = now;

        boat.update(deltaTime);
        sphere.update(deltaTime);

        boat.checkCollision(sphere);

        water.material.uniforms['time'].value += 1.0 / 60.0;
        renderer.render(scene, camera);
       
        const { x, y, z } = sphere.object.position;
        sphereCoordinatesElement.textContent = `Sphere Coordinates: (x: ${x.toFixed(2)}, y: ${y.toFixed(2)}, z: ${z.toFixed(2)})`;
    
    }

    let then = Date.now();
    animate();
}

window.onload = init;
