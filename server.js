const express = require('express');
const { ExpressPeerServer } = require('peer');

const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

app.get('/', (req, res) => res.send('DonkeyChat signaling server is running 🫏'));

// ─── PASTE YOUR METERED.CA CREDENTIALS HERE ───
const TURN_USERNAME   = 'YOUR_METERED_USERNAME';   // 👈 from metered.ca dashboard
const TURN_CREDENTIAL = 'YOUR_METERED_CREDENTIAL'; // 👈 from metered.ca dashboard
// ──────────────────────────────────────────────

app.get('/turn-credentials', (req, res) => {
    res.json({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.relay.metered.ca:80' },
            {
                urls: 'turn:standard.relay.metered.ca:80',
                username: TURN_USERNAME,
                credential: TURN_CREDENTIAL
            },
            {
                urls: 'turn:standard.relay.metered.ca:80?transport=tcp',
                username: TURN_USERNAME,
                credential: TURN_CREDENTIAL
            },
            {
                urls: 'turn:standard.relay.metered.ca:443',
                username: TURN_USERNAME,
                credential: TURN_CREDENTIAL
            },
            {
                urls: 'turns:standard.relay.metered.ca:443?transport=tcp',
                username: TURN_USERNAME,
                credential: TURN_CREDENTIAL
            }
        ]
    });
});

const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});

const peerServer = ExpressPeerServer(server, {
    allow_discovery: false
});

app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
    console.log('Peer connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
    console.log('Peer disconnected:', client.getId());
});
