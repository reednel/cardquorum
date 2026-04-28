# Changes

## Fixes

1. Revisit the behavior around persisting room roster changes, might be needlessly inefficient.
2. In card-stack, spreadAngle refers to rotation angle of spread cards, about the bottom center (ish). There should be another argument called something like spreadDirection which refers to the direction of the spread, defaulting to 90. With 0 = 12:00, 90 = 3:00, 180 = 6:00... These would be mutually exclusive transformations.
3. Persist certain minor features through page reload: open/closedness of game sidebar, order of cards. Theme (defaults to white on login screen).
4. Users can get logged out mid-game (due to session timeout). Unclear if we can/should do anything about that. But if it happens, we should redirect back to where they had been on re-sign-in

## Features

1. Game log? In chat or its own section.
2. Allow the room owner to force `GAME_ABANDON` on behalf of a player after a determined timeout (e.g. 5 minutes).
3. Robust badge system - already have Dealer badge, add picker badge, number of tricks taken. Tooltips for context on hover.
4. Reactions to messages
5. Notifications - on friend request/accept, room invite...
6. Idle game area gets the DVD treatment, but with a playing card, and the card changed on every impact.
7. Admin view
   1. Flag(?) col on Users table
   2. Additional page in menu, control other users (mainly reset basic auth password)
