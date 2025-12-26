const WebSocket = require('ws');

let wss;

// Store connections mapped by user ID
// key: userId, value: Set of WebSocket connections
const clients = new Map();

/**
 * Initializes the WebSocket server.
 * @param {http.Server} server - The HTTP server to attach the WebSocket server to.
 */
function init(server) {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        // For this simple case, we won't authenticate the websocket connection itself,
        // but in a real app, you would use a token passed in the query string.
        // e.g., const url = new URL(req.url, `ws://${req.headers.host}`);
        // const token = url.searchParams.get('token');
        // const userId = authenticateToken(token); -> then store ws with userId

        console.log('WebSocket client connected');

        ws.on('message', (message) => {
            // The client can send its userId after connection to be mapped.
            try {
                const data = JSON.parse(message);
                if (data.type === 'authenticate' && data.userId) {
                    const userId = data.userId.toString();
                    if (!clients.has(userId)) {
                        clients.set(userId, new Set());
                    }
                    clients.get(userId).add(ws);
                    console.log(`WebSocket client authenticated for user: ${userId}`);

                    // When a user authenticates, send a confirmation
                    ws.send(JSON.stringify({ type: 'authentication_success', message: 'WebSocket connection authenticated.' }));
                }
            } catch (e) {
                console.log('Received non-JSON message or bad format');
            }
        });

        ws.on('close', () => {
            console.log('WebSocket client disconnected');
            // Remove the disconnected client from all user mappings
            for (const [userId, userSockets] of clients.entries()) {
                if (userSockets.has(ws)) {
                    userSockets.delete(ws);
                    if (userSockets.size === 0) {
                        clients.delete(userId);
                    }
                    break; // A connection belongs to only one user
                }
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    console.log('WebSocket server initialized.');
}

/**
 * Sends a message to all connected clients for a specific user.
 * @param {string} userId - The ID of the user to send the message to.
 * @param {object} data - The data payload to send (will be JSON.stringified).
 */
function sendToUser(userId, data) {
    if (!userId) return;
    const userSockets = clients.get(userId.toString());

    if (userSockets && userSockets.size > 0) {
        const message = JSON.stringify(data);
        let count = 0;
        userSockets.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
                count++;
            }
        });
        console.log(`Sent message to ${count} socket(s) for user ${userId}`);
    }
}


module.exports = {
    init,
    sendToUser
};