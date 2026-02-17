const express = require('express');
const { PeerServer } = require('peer');

const app = express();

app.get('/', (req, res) => res.send('DonkeyChat signaling server is running 🫏'));

const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});

const peerServer = PeerServer({
    server: server,
    path: '/peerjs'
});

peerServer.on('connection', (client) => {
    console.log('Peer connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
    console.log('Peer disconnected:', client.getId());
});
