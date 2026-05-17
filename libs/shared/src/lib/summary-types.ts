export interface SummaryParticipantDto {
  userId: number;
  displayName: string;
  username: string;
  seatIndex: number;
}

export interface SummaryDataResponse {
  sessionId: number;
  gameType: string;
  store: unknown;
  participants: SummaryParticipantDto[];
}
