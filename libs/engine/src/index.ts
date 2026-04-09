export { RoomManager } from './lib/room-manager';
export type { RoomState } from './lib/room-manager';
export {
  addMember,
  removeMember,
  reorderRoster,
  rotateSeat,
  handleDisconnect,
} from './lib/roster-logic';
export type {
  GamePlugin,
  GameEventBase,
  ScheduledEvent,
  WithScheduledEvents,
} from './lib/game-plugin';
export type {
  FieldMode,
  ConfigFieldDef,
  SelectFieldDef,
  FieldMetadata,
  FieldRegistry,
  GenericConfigPreset,
  GameConfigPlugin,
} from './lib/game-config-types';
