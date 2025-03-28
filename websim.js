// Provide the WebsimSocket class and websim object globally
// This file would typically be provided by the Websim platform environment
// For local development, you might create a mock version.

class Collection {
    constructor(room, type) {
        this.room = room;
        this.type = type;
        this.filterObj = null;
        this.subscribers = new Set();
        // Mock data storage
        this.mockData = {}; // { id: record }
        this.mockDataList = [];
    }

    _matchesFilter(record) {
        if (!this.filterObj) return true;
        return Object.keys(this.filterObj).every(key => record[key] === this.filterObj[key]);
    }

    _notifySubscribers() {
        const filteredList = this.getList();
         this.subscribers.forEach(callback => callback(filteredList));
    }

    async create(data) {
         console.log(`[Mock DB] Creating ${this.type}:`, data);
         const id = `mock_${this.type}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
         const username = this.room.peers[this.room.clientId]?.username || 'mock_user';
         const newRecord = {
             ...data,
             id,
             username,
             created_at: new Date().toISOString(),
             type: this.type,
         };
         this.mockData[id] = newRecord;
         this.mockDataList.push(newRecord);
         this.mockDataList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Keep sorted newest first
         this._notifySubscribers();
         // Simulate network delay
         await new Promise(resolve => setTimeout(resolve, 100));
         return newRecord;
    }

    async update(id, data) {
        console.log(`[Mock DB] Updating ${this.type} ${id}:`, data);
        if (!this.mockData[id]) {
            console.warn(`[Mock DB] Record not found for update: ${id}`);
            return;
        }
        // Rudimentary permission check
        if (this.mockData[id].username !== (this.room.peers[this.room.clientId]?.username || 'mock_user')) {
             console.error(`[Mock DB] Permission denied: Cannot update record created by another user.`);
             throw new Error("Permission denied");
        }

        this.mockData[id] = { ...this.mockData[id], ...data };
        const index = this.mockDataList.findIndex(item => item.id === id);
        if (index > -1) {
            this.mockDataList[index] = this.mockData[id];
        }
        this._notifySubscribers();
         await new Promise(resolve => setTimeout(resolve, 100));
    }

     async delete(id) {
         console.log(`[Mock DB] Deleting ${this.type} ${id}`);
         if (!this.mockData[id]) {
             console.warn(`[Mock DB] Record not found for delete: ${id}`);
             return;
         }
         // Rudimentary permission check
         if (this.mockData[id].username !== (this.room.peers[this.room.clientId]?.username || 'mock_user')) {
             console.error(`[Mock DB] Permission denied: Cannot delete record created by another user.`);
             throw new Error("Permission denied");
         }
         delete this.mockData[id];
         this.mockDataList = this.mockDataList.filter(item => item.id !== id);
         this._notifySubscribers();
         await new Promise(resolve => setTimeout(resolve, 100));
     }

    getList() {
        const list = this.mockDataList.filter(record => this._matchesFilter(record));
         //console.log(`[Mock DB] getList (${this.type}, filter: ${JSON.stringify(this.filterObj)}):`, list.length, "items");
         return list; // Already sorted newest first
    }

    filter(filterObj) {
        // Return a new or cached Collection instance with the filter applied
        const filteredCollection = new Collection(this.room, this.type);
        filteredCollection.filterObj = filterObj;
         // Copy mock data reference for filtering (in real scenario, this would query differently)
         filteredCollection.mockData = this.mockData;
         filteredCollection.mockDataList = this.mockDataList;
        return filteredCollection;
    }

    subscribe(callback) {
        console.log(`[Mock DB] Subscribing to ${this.type} (filter: ${JSON.stringify(this.filterObj)})`);
        this.subscribers.add(callback);
        // Immediately call with current data
        callback(this.getList());
        return () => {
            console.log(`[Mock DB] Unsubscribing from ${this.type} (filter: ${JSON.stringify(this.filterObj)})`);
            this.subscribers.delete(callback);
        };
    }
}


class WebsimSocket {
    constructor() {
        this.presence = {}; // { clientId: data }
        this.roomState = {}; // { key: value }
        this.peers = {}; // { clientId: { username, avatarUrl } }
        this.clientId = `mock_client_${Math.random().toString(16).slice(2)}`;

        this.presenceSubscribers = new Set();
        this.roomStateSubscribers = new Set();
        this.presenceUpdateRequestsSubscribers = new Set();

        this._collections = {}; // Cache for collection instances

        // Mock self peer
        this.peers[this.clientId] = {
            username: `User_${this.clientId.slice(-4)}`,
            avatarUrl: `https://images.websim.ai/avatar/User_${this.clientId.slice(-4)}` // Default avatar structure
        };
        this.presence[this.clientId] = { x: 0, y: 0, z: 0, avatarUrl: this.peers[this.clientId].avatarUrl }; // Initial presence

        console.log(`[Mock Websim] Initialized client: ${this.clientId}, Username: ${this.peers[this.clientId].username}`);

