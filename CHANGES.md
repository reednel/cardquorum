# Changes

## Fixes

1. The login page should redirect to the home page when a user already has an authenticated session.
2. Rooms page owner shoud display displayName ?? username.
3. Remove fragile, useless tests.

## Features

1. Games
   1. Game selection and configuration menu(s)
   2. Game UI
      1. Use pure Angular and Tailwind, for accessability and CSP reasons.
      2. [CardsJS](https://github.com/richardschneider/cardsJS)
   3. Whole mf backend
   4. Everything else
2. Reactions to messages
3. Notifications - on friend request/accept, room invite...
4. Admin view
   1. Flag(?) on Users
   2. Additional page in menu, control other users (mainly reset basic auth password)
