# Sheepshead

Design decisions and rules for the Sheepshead game plugin (`libs/games/sheepshead/`). For the generic game engine framework, see [Game Engine](../game-engine.md).

> All game logic is made of pure functions. Phase handlers take `(state, store, event)` and return `[newState, newStore]`. Utility functions are pure and side-effect free.

## Card Model

Sheepshead uses a 32-card deck (7 through Ace in four suits). Each `Card` carries its data directly — no lookups:

```typescript
interface Card {
  name: CardName; // compact notation: rank initial + suit initial
  suit: Suit; // 'clubs' | 'spades' | 'hearts' | 'diamonds'
  rank: Rank; // '7' | '8' | '9' | '10' | 'jack' | 'queen' | 'king' | 'ace'
  points: Points; // 0 | 2 | 3 | 4 | 10 | 11
}
```

The `name` field uses compact notation: `'qc'` = Queen of Clubs, `'ad'` = Ace of Diamonds, `'xs'` = 10 of Spades (10 → `x` to keep all names 2 characters).

Total points in the deck: **120**.

## Trump and Fail

**Trump cards** (14 total), highest to lowest:

```txt
Qc > Qs > Qh > Qd > Jc > Js > Jh > Jd > Ad > 10d > Kd > 9d > 8d > 7d
```

All four Queens, then all four Jacks, then the remaining Diamonds (Ace down to 7).

**Fail suits** are Clubs, Spades, and Hearts (minus their Queens and Jacks, which are trump). Within a fail suit, rank order is: Ace > 10 > King > 9 > 8 > 7.

`isTrump(card)` returns true if the card is a Queen, Jack, or Diamond.

## Dealing

`dealingLayout(playerCount)` determines hand size and blind size for 2–8 players. The constraint is `playerCount × cardsPerPlayer + blindSize = 32`.

The blind is dealt first (top of shuffled deck), then hands are dealt to each player in seat order.

## Phase Flow

```txt
deal → pick → bury → call → play → score
```

### deal

Shuffle the deck, distribute cards per `dealingLayout`. Transition to `pick`. Active player is the player after the dealer (seat index 1).

### pick

Each player, starting after the dealer, chooses to **pick** (take the blind) or **pass**.

- **Pick**: Player becomes the picker, blind cards are added to their hand. Transition to `bury`.
- **Pass**: Advance to the next player.
- **All pass**:
  - If `config.leasters`: all players are opposition, `isLeaster = true`, skip to `play`.
  - Otherwise: re-deal (engine creates fresh state and deals again).

### bury

The picker discards cards from their hand (the number depends on blind size). Buried cards count toward the picker's point total at scoring.

- If `config.partnerRule === 'called-ace'`: transition to `call`.
- Otherwise: assign partner by rule, transition to `play`.

### call

Only used with the `called-ace` partner rule. The picker names a fail suit. The holder of that suit's Ace becomes the partner — but this is hidden from other players until the Ace is played.

### play

Players play cards in tricks. The player after the dealer leads the first trick; after that, the trick winner leads.

**Follow-suit rules:**

- If trump was led: must play trump if you have any.
- If a fail suit was led: must follow that suit if you have any.
- If void in the led suit: any card is legal.

**Trick evaluation:** Trump always beats fail. Higher trump beats lower trump. Within a fail suit, higher rank beats lower. Off-suit cards (not trump, not the led suit) never win.

### score

