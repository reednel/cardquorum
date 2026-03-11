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

Hand size and blind size are set in `SheepsheadConfig` (`handSize`, `blindSize`) and locked by the chosen preset. The constraint is `playerCount × handSize + blindSize = deckSize` (where deckSize is 32 minus any removed cards).

`deal(deck, config)` takes the shuffled deck and config, deals the blind first (top of deck), then distributes hands to each player in seat order.

## Phase Flow

```txt
deal → pick → bury → call → play → score
```

### deal

Shuffle the deck, distribute cards per config's `handSize`/`blindSize`. Transition to `pick`. Active player is the player after the dealer (seat index 1).

### pick

Behavior depends on `config.pickerRule`:

- **`'autonomous'`**: Each player, starting after the dealer, chooses to **pick** or **pass**.
  - **Pick**: Player becomes the picker, blind cards are added to their hand. Transition to `bury`.
  - **Pass**: Advance to the next player.
  - **All pass**: Handled by `config.noPick` (see [Non-Picking](#non-picking)).
- **`'left-of-dealer'`**: The player at seat index 1 must pick. No choice. (Schiller variant.)
- **`null`**: No picking round — partners are predetermined by card holdings (e.g. black queens). Skip directly to `play`.

### bury

The picker discards cards from their hand (the number depends on blind size). Buried cards count toward the picker's point total at scoring.

- If `config.partnerRule === 'called-ace'`: transition to `call`.
- Otherwise: assign partner by rule, transition to `play`.

### call

Only used with the `called-ace` partner rule. The picker names a fail ace (or fail 10, or goes alone). The holder of the called card becomes the partner — but this is hidden from other players until the called card is played.

**Calling rules:**

- The picker calls a fail ace (`ac`, `as`, or `ah`). They must hold at least one card of the called suit in their hand to call it. Unless `callOwnAce` is enabled, the picker cannot call an ace they hold or have buried.
- **Calling a 10**: If the picker holds all 3 fail aces, they may call a fail 10 (`xc`, `xs`, or `xh`) instead. The picker is obligated to hold the ace of that suit. When the called suit is led, the picker must play the ace. The 10 takes the trick if it isn't trumped.
- **Unknown / hole card**: If the picker has no fail suit for which they don't also hold the ace (but doesn't have all 3 aces), they may call any fail ace and place a card face-down as a "hole card." The hole card has no trick-taking power and its identity is hidden from all players except the trick-taker until scoring. The picker is forced to play the hole card on the first trick where the called suit is led.
- **Going alone**: The picker can choose `'alone'` — no partner, no called card.
- **`callOwnAce`**: When enabled, the picker can call a suit for which they hold the ace. They must save the ace and effectively play alone (without declaring it).

The `CalledCard` type captures all valid options: `'ac' | 'as' | 'ah' | 'xc' | 'xs' | 'xh' | 'alone'`.

### play

Players play cards in tricks. The player after the dealer leads the first trick; after that, the trick winner leads.

**Follow-suit rules:**

- If trump was led: must play trump if you have any.
- If a fail suit was led: must follow that suit if you have any.
- If void in the led suit: any card is legal.

**Called-ace play constraints** (when `partnerRule === 'called-ace'`):

- **Picker must hold suit**: Until the called suit has been led, the picker must keep at least one card of the called suit in hand (cannot play them all away on other tricks).
- **Partner must play called card**: On the first trick where the called suit is led, the partner must play the called card (ace or 10).
- **Picker plays ace when calling 10**: If the picker called a 10, they must play the ace of that suit on the first trick where the called suit is led.
- **Hole card forced play**: If a hole card exists, the picker must play it on the first trick where the called suit is led. The hole card is played face-down and has no trick-taking power.

**Trick evaluation:** Trump always beats fail. Higher trump beats lower trump. Within a fail suit, higher rank beats lower. Off-suit cards (not trump, not the led suit) never win. Hole cards never win (they are skipped during evaluation).

### score

Compute final results. See [Scoring](#scoring) below.

## Partner Rules

The `PartnerRule` type determines how the picker's partner is identified:

| Rule             | How partner is determined                                         | Status      |
| ---------------- | ----------------------------------------------------------------- | ----------- |
| `called-ace`     | Picker calls a fail ace/10 or goes alone; see [call phase](#call) | Implemented |
| `jd`             | Whoever holds the Jack of Diamonds                                | Implemented |
| `jc`             | Whoever holds the Jack of Clubs (6-handed)                        | Implemented |
| `qc-qs`          | Holders of the two black Queens are partners (4/8-handed)         | Implemented |
| `qs-jc`          | Holders of Queen of Spades and Jack of Clubs (5-handed, 30 cards) | Implemented |
| `first-trick`    | Winner of the first trick becomes the partner                     | Implemented |
| `qc-7d`          | Holders of Queen of Clubs and 7 of Diamonds                       | Implemented |
| `left-of-picker` | Player to picker's left (7-handed partner draft)                  | Implemented |
| `null`           | No partner — picker plays alone (2/3-handed, or solo variants)    | Implemented |

## Scoring

### Point Threshold

The picking team (picker + partner) needs **61+ points** to win. Points come from:

- Buried cards (always count for picker)
- Tricks won by the picking team

### Multipliers

Multipliers stack multiplicatively (subject to `multiplicityLimit`):

| Condition      | Multiplier | Notes                                          | Status      |
| -------------- | ---------- | ---------------------------------------------- | ----------- |
| Base           | ×1         |                                                | Implemented |
| Schneider      | ×2         | Losing team took <30 points                    | Implemented |
| Schwarz        | ×3         | Losing team took 0 tricks (replaces schneider) | Implemented |
| Crack          | ×2         | Opposition declares before play                | Implemented |
| Re-crack       | ×4         | Picker responds to crack (replaces crack)      | Implemented |
| Blitz          | ×2         | Player with both black or red Queens declares  | Implemented |
| Double on bump | ×2         | Picking team pays double for losing            | Implemented |

Example: Schneider + Crack = ×2 × ×2 = ×4. Schwarz + Crack = ×3 × ×2 = ×6.

### Zero-Sum Formula

Each opposition member's delta is `±baseScore` (where baseScore = scoreMultiplier). If a partner exists, partner delta is `±baseScore`, and picker delta is `±(oppositionCount - 1) × baseScore`. Without a partner, picker delta is `±oppositionCount × baseScore`. The sum of all deltas is always 0.

### Leasters

When all players pass and leasters is enabled, everyone plays for themselves (all opposition, no picker). The player with the **fewest points** wins. Exception: if any player took no tricks, the player with the **most points** wins instead. Winner gets `+(playerCount - 1)`, everyone else gets `-1`.

## Visibility

`getPlayerView` implements fog-of-war:

- **Hands**: Each player sees only their own hand. Other players' hands appear as empty arrays.
- **Blind**: Hidden (empty array) during `deal` and `pick` phases. Visible after picking.
- **Buried cards**: Only visible to the picker. `null` for everyone else.
- **Partner identity**: In `called-ace`, the partner's role is shown as `'opposition'` until the called card has been played.
- **Hole card**: During play, only the picker knows the hole card's identity. Other players see `'hidden'`. The trick-taker can see the hole card's identity in their trick. All hole cards are revealed at scoring.

## Configuration

Game configuration is defined by `SheepsheadConfig` (stored in `game_sessions.config`). Valid configurations are expressed as **presets** (`ConfigPreset` in `constants.ts`) in a flat array `CONFIG_PRESETS`.

Each preset has:

- **`fixed`** — values locked by the preset (`name`, `playerCount`, `handSize`, `blindSize`, `pickerRule`, `partnerRule`, and optionally `cardsRemoved`)
- **`defaults`** — house rules the players can toggle (`noPick`, `cracking`, `blitzing`, `doubleOnTheBump`, `callOwnAce`, etc.)

The `name` field is a unique, space-free identifier for each config (e.g. `'called-ace'`, `'jack-of-diamonds'`). It is stored in `SheepsheadConfig` alongside the other fixed values.

### Presets

| Players | Preset           | Name               | Hand | Blind | Picker         | Partner          | Cards Removed |
| ------- | ---------------- | ------------------ | ---- | ----- | -------------- | ---------------- | ------------- |
| 2       | Two-Handed       | `two-handed`       | 14   | 4     | —              | —                |               |
| 3       | Three-Handed     | `three-handed`     | 10   | 2     | autonomous     | —                |               |
| 4       | Black Queens     | `black-queens`     | 8    | 0     | —              | `qc-qs`          |               |
| 4       | Queen & 7        | `queen-and-7`      | 8    | 0     | —              | `qc-7d`          |               |
| 4       | Picker Alone     | `picker-alone`     | 7    | 4     | autonomous     | —                |               |
| 4       | Called Ace       | `called-ace`       | 7    | 2     | autonomous     | `called-ace`     | 7c, 7s        |
| 5       | Called Ace       | `called-ace`       | 6    | 2     | autonomous     | `called-ace`     |               |
| 5       | Jack of Diamonds | `jack-of-diamonds` | 6    | 2     | autonomous     | `jd`             |               |
| 5       | Queen & Jack     | `queen-and-jack`   | 6    | 0     | —              | `qs-jc`          | 7c, 7s        |
| 5       | First Trick      | `first-trick`      | 6    | 2     | autonomous     | `first-trick`    |               |
| 5       | Schiller         | `schiller`         | 6    | 2     | left-of-dealer | `called-ace`     |               |
| 6       | Jack of Clubs    | `jack-of-clubs`    | 5    | 2     | autonomous     | `jc`             |               |
| 7       | Jack of Diamonds | `jack-of-diamonds` | 4    | 4     | autonomous     | `jd`             |               |
| 7       | Partner Draft    | `partner-draft`    | 4    | 4     | autonomous     | `left-of-picker` |               |
| 8       | Black Queens     | `black-queens`     | 4    | 0     | —              | `qc-qs`          |               |

### Non-Picking

- Forced pick: The last player must pick.
- Leaster: All players are in opposition and the player with the fewest points (while still taking a trick) wins. The last trick takes the blind. If a player takes every trick, they win.
- Moster: All players are in opposition and the player with the most points is the only loser, unless that player takes every trick, in which case they are the winner.
- Mittler: all players are in opposition and the player with the middle score wins. If there is no single middle value, the game is a wash.
- Schneidster: All players are in opposition and the player with the closest to 30 points without going over wins. If two players tie for closest, the game is a wash.
- Doubler: A redeal occurs (within the same game session), in which all points are worth double. Doublers do not compound — multiple consecutive doublers still result in a ×2 multiplier. Each redeal's hands and blind are recorded in the store's `redeals` array.
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
