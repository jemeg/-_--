const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const path = require('path');

// إعداد خادم Express
const app = express();
const port = 8081;

// تقديم الملفات الثابتة
app.use(express.static(__dirname));

// بدء خادم HTTP
const server = app.listen(8081, '0.0.0.0', () => {
    console.log(`HTTP server running on http://0.0.0.0:8081`);
    // احصل على عنوان IP المحلي
    const networkInterfaces = require('os').networkInterfaces();
    const addresses = [];
    for (const k in networkInterfaces) {
        for (const k2 in networkInterfaces[k]) {
            const address = networkInterfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    console.log('Available on your network at:');
    addresses.forEach(addr => {
        console.log(`http://${addr}:8081`);
    });
});

// إعداد خادم WebSocket
const wss = new WebSocket.Server({ server });

// إدارة الغرف واللاعبين
const rooms = new Map();
const players = new Map();

function broadcastRoomsList() {
    const roomsList = Array.from(rooms.values()).map(room => ({
        code: room.code,
        name: room.name,
        maxPlayers: room.maxPlayers,
        players: Array.from(room.players.values()).map(p => ({ name: p.name })),
        difficulty: room.difficulty,
        gameStarted: room.gameStarted
    }));

    const message = JSON.stringify({
        type: 'rooms_list',
        rooms: roomsList
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastToRoom(room, message) {
    if (room && room.players) {
        room.players.forEach(player => {
            if (player.ws && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }
}

wss.on('connection', (ws) => {
    console.log('New client connected');
    let currentPlayer = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received message:', message);

            switch (message.type) {
                case 'player_ready':
                    currentPlayer = {
                        name: message.name,
                        ws: ws
                    };
                    players.set(message.name, currentPlayer);
                    broadcastRoomsList();
                    break;

                case 'create_room':
                    if (!currentPlayer) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'يجب تسجيل الدخول أولاً'
                        }));
                        return;
                    }

                    const room = {
                        code: uuidv4().substring(0, 6).toUpperCase(),
                        name: message.name,
                        maxPlayers: parseInt(message.maxPlayers),
                        difficulty: message.difficulty,
                        host: message.host,
                        players: new Map(),
                        gameStarted: false
                    };

                    room.players.set(currentPlayer.name, currentPlayer);
                    rooms.set(room.code, room);

                    ws.send(JSON.stringify({
                        type: 'room_created',
                        room: {
                            code: room.code,
                            name: room.name,
                            maxPlayers: room.maxPlayers,
                            difficulty: room.difficulty,
                            host: room.host,
                            players: Array.from(room.players.values()).map(p => ({ name: p.name }))
                        }
                    }));

                    broadcastRoomsList();
                    break;

                case 'join_room':
                    const targetRoom = rooms.get(message.roomCode);
                    if (!targetRoom) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'الغرفة غير موجودة'
                        }));
                        return;
                    }

                    if (targetRoom.players.size >= targetRoom.maxPlayers) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'الغرفة ممتلئة'
                        }));
                        return;
                    }

                    if (targetRoom.gameStarted) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'اللعبة قد بدأت بالفعل'
                        }));
                        return;
                    }

                    targetRoom.players.set(currentPlayer.name, currentPlayer);

                    const roomData = {
                        code: targetRoom.code,
                        name: targetRoom.name,
                        maxPlayers: targetRoom.maxPlayers,
                        difficulty: targetRoom.difficulty,
                        host: targetRoom.host,
                        players: Array.from(targetRoom.players.values()).map(p => ({ name: p.name }))
                    };

                    broadcastToRoom(targetRoom, {
                        type: 'room_updated',
                        room: roomData
                    });

                    ws.send(JSON.stringify({
                        type: 'room_joined',
                        room: roomData
                    }));

                    broadcastRoomsList();
                    break;

                case 'leave_room':
                    const roomToLeave = rooms.get(message.roomCode);
                    if (roomToLeave) {
                        roomToLeave.players.delete(message.playerName);

                        if (roomToLeave.players.size === 0) {
                            rooms.delete(message.roomCode);
                        } else if (message.playerName === roomToLeave.host) {
                            roomToLeave.host = Array.from(roomToLeave.players.keys())[0];
                        }

                        broadcastToRoom(roomToLeave, {
                            type: 'room_updated',
                            room: {
                                code: roomToLeave.code,
                                name: roomToLeave.name,
                                maxPlayers: roomToLeave.maxPlayers,
                                difficulty: roomToLeave.difficulty,
                                host: roomToLeave.host,
                                players: Array.from(roomToLeave.players.values()).map(p => ({ name: p.name }))
                            }
                        });

                        broadcastRoomsList();
                    }
                    break;

                case 'start_game':
                    const gameRoom = rooms.get(message.roomCode);
                    if (gameRoom && message.playerName === gameRoom.host) {
                        gameRoom.gameStarted = true;
                        broadcastToRoom(gameRoom, {
                            type: 'game_started',
                            room: {
                                code: gameRoom.code,
                                name: gameRoom.name,
                                maxPlayers: gameRoom.maxPlayers,
                                difficulty: gameRoom.difficulty,
                                host: gameRoom.host,
                                players: Array.from(gameRoom.players.values()).map(p => ({ name: p.name }))
                            }
                        });
                        broadcastRoomsList();
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'حدث خطأ في معالجة الرسالة'
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (currentPlayer) {
            players.delete(currentPlayer.name);
            rooms.forEach((room, code) => {
                if (room.players.has(currentPlayer.name)) {
                    room.players.delete(currentPlayer.name);
                    if (room.players.size === 0) {
                        rooms.delete(code);
                    } else if (currentPlayer.name === room.host) {
                        room.host = Array.from(room.players.keys())[0];
                    }
                    broadcastToRoom(room, {
                        type: 'room_updated',
                        room: {
                            code: room.code,
                            name: room.name,
                            maxPlayers: room.maxPlayers,
                            difficulty: room.difficulty,
                            host: room.host,
                            players: Array.from(room.players.values()).map(p => ({ name: p.name }))
                        }
                    });
                }
            });
            broadcastRoomsList();
        }
    });

    // إرسال قائمة الغرف المتاحة عند الاتصال
    broadcastRoomsList();
});

console.log('Game server running on ws://localhost:8081');
