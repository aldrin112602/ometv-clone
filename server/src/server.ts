import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';

const app = express();
const httpServer = createServer(app);

// CORS configuration
app.use(cors());
app.use(express.json());

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../../client/public')));

// Specific routes for SEO files with correct content types
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(__dirname, '../../client/public/robots.txt'));
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.sendFile(path.join(__dirname, '../../client/public/sitemap.xml'));
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Types
interface User {
  id: string;
  socket: Socket;
  partnerId?: string;
}

// Data structures
const waitingUsers: User[] = [];
const connectedUsers = new Map<string, User>();

// Match two users together
function matchUsers(user1: User, user2: User): void {
  // Set up the partnership
  user1.partnerId = user2.id;
  user2.partnerId = user1.id;

  console.log(`Matched ${user1.id} with ${user2.id}`);

  // User1 (who was waiting) becomes the initiator and creates the offer
  // User2 (who just requested) will wait for the offer
  user1.socket.emit('matched', { partnerId: user2.id, initiator: true });
  user2.socket.emit('matched', { partnerId: user1.id, initiator: false });
}

// Find a random partner for a user
function findPartner(user: User): void {
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
  } else {
    // Add user to waiting list
    waitingUsers.push(user);
    user.socket.emit('waiting');
    console.log(`User ${user.id} is waiting. Total waiting: ${waitingUsers.length}`);
  }
}

// Disconnect a user from their partner
function disconnectFromPartner(user: User): void {
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
function removeFromWaiting(userId: string): void {
  const index = waitingUsers.findIndex(u => u.id === userId);
  if (index !== -1) {
    waitingUsers.splice(index, 1);
    console.log(`Removed ${userId} from waiting list. Total waiting: ${waitingUsers.length}`);
  }
}

// Socket.io event handlers
io.on('connection', (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create user object
  const user: User = {
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
  socket.on('offer', (data: { offer: any, to: string }) => {
    console.log(`Offer from ${socket.id} to ${data.to}`);
    io.to(data.to).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  // Handle WebRTC signaling - answer
  socket.on('answer', (data: { answer: any, to: string }) => {
    console.log(`Answer from ${socket.id} to ${data.to}`);
    io.to(data.to).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
  });

  // Handle WebRTC signaling - ICE candidate
  socket.on('ice-candidate', (data: { candidate: any, to: string }) => {
    io.to(data.to).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // Handle chat messages
  socket.on('chat-message', (data: { to: string, message: string }) => {
    console.log(`Chat from ${socket.id} to ${data.to}: ${data.message}`);
    io.to(data.to).emit('chat-message', {
      message: data.message,
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