class Game {
    constructor() {
        this.socket = null;
        this.playerName = '';
        this.currentRoom = null;
        this.isHost = false;
        
        // تهيئة الاتصال بالخادم
        this.initializeSocket();
        
        // إعداد مستمعي الأحداث
        this.setupEventListeners();
    }

    initializeSocket() {
        this.socket = new WebSocket('ws://localhost:8081');
        
        this.socket.onopen = () => {
            console.log('Connected to server');
            if (this.playerName) {
                this.socket.send(JSON.stringify({
                    type: 'player_ready',
                    name: this.playerName
                }));
            }
        };
        
        this.socket.onclose = () => {
            console.log('Disconnected from server');
            this.showError('تم قطع الاتصال بالخادم');
        };
        
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showError('حدث خطأ في الاتصال');
        };
        
        this.socket.onmessage = this.handleServerMessage.bind(this);
    }

    handleServerMessage(event) {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        
        switch (message.type) {
            case 'room_created':
                this.currentRoom = message.room;
                this.isHost = true;
                this.showWaitingScreen();
                this.updateRoomInfo();
                break;
                
            case 'room_joined':
                this.currentRoom = message.room;
                this.isHost = this.currentRoom.host === this.playerName;
                this.showWaitingScreen();
                this.updateRoomInfo();
                break;
                
            case 'room_updated':
                this.currentRoom = message.room;
                this.updateRoomInfo();
                break;
                
            case 'game_started':
                this.currentRoom = message.room;
                this.hideAllScreens();
                this.showGameScreen();
                break;
                
            case 'game_setup':
                this.setupGameEnvironment(message);
                break;
                
            case 'error':
                this.showError(message.message);
                break;
                
            case 'rooms_list':
                this.updateRoomsList(message.rooms);
                break;
        }
    }

    setupEventListeners() {
        // شاشة الاسم
        const nameSubmitBtn = document.getElementById('name-submit');
        const playerNameInput = document.getElementById('player-name');
        
        nameSubmitBtn.addEventListener('click', () => {
            const name = playerNameInput.value.trim();
            if (name) {
                this.playerName = name;
                this.socket.send(JSON.stringify({
                    type: 'player_ready',
                    name: this.playerName
                }));
                this.showRoomScreen();
            } else {
                this.showError('الرجاء إدخال اسم');
            }
        });

        // إضافة مستمع للضغط على Enter في حقل الاسم
        playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                nameSubmitBtn.click();
            }
        });
        
        // إنشاء غرفة
        const createRoomBtn = document.getElementById('create-room-btn');
        const newRoomNameInput = document.getElementById('new-room-name');
        const maxPlayersSelect = document.getElementById('max-players');
        const difficultySelect = document.getElementById('difficulty');
        
        createRoomBtn.addEventListener('click', () => {
            const roomName = newRoomNameInput.value.trim();
            if (!roomName) {
                this.showError('الرجاء إدخال اسم الغرفة');
                return;
            }
            
            this.socket.send(JSON.stringify({
                type: 'create_room',
                name: roomName,
                maxPlayers: maxPlayersSelect.value,
                difficulty: difficultySelect.value,
                host: this.playerName
            }));
        });

        // إضافة مستمع للضغط على Enter في حقل اسم الغرفة
        newRoomNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                createRoomBtn.click();
            }
        });
        
        // الانضمام لغرفة
        const joinRoomBtn = document.getElementById('join-room-btn');
        const roomCodeInput = document.getElementById('room-code');
        
        joinRoomBtn.addEventListener('click', () => {
            const roomCode = roomCodeInput.value.trim();
            if (!roomCode) {
                this.showError('الرجاء إدخال رمز الغرفة');
                return;
            }
            
            this.socket.send(JSON.stringify({
                type: 'join_room',
                roomCode: roomCode,
                playerName: this.playerName
            }));
        });

        // إضافة مستمع للضغط على Enter في حقل رمز الغرفة
        roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinRoomBtn.click();
            }
        });
        
        // أزرار غرفة الانتظار
        const startGameBtn = document.getElementById('start-game-btn');
        const leaveRoomBtn = document.getElementById('leave-room-btn');
        
        startGameBtn.addEventListener('click', () => {
            if (this.currentRoom && this.isHost && this.currentRoom.players.size >= 2) {
                this.socket.send(JSON.stringify({
                    type: 'start_game',
                    roomCode: this.currentRoom.code,
                    playerName: this.playerName
                }));
            } else {
                this.showError('لا يمكن بدء اللعبة. تحتاج إلى لاعبين على الأقل.');
            }
        });
        
        leaveRoomBtn.addEventListener('click', () => {
            if (this.currentRoom) {
                this.socket.send(JSON.stringify({
                    type: 'leave_room',
                    roomCode: this.currentRoom.code,
                    playerName: this.playerName
                }));
                this.currentRoom = null;
                this.showRoomScreen();
            }
        });

        // أزرار شاشة الموت
        const spectateBtn = document.getElementById('spectate-btn');
        const returnLobbyBtn = document.getElementById('return-lobby-btn');
        
        spectateBtn.addEventListener('click', () => {
            this.showGameScreen();
            this.startSpectating();
        });
        
        returnLobbyBtn.addEventListener('click', () => {
            this.currentRoom = null;
            this.showRoomScreen();
        });

        // زر اللعب مرة أخرى
        const playAgainBtn = document.getElementById('play-again-btn');
        playAgainBtn.addEventListener('click', () => {
            this.currentRoom = null;
            this.showRoomScreen();
        });
    }

    hideAllScreens() {
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => screen.classList.add('hidden'));
    }

    showScreen(screenId) {
        this.hideAllScreens();
        document.getElementById(screenId).classList.remove('hidden');
    }

    showRoomScreen() {
        this.showScreen('start-screen');
        document.getElementById('name-screen').classList.add('hidden');
        document.getElementById('room-screen').classList.remove('hidden');
        document.getElementById('waiting-screen').classList.add('hidden');
    }

    showWaitingScreen() {
        this.showScreen('start-screen');
        document.getElementById('name-screen').classList.add('hidden');
        document.getElementById('room-screen').classList.add('hidden');
        document.getElementById('waiting-screen').classList.remove('hidden');
    }

    showGameScreen() {
        this.showScreen('game-screen');
        this.initializeGame();
    }

    updateRoomInfo() {
        if (!this.currentRoom) return;
        
        const roomCodeDisplay = document.getElementById('room-code-display');
        const connectedPlayers = document.getElementById('connected-players');
        const playersList = document.getElementById('waiting-players-list');
        const startGameBtn = document.getElementById('start-game-btn');
        
        roomCodeDisplay.textContent = this.currentRoom.code;
        connectedPlayers.textContent = `${this.currentRoom.players.size}/${this.currentRoom.maxPlayers}`;
        
        playersList.innerHTML = '';
        this.currentRoom.players.forEach(player => {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            playerItem.textContent = `${player.name} ${player.name === this.currentRoom.host ? '(المضيف)' : ''}`;
            playersList.appendChild(playerItem);
        });
        
        if (startGameBtn) {
            startGameBtn.style.display = this.isHost ? 'block' : 'none';
            startGameBtn.disabled = this.currentRoom.players.size < 2;
        }
    }

    updateRoomsList(rooms) {
        const roomsList = document.getElementById('rooms-list');
        roomsList.innerHTML = '';
        
        rooms.forEach(room => {
            if (room.players.size < room.maxPlayers && !room.gameStarted) {
                const roomItem = document.createElement('div');
                roomItem.className = 'room-item';
                roomItem.innerHTML = `
                    <div class="room-info">
                        <span class="room-name">${room.name}</span>
                        <span class="room-players">${room.players.size}/${room.maxPlayers}</span>
                        <span class="room-difficulty">${room.difficulty}</span>
                    </div>
                    <button class="join-btn" data-code="${room.code}">انضمام</button>
                `;
                
                const joinBtn = roomItem.querySelector('.join-btn');
                joinBtn.addEventListener('click', () => {
                    this.socket.send(JSON.stringify({
                        type: 'join_room',
                        roomCode: room.code,
                        playerName: this.playerName
                    }));
                });
                
                roomsList.appendChild(roomItem);
            }
        });
    }

    showError(message) {
        const systemMessages = document.getElementById('system-messages');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        systemMessages.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 3000);
    }

    initializeGame() {
        console.log('Initializing game...');
        // سيتم إضافة منطق بدء اللعبة هنا
    }

    setupGameEnvironment(gameData) {
        console.log('Setting up game environment:', gameData);
        // سيتم إضافة منطق إعداد بيئة اللعبة هنا
    }

    startSpectating() {
        console.log('Starting spectator mode...');
        // سيتم إضافة منطق وضع المشاهدة هنا
    }
}

// إنشاء كائن اللعبة عند تحميل الصفحة
window.addEventListener('load', () => {
    window.game = new Game();
});
