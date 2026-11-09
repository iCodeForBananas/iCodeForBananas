-- Word Climb: one row per child per card, holding that card's SM-2 schedule so
-- a reading session picks up where the last one stopped, on any device.
create table if not exists word_climb_cards (
  player_name text not null,
  card_id text not null,                 -- "word:the", "sentence:i-see-you"; see app/lib/wordClimbContent.ts
  reps integer not null default 0,
  ease real not null default 2.5,
  interval_days integer not null default 0,
  due_on date,                           -- null until the card has been graded
  secure boolean not null default false, -- ever read without help; opens the next level
  lapses integer not null default 0,
  reviews integer not null default 0,
  last_grade text check (last_grade in ('again', 'hard', 'good', 'easy')),
  updated_at timestamptz not null default now(),
  primary key (player_name, card_id)
);

alter table word_climb_cards enable row level security;

-- Like Space Math, the game has no sign-in, and the API route validates writes.
-- Update is needed here because a card's row changes on every review. There is
-- deliberately no delete policy.
create policy "Public can read word climb cards"
  on word_climb_cards for select using (true);

create policy "Anyone can insert word climb cards"
  on word_climb_cards for insert with check (true);

create policy "Anyone can update word climb cards"
  on word_climb_cards for update using (true) with check (true);
