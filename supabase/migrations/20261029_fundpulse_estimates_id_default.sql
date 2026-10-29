-- Ensure existing FundPulse databases can insert estimates without supplying an id.
-- Safe for databases where the column already has an identity/default.
DO $$
DECLARE
  column_identity text;
  column_default text;
BEGIN
  SELECT is_identity, column_default
    INTO column_identity, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'fundpulse_estimates'
    AND column_name = 'id';

  IF column_identity = 'NO' AND column_default IS NULL THEN
    CREATE SEQUENCE IF NOT EXISTS public.fundpulse_estimates_id_seq;
    ALTER SEQUENCE public.fundpulse_estimates_id_seq
      OWNED BY public.fundpulse_estimates.id;

    PERFORM setval(
      'public.fundpulse_estimates_id_seq',
      GREATEST(COALESCE((SELECT MAX(id) FROM public.fundpulse_estimates), 0) + 1, 1),
      false
    );

    ALTER TABLE public.fundpulse_estimates
      ALTER COLUMN id SET DEFAULT nextval('public.fundpulse_estimates_id_seq');
  END IF;
END
$$;