Compute final results. See [Scoring](#scoring) below.

## Partner Rules

The `PartnerRule` type determines how the picker's partner is identified:

| Rule          | How partner is determined                    | Status      |
| ------------- | -------------------------------------------- | ----------- |
| `called-ace`  | Picker calls a fail suit; holder of that Ace | Implemented |
| `jd`          | Whoever holds the Jack of Diamonds           | Implemented |
| `jc-qs`       | —                                            | Stub (TODO) |
| `first-trick` | —                                            | Stub (TODO) |
| `qc-7d`       | —                                            | Stub (TODO) |

## Scoring

### Point Threshold

The picking team (picker + partner) needs **61+ points** to win. Points come from:

- Buried cards (always count for picker)
- Tricks won by the picking team

### Multipliers

Multipliers stack multiplicatively:

| Condition | Multiplier | Notes                                     |
| --------- | ---------- | ----------------------------------------- |
| Base      | ×1         |                                           |
| Schneider | ×2         | Losing team took <30 points               |
| Crack     | ×2         | Opposition declares before play           |
| Re-crack  | ×4         | Picker responds to crack (replaces crack) |

Example: Schneider + Crack = ×2 × ×2 = ×4.

### Zero-Sum Formula

Each opposition member's delta is `±baseScore` (where baseScore = scoreMultiplier). If a partner exists, partner delta is `±baseScore`, and picker delta is `±(oppositionCount - 1) × baseScore`. Without a partner, picker delta is `±oppositionCount × baseScore`. The sum of all deltas is always 0.

### Leasters

When all players pass and leasters is enabled, everyone plays for themselves (all opposition, no picker). The player with the **fewest points** wins. Exception: if any player took no tricks, the player with the **most points** wins instead. Winner gets `+(playerCount - 1)`, everyone else gets `-1`.

## Visibility

`getPlayerView` implements fog-of-war:

- **Hands**: Each player sees only their own hand. Other players' hands appear as empty arrays.
- **Blind**: Hidden (empty array) during `deal` and `pick` phases. Visible after picking.
- **Buried cards**: Only visible to the picker. `null` for everyone else.
- **Partner identity**: In `called-ace`, the partner is hidden until the called Ace is played during a trick.

## Configuration (House Rules)

### Team Rules

- 2 Handed: No teams.
- 3 Handed: Picker plays alone against two opponents, buries 2 cards. 10 cards to each, 2 in the blind.
- 4 Handed
  - Black Queens are partners. Player with both goes alone. 8 cards to each, no blind. Double on the bump.
  - Queen of Clubs and 7 of Diamonds are partners. Player with both goes alone. 8 cards to each, no blind. Not double on the bump.
  - Picker plays alone, buries 4. 7 cards to each, 4 in the blind. Double on the bump.
  - Play with 30 cards (black 7s removed). 7 cards to each, 2 in the blind. Picker calls an ace for partner. If picker has all 3 fail aces, call for winner of first trick to be partner. Double on the bump.
- 5 Handed
  - Picker calls and ace of fail suit in hand, and must keep that fail in hand until that fail is lead, or the card is forced.
  - Picker and Jack of Diamonds are partners.
  - Remove the black 7s from the deck. Queen of Spades and Jack of Clubs are partners. 6 cards to each, no blind.
  - Whomever takes the first trick is the partner.
  - Schiller: The player left of the dealer has to pick
- 6 Handed: 5 cards to each, 2 in the blind. Picker and Jack of Clubs are partners. If picker has the Jack of Clubs, they can call another Jack or play alone. Not double on the bump.
- 7 Handed
  - 4 cards to each, 4 in the blind. Picker and Jack of Diamonds are partners. If picker has the Jack of Diamonds, they can call another Jack or play alone.
  - 4 cards to each, 4 in the blind. Picker draws 2 from the blind, and the player to their left is their partner, drawing the remaining 2 from the blind.
- 8 handed: 4 cards to each, no blind. Black Queens are partners. Player with both goes alone.

### Non-Picking

- Forced pick: The last player must pick.
- Leaster: All players are in opposition and the player with the fewest points (while still taking a trick) wins. The last trick takes the blind. If a player takes every trick, they win.
- Moster: All players are in opposition and the player with the most points is the only loser, unless that player takes every trick, in which case they are the winner.
- Mittler: all players are in opposition and the player with the middle score wins. If there is no single middle value, the game is a wash.
- Schneidster: All players are in opposition and the player with the closest to 30 points without going over wins. If two players tie for closest, the game is a wash.
- Doubler: A new game is started, in which all points are worth double. Doublers do not stack multiplicitavely.
- Schwanzer: All players turn their cards up, and the player with the greatest calculated power is the only loser. If multiple players tie for greatest power, they one with the highest trump is the only loser.
  - Queens: 3 points, Jacks: 2 points, Diamonds: 1 point

### Cracking and Re-cracking

An opposition player who did not get the opportunity to pick can declare a crack before the first card is played. This doubles the stakes. A member of the picking team can respond by declaring a re-crack, which doubles the stakes again (quadrupling from the original). Re-crack must also occur before the first card is played.

> Note, this requires each player to be aware of their own team alignment, however that is determined for that game

### Blitzing

A player with both black Queens can declare a blitz before the first card is played. This doubles the stakes. A player with both red Queens can declare a red blitz, also doubling the stakes. Only one blitz can be declared per game.

### Double on the Bump

This rule requires the picking team to pay double for losing a game.

### Partner off the Hook

This rule states that if the picking team takes no tricks, the partner is not penalized for the loss, and the picker pays the opposition on their own.

> Note: "Partner off the Hook" is an unofficial name for this rule. I'm not sure if it has a widely recognized name.

### No-Ace, No-Face, No-Trump

This rule triggers a redeal if any player is dealt a hand with no Aces, no face cards, and no trump cards.

### Multiplicity Limit

This rule limits the number of multipliers that can affect a single game. For example, an unbounded multiplicity on a game with a crack, re-crack, and a blitz would be ×8. But with a multiplicity limit of 4, the maximum multiplier would be ×4 instead.
