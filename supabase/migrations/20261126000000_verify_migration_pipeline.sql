-- End-to-end check of the Apply Supabase Migrations workflow: runs real DDL
-- against the database and leaves nothing behind except this version in
-- supabase_migrations.schema_migrations.
create table public._migration_pipeline_check (id int primary key);
insert into public._migration_pipeline_check values (1);
drop table public._migration_pipeline_check;
