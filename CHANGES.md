# Changes

## Minor Features

1. Bug fixes
   1. When you call your own ace, you must follow with that ace, the jig is up
   2. Predetermined picker-partner variants should not show who the partner is until their card is revealed
   3. who took in bg (?)
   4. Unknown ace doesn't work: failed to select the 6 of spades.

## Major Features

1. Spectator view
2. Replay omnicient view
3. Replay and Summary access permissions
4. Admin view
   1. Flag(?) col on Users table
   2. Additional page in menu, control other users (mainly reset basic auth password)
5. Notifications - on friend request/accept, room invite...

## Platform & Misc

1. Schema renaming
2. Both extend and prune the test suite
3. Thorough security and code quality review
4. Protected branches
5. Versioning
6. Security Scanning
   1. SAST: CodeQL
   2. SCA + auto-remediation: Dependabot
7. CI/CD pipelines
   1. Run automated tests
   2. Image deployment
8. Actually robust documentation
   1. Zensical hosted on GH Pages (separate repo) - `docs.cardquorum.com`
   2. Three domains:
      1. User - getting started, in-depth game rules
      2. Admin - deployment options, env configuration, etc
      3. Developer - building from source, dev procedures, design decisions, etc
9. 404 Page
10. Copyright/TOS/Privacy Policy