        // Simulate another peer joining after a delay
        setTimeout(() => {
            const peerId = `mock_peer_${Math.random().toString(16).slice(2)}`;
            this.peers[peerId] = {
                 username: `Peer_${peerId.slice(-4)}`,
                 avatarUrl: `https://images.websim.ai/avatar/Peer_${peerId.slice(-4)}`
             };
             this.presence[peerId] = { x: Math.random() * 10 - 5, y: 0, z: Math.random() * 10 - 5, avatarUrl: this.peers[peerId].avatarUrl };
             this._notifyPresenceSubscribers();
             console.log(`[Mock Websim] Peer joined: ${peerId}`);

             // Simulate peer leaving
             setTimeout(() => {
                console.log(`[Mock Websim] Peer left: ${peerId}`);
                delete this.peers[peerId];
                delete this.presence[peerId];
                 this._notifyPresenceSubscribers();
             }, 15000);

        }, 3000);
    }

    async initialize() {
        console.log("[Mock Websim] Initializing...");
        // Simulate async initialization
        await new Promise(resolve => setTimeout(resolve, 50));
        console.log("[Mock Websim] Initialized.");
         this._notifyPresenceSubscribers(); // Notify initial state
         this._notifyRoomStateSubscribers();
    }

    _notifyPresenceSubscribers() {
        // Also update peers list when presence changes (joins/leaves)
        this.peers = Object.keys(this.presence).reduce((acc, clientId) => {
            acc[clientId] = this.peers[clientId] || { username: `Unknown_${clientId.slice(-4)}`, avatarUrl: `https://images.websim.ai/avatar/Unknown_${clientId.slice(-4)}`}; // Ensure peer data exists
            return acc;
        }, {});

        this.presenceSubscribers.forEach(cb => cb(this.presence));
    }

    _notifyRoomStateSubscribers() {
        this.roomStateSubscribers.forEach(cb => cb(this.roomState));
    }

    updatePresence(data) {
         console.log("[Mock Websim] Updating presence:", data);
         // Deep merge simulation (simple version)
         this.presence[this.clientId] = { ...(this.presence[this.clientId] || {}), ...data };
         // If avatarUrl changed, update peers too
         if (data.avatarUrl && this.peers[this.clientId]) {
             this.peers[this.clientId].avatarUrl = data.avatarUrl;
         }
         this._notifyPresenceSubscribers();
         // Simulate broadcast delay
         // In a real scenario, server broadcasts this to others
    }

    updateRoomState(data) {
        console.log("[Mock Websim] Updating room state:", data);
        // Deep merge simulation (handles nested objects and null for deletion)
        const merge = (target, source) => {
            for (const key in source) {
                if (source[key] === null) {
                    delete target[key];
                } else if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    if (typeof target[key] !== 'object' || target[key] === null || Array.isArray(target[key])) {
                        target[key] = {};
                    }
                    merge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        };
        merge(this.roomState, data);
        this._notifyRoomStateSubscribers();
        // Simulate broadcast delay
    }

    requestPresenceUpdate(clientId, update) {
        console.log(`[Mock Websim] Requesting presence update for ${clientId}:`, update);
        // Simulate sending request to the specific client
        // In a real setup, this goes via the server to the target client
        // For mock, we can directly invoke handlers if needed, but usually not done this way.
        // We can simulate the *other* client receiving it:
        setTimeout(() => {
             console.log(`[Mock Websim] Simulating ${clientId} receiving request from ${this.clientId}`);
             // If the target client had a listener, it would trigger here.
             // For simplicity, we won't auto-process requests in this mock.
             this.presenceUpdateRequestsSubscribers.forEach(cb => {
                 // Normally this callback only runs on the *target* client's machine.
                 // Here we simulate it running for demonstration if needed.
                 // cb(update, this.clientId);
             });
         }, 100);
    }

    subscribePresence(callback) {
        this.presenceSubscribers.add(callback);
        // Immediately call with current data
        callback(this.presence);
        return () => this.presenceSubscribers.delete(callback);
    }

    subscribeRoomState(callback) {
        this.roomStateSubscribers.add(callback);
        // Immediately call with current data
        callback(this.roomState);
        return () => this.roomStateSubscribers.delete(callback);
    }

    subscribePresenceUpdateRequests(callback) {
        this.presenceUpdateRequestsSubscribers.add(callback);
        // This usually doesn't immediately call back
        return () => this.presenceUpdateRequestsSubscribers.delete(callback);
    }

    // Database Collection Access
    collection(type) {
        if (!this._collections[type]) {
            this._collections[type] = new Collection(this, type);
        }
        return this._collections[type];
    }
}

// Mock websim global object
window.websim = {
    upload: async (file) => {
        console.log(`[Mock Upload] Uploading file: ${file.name} (${file.size} bytes)`);
        // Simulate upload delay
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
        // Return a mock URL. In reality, this would be a blob storage URL.
        // For GLB files, we can return a blob URL for local testing if needed,
        // but a placeholder is often sufficient for mock.
        // return URL.createObjectURL(file); // Option 1: Blob URL (temporary)
        return `/mock-assets/${file.name}`; // Option 2: Placeholder URL path
        // throw new Error("Mock upload failed"); // Simulate failure
    },
    getCreatedBy: async () => {
        // Simulate fetching creator info
        await new Promise(resolve => setTimeout(resolve, 50));
        return { username: 'mock_creator' }; // Return mock creator username
    }
};

// Expose WebsimSocket globally
window.WebsimSocket = WebsimSocket;

