# Changes

## Near Term - Auth

1. Retype password on basic auth registration
2. Change passwords (must re-enter current password)
3. Fix UI when OIDC and Basic auth are enabled, and only OIDC is currently used on Linked Accounts page. (Not broken, just looks weird).

## Medium Term

1. Account Page - switch to several tabs
   1. profile - username, display name, password, sessions, delete account
   2. friends - the current account/friends page
   3. preferences - notification settings? (not developed yet)
   4. stats - display game stats (not developed yet)
2. Add room/home button to top bar, else get stuck in account page
3. Room list should show the join button in addition to the settings button, for owners
4. Invite system for rooms
5. Blocking other users - hide friend invites, hide rooms they own (?)
6. Call out password for database string

## Long Term

1. Games
   1. Game selection and configuration menu(s)
   2. Game table UI representation
   3. Whole mf backend
   4. Everything else
2. Reactions to messages
3. Notifications - on friend request/accept, room invite...
4. Admin view
   1. Flag(?) on Users
   2. Additional page in menu, control other users (mainly reset basic auth password)
