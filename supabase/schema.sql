CREATE TABLE IF NOT EXISTS public.print_sequence (
  id smallint PRIMARY KEY CHECK (id = 1),
  value bigint NOT NULL CHECK (value >= 0)
);

INSERT INTO public.print_sequence (id, value)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('relatorios-pdfs', 'relatorios-pdfs', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.print_records (
  identification bigint PRIMARY KEY CHECK (identification > 0),
  of_number text NOT NULL,
  client text NOT NULL DEFAULT '',
  workshop text NOT NULL DEFAULT '',
  product text NOT NULL DEFAULT '',
  deposit text NOT NULL DEFAULT '',
  item_count integer NOT NULL CHECK (item_count BETWEEN 1 AND 5000),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  pdf_path text,
  pdf_uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.print_records
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS pdf_uploaded_at timestamptz;

ALTER TABLE public.print_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.print_sequence FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.print_records FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_print(p_report jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  next_identification bigint;
  report_items jsonb;
BEGIN
  IF jsonb_typeof(p_report) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'The report must be a JSON object';
  END IF;

  report_items := p_report -> 'items';
  IF jsonb_typeof(report_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(report_items) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'The report must contain between 1 and 5000 items';
  END IF;

  INSERT INTO public.print_sequence (id, value)
  SELECT 1, COALESCE(MAX(identification), 0)
  FROM public.print_records
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.print_sequence
  SET value = value + 1
  WHERE id = 1
  RETURNING value INTO next_identification;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The print sequence is not initialized';
  END IF;

  INSERT INTO public.print_records (
    identification,
    of_number,
    client,
    workshop,
    product,
    deposit,
    item_count,
    items,
    pdf_path
  ) VALUES (
    next_identification,
    COALESCE(p_report ->> 'of_number', ''),
    COALESCE(p_report ->> 'client', ''),
    COALESCE(p_report ->> 'workshop', ''),
    COALESCE(p_report ->> 'product', ''),
    COALESCE(p_report ->> 'deposit', ''),
    jsonb_array_length(report_items),
    report_items,
    NULL
  );

  RETURN next_identification;
END;
$function$;

CREATE OR REPLACE FUNCTION public.authorize_print_pdf_upload(p_identification bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.print_records AS records
    WHERE records.identification = p_identification
      AND records.pdf_uploaded_at IS NULL
  );
$function$;

DROP FUNCTION IF EXISTS public.complete_print(bigint);

CREATE OR REPLACE FUNCTION public.complete_print(p_identification bigint, p_pdf_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  existing_pdf_path text;
  existing_pdf_uploaded_at timestamptz;
BEGIN
  SELECT records.pdf_path,
         records.pdf_uploaded_at
  INTO existing_pdf_path,
       existing_pdf_uploaded_at
  FROM public.print_records AS records
  WHERE records.identification = p_identification;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The print record does not exist';
  END IF;

  IF p_pdf_path IS DISTINCT FROM ('relatorios/' || p_identification::text || '.pdf') THEN
    RAISE EXCEPTION 'The PDF path does not match the print identification';
  END IF;

  IF existing_pdf_uploaded_at IS NOT NULL THEN
    IF existing_pdf_path = p_pdf_path THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'The PDF for this print was already archived';
  END IF;

  UPDATE public.print_records AS records
  SET pdf_path = p_pdf_path,
      pdf_uploaded_at = now()
  WHERE records.identification = p_identification
    AND records.pdf_uploaded_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_print(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.authorize_print_pdf_upload(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_print(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_print(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.authorize_print_pdf_upload(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_print(bigint, text) TO service_role;

NOTIFY pgrst, 'reload schema';
