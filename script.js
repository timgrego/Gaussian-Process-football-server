const canvas = document.getElementById('plotCanvas');
const actionCardsContainer = document.getElementById('actionCardsContainer');
const ctx = canvas.getContext('2d');
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;


const marginLeft = 30; 
const marginBottom = 20;


const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const createRoomInput = document.getElementById('createRoomInput');
const joinRoomInput = document.getElementById('joinRoomInput');
const createRoomIdInput = document.getElementById('createRoomIdInput');
const joinRoomIdInput = document.getElementById('joinRoomIdInput');
const submitCreateRoom = document.getElementById('submitCreateRoom');
const submitJoinRoom = document.getElementById('submitJoinRoom');
const roomSelection = document.getElementById('roomSelection');


let playerPositions = []
let user_team = null;
let usr_has_ball = false;
let ball_unassigned = false;

console.log('Connecting to server:', config.SERVER_URL);
const socket = io(config.SERVER_URL, {
    transports: ['websocket'],
    upgrade: false
});

socket.on('connect', () => {
    console.log('Connected to the server with ID:', socket.id);
});

createRoomBtn.addEventListener('click', () => {
    console.log('Create Room button clicked');
    createRoomInput.style.display = 'block';
    joinRoomInput.style.display = 'none';
});

joinRoomBtn.addEventListener('click', () => {
    console.log('Join Room button clicked');
    joinRoomInput.style.display = 'block';
    createRoomInput.style.display = 'none';
});

submitCreateRoom.addEventListener('click', () => {
    console.log('Submit Create Room button clicked');
    const roomId = createRoomIdInput.value.trim();
    if (roomId) {
        console.log(`Emitting create_game event with room_id: ${roomId}`);
        socket.emit('create_game', { room_id: roomId });
    } else {
        alert('Please enter a room ID');
    }
});

submitJoinRoom.addEventListener('click', () => {
    console.log('Submit Join Room button clicked');
    const roomId = joinRoomIdInput.value.trim();
    if (roomId) {
        console.log(`Emitting join_game event with room_id: ${roomId}`);
        socket.emit('join_game', { room_id: roomId });
    } else {
        alert('Please enter a room ID');
    }
});

socket.on('game_created', (data) => {
    console.log('Game created with room ID:', data.room_id);
    alert(`Room created! Your room ID is: ${data.room_id}`);
    roomSelection.style.display = 'none';
});

socket.on('game_joined', (data) => {
    console.log('Joined game in room:', data.room_id);
    roomSelection.style.display = 'none';
});

socket.on('connect_error', (err) => {
    console.error('Connection error:', err.message);
});



socket.on('team_assignment', (data) => {
    user_team = data.team;
    console.log('Assigned to team:', user_team);
});

socket.on('update_positions', (data) => {
    console.log(data.ball_state)
    initialize_positions(data.position, data.ball_state);
    exitSelectionMode();
    drawActionCards();

});

// Plot area dimensions
const plotWidth = canvasWidth - marginLeft;
const plotHeight = canvasHeight - marginBottom;


let isSelectingPlayer = false;
let isSelectingPosition = false;
let actionRequiringPlayerSelection = null;
let actionRequiringPositionSelection = null;
let selectedCharacterId = null;


let ballPosition = null;


function normalizedToCanvasPosition(position) {
    return {
        x: canvasWidth * position.x,
        y: position.y * canvasHeight
    };
}
function canvasToNormalizedPosition(canvasPos) {
    return {
        x: (canvasPos.x - marginLeft) / plotWidth,
        y: 1 - (canvasPos.y / plotHeight)
    };
}

function initialize_positions(positions, ball_state) {
    playerPositions = []
    ballPosition = null;
    console.log(positions[5])

    for (let i = 0; i < positions.length; i++){
        if (i < 5){
            playerPositions.push({ id: i, 
                x: positions[i][0], 
                y: positions[i][1], 
                has_ball: i === ball_state['Player'], 
                team: 'A' });
        }else if (i === 5){
            if (ball_state['Assigned'] != null){
                ballPosition = { id: i, x: positions[i][0], y: positions[i][1], heldBy: ball_state['Player']}
                usr_has_ball = ball_state.Assigned === user_team;
                ball_unassigned = false;
            }else{
                usr_has_ball = false;
                ball_unassigned = true;
                ballPosition = { id: i, x: positions[i][0], y: positions[i][1], heldBy: null}
            }
        }else{
            playerPositions.push({ id: i, 
                x: positions[i][0], 
                y: positions[i][1], 
                has_ball: i === ball_state['Player'], 
                team: 'B' });
        }
    }
    plotPlayers();
}

