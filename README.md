# Websim Second Life World

This project creates a basic 3D multiplayer world using Three.js and Websim for real-time communication and data persistence.

## Features

- **Real-time Multiplayer:** See other users move around in the 3D space.
- **Custom Avatars:** Users can upload their own rigged 3D models (GLB format) to use as avatars. A default avatar is provided if none is uploaded.
- **Asset Uploading:** Users can upload custom 3D assets (GLB format) to an asset library.
- **Asset Placement:** Users can select assets from the library and place them into the world.
- **Persistence:** Uploaded assets and placed object locations are saved using Websim's persistent records. Avatar choices are saved in player presence.
- **Basic 3D Environment:** Includes a ground plane, grid helper, basic lighting, and orbit controls for navigation.

## How to Run

1.  Ensure you have a web server capable of serving the files.
2.  Place `index.html`, `main.js`, `config.js`, and `websim.js` (or use the platform-provided version) in the same directory.
3.  Access `index.html` through your web server.

## File Structure

-   `index.html`: The main HTML file, sets up the canvas, UI elements, and includes the scripts.
-   `main.js`: Contains the core Three.js logic, Websim integration, game state management, and UI interactions.
-   `config.js`: Stores configuration values like default scaling factors or thumbnails.
-   `websim.js`: (Mock provided) Simulates the `WebsimSocket` class and `websim` global object for local development. In a real Websim environment, this would be provided by the platform.

## Key Concepts

-   **Three.js:** Used for rendering the 3D scene, loading models (GLTFLoader), handling animations (AnimationMixer), and user interaction (Raycaster, OrbitControls).
-   **WebsimSocket:**
    -   `room.presence`: Stores and syncs per-player data like position and `avatarUrl`. Updated frequently via `room.updatePresence()`.
    -   `room.peers`: Provides information about connected users (username, avatar).
    -   `room.collection('asset_library_v1')`: Persisted collection storing information about uploaded assets (name, URL, creator). Uses `create`, `delete`, `subscribe`, `getList`.
    -   `room.collection('placed_asset_v1')`: Persisted collection storing information about assets placed in the world (asset URL, position, rotation, scale). Uses `create`, `subscribe`, `getList`.
-   **Asset Workflow:**
    1.  User selects a `.glb` file using the "Upload Asset" input.
    2.  Clicking "Upload" calls `websim.upload(file)` to upload the file and get a URL.
    3.  A new record is created in the `asset_library_v1` collection with the asset's name and URL.
    4.  The asset library UI automatically updates via the `subscribe` listener.
-   **Avatar Workflow:**
    1.  User selects a `.glb` file using the "Upload Avatar" input.
    2.  Clicking "Upload Avatar" calls `websim.upload(file)` to get the URL.
    3.  The user's own presence data is updated using `room.updatePresence({ avatarUrl: url })`.
    4.  All clients receive the presence update via `room.subscribePresence`, triggering the loading/updating of the corresponding avatar mesh.
-   **Placement Workflow:**
    1.  User clicks on an asset's thumbnail in the library to select it (`selectedAssetUrl` is set).
    2.  User clicks on the ground in the 3D view.
    3.  A raycaster determines the intersection point on the invisible ground plane.
    4.  A new record is created in the `placed_asset_v1` collection with the selected asset's URL and the calculated position/default transform.
    5.  All clients receive the collection update via `subscribe`, triggering the loading and placement of the asset mesh in their scene.

## Future Improvements

-   Generate thumbnails for uploaded assets instead of using a default.
-   Implement asset transformation (moving, rotating, scaling) after placement.
-   Add more sophisticated player controls and animations (walking, idle).
-   Implement collision detection.
-   Optimize loading and rendering for large numbers of assets/players.
-   Add chat functionality.
-   Improve error handling and user feedback.
-   Refactor into more modular components/classes.

