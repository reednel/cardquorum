import { UserIdentity } from './ws-types';

export interface Room {
  id: number;
  name: string;
  members: UserIdentity[];
  createdAt: string;
}