function plotPlayers() {
    // Clear the canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Plot each player
    playerPositions.forEach((player, index) => {
        const canvasPos = normalizedToCanvasPosition(player);

        // Adjust y-coordinate to invert the axis (optional)
        const yPos = plotHeight - canvasPos.y;

        let playerColor = 'gray'; // Default color
        if (player.team === 'A') {
            playerColor = 'blue';
        } else if (player.team === 'B') {
            playerColor = 'red';
        }

        // Draw the player as a circle
        ctx.beginPath();
        ctx.arc(canvasPos.x, yPos, 5, 0, 2 * Math.PI); // Radius of 5 pixels
        ctx.fillStyle = playerColor; // Player color
        ctx.fill();
        
        if (isSelectingPlayer) {
            let shouldHighlight = false;
            let highlightColor = 'green';

            if (actionRequiringPlayerSelection === 'pass' &&
                player.team === user_team &&
                !player.has_ball) {
                shouldHighlight = true;
            } else if (actionRequiringPlayerSelection === 'move_character' &&
                       player.team === user_team) {
                shouldHighlight = true;
                highlightColor = 'red';
            } else if (actionRequiringPlayerSelection === 'recover_ball' &&
                       player.team === user_team &&
                       calculateDistance(player, ballPosition) <= MAX_RECOVERY_DISTANCE) {
                shouldHighlight = true;
                highlightColor = 'purple';
            } else if (actionRequiringPlayerSelection === 'intercept' &&
                       player.team === user_team &&
                       playerPositions.some(opponent => 
                           opponent.team !== user_team && 
                           opponent.has_ball && 
                           calculateDistance(player, opponent) <= MAX_INTERCEPT_DISTANCE)) {
                shouldHighlight = true;
                highlightColor = 'pink';
            }

            if (shouldHighlight) {
                ctx.strokeStyle = highlightColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(canvasPos.x, yPos, 7, 0, 2 * Math.PI);
                ctx.stroke();
            }
        }

        // Optionally, label the player
        ctx.font = '12px Arial';
        ctx.fillStyle = 'black';
        ctx.fillText(`P${index + 1}`, canvasPos.x + 6, yPos - 6);
    });

    plotBall();
}

function plotBall() {
    let ballX, ballY;

    console.log(ballPosition)

    if (ballPosition.heldBy !== null) {
        // Find the player who holds the ball
        const holdingPlayer = playerPositions.find(player => player.id === ballPosition.heldBy);

        if (holdingPlayer) {
            const canvasPos = normalizedToCanvasPosition(holdingPlayer);
            const yPos = plotHeight - canvasPos.y;

            // Position the ball near the holding player
            ballX = canvasPos.x + 10; // Adjust as needed
            ballY = yPos - 10;        // Adjust as needed
        } else {
            // If the player is not found, default to ball's own position
            const canvasPos = normalizedToCanvasPosition(ballPosition);
            ballX = canvasPos.x;
            ballY = plotHeight - canvasPos.y;
        }
    } else {
        // Ball is not held; use its own position
        const canvasPos = normalizedToCanvasPosition(ballPosition);
        ballX = canvasPos.x;
        ballY = plotHeight - canvasPos.y;
    }

    // Draw the ball
    ctx.beginPath();
    ctx.arc(ballX, ballY, 4, 0, 2 * Math.PI); // Ball radius of 4 pixels
    ctx.fillStyle = 'orange';
    ctx.fill();
}


