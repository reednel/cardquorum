# Changes

1. Restructure Room UI
   1. The leftmost ~3/4 of the screen will be blank, saved for game UI.
   2. To the right will be a column with tabs:
      1. Chat
      2. Members
         1. Online
         2. Invited
         3. Kicked (minimized by default, invisible when there are none)
      3. Settings (nothing for now)
2. Invite system for rooms
   1. In the create room modal, when you select "invite only" in the visbility dropdown, the modal should expand to display a user search bar, where you can search for any non-blocked user. Clicking on a user adds them to a section below, where they can be removed.
   2. room-invite table, foreign key roomID, userIDs indicating the invited user.
   3. room-ban table, foreign key roomID, userID indicating the banned user.
   4. Also allow revocation of invite
   5. Also allow banning/unbanning of joined user
   6. Only room owner should have power to invite/uninvite/ban/unban, no ability to do those to oneself.
   7. User ban results in their immediate removal, and they won't be able to see/search for that room.
   8. In an invite-only room, a ban both creates a ban record and deletes the invite record.
3. Games
   1. Game selection and configuration menu(s)
   2. Game table UI representation
   3. Whole mf backend
   4. Everything else
4. Reactions to messages
5. Notifications - on friend request/accept, room invite...
6. Admin view
   1. Flag(?) on Users
   2. Additional page in menu, control other users (mainly reset basic auth password)
