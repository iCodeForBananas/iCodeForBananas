-- Allow users to permanently remove their own deployed strategies.
-- (lambda_trades rows cascade-delete via the existing FK constraint.)
create policy "Auth users can delete their own lambdas"
  on trading_lambdas for delete using (auth.uid() = user_id);