function drawActionCards() {
    const actionCardsContainer = document.getElementById('actionCardsContainer');
    actionCardsContainer.innerHTML = ''; // Clear existing cards

    let actions = [];
    if (usr_has_ball) {
        actions = ['Pass', 'Shoot', 'Move Character'];
    } else {
        actions = ['Move Character'];
        
        // Check if any opponent with the ball is near a player from the user's team
        const canIntercept = playerPositions.some(player => 
            player.team === user_team && 
            playerPositions.some(opponent => 
                opponent.team !== user_team && 
                opponent.has_ball && 
                calculateDistance(player, opponent) <= MAX_INTERCEPT_DISTANCE
            )
        );
        
        if (canIntercept) {
            actions.push('Intercept');
        }
        
        // Check if the ball is unassigned and if any player from the user's team is near the ball
        if (ball_unassigned) {
            const canRecover = playerPositions.some(player => 
                player.team === user_team && 
                calculateDistance(player, ballPosition) <= MAX_RECOVERY_DISTANCE
            );
            
            if (canRecover) {
                actions.push('Recover Ball');
            }
        }
    }

    // Display action cards
    actionCardsContainer.style.display = 'flex';

    actions.forEach((action) => {
        const card = document.createElement('div');
        card.className = 'action-card';
        card.textContent = action;
        card.style = `
            flex: 1;
            padding: 10px;
            margin: 5px;
            background-color: #f0f0f0;
            border: 1px solid #ccc;
            text-align: center;
            cursor: pointer;
            border-radius: 5px;
        `;

        // Attach event handler
        card.addEventListener('click', () => handleActionClick(action));

        actionCardsContainer.appendChild(card);
    });
}

function handleActionClick(action) {
    console.log(`Action chosen: ${action}`);

    if (action === 'Pass') {
        // Enter player selection mode
        isSelectingPlayer = true;
        actionRequiringPlayerSelection = 'pass';
        disableActionCards();
        // Optionally, disable other action cards

        // Provide visual feedback (e.g., show a message)
        console.log('Select a teammate to pass the ball to.');
        plotPlayers();
    }else if (action === 'Shoot'){

        isSelectingPosition = true;
        actionRequiringPositionSelection = 'shoot'
        disableActionCards();
        console.log('Choose position to shoot to.')
        

    }else if (action === 'Move Character'){
        
        isSelectingPlayer = true;
        
        actionRequiringPlayerSelection = 'move_character'
        disableActionCards();
        console.log('Choose player to move.')

        plotPlayers();
    }else if (action === 'Recover Ball'){
        isSelectingPlayer = true;
        actionRequiringPlayerSelection = 'recover_ball';
        disableActionCards();
        console.log('Choose a player near the ball to recover it.');
        plotPlayers();
    } else if (action === 'Intercept') {
        isSelectingPlayer = true;
        actionRequiringPlayerSelection = 'intercept';
        disableActionCards();
        console.log('Choose a player to attempt interception.');
        plotPlayers();
    } else {
        // Handle other actions as before
        sendPlayerAction(action.toLowerCase().replace(' ', '_'));
    }
}

canvas.addEventListener('click', (event) => {
    if (isSelectingPlayer) {
        handlePlayerSelection(event);
    } else if (isSelectingPosition) {
        handlePositionSelection(event);
    }
});

function handlePlayerSelection(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const selectedPlayer = getClickedPlayer(x, y);

    if (selectedPlayer) {
        console.log('Player selected:', selectedPlayer.id);

        if (actionRequiringPlayerSelection === 'pass') {
            // Send pass action to server
            sendPlayerAction('pass', { targetPlayerId: selectedPlayer.id });
            selectedPlayer.has_ball = true;
            ballPosition.heldBy = selectedPlayer.id
            player_pass = selectedPlayer.id
            console.log(`Passing the ball to ${selectedPlayer.id}`);
            exitSelectionMode();
        } else if (actionRequiringPlayerSelection === 'move_character') {
            selectedCharacterId = selectedPlayer.id;
            isSelectingPosition = true;
            actionRequiringPositionSelection = 'move_character';
            isSelectingPlayer = false;
            actionRequiringPlayerSelection = null;
            console.log(`Selected player ${selectedPlayer.id} to move. Choose a position.`);
        } else if (actionRequiringPlayerSelection === 'recover_ball') {
            if (calculateDistance(selectedPlayer, ballPosition) <= MAX_RECOVERY_DISTANCE) {
                sendPlayerAction('recover_ball', { playerId: selectedPlayer.id });
                console.log(`Player ${selectedPlayer.id} is attempting to recover the ball.`);
                exitSelectionMode();
            } else {
                console.log(`Player ${selectedPlayer.id} is too far from the ball to recover it.`);
            }
        } else if (actionRequiringPlayerSelection === 'intercept') {
            selectedCharacterId = selectedPlayer.id;
            isSelectingPosition = true;
            actionRequiringPositionSelection = 'intercept';
            isSelectingPlayer = false;
            actionRequiringPlayerSelection = null;
            console.log(`Selected player ${selectedPlayer.id} to intercept. Choose a position.`);
        }

        plotPlayers();
    }
}

