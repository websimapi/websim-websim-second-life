import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { WebsimSocket } from 'websim';
import config from './config.js';

const room = new WebsimSocket();
await room.initialize();

let scene, camera, renderer, controls;
let clock = new THREE.Clock();
let mixers = []; // For animations
const playerMeshes = {}; // Store player meshes { clientId: mesh }
const assetObjects = {}; // Store placed asset objects { assetId: mesh }

const loader = new GLTFLoader();
const ktx2Loader = new KTX2Loader()
    .setTranscoderPath( 'https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/' )
    .detectSupport( renderer ); // Assuming renderer is initialized before this line
loader.setKTX2Loader( ktx2Loader );
loader.setMeshoptDecoder( MeshoptDecoder );

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let groundPlane; // For placing objects
let selectedAssetUrl = null; // URL of the asset to place

// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('container').appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI / 2;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Ground Plane (invisible, for raycasting)
    const planeGeometry = new THREE.PlaneGeometry(100, 100);
    const planeMaterial = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    groundPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    scene.add(groundPlane);

    // Basic Grid Helper
    const gridHelper = new THREE.GridHelper(100, 100);
    scene.add(gridHelper);

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);

    // Setup UI Event Listeners
    setupUI();

    // Start Animation Loop
    animate();

    // Initialize Websim sync
    setupWebsimSync();

    // Load initial assets from database
    loadInitialAssets();

    // Load initial player avatars
    loadInitialAvatars();

    // Load initial placed objects
    loadInitialPlacedObjects();
}

// --- Player Avatar Handling ---
async function loadPlayerAvatar(clientId, avatarUrl) {
    if (!avatarUrl) {
        // Default avatar (e.g., a simple cube or sphere)
        const geometry = new THREE.BoxGeometry(1, 1.8, 1);
        const material = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
        const mesh = new THREE.Mesh(geometry, material);
        playerMeshes[clientId] = { mesh, mixer: null };
        scene.add(mesh);
        updatePlayerPosition(clientId, room.presence[clientId] || {});
        console.log(`Loaded default avatar for ${clientId}`);
        return;
    }

    try {
        const gltf = await loader.loadAsync(avatarUrl);
        const mesh = gltf.scene;
        mesh.scale.set(0.5, 0.5, 0.5); // Adjust scale as needed

        // Check for animations
        let mixer = null;
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(mesh);
            // Play the first animation by default (can be configured later)
            const action = mixer.clipAction(gltf.animations[0]);
            action.play();
            mixers.push(mixer); // Add mixer to the list for updating
        }

        playerMeshes[clientId] = { mesh, mixer };
        scene.add(mesh);
        updatePlayerPosition(clientId, room.presence[clientId] || {});
        console.log(`Loaded avatar ${avatarUrl} for ${clientId}`);

    } catch (error) {
        console.error(`Error loading avatar for ${clientId}:`, error);
        // Fallback to default if loading fails
        if (!playerMeshes[clientId]) {
            await loadPlayerAvatar(clientId, null); // Load default
        }
    }
}

function removePlayerAvatar(clientId) {
    if (playerMeshes[clientId]) {
        scene.remove(playerMeshes[clientId].mesh);
        if (playerMeshes[clientId].mixer) {
            const index = mixers.indexOf(playerMeshes[clientId].mixer);
            if (index > -1) {
                mixers.splice(index, 1);
            }
        }
        delete playerMeshes[clientId];
        console.log(`Removed avatar for ${clientId}`);
    }
}

function updatePlayerPosition(clientId, presenceData) {
    if (playerMeshes[clientId] && presenceData) {
        const { x = 0, y = 0, z = 0 } = presenceData;
        playerMeshes[clientId].mesh.position.set(x, y, z); // Assuming y is height
    }
}

// --- Asset Handling ---
async function loadAsset(assetData) {
    const { id, url, position, rotation, scale } = assetData;
    if (assetObjects[id]) return; // Already loaded

    try {
        const gltf = await loader.loadAsync(url);
        const mesh = gltf.scene;
        if (position) mesh.position.set(position.x, position.y, position.z);
        if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
        if (scale) mesh.scale.set(scale.x, scale.y, scale.z);
        else mesh.scale.set(config.defaultAssetScale, config.defaultAssetScale, config.defaultAssetScale); // Default scale

        assetObjects[id] = mesh;
        scene.add(mesh);
        console.log(`Loaded asset ${id} from ${url}`);
    } catch (error) {
        console.error(`Error loading asset ${id}:`, error);
    }
}

function removeAsset(assetId) {
    if (assetObjects[assetId]) {
        scene.remove(assetObjects[assetId]);
        delete assetObjects[assetId];
        console.log(`Removed asset ${assetId}`);
    }
}

function updateAssetTransform(assetId, transformData) {
     if (assetObjects[assetId] && transformData) {
        const { position, rotation, scale } = transformData;
         if (position) assetObjects[assetId].position.set(position.x, position.y, position.z);
         if (rotation) assetObjects[assetId].rotation.set(rotation.x, rotation.y, rotation.z);
         if (scale) assetObjects[assetId].scale.set(scale.x, scale.y, scale.z);
     }
}

