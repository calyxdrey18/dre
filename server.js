const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Create HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        return res.end('Error loading index.html');
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

const clients = new Map();

wss.on('connection', (ws) => {
  let currentUser = null;

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    switch(data.type) {
      case 'user-connect':
        currentUser = {
          username: data.username,
          profilePic: data.profilePic,
          ws: ws
        };
        clients.set(data.username, currentUser);
        broadcastUserList();
        broadcastSystemMessage(`${data.username} joined the chat`);
        break;
        
      case 'message':
        if (data.receiver) {
          // Private message
          const receiver = clients.get(data.receiver);
          if (receiver && receiver.ws.readyState === WebSocket.OPEN) {
            receiver.ws.send(JSON.stringify({
              ...data,
              sender: currentUser.username
            }));
          }
        } else {
          // Broadcast message
          clients.forEach(client => {
            if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({
                ...data,
                sender: currentUser.username
              }));
            }
          });
        }
        break;
        
      case 'offer':
      case 'answer':
      case 'candidate':
        // Forward WebRTC signaling messages
        const receiver = clients.get(data.receiver);
        if (receiver && receiver.ws.readyState === WebSocket.OPEN) {
          receiver.ws.send(JSON.stringify(data));
        }
        break;
    }
  });

  ws.on('close', () => {
    if (currentUser) {
      clients.delete(currentUser.username);
      broadcastUserList();
      broadcastSystemMessage(`${currentUser.username} left the chat`);
    }
  });
});

function broadcastUserList() {
  const users = Array.from(clients.values()).map(user => ({
    username: user.username,
    profilePic: user.profilePic
  }));
  
  clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'user-list',
        users: users
      }));
    }
  });
}

function broadcastSystemMessage(message) {
  clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'system',
        message: message
      }));
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
