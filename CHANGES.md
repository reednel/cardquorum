# Changes

## Minor Features

1. Login/register pages should only show the option(s) for the available auth modes.
2. Feed tab says both "Loading..." and "No messages yet. Say hello!" when the server's spinning up.
3. In card-stack, spreadAngle refers to rotation angle of spread cards, about the bottom center (ish). There should be another argument called something like spreadDirection which refers to the direction of the spread, defaulting to 90. With 0 = 12:00, 90 = 3:00, 180 = 6:00... These would be mutually exclusive transformations.
4. Allow the room owner to force `GAME_ABANDON` on behalf of a player after a determined timeout (e.g. 5 minutes).
5. Idle game area gets the DVD treatment, but with a playing card, and the card changed on every impact. That or just say "No Active Game".
6. Replace words with icons+tooltips wherever reasonable.
7. Color preferences should be 3 rows of 6.

## Major Features

1. Game Replay
   1. Replays themselves sit at the route /replay. There should be a common link to a replay, perhaps a query parameter of game_session id. For now, we say a user is authorized to see a replay of a game if and only if they're in the game_participants.
   2. Eventually we will want to allow favoriting and sharing of game history, but that's out of scope for now.
   3. After each game, a link to the replay is added in the log in much the same way as the "game finished" message.
   4. The /replay page is laid out very similar to the game page. The visual of the game gets the majority of the space, with a right hand sidebar, collapsible, consisting of not 3 but 2 tabs: game selection and replay controls.
   5. The game selection tab should have a paginated set of rows, displaying in a necessarily compact way (Game, room, start date/time). This should be filterable and sortable.
   6. The replay controls should be discussed once we have a clearer picture of the mechanisms for feeding the old game back through the gameplay pipeline.
2. Game Reporting
3. Admin view
   1. Flag(?) col on Users table
   2. Additional page in menu, control other users (mainly reset basic auth password)
4. Notifications - on friend request/accept, room invite...
5. Robust badge system - already have Dealer badge, add picker badge, number of tricks taken. Tooltips for context on hover.
