const express = require('express');
const { ExpressPeerServer } = require('peer');

const app = express();

// CORS - allow your Vercel frontend
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// Health check
app.get('/', (req, res) => res.send('DonkeyChat signaling server is running 🫏'));

// TURN credentials endpoint
// Gives the frontend fresh TURN credentials on demand
app.get('/turn-credentials', (req, res) => {
    res.json({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // Cloudflare TURN - free, fast, global
            {
                urls: [
                    'turn:turn.cloudflare.com:3478?transport=udp',
                    'turn:turn.cloudflare.com:3478?transport=tcp',
                    'turns:turn.cloudflare.com:5349?transport=tcp'
                ],
                username: '114a8a4e9b28b2a78f75c14478b96ad41ead31f55efc4d4c78ce08ae56d1aadc',
                credential: 'LQy8LPfYx4eUvhJQRzFxd1m7L3JPHI+5BFsC1lqXXbY='
            },
            // Open Relay as additional fallback
            {
                urls: [
                    'turn:a.relay.metered.ca:80',
                    'turn:a.relay.metered.ca:443',
                    'turns:a.relay.metered.ca:443'
                ],
                username: 'openrelayproject',
                credential: 'openrelayproject'
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
