class HorrorGameEngine {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
        this.clock = new THREE.Clock();
        this.models = {};
        this.lights = {};
        this.sounds = {};
        this.physics = new CANNON.World();
        
        this.initialize();
    }

    async initialize() {
        // تهيئة المحرك
        this.setupRenderer();
        this.setupLights();
        this.setupPhysics();
        this.setupControls();
        await this.loadModels();
        this.setupPostProcessing();
        
        // بدء حلقة التحديث
        this.animate();
    }

    setupRenderer() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        
        // إضافة الضباب
        this.scene.fog = new THREE.FogExp2(0x000000, 0.015);
    }

    setupLights() {
        // إضافة إضاءة محيطة خافتة
        const ambientLight = new THREE.AmbientLight(0x404040, 0.2);
        this.scene.add(ambientLight);

        // إضافة ضوء القمر
        const moonLight = new THREE.DirectionalLight(0x6666ff, 0.3);
        moonLight.position.set(50, 100, 50);
        moonLight.castShadow = true;
        this.scene.add(moonLight);

        // إضافة ضوء المصباح اليدوي
        this.flashlight = new THREE.SpotLight(0xffffff, 1);
        this.flashlight.angle = Math.PI / 6;
        this.flashlight.penumbra = 0.1;
        this.flashlight.decay = 2;
        this.flashlight.distance = 30;
        this.camera.add(this.flashlight);
        this.scene.add(this.camera);
    }

    setupPhysics() {
        this.physics.gravity.set(0, -9.82, 0);
        this.physics.broadphase = new CANNON.NaiveBroadphase();
        this.physics.solver.iterations = 10;
    }

    setupControls() {
        this.controls = new THREE.PointerLockControls(this.camera, document.body);
        
        // إعداد التحكم بلوحة المفاتيح
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            shift: false
        };

        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousedown', (e) => this.onMouseClick(e));
    }

    async loadModels() {
        const loader = new THREE.GLTFLoader();
        
        // تحميل نماذج المنزل والأثاث
        this.models.house = await this.loadModel(loader, 'models/house.glb');
        this.models.furniture = await this.loadModel(loader, 'models/furniture.glb');
        
        // تحميل نماذج الوحوش
        this.models.zombie = await this.loadModel(loader, 'models/zombie.glb');
        this.models.ghost = await this.loadModel(loader, 'models/ghost.glb');
        this.models.demon = await this.loadModel(loader, 'models/demon.glb');
    }

    setupPostProcessing() {
        // إعداد مؤثرات ما بعد المعالجة
        const composer = new THREE.EffectComposer(this.renderer);
        
        // إضافة مؤثر التصحيح اللوني
        const renderPass = new THREE.RenderPass(this.scene, this.camera);
        composer.addPass(renderPass);
        
        // إضافة مؤثر التشويش
        const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, 0.4, 0.85
        );
        composer.addPass(bloomPass);
        
        // إضافة مؤثر الخوف
        const fearEffect = new THREE.ShaderPass(THREE.FearShader);
        composer.addPass(fearEffect);
        
        this.composer = composer;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        
        // تحديث الفيزياء
        this.physics.step(1/60, delta);
        
        // تحديث الكائنات المتحركة
        this.updateMonsters(delta);
        this.updateGhosts(delta);
        
        // تحديث التأثيرات
        this.updateEffects(delta);
        
        // تحديث الإضاءة
        this.updateLighting(delta);
        
        // عرض المشهد
        this.composer.render();
    }

    updateMonsters(delta) {
        // تحديث حركة وسلوك الوحوش
        Object.values(this.monsters).forEach(monster => {
            monster.update(delta);
            monster.updateAI(this.camera.position);
        });
    }

    updateGhosts(delta) {
        // تحديث حركة وتأثيرات الأشباح
        Object.values(this.ghosts).forEach(ghost => {
            ghost.update(delta);
            ghost.updateEffects(this.playerSanity);
        });
    }

    updateEffects(delta) {
        // تحديث تأثيرات الخوف والهلوسة
        if (this.playerSanity < 50) {
            this.fearEffect.uniforms.intensity.value = (50 - this.playerSanity) / 50;
            this.distortScene(delta);
        }
    }

    updateLighting(delta) {
        // تحديث إضاءة المصباح اليدوي
        this.flashlight.position.copy(this.camera.position);
        this.flashlight.target.position.copy(
            this.camera.position.clone().add(
                this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1)
            )
        );
    }

    distortScene(delta) {
        // إضافة تشويه للمشهد عند انخفاض الصحة العقلية
        const intensity = (50 - this.playerSanity) / 50;
        this.scene.children.forEach(child => {
            if (child.isMesh) {
                child.material.uniforms.distortion.value = Math.sin(this.clock.elapsedTime * 2) * intensity;
            }
        });
    }

    spawnMonster(type, position) {
        const model = this.models[type].clone();
        const monster = new Monster(model, position, this.physics);
        this.monsters[monster.id] = monster;
        this.scene.add(monster.mesh);
        return monster;
    }

    spawnGhost(type, position) {
        const model = this.models[type].clone();
        const ghost = new Ghost(model, position);
        this.ghosts[ghost.id] = ghost;
        this.scene.add(ghost.mesh);
        return ghost;
    }

    onKeyDown(event) {
        switch(event.code) {
            case 'KeyW': this.keys.forward = true; break;
            case 'KeyS': this.keys.backward = true; break;
            case 'KeyA': this.keys.left = true; break;
            case 'KeyD': this.keys.right = true; break;
            case 'ShiftLeft': this.keys.shift = true; break;
            case 'KeyF': this.toggleFlashlight(); break;
            case 'KeyE': this.interact(); break;
        }
    }

    onKeyUp(event) {
        switch(event.code) {
            case 'KeyW': this.keys.forward = false; break;
            case 'KeyS': this.keys.backward = false; break;
            case 'KeyA': this.keys.left = false; break;
            case 'KeyD': this.keys.right = false; break;
            case 'ShiftLeft': this.keys.shift = false; break;
        }
    }

    onMouseClick(event) {
        if (event.button === 0) { // زر الماوس الأيسر
            this.useCurrentItem();
        }
    }

    toggleFlashlight() {
        this.flashlight.visible = !this.flashlight.visible;
        if (this.flashlight.visible) {
            this.playSound('flashlight_on');
        } else {
            this.playSound('flashlight_off');
        }
    }

    interact() {
        // التفاعل مع العناصر القريبة
        const interactiveObjects = this.findNearbyInteractiveObjects();
        if (interactiveObjects.length > 0) {
            const nearest = interactiveObjects[0];
            nearest.interact(this);
        }
    }

    useCurrentItem() {
        if (this.currentItem) {
            this.currentItem.use(this);
            this.playSound('item_use');
        }
    }

    playSound(soundName) {
        if (this.sounds[soundName]) {
            this.sounds[soundName].play();
        }
    }
}

// تصدير الفئة
window.HorrorGameEngine = HorrorGameEngine;
