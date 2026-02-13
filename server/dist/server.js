"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// CORS configuration
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve static files from client directory
app.use(express_1.default.static(path_1.default.join(__dirname, '../../client/public')));
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
// Data structures
const waitingUsers = [];
const connectedUsers = new Map();
// Match two users together
function matchUsers(user1, user2) {
    // Set up the partnership
    user1.partnerId = user2.id;
    user2.partnerId = user1.id;
    console.log(`Matched ${user1.id} with ${user2.id}`);
    // Notify both users they've been matched
    user1.socket.emit('matched', { partnerId: user2.id });
    user2.socket.emit('matched', { partnerId: user1.id });
}
// Find a random partner for a user
function findPartner(user) {
    // Remove user from waiting list if they're in it
    const waitingIndex = waitingUsers.findIndex(u => u.id === user.id);
    if (waitingIndex !== -1) {
        waitingUsers.splice(waitingIndex, 1);
    }
    // Check if there are any waiting users
    if (waitingUsers.length > 0) {
        // Get a random waiting user
        const randomIndex = Math.floor(Math.random() * waitingUsers.length);
        const partner = waitingUsers[randomIndex];
        // Remove partner from waiting list
        waitingUsers.splice(randomIndex, 1);
        // Match them
        matchUsers(user, partner);
    }
    else {
        // Add user to waiting list
        waitingUsers.push(user);
        user.socket.emit('waiting');
        console.log(`User ${user.id} is waiting. Total waiting: ${waitingUsers.length}`);
    }
}
// Disconnect a user from their partner
function disconnectFromPartner(user) {
    if (user.partnerId) {
        const partner = connectedUsers.get(user.partnerId);
        if (partner) {
            // Notify partner
            partner.socket.emit('partner-disconnected');
            partner.partnerId = undefined;
        }
        user.partnerId = undefined;
    }
}
// Remove user from waiting list
function removeFromWaiting(userId) {
    const index = waitingUsers.findIndex(u => u.id === userId);
    if (index !== -1) {
        waitingUsers.splice(index, 1);
        console.log(`Removed ${userId} from waiting list. Total waiting: ${waitingUsers.length}`);
    }
}
// Socket.io event handlers
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    // Create user object
    const user = {
        id: socket.id,
        socket: socket
    };
    connectedUsers.set(socket.id, user);
    // Handle user requesting to find a partner
    socket.on('find-partner', () => {
        console.log(`User ${socket.id} looking for partner`);
        findPartner(user);
    });
    // Handle WebRTC signaling - offer
    socket.on('offer', (data) => {
        console.log(`Offer from ${socket.id} to ${data.to}`);
        io.to(data.to).emit('offer', {
            offer: data.offer,
            from: socket.id
        });
    });
    // Handle WebRTC signaling - answer
    socket.on('answer', (data) => {
        console.log(`Answer from ${socket.id} to ${data.to}`);
        io.to(data.to).emit('answer', {
            answer: data.answer,
            from: socket.id
        });
    });
    // Handle WebRTC signaling - ICE candidate
    socket.on('ice-candidate', (data) => {
        io.to(data.to).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });
    // Handle skip/next button
    socket.on('skip', () => {
        console.log(`User ${socket.id} skipped partner`);
        // Disconnect from current partner
        disconnectFromPartner(user);
        // Find new partner
        findPartner(user);
    });
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Disconnect from partner if any
        disconnectFromPartner(user);
        // Remove from waiting list
        removeFromWaiting(socket.id);
        // Remove from connected users
        connectedUsers.delete(socket.id);
    });
});
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        connectedUsers: connectedUsers.size,
        waitingUsers: waitingUsers.length
    });
});
// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server ready for connections`);
});
