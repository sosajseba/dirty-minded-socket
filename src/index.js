const { instrument } = require('@socket.io/admin-ui')
const dotenv = require('dotenv')
dotenv.config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const connectDb = require('./db')
const Room = require('./models/room')

const app = express();

connectDb();

const server = http.createServer(app);

app.use(cors());

app.get('/health', (req, res) => {
    res.send('Server is up!');
});

const allowAllOrigins = process.env.ALLOW_ALL_ORIGINS === 'true';

const corsConfig = {
    origin: process.env.CORS_ORIGINS.split(','),
    methods: ['GET', 'POST'],
    credentials: true
}

const io = new Server(server, {
    cors: allowAllOrigins ? { origin: '*' } : corsConfig
})

const cardsPerPlayer = process.env.CARDS_PER_PLAYER;

io.on('connection', (socket) => {

    socket.on('ping', () => {
        socket.emit("ping", 'pong')
    })

    socket.on('emit-create-room', async (data) => {
        const newRoom = new Room(data);
        await newRoom.save();
        socket.join(data.roomId);
    })

    socket.on('emit-join-room', async (data) => {
        let room = await Room.findOne({ 'roomId': data.roomId })
        if (room) {
            if (room.players) {
                if (room.players.length < process.env.MAX_PLAYERS_PER_ROOM) {
                    socket.join(data.roomId);
                    room.players.push(data.player);
                    await Room.findByIdAndUpdate(room._id, room)
                    socket.nsp.to(data.roomId).emit('receive-new-player', { players: room.players, roomId: data.roomId });
                } else {
                    socket.nsp.to(data.player.id).emit('receive-room-is-full', true);
                }
            }
        }
    })

    socket.on('emit-message', (data) => {
        socket.to(data.room).emit('receive-message', data.message)
    })

    socket.on('emit-initial-cards-order', async (data) => {
        const roomId = Array.from(socket.rooms)[1]
        const filter = { roomId: roomId }
        const update = { whiteCards: data.whiteCards, blackCards: data.blackCards };
        await Room.findOneAndUpdate(filter, update)
    })

    socket.on('emit-cards-distribution', async () => {
        const roomId = Array.from(socket.rooms)[1]
        let room = await Room.findOne({ 'roomId': roomId })
        if (room) {
            let newPlayers = []
            room.players.forEach(player => {
                const firstCards = room.whiteCards.slice(0, cardsPerPlayer);
                let lastCards = room.whiteCards.slice(cardsPerPlayer, room.whiteCards.length);
                player.cards = firstCards;
                lastCards = lastCards.concat(firstCards);
                room.whiteCards = lastCards;
                newPlayers.push(player);
                socket.nsp.to(player.id).emit('receive-cards-distribution', firstCards);
            });
            room.players = newPlayers;
            await Room.findByIdAndUpdate(room._id, room)
        }
    })

    socket.on('emit-cards-replacement', async () => {
        const roomId = Array.from(socket.rooms)[1]
        let room = await Room.findOne({ 'roomId': roomId })
        if (room) {
            room.players.forEach(player => {
                if (player.reads === false) {
                    const firstCardList = room.whiteCards.slice(0, 1);
                    let lastCards = room.whiteCards.slice(1, room.whiteCards.length);
                    player.cards = player.cards.concat(firstCardList);
                    lastCards = lastCards.concat(firstCardList);
                    room.whiteCards = lastCards;
                    socket.nsp.to(player.id).emit('receive-cards-replacement', firstCardList);
                }
            });
            await Room.findByIdAndUpdate(room._id, room);
        }
    })

    socket.on('emit-player-picked-white-card', (data) => {
        const roomId = Array.from(socket.rooms)[1]
        socket.nsp.to(roomId).emit('receive-player-picked-white-card', { player: data.playerId, pickedCard: data.cardIndex });
    })

    socket.on('emit-winner-gets-one-point', async (roundWinnerId) => {
        const roomId = Array.from(socket.rooms)[1]
        let room = await Room.findOne({ 'roomId': roomId })
        if (room) {
            room.round++
            await Room.findByIdAndUpdate(room._id, room);
            socket.nsp.to(room.roomId).emit('receive-winner-gets-one-point', roundWinnerId);
        }
    })

    socket.on('emit-current-black-card', async (roomId) => {
        let room = await Room.findOne({ 'roomId': roomId })
        if (room) {
            const cardIndex = room.blackCards[room.round]
            room.currentBlackCard = cardIndex;
            await Room.findByIdAndUpdate(room._id, room);
            socket.nsp.to(roomId).emit('receive-current-black-card', cardIndex)
        }
    })

    socket.on('emit-first-turn', async () => {
        const roomId = Array.from(socket.rooms)[1]
        let room = await Room.findOne({ 'roomId': roomId })
        if (room) {
            var rand = Math.floor(Math.random() * room.players.length);
            room.players[rand].reads = true
            await Room.findByIdAndUpdate(room._id, room);
            socket.nsp.to(room.roomId).emit('receive-first-turn', rand)
        }
    })

    socket.on('emit-next-turn', async () => {
        const roomId = Array.from(socket.rooms)[1]
        let room = await Room.findOne({ 'roomId': roomId })
        if (room) {
            for (let i = 0; i < room.players.length; i++) {
                if (room.players[i].reads === true) {
                    room.players[i].reads = false;
                    if (room.players.length - 1 === i) {
                        room.players[0].reads = true;
                        room.players.readerId = room.players[0].id
                    } else {
                        room.players[i + 1].reads = true;
                        room.players.readerId = room.players[i + 1].id
                    }
                    break;
                }
            }
            await Room.findByIdAndUpdate(room._id, room);
            socket.nsp.to(room.roomId).emit('receive-next-turn', null)
        }
    })

    socket.on('disconnecting', async () => {
        const roomId = Array.from(socket.rooms)[1]
        let room = await Room.findOne({ 'roomId': roomId })
        if (room) {
            if (room.players.length === 1) {
                await Room.findByIdAndDelete(room._id)
            } else {
                room.players = room.players?.filter(x => x.id !== socket.id);
                if (room.players?.length > 0) {
                    var rand = Math.floor(Math.random() * room.players.length)
                    room.players[rand].admin = true;
                    await Room.findByIdAndUpdate(room._id, room)
                    socket.to(room.roomId).emit('receive-user-disconnected', { admin: room.players[rand].id, disconnected: socket.id })
                }
            }
        }
    });
})

instrument(io, {
    auth: {
        type: "basic",
        username: process.env.ADMIN_UI_USER,
        password: bcrypt.hashSync(process.env.ADMIN_UI_PASS, 10)
    }
})

server.listen(process.env.PORT, () => {
    console.log('Server is running on port ' + process.env.PORT)
})