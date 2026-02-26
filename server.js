
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

// Serve static files
app.use(express.static('.'));

// rooms[code] = { peers: [ws1, ws2], createdAt: timestamp }
const rooms = {};
const CODE_TTL_MS = 10 * 60 * 1000;

// discovery[ip] = { peerId: { ws, nick, os }, ... }
const discovery = {};

// Cleanup expired rooms
setInterval(() => {
    const now = Date.now();
    for (const code in rooms) {
        if (now - rooms[code].createdAt > CODE_TTL_MS) {
            rooms[code].peers.forEach(p => {
                if (p.readyState === 1) {
                    p.send(JSON.stringify({ type: 'error', msg: 'Room expired.' }));
                    p.close();
                }
            });
            delete rooms[code];
        }
    }
}, 60 * 1000);

let activeConnections = 0;

function broadcastTraffic() {
    const payload = JSON.stringify({ type: 'traffic', count: activeConnections });
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(payload);
    });
}

wss.on('connection', (ws, req) => {
    activeConnections++;
    broadcastTraffic();

    let myCode = null;
    let myPeerId = null;
    let myIp = null;

    const broadcastDiscovery = (ip) => {
        if (!discovery[ip]) return;
        const peers = Object.keys(discovery[ip]).map(id => ({
            id, nick: discovery[ip][id].nick, os: discovery[ip][id].os
        }));
        for (const id in discovery[ip]) {
            const clientWs = discovery[ip][id].ws;
            if (clientWs.readyState === 1) {
                clientWs.send(JSON.stringify({ type: 'discovery_list', peers: peers.filter(p => p.id !== id) }));
            }
        }
    };

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        // --- AUTO DISCOVERY ---
        if (msg.type === 'init_discovery') {
            myIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            if (myIp === '::1') myIp = '127.0.0.1';
            if (myIp && myIp.includes(',')) myIp = myIp.split(',')[0].trim();

            myPeerId = msg.peerId;
            if (!discovery[myIp]) discovery[myIp] = {};
            discovery[myIp][myPeerId] = { ws, nick: msg.nick, os: msg.os };
            broadcastDiscovery(myIp);
        }
        else if (msg.type === 'request_connect') {
            if (!discovery[myIp] || !discovery[myIp][msg.target]) return;
            const targetWs = discovery[myIp][msg.target].ws;
            if (targetWs.readyState === 1) {
                targetWs.send(JSON.stringify({ type: 'discovery_request', from: myPeerId, nick: discovery[myIp][myPeerId].nick }));
            }
        }
        else if (msg.type === 'accept_connect') {
            if (!discovery[myIp] || !discovery[myIp][msg.target]) return;
            const targetWs = discovery[myIp][msg.target].ws;

            myCode = String(Math.floor(100000 + Math.random() * 900000));
            rooms[myCode] = { peers: [targetWs, ws], createdAt: Date.now() };

            // Inform both peers to transition (targetWs is the initiator)
            if (targetWs.readyState === 1) {
                targetWs.send(JSON.stringify({ type: 'discovery_accepted', code: myCode, initiator: true }));
                // targetWs needs its myCode correctly updated for relaying later
                targetWs.roomCode = myCode; // store it on the socket object
            }
            ws.roomCode = myCode;
            ws.send(JSON.stringify({ type: 'discovery_accepted', code: myCode, initiator: false }));

            delete discovery[myIp][msg.target];
            delete discovery[myIp][myPeerId];
            broadcastDiscovery(myIp);
        }
        else if (msg.type === 'decline_connect') {
            if (!discovery[myIp] || !discovery[myIp][msg.target]) return;
            const targetWs = discovery[myIp][msg.target].ws;
            if (targetWs.readyState === 1) {
                targetWs.send(JSON.stringify({ type: 'error', msg: 'Connection declined by peer.' }));
            }
        }

        // --- STANDARD MANUAL ROOMS ---
        else if (msg.type === 'create') {
            if (rooms[msg.code] && Date.now() - rooms[msg.code].createdAt < CODE_TTL_MS) {
                ws.send(JSON.stringify({ type: 'error', msg: 'Code in use.' }));
                return;
            }
            myCode = msg.code;
            ws.roomCode = myCode;
            rooms[myCode] = { peers: [ws], createdAt: Date.now() };
            ws.send(JSON.stringify({ type: 'created', code: myCode, expiresIn: CODE_TTL_MS }));

            // If they created a room manually, hide them from discovery
            if (myIp && myPeerId && discovery[myIp]) {
                delete discovery[myIp][myPeerId];
                broadcastDiscovery(myIp);
            }
        }
        else if (msg.type === 'join') {
            const room = rooms[msg.code];
            if (!room || Date.now() - room.createdAt > CODE_TTL_MS) {
                ws.send(JSON.stringify({ type: 'error', msg: 'Room not found.' }));
                return;
            }
            if (room.peers.length >= 2) {
                ws.send(JSON.stringify({ type: 'error', msg: 'Room full.' }));
                return;
            }
            myCode = msg.code;
            ws.roomCode = myCode;
            room.peers.push(ws);
            room.peers.forEach(p => p.send(JSON.stringify({ type: 'peer_joined' })));

            if (myIp && myPeerId && discovery[myIp]) {
                delete discovery[myIp][myPeerId];
                broadcastDiscovery(myIp);
            }
        }

        // --- RELAY ---
        else if (msg.type === 'relay') {
            const activeCode = ws.roomCode || myCode;
            const room = rooms[activeCode];
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

        if (myIp && myPeerId && discovery[myIp] && discovery[myIp][myPeerId]) {
            delete discovery[myIp][myPeerId];
            broadcastDiscovery(myIp);
        }

        const activeCode = ws.roomCode || myCode;
        if (activeCode && rooms[activeCode]) {
            const other = rooms[activeCode].peers.find(p => p !== ws);
            if (other && other.readyState === 1) {
                other.send(JSON.stringify({ type: 'peer_left' }));
            }
            delete rooms[activeCode];
        }
    });
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});