function getClickedPlayer(x, y) {
    let eligiblePlayers = [];
    if (actionRequiringPlayerSelection === 'pass') {
        eligiblePlayers = playerPositions.filter(
            (player) => player.team === user_team && !player.has_ball
        );
    } else if (actionRequiringPlayerSelection === 'move_character') {
        eligiblePlayers = playerPositions.filter((player) => player.team === user_team);
    } else if (actionRequiringPlayerSelection === 'recover_ball') {
        eligiblePlayers = playerPositions.filter(
            (player) => player.team === user_team && 
            calculateDistance(player, ballPosition) <= MAX_RECOVERY_DISTANCE
        );
    } else if (actionRequiringPlayerSelection === 'intercept') {
        eligiblePlayers = playerPositions.filter(
            (player) => player.team === user_team &&
            playerPositions.some(opponent => 
                opponent.team !== user_team && 
                opponent.has_ball && 
                calculateDistance(player, opponent) <= MAX_INTERCEPT_DISTANCE
            )
        );
    }

    for (const player of eligiblePlayers) {
        const canvasPos = normalizedToCanvasPosition(player);
        const yPos = plotHeight - canvasPos.y;

        const dx = x - canvasPos.x;
        const dy = y - yPos;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= 5) {
            return player;
        }
    }
    return null;
}


function handlePositionSelection(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const pitchPosition = canvasToNormalizedPosition({ x, y });
    console.log('Position selected:', pitchPosition);

    if (actionRequiringPositionSelection === 'shoot') {
        sendPlayerAction('shoot', { targetPosition: pitchPosition });
        console.log(`Shooting to position (${pitchPosition.x.toFixed(2)}, ${pitchPosition.y.toFixed(2)})`);
        exitSelectionMode();
    } else if (actionRequiringPositionSelection === 'move_character') {
        sendPlayerAction('move_character', {
            characterId: selectedCharacterId,
            targetPosition: pitchPosition,
        });
        console.log(`Moving player ${selectedCharacterId} to position (${pitchPosition.x.toFixed(2)}, ${pitchPosition.y.toFixed(2)})`);
        selectedCharacterId = null;
        exitSelectionMode();
    } else if (actionRequiringPositionSelection === 'intercept') {
        sendPlayerAction('intercept', {
            characterId: selectedCharacterId,
            targetPosition: pitchPosition,
        });
        console.log(`Player ${selectedCharacterId} attempting to intercept at position (${pitchPosition.x.toFixed(2)}, ${pitchPosition.y.toFixed(2)})`);
        selectedCharacterId = null;
        exitSelectionMode();
    }
}

function sendPlayerAction(action, data = {}) {
    console.log('Sending action to server:', action, data);
    // Implement server communication here
    socket.emit('player_action', { action: action, ...data });
}

function disableActionCards() {
    const actionCards = document.getElementsByClassName('action-card');
    for (const card of actionCards) {
        card.style.pointerEvents = 'none';
        card.style.opacity = '0.5';
    }
}

function enableActionCards() {
    const actionCards = document.getElementsByClassName('action-card');
    for (const card of actionCards) {
        card.style.pointerEvents = 'auto';
        card.style.opacity = '1';
    }
}

function exitSelectionMode() {
    isSelectingPlayer = false;
    isSelectingPosition = false;
    actionRequiringPlayerSelection = null;
    actionRequiringPositionSelection = null;
    plotPlayers();
}

if (!isSelectingPlayer){
    drawActionCards()
}

// Add this function to calculate distance between two points
function calculateDistance(point1, point2) {
    return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
}

// Define a constant for the maximum recovery distance
const MAX_RECOVERY_DISTANCE = 0.2; // Adjust this value as needed

// Define MAX_INTERCEPT_DISTANCE at the top of your file
const MAX_INTERCEPT_DISTANCE = 0.3; // Adjust this value as needed