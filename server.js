
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

app.get('/', (req, res) => res.send('DonkeyChat relay server running 🫏'));

// rooms[code] = { peers: [ws1, ws2], createdAt: timestamp, used: bool }
const rooms = {};
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cleanup expired rooms every 60 seconds
setInterval(() => {
    const now = Date.now();
    for (const code in rooms) {
        const room = rooms[code];
        if (now - room.createdAt > CODE_TTL_MS) {
            // Notify any connected peers
            for (const peer of room.peers) {
                if (peer.readyState === 1) {
                    peer.send(JSON.stringify({ type: 'error', msg: 'Room expired.' }));
                    peer.close();
                }
            }
            delete rooms[code];
            console.log('Room expired and cleaned:', code);
        }
    }
}, 60 * 1000);

let activeConnections = 0;

function broadcastTraffic() {
    const payload = JSON.stringify({ type: 'traffic', count: activeConnections });
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(payload);
        }
    });
}

wss.on('connection', (ws) => {
    activeConnections++;
    broadcastTraffic();

    let myCode = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === 'create') {
            const code = msg.code;
            const now = Date.now();

            // Check if code already exists and is not expired
            if (rooms[code]) {
                const age = now - rooms[code].createdAt;
                if (age < CODE_TTL_MS) {
                    // Code still active — reject
                    ws.send(JSON.stringify({ type: 'error', msg: 'Code already in use. Please generate a new one.' }));
                    return;
                } else {
                    // Expired — clean it up
                    delete rooms[code];
                }
            }

            myCode = code;
            rooms[myCode] = { peers: [ws], createdAt: now };
            ws.send(JSON.stringify({ type: 'created', code: myCode, expiresIn: CODE_TTL_MS }));
            console.log('Room created:', myCode);
        }

        else if (msg.type === 'join') {
            const room = rooms[msg.code];
            const now = Date.now();

            if (!room) {
                ws.send(JSON.stringify({ type: 'error', msg: 'Room not found or expired.' }));
                return;
            }
            if (now - room.createdAt > CODE_TTL_MS) {
                delete rooms[msg.code];
                ws.send(JSON.stringify({ type: 'error', msg: 'Room code has expired.' }));
                return;
            }
            if (room.peers.length >= 2) {
                ws.send(JSON.stringify({ type: 'error', msg: 'Room is full.' }));
                return;
            }

            myCode = msg.code;
            room.peers.push(ws);

            // Tell both peers they're connected
            room.peers[0].send(JSON.stringify({ type: 'peer_joined' }));
            room.peers[1].send(JSON.stringify({ type: 'peer_joined' }));
            console.log('Room joined:', myCode);
        }

        else if (msg.type === 'relay') {
            // Forward anything to the other peer
            // Used for: chat msgs, WebRTC signaling (offer/answer/ICE), read receipts, file chunks (fallback)
            const room = rooms[myCode];
            if (!room) return;
            const other = room.peers.find(p => p !== ws);
            if (other && other.readyState === 1) {
                other.send(JSON.stringify({ type: 'relay', data: msg.data }));
            }
        }
    });

    ws.on('close', () => {
        activeConnections--;
        broadcastTraffic();

        if (myCode && rooms[myCode]) {
            const room = rooms[myCode];
            const other = room.peers.find(p => p !== ws);
            if (other && other.readyState === 1) {
                other.send(JSON.stringify({ type: 'peer_left' }));
            }
            delete rooms[myCode];
            console.log('Room closed:', myCode);
        }
    });

    ws.on('error', console.error);
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});