// --- Websim Integration ---
function setupWebsimSync() {
    // Handle Presence Updates (Player movements, avatar changes)
    room.subscribePresence((presence) => {
        const currentClientIds = Object.keys(presence);
        const knownClientIds = Object.keys(playerMeshes);

        // Add or update players
        currentClientIds.forEach(clientId => {
            if (!playerMeshes[clientId]) {
                // New player joined
                loadPlayerAvatar(clientId, presence[clientId]?.avatarUrl); // Load avatar if specified
            } else {
                // Update existing player position
                updatePlayerPosition(clientId, presence[clientId]);
                // Check if avatar URL changed
                if (playerMeshes[clientId] && presence[clientId]?.avatarUrl !== playerMeshes[clientId].avatarUrl) {
                    removePlayerAvatar(clientId);
                    loadPlayerAvatar(clientId, presence[clientId]?.avatarUrl);
                }
            }
        });

        // Remove players who left
        knownClientIds.forEach(clientId => {
            if (!presence[clientId]) {
                removePlayerAvatar(clientId);
            }
        });
    });

    // Handle Room State Updates (Placed assets)
     room.collection('placed_asset_v1').subscribe((placedAssets) => {
         const currentAssetIds = placedAssets.map(asset => asset.id);
         const knownAssetIds = Object.keys(assetObjects);

         // Add or update assets
         placedAssets.forEach(assetData => {
             if (!assetObjects[assetData.id]) {
                 // New asset placed
                 loadAsset(assetData);
             } else {
                 // Update existing asset transform (if needed, could be complex)
                 // For simplicity, we'll assume assets are static once placed for now.
                 // If transform updates are needed, compare assetData with stored data.
                 // updateAssetTransform(assetData.id, assetData);
             }
         });

         // Remove assets that are no longer in the list
         knownAssetIds.forEach(assetId => {
             if (!currentAssetIds.includes(assetId)) {
                 removeAsset(assetId);
             }
         });
     });

     // Handle Asset Library Updates
     room.collection('asset_library_v1').subscribe((libraryAssets) => {
         renderAssetLibrary(libraryAssets);
     });


    // Simulate player movement (replace with actual input later)
    setInterval(() => {
        const moveX = (Math.random() - 0.5) * 0.1;
        const moveZ = (Math.random() - 0.5) * 0.1;
        const currentPresence = room.presence[room.clientId] || { x: 0, y: 0, z: 0 };
        room.updatePresence({
            ...currentPresence,
            x: (currentPresence.x || 0) + moveX,
            y: currentPresence.y || 0, // Keep y the same for now
            z: (currentPresence.z || 0) + moveZ,
        });
    }, 200);

     // Load initial state
     loadInitialAvatars();
     loadInitialPlacedObjects();
     loadInitialAssets(); // Load asset library
}

async function loadInitialAvatars() {
     Object.entries(room.presence).forEach(([clientId, presenceData]) => {
         if (!playerMeshes[clientId]) {
            loadPlayerAvatar(clientId, presenceData?.avatarUrl);
         }
     });
}

async function loadInitialPlacedObjects() {
    const placedAssets = room.collection('placed_asset_v1').getList();
    placedAssets.forEach(assetData => {
        if (!assetObjects[assetData.id]) {
            loadAsset(assetData);
        }
    });
}

async function loadInitialAssets() {
    const libraryAssets = room.collection('asset_library_v1').getList();
    renderAssetLibrary(libraryAssets);
}


// --- UI Handling ---
function setupUI() {
    const uploadButton = document.getElementById('upload-button');
    const assetUploadInput = document.getElementById('asset-upload');
    const uploadAvatarButton = document.getElementById('upload-avatar-button');
    const avatarUploadInput = document.getElementById('avatar-upload');

    uploadButton.addEventListener('click', async () => {
        const file = assetUploadInput.files[0];
        if (!file) {
            alert('Please select a GLB file to upload.');
            return;
        }

        uploadButton.disabled = true;
        uploadButton.textContent = 'Uploading...';

        try {
            const url = await websim.upload(file);
            // Add asset to the library database
            await room.collection('asset_library_v1').create({
                name: file.name,
                url: url,
                // Add thumbnail generation later if needed
                thumbnailUrl: config.defaultThumbnail // Use a default for now
            });
            alert('Asset uploaded successfully!');
            assetUploadInput.value = ''; // Clear the input
        } catch (error) {
            console.error('Error uploading asset:', error);
            alert('Error uploading asset. See console for details.');
        } finally {
            uploadButton.disabled = false;
            uploadButton.textContent = 'Upload';
        }
    });

     uploadAvatarButton.addEventListener('click', async () => {
        const file = avatarUploadInput.files[0];
        if (!file) {
            alert('Please select a GLB file for your avatar.');
            return;
        }

        uploadAvatarButton.disabled = true;
        uploadAvatarButton.textContent = 'Uploading...';

        try {
            const url = await websim.upload(file);
            // Update user's presence with the new avatar URL
            const currentPresence = room.presence[room.clientId] || {};
             await room.updatePresence({
                 ...currentPresence,
                 avatarUrl: url
             });
            alert('Avatar uploaded successfully!');
             avatarUploadInput.value = ''; // Clear the input

             // Immediately update local avatar if needed (presence update might take time)
             removePlayerAvatar(room.clientId);
             await loadPlayerAvatar(room.clientId, url);

        } catch (error) {
            console.error('Error uploading avatar:', error);
            alert('Error uploading avatar. See console for details.');
        } finally {
            uploadAvatarButton.disabled = false;
            uploadAvatarButton.textContent = 'Upload Avatar';
        }
    });
}

