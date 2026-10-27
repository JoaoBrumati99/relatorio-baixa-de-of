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

REVOKE ALL ON FUNCTION public.register_print(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_print(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
