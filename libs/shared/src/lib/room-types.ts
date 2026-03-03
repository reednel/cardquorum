import { UserIdentity } from './ws-types';

export interface Room {
  id: string;
  name: string;
  members: UserIdentity[];
  createdAt: string;
}
