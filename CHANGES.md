# Changes

## Minor Features

1. Feed tab says both "Loading..." and "No messages yet. Say hello!" when the server's spinning up.
2. Bug where "Player n" displays at random times on the game summary or table, usually only for one player at a time. "Player 1", "Player 5", etc.
3. In a "production" deployment, I can get to a page fine, but reloading that page yields a 404, no matter what page.
4. Allow the room owner to force `GAME_ABANDON` on behalf of a player after a determined timeout (e.g. 5 minutes).
5. Login screen contrast

## Major Features

1. Game Reporting
2. Replay and Summary access permissions
3. Spectator view
4. Replay omnicient view
5. Admin view
   1. Flag(?) col on Users table
   2. Additional page in menu, control other users (mainly reset basic auth password)
6. Notifications - on friend request/accept, room invite...
