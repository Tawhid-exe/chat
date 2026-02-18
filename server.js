
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

// rooms[code] = [ws1, ws2]
const rooms = {};

wss.on('connection', (ws) => {
    let myCode = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === 'create') {
            myCode = msg.code;
            rooms[myCode] = [ws];
            ws.send(JSON.stringify({ type: 'created', code: myCode }));
            console.log('Room created:', myCode);
        }

        else if (msg.type === 'join') {
            const room = rooms[msg.code];
            if (!room || room.length >= 2) {
                ws.send(JSON.stringify({ type: 'error', msg: 'Room not found or full' }));
                return;
            }
            myCode = msg.code;
            room.push(ws);

            // Tell both peers they're connected
            room[0].send(JSON.stringify({ type: 'peer_joined' }));
            room[1].send(JSON.stringify({ type: 'peer_joined' }));
            console.log('Room joined:', myCode);
        }

        else if (msg.type === 'relay') {
            // Forward anything to the other peer (chat msgs + WebRTC signaling)
            const room = rooms[myCode];
            if (!room) return;
            const other = room.find(p => p !== ws);
            if (other && other.readyState === 1) {
                other.send(JSON.stringify({ type: 'relay', data: msg.data }));
            }
        }
    });

    ws.on('close', () => {
        if (myCode && rooms[myCode]) {
            const room = rooms[myCode];
            const other = room.find(p => p !== ws);
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
