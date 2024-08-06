import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer, controls, water, sun, boat;
const clock = new THREE.Clock();

const GRAVITY_ACCELERATION = 9.81; // تسارع الجاذبية
let windDirection = new THREE.Vector3(1, 0, 0); // اتجاه الرياح الافتراضي
let sailAngle = Math.PI / 2; // زاوية الشراع الافتراضية (90 درجة)

class Forces {
    constructor(mass, volumeDisplaced, fluidDensity, dragCoefficient = 0.1, windForce = new THREE.Vector3(0, 0, 0)) {
        this.mass = mass;
        this.volumeDisplaced = volumeDisplaced; // الحجم المزاح
        this.fluidDensity = fluidDensity; // كثافة السائل
        this.gravity = new THREE.Vector3(0, -GRAVITY_ACCELERATION * this.mass, 0); // قوة الجاذبية
        this.buoyancy = this.computeBuoyancy(); // قوة الطفو
        this.dragCoefficient = dragCoefficient; // معامل السحب
        this.windForce = windForce; // قوة الرياح
    }

    computeBuoyancy() {
        return new THREE.Vector3(0, this.fluidDensity * this.volumeDisplaced * GRAVITY_ACCELERATION, 0);
    }

    computeAirResistance(velocity) {
        return velocity.clone().multiplyScalar(-this.dragCoefficient);
    }

    computeWaterResistance(velocity) {
        return velocity.clone().multiplyScalar(-this.dragCoefficient * 2); // افتراض أن مقاومة الماء ضعف مقاومة الهواء
    }

    computeWindForce(windDirection, sailAngle) {
        sailAngle = Math.max(0, Math.min(sailAngle, Math.PI / 2)); // ضبط الزاوية بين 0 و 90 درجة
        const windEffectiveness = Math.abs(Math.sin(sailAngle)); // استخدام دالة الجيب لنطاق أفضل
        return windDirection.clone().multiplyScalar(windEffectiveness);
    }

    computeNetForce(velocity, windDirection, sailAngle) {
        const airResistance = this.computeAirResistance(velocity);
        const waterResistance = this.computeWaterResistance(velocity);
        const windForce = this.computeWindForce(windDirection, sailAngle);

        const netForce = new THREE.Vector3();
        netForce.add(this.gravity).add(this.buoyancy).add(windForce).add(airResistance).add(waterResistance);
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
        this.mass = 500; // كتلة القارب
        this.volumeDisplaced = 2; // الحجم المزاح
        this.fluidDensity = 1000; // كثافة الماء (تقريبًا)
        this.forces = new Forces(this.mass, this.volumeDisplaced, this.fluidDensity);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.rotationSpeed = 0;
        this.boat = null;
        const loader = new GLTFLoader();
        loader.load('assets/boat/board_hight/scene.gltf', (gltf) => {
            scene.add(gltf.scene);
            gltf.scene.scale.set(1, 1, 1);
            
            // تعديل وضع القارب ليكون جزء منه مغمور في الماء
            const boatHeight = 2; // تعديل بناءً على ارتفاع القارب الفعلي
            gltf.scene.position.set(0, -10, 0); // غمر نصف القارب

            gltf.scene.rotation.y = Math.PI;
            this.boat = gltf.scene;
            console.log("Boat loaded and added to scene");

            // التأكد من أن القارب يبدأ في حالة سكون
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

            // حساب القوة الناتجة
            const resultantForce = netForce.clone();

            // تحديث موقع القارب والدوران
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
    // إعداد المشهد والكاميرا
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(-100, 50, 200);

    // إعداد المصير
    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // إعداد الشمس والسماء
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

    // إعداد الماء
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
    water.position.y = 0; // تحديد مستوى الماء عند y = 0
    scene.add(water);

    // إعداد الإضاءة
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 100, 100).normalize();
    scene.add(directionalLight);

    // إعداد التحكم
    controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(0, 10, 0);
    controls.minDistance = 40.0;
    controls.maxDistance = 200.0;
    controls.update();

    window.addEventListener('resize', onWindowResize);

    console.log("Scene and camera initialized");

    // إنشاء القارب
    boat = new Boat();

    // مستمعي الأحداث للضغط على المفاتيح
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
}

function handleKeyDown(event) {
    switch (event.key) {
        case 'w':
            boat.setVelocity(100); // تحريك القارب للأمام
            break;
        case 's':
            boat.setVelocity(-100); // تحريك القارب للخلف
            break;
        case 'a':
            boat.setRotationSpeed(1); // تدوير القارب لليسار
            break;
        case 'd':
            boat.setRotationSpeed(-1); // تدوير القارب لليمين
            break;
        case 'ArrowLeft':
            windDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 18); // تدوير اتجاه الرياح لليسار
            console.log('Wind direction after left arrow press:', windDirection); // تسجيل التفاصيل
            break;
        case 'ArrowRight':
            windDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 18); // تدوير اتجاه الرياح لليمين
            console.log('Wind direction after right arrow press:', windDirection); // تسجيل التفاصيل
            break;
        case 'ArrowUp':
            sailAngle = Math.min(sailAngle + Math.PI / 18, Math.PI / 2); // زيادة زاوية الشراع إلى 90°
            console.log('Sail angle increased:', sailAngle); // تسجيل التفاصيل
            break;
        case 'ArrowDown':
            sailAngle = Math.max(sailAngle - Math.PI / 18, 0); // تقليل زاوية الشراع إلى 0°
            console.log('Sail angle decreased:', sailAngle); // تسجيل التفاصيل
            break;
    }
}

function handleKeyUp(event) {
    switch (event.key) {
        case 'w':
        case 's':
            boat.setVelocity(0); // إيقاف حركة القارب
            break;
        case 'a':
        case 'd':
            boat.setRotationSpeed(0); // إيقاف دوران القارب
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
    const deltaTime = clock.getDelta(); // حساب الوقت المنقضي
    if (boat) boat.update(deltaTime);
    water.material.uniforms['time'].value += deltaTime; // تحديث حركة الماء

    // تحديث موقع الكاميرا لمتابعة القارب
    if (boat && boat.boat) {
        const offset = new THREE.Vector3(0, 300, 500); // تعيين الإزاحة المناسبة
        const boatPosition = boat.boat.position.clone();
        camera.position.copy(boatPosition).add(offset);
        camera.lookAt(boatPosition);
    }

    render();
}

function render() {
    renderer.render(scene, camera);
}

init();
animate();
