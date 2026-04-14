-- Section 20.6: Referral credit system
CREATE TABLE IF NOT EXISTS public.mkt_account_credits (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid    NOT NULL,
  contact_id          uuid    REFERENCES public.contacts(id) ON DELETE SET NULL,
  credit_type         text    NOT NULL DEFAULT 'referral_reward',
  -- 'referral_reward' | 'goodwill' | 'promotion'
  amount_paise        bigint  NOT NULL CHECK (amount_paise > 0),
  balance_paise       bigint  NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  source_referral_id  uuid,   -- mkt_referrals.id if applicable
  status              text    NOT NULL DEFAULT 'active',
  -- 'active' | 'redeemed' | 'expired'
  expires_at          timestamptz,  -- NULL = no expiry (referral credits don't expire)
  redeemed_at         timestamptz,
  redeemed_invoice_id text,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mkt_account_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can access credits"
  ON public.mkt_account_credits
  FOR ALL
  USING (org_id = auth.uid() OR auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_mkt_credits_org
  ON public.mkt_account_credits(org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mkt_credits_contact
  ON public.mkt_account_credits(contact_id);

-- RPC: apply_account_credit — FIFO deduction from oldest active credit
CREATE OR REPLACE FUNCTION public.apply_account_credit(
  _org_id       uuid,
  _amount_paise bigint,
  _invoice_id   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _credit       RECORD;
  _remaining    bigint := _amount_paise;
  _total_applied bigint := 0;
BEGIN
  -- FIFO: consume oldest active credits first
  FOR _credit IN
    SELECT id, balance_paise
    FROM public.mkt_account_credits
    WHERE org_id = _org_id
      AND status = 'active'
      AND balance_paise > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN _remaining <= 0;

    IF _credit.balance_paise >= _remaining THEN
      UPDATE public.mkt_account_credits
        SET balance_paise       = balance_paise - _remaining,
            status              = CASE WHEN balance_paise - _remaining = 0 THEN 'redeemed' ELSE 'active' END,
            redeemed_at         = CASE WHEN balance_paise - _remaining = 0 THEN now() ELSE redeemed_at END,
            redeemed_invoice_id = COALESCE(_invoice_id, redeemed_invoice_id),
            updated_at          = now()
        WHERE id = _credit.id;
      _total_applied := _total_applied + _remaining;
      _remaining := 0;
    ELSE
      UPDATE public.mkt_account_credits
        SET balance_paise       = 0,
            status              = 'redeemed',
            redeemed_at         = now(),
            redeemed_invoice_id = COALESCE(_invoice_id, redeemed_invoice_id),
            updated_at          = now()
        WHERE id = _credit.id;
      _remaining     := _remaining - _credit.balance_paise;
      _total_applied := _total_applied + _credit.balance_paise;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'applied_paise',   _total_applied,
    'remaining_paise', _remaining
  );
END;
$$;

-- Helper: get current credit balance for a contact
CREATE OR REPLACE FUNCTION public.get_credit_balance(_org_id uuid, _contact_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(balance_paise), 0)
  FROM public.mkt_account_credits
  WHERE org_id = _org_id
    AND contact_id = _contact_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now());
$$;