function renderAssetLibrary(assets) {
    const libraryContent = document.getElementById('library-content');
    libraryContent.innerHTML = ''; // Clear existing content

    // Sort assets newest first
    const sortedAssets = [...assets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));


    sortedAssets.forEach(asset => {
        const assetDiv = document.createElement('div');
        assetDiv.classList.add('asset-item');

        const img = document.createElement('img');
        img.src = asset.thumbnailUrl || config.defaultThumbnail; // Use thumbnail or default
        img.alt = asset.name;
        img.title = `Click to select: ${asset.name}`;
        img.addEventListener('click', () => {
            selectedAssetUrl = asset.url;
            // Highlight selected asset visually (optional)
            document.querySelectorAll('#asset-library img').forEach(el => el.style.border = '1px solid #ccc');
            img.style.border = '2px solid blue';
            console.log(`Selected asset: ${asset.name} (${asset.url})`);
        });

        const nameSpan = document.createElement('span');
        nameSpan.textContent = asset.name.length > 15 ? asset.name.substring(0, 12) + '...' : asset.name; // Truncate long names


        assetDiv.appendChild(img);
        assetDiv.appendChild(nameSpan);


        // Add delete button if the asset was created by the current user
         // Add delete button logic - check ownership before showing/enabling
        // Note: Need to fetch username async
         (async () => {
            const currentUser = room.peers[room.clientId]?.username;
             if (currentUser && asset.username === currentUser) {
                 const deleteButton = document.createElement('button');
                 deleteButton.textContent = 'Del';
                 deleteButton.title = `Delete ${asset.name}`;
                 deleteButton.style.marginLeft = 'auto'; // Push to the right
                 deleteButton.onclick = async (e) => {
                     e.stopPropagation(); // Prevent asset selection
                     if (confirm(`Are you sure you want to delete ${asset.name}?`)) {
                         try {
                             await room.collection('asset_library_v1').delete(asset.id);
                             console.log(`Deleted asset ${asset.id}`);
                             // UI will update automatically via subscription
                         } catch (error) {
                             console.error(`Error deleting asset ${asset.id}:`, error);
                             alert('Error deleting asset.');
                         }
                     }
                 };
                 assetDiv.appendChild(deleteButton);
             }
         })();


        libraryContent.appendChild(assetDiv);
    });
}


// --- Event Handlers ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
    // Update mouse coordinates for raycasting
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

async function onClick(event) {
     // Ignore clicks on UI elements
    if (event.target !== renderer.domElement) {
        // Check if the click originated from within the asset library or upload panel
        const uploadPanel = document.getElementById('upload-panel');
        const assetLibrary = document.getElementById('asset-library');
        if (uploadPanel.contains(event.target) || assetLibrary.contains(event.target)) {
             return;
        }
    }


    if (!selectedAssetUrl) {
        console.log("No asset selected to place.");
        return; // Nothing selected to place
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(groundPlane); // Intersect with the invisible ground plane

    if (intersects.length > 0) {
        const intersectPoint = intersects[0].point;

        // Create a record for the placed asset
        try {
            const placedAssetData = {
                url: selectedAssetUrl,
                position: { x: intersectPoint.x, y: intersectPoint.y + 0.01, z: intersectPoint.z }, // Slight offset from ground
                rotation: { x: 0, y: 0, z: 0 }, // Default rotation
                scale: { x: config.defaultAssetScale, y: config.defaultAssetScale, z: config.defaultAssetScale }, // Default scale
                // Add creator info if needed: creatorId: room.clientId
            };
            await room.collection('placed_asset_v1').create(placedAssetData);
            console.log("Placed asset at:", intersectPoint);

            // De-select asset after placing (optional)
            // selectedAssetUrl = null;
            // document.querySelectorAll('#asset-library img').forEach(el => el.style.border = '1px solid #ccc');

        } catch (error) {
            console.error("Error creating placed asset record:", error);
            alert("Failed to place asset.");
        }
    }
}


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Update controls
    controls.update();

    // Update animation mixers
    mixers.forEach(mixer => mixer.update(delta));

    renderer.render(scene, camera);
}

// --- Start ---
init();

