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

let userCount = 0;

io.on('connection', (socket) => {

    userCount++

    //console.log("User count: ", userCount)

    socket.on('ping', () => {
        console.log('ping')
        socket.emit("ping", 'pong')
    })

    socket.on('emit-create-room', async (data) => {
        try {
            const newRoom = new Room(data);
            await newRoom.save();
            socket.join(data.roomId);
        } catch (error) {
            console.log(data.roomId, 'emit-create-room', error)
        }
    })

    socket.on('emit-join-room', async (data) => {
        try {
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
        } catch (error) {
            console.log(data.roomId, 'emit-join-room', error)
        }
    })

    socket.on('emit-message', (data) => {
        socket.to(data.room).emit('receive-message', data.message)
    })

    socket.on('emit-initial-cards-order', async (data) => {
        try {
            const roomId = Array.from(socket.rooms)[1]
            const filter = { roomId: roomId }
            const update = { whiteCards: data.whiteCards, blackCards: data.blackCards };
            await Room.findOneAndUpdate(filter, update)
        } catch (error) {
            console.log(roomId, 'emit-initial-cards-order', error)
        }
    })

    socket.on('emit-cards-distribution', async () => {
        const roomId = Array.from(socket.rooms)[1]
        try {
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
        } catch (error) {
            console.log(roomId, 'emit-cards-distribution', error)
        }
    })

    socket.on('emit-cards-replacement', async () => {
        const roomId = Array.from(socket.rooms)[1]
        try {
            let room = await Room.findOne({ 'roomId': roomId })
            if (room) {
                room.players.forEach(player => {
                    if (player.id !== room.readerId) {
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
        } catch (error) {
            console.log(roomId, 'emit-cards-replacement', error)
        }
    })

    socket.on('emit-player-picked-white-card', (data) => {
        const roomId = Array.from(socket.rooms)[1]
        try {
            socket.nsp.to(roomId).emit('receive-player-picked-white-card', { player: data.playerId, pickedCard: data.cardIndex });
        } catch (error) {
            console.log(roomId, 'emit-player-picked-white-card', error)
        }
    })

    socket.on('emit-winner-gets-one-point', async (roundWinnerId) => {
        const roomId = Array.from(socket.rooms)[1]
        try {
            let room = await Room.findOne({ 'roomId': roomId })
            if (room) {
                socket.nsp.to(room.roomId).emit('receive-winner-gets-one-point', roundWinnerId);
            }
        } catch (error) {
            console.log(roomId, 'emit-winner-gets-one-point', error)
        }
    })

    socket.on('emit-current-black-card', async () => {
        const roomId = Array.from(socket.rooms)[1]
        try {
            let room = await Room.findOne({ 'roomId': roomId })
            if (room) {
                const cardIndex = room.blackCards[room.round]
                socket.nsp.to(roomId).emit('receive-current-black-card', cardIndex)
            }
        } catch (error) {
            console.log(roomId, 'emit-current-black-card', error)
        }
    })

    socket.on('emit-first-turn', async () => {
        const roomId = Array.from(socket.rooms)[1]
        try {
            let room = await Room.findOne({ 'roomId': roomId })
            if (room) {
                var rand = Math.floor(Math.random() * room.players.length);
                Room.findById(room._id).then((room)=>{
                    room.readerId = room.players[rand].id;
                    room.save();
                    socket.nsp.to(room.roomId).emit('receive-next-turn', room.players[rand].id)
                })
            }
        } catch (error) {
            console.log(roomId, 'emit-first-turn', error)
        }
    })

    socket.on('emit-next-turn', async () => {
        const roomId = Array.from(socket.rooms)[1]
        try {
            let room = await Room.findOne({ 'roomId': roomId })
            if (room) {
                for (let i = 0; i < room.players.length; i++) {
                    if (room.readerId === room.players[i].id) {
                        if (i + 1 === room.players.length) {
                            room.readerId = room.players[0].id
                        } else {
                            room.readerId = room.players[i + 1].id
                        }
                        break;
                    }
                }
                room.round += 1;
                await Room.findByIdAndUpdate(room._id, room);
                socket.nsp.to(room.roomId).emit('receive-next-turn', room.readerId)
            }
        } catch (error) {
            console.log(roomId, 'emit-next-turn', error)
        }
    })

    socket.on('disconnecting', async () => {
        userCount--
        const roomId = Array.from(socket.rooms)[1]
        try {
            let room = await Room.findOne({ 'roomId': roomId })
            if (room) {
                room.players = room.players?.filter(x => x.id !== socket.id);
                if (room.players.length <= 0) {
                    await Room.findByIdAndDelete(room._id) //TODO: if there is no enough players, room should be deleted and game cannot continue
                } else {
                    var rand = Math.floor(Math.random() * room.players.length)
                    room.players[rand].admin = true;
                    await Room.findByIdAndUpdate(room._id, room)
                    socket.to(roomId).emit('receive-user-disconnected', { admin: room.players[rand].id, disconnected: socket.id })
                }
            }
        } catch (error) {
            console.log(roomId, 'disconnecting', error)
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