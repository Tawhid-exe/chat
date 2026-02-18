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

// rooms[code] = { peers: [ws1, ws2], createdAt: timestamp }
const rooms = {};

// FEATURE: 10-Minute Code Expiry Sweeper
setInterval(() => {
    const now = Date.now();
    for (const code in rooms) {
        if (now - rooms[code].createdAt > 10 * 60 * 1000) {
            console.log(`Room ${code} expired after 10 minutes.`);
            rooms[code].peers.forEach(ws => {
                if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', msg: 'Session expired (10 min limit). Please create a new room.' }));
            });
            delete rooms[code];
        }
    }
}, 60000); // Check every 60 seconds

wss.on('connection', (ws) => {
    let myCode = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === 'create') {
            // Prevent duplicate codes
            if (rooms[msg.code]) {
                ws.send(JSON.stringify({ type: 'error', msg: 'collision' }));
                return;
            }
            myCode = msg.code;
            rooms[myCode] = { peers: [ws], createdAt: Date.now() };
            ws.send(JSON.stringify({ type: 'created', code: myCode }));
            console.log('Room created:', myCode);
        }

        else if (msg.type === 'join') {
            const room = rooms[msg.code];
            if (!room || room.peers.length >= 2) {
                ws.send(JSON.stringify({ type: 'error', msg: 'Passcode invalid or room full.' }));
                return;
            }
            myCode = msg.code;
            room.peers.push(ws);

            // Tell both peers they're connected - Assign one as 'initiator' for WebRTC
            room.peers[0].send(JSON.stringify({ type: 'peer_joined', initiator: true }));
            room.peers[1].send(JSON.stringify({ type: 'peer_joined', initiator: false }));
            console.log('Room joined:', myCode);
        }

        else if (msg.type === 'relay') {
            const room = rooms[myCode];
            if (!room) return;
            const other = room.peers.find(p => p !== ws);
            if (other && other.readyState === 1) {
                other.send(JSON.stringify({ type: 'relay', data: msg.data }));
            }
        }
    });

    ws.on('close', () => {
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
