import socketio
import eventlet
import eventlet.wsgi
from flask import Flask, jsonify
from collections import defaultdict
from computational_part import update_pos
import os
from dotenv import load_dotenv


load_dotenv()

SERVER_IP = os.getenv('SERVER_IP')
SERVER_PORT = int(os.getenv('SERVER_PORT'))
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS')
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS.split(',') if origin.strip()]

print(ALLOWED_ORIGINS)

sio = socketio.Server(cors_allowed_origins=ALLOWED_ORIGINS, async_mode='eventlet')

app = Flask(__name__)
app = socketio.WSGIApp(sio, app)


rooms = {}
room_players = defaultdict(int)
room_states = {}


@sio.event
def connect(sid, environ):
    print(f'Client connected: {sid}')
    sio.emit('server_url', {'url': f'http://{SERVER_IP}:{SERVER_PORT}'}, room=sid)

@sio.event
def create_game(sid, data):
    room_id = data['room_id']
    if room_id in rooms:
        sio.emit('error', {'message': 'Room already exists'}, to=sid)
    else:
        rooms[room_id] = {'A_assigned': 1, 'players': [sid]}
        room_states[room_id] = {
            'current_pos': [(0.00082, 0.48238),
                (0.32648, 0.65322),
                (0.33701, 0.48863),
                (0.30927, 0.35529),
                (0.32137, 0.21262),
                (0.45472, 0.38709),
                (0.90509, 0.47462),
                (0.58393, 0.20794),
                (0.67658, 0.4671),
                (0.6731, 0.76476),
                (0.40783, 0.61525)],
            'ball_state': {'Assigned': 'A', 'Player': 1},
            'curr_frame': 0,
            'chosen_objects': set(),
            'pass_made': False,
            'intercept_made': False,
            'player_intercepting': None,
            'players_made_choice': 0
        }
        room_players[sid] = room_id
        sio.enter_room(sid, room_id)
        sio.emit('game_created', {'room_id': room_id}, to=sid)
        sio.emit('team_assignment', {'team': 'A'}, to=sid)
        print(f"Game created: {room_id}")

@sio.event
def join_game(sid, data):
    room_id = data['room_id']
    if room_id not in rooms:
        sio.emit('error', {'message': 'Room does not exist'}, to=sid)
    elif len(rooms[room_id]['players']) >= 2:
        sio.emit('error', {'message': 'Room is full'}, to=sid)
    else:
        rooms[room_id]['players'].append(sid)
        room_players[sid] = room_id
        sio.enter_room(sid, room_id)
        sio.emit('team_assignment', {'team': 'B'}, to=sid)
        sio.emit('game_joined', {'room_id': room_id}, to=sid)
        
        if len(rooms[room_id]['players']) == 2:
            # Start the game when both players have joined
            for player_sid in rooms[room_id]['players']:
                sio.emit('update_positions', {
                    'position': room_states[room_id]['current_pos'],
                    'ball_state': room_states[room_id]['ball_state']
                }, to=player_sid)
            print(f"Game started: {room_id}")


@sio.event
def disconnect(sid):
    print(f'Client disconnected: {sid}')
    for room_id, players in room_players.items():
        if sid in players:
            players.remove(sid)
            if not players:  # If room is empty
                del room_players[room_id]
                del room_states[room_id]
                del rooms[room_id]
            break

