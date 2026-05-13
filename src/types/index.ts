export interface Race {
  id: string;
  name: string;
  date: string;
  distance?: string;
  goal_time?: string;
  terrain?: 'road' | 'trail' | 'mixed' | 'track';
  priority?: 'A' | 'B' | 'C';
}
