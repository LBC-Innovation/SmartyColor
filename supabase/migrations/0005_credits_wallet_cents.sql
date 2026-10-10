-- Promo credits are stored as USD cents (wallet balance applied at checkout).

comment on column public.profiles.credits_balance is
  'Promo wallet balance in USD cents (e.g. 1050 = $10.50).';

comment on column public.credit_ledger.delta is
  'Wallet adjustment in USD cents; negative reduces balance.';

comment on column public.credit_ledger.balance_after is
  'Wallet balance after this entry, in USD cents.';

comment on column public.book_orders.credits_applied is
  'Promo wallet amount applied to this order, in USD cents.';