@sio.event
def player_action(sid, data):

    print(f'Received player action from {sid}: {data}')
    action = data.get('action')
    room_id = room_players[sid]

    if action == 'pass':
        room_states[room_id]['pass_made'] = True
        target_idx = data.get('targetPlayerId')
        j_val = 5
        room_states[room_id]['chosen_objects'].add(target_idx)
        room_states[room_id]['chosen_objects'].add(j_val)
        curr = room_states[room_id]['current_pos'][5]
        x_j, y_j = curr
        nxt = room_states[room_id]['current_pos'][target_idx]
        nxt_x, nxt_y = nxt

        if not room_states[room_id]['intercept_made']:
            room_states[room_id]['ball_state']['Player'] = target_idx
            
    elif action == 'shoot':
        target_pos = data.get('targetPosition')
        j_val = 5
        room_states[room_id]['chosen_objects'].add(j_val)
        curr = room_states[room_id]['current_pos'][5]
        x_j, y_j = curr
        nxt_x = target_pos['x']
        nxt_y = target_pos['y']
        room_states[room_id]['ball_state']['Assigned'] = None
        room_states[room_id]['ball_state']['Player'] = None

    elif action == 'move_character':
        j_val = data.get('characterId')
        nxt_pos = data.get('targetPosition')
        room_states[room_id]['chosen_objects'].add(j_val)
        curr = room_states[room_id]['current_pos'][j_val]
        x_j, y_j = curr
        nxt_x = nxt_pos['x']
        nxt_y = nxt_pos['y']

    elif action == 'recover_ball':
        target_pos = data.get('playerId')
        j_val = 5
        room_states[room_id]['chosen_objects'].add(j_val)
        curr = room_states[room_id]['current_pos'][j_val]
        nxt = room_states[room_id]['current_pos'][target_pos]
        x_j, y_j = curr
        nxt_x, nxt_y = nxt
        room_states[room_id]['ball_state']['Assigned'] = 'A' if target_pos < 5 else 'B'
        room_states[room_id]['ball_state']['Player'] = target_pos
    elif action == 'intercept':
        target_pos = data.get('targetPosition')
        j_val = data.get('characterId')
        player_intercepting = j_val
        room_states[room_id]['chosen_objects'].add(j_val)
        curr = room_states[room_id]['current_pos'][j_val]
        x_j, y_j = curr
        nxt_x = target_pos['x']
        nxt_y = target_pos['y']
        if is_interception_successful(j_val, target_pos):
            room_states[room_id]['ball_state']['Assigned'] = 'A' if j_val < 5 else 'B'
            room_states[room_id]['ball_state']['Player'] = j_val
            room_states[room_id]['pass_made'] = False
            room_states[room_id]['intercept_made'] = True
    
    tmp = []
    for i in range(11):
        if i not in room_states[room_id]['chosen_objects']:
            x_i, y_i = room_states[room_id]['current_pos'][i]

            max_attempts = 100
            attempts = 0

            new_pos = update_pos(x_i, y_i, x_j, y_j, nxt_x, nxt_y, 2*i, j_val, room_states[room_id]['curr_frame'], room_states[room_id]['curr_frame'] + 0.0001253)
            while (new_pos[0] < 0 or new_pos[0] > 1 or new_pos[1] < 0 or new_pos[1] > 1) and attempts < max_attempts:
                new_pos = update_pos(x_i, y_i, x_j, y_j, nxt_x, nxt_y, 2*i, j_val, room_states[room_id]['curr_frame'], room_states[room_id]['curr_frame'] + 0.0001253)
                attempts += 1
            if new_pos[0] < 0 or new_pos[0] > 1 or new_pos[1] < 0 or new_pos[1] > 1:
                new_pos = (max(0, min(new_pos[0], 1)), max(0, min(new_pos[1], 1)))
            tmp.append(new_pos)
        elif action == 'shoot' or (action == 'move_character' and i == j_val) or (action == 'pass' and i == j_val):
            tmp.append((nxt_x, nxt_y))
        else:
            tmp.append(room_states[room_id]['current_pos'][i])

    room_states[room_id]['players_made_choice'] += 1
    room_states[room_id]['current_pos'] = tmp
    if room_states[room_id]['players_made_choice'] == 2:
        room_states[room_id]['curr_frame'] += 0.0001253
        print('sending new positions to clients')
        print(room_states[room_id]['ball_state'])
        sio.emit('update_positions', {'position': tmp, 'ball_state': room_states[room_id]['ball_state']})
        room_states[room_id]['players_made_choice'] = 0
        room_states[room_id]['chosen_objects'] = set()
        room_states[room_id]['pass_made'] = False
        room_states[room_id]['intercept_made'] = False
        room_states[room_id]['player_intercepting'] = None
        

def is_interception_successful(intercept_player, intercept_pos):

    success_chance = 0.5 
    return True   


if __name__ == '__main__':
    eventlet.wsgi.server(eventlet.listen((SERVER_IP, SERVER_PORT)), app)