CREATE TABLE public.demo_rehab_reports (
 id uuid PRIMARY KEY,
 patient_id text NOT NULL,
 session_id uuid NOT NULL,
 episode_id text NOT NULL,
 payload jsonb NOT NULL,
 report_text text NOT NULL,
 signed_by uuid NOT NULL DEFAULT auth.uid(),
 signed_at timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL DEFAULT 1
);
GRANT SELECT, INSERT ON public.demo_rehab_reports TO authenticated;
GRANT ALL ON public.demo_rehab_reports TO service_role;
ALTER TABLE public.demo_rehab_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read synthetic rehab reports" ON public.demo_rehab_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "staff sign own synthetic rehab reports" ON public.demo_rehab_reports FOR INSERT TO authenticated WITH CHECK (signed_by = auth.uid() AND (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin')));
CREATE INDEX demo_rehab_reports_patient_date ON public.demo_rehab_reports(patient_id, signed_at DESC);
CREATE FUNCTION public.stamp_demo_rehab_report() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authenticated staff required'; END IF;
 IF NOT (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'staff required'; END IF;
 IF NEW.patient_id NOT IN ('p1','p2','p3','p4','p5','p6') THEN RAISE EXCEPTION 'synthetic patient required'; END IF;
 NEW.signed_by := auth.uid();
 NEW.signed_at := now();
 NEW.revision := 1;
 NEW.payload := jsonb_set(jsonb_set(NEW.payload, '{verification}', '"staff-confirmed"'::jsonb), '{recorder}', to_jsonb(auth.uid()::text));
 NEW.payload := jsonb_set(NEW.payload, '{events}', COALESCE((SELECT jsonb_agg(jsonb_set(jsonb_set(e, '{staffVerification}', '"staff-confirmed"'::jsonb), '{recorder}', to_jsonb(auth.uid()::text))) FROM jsonb_array_elements(NEW.payload->'events') e), '[]'::jsonb));
 RETURN NEW;
END;
$$;
CREATE TRIGGER stamp_demo_rehab_report BEFORE INSERT ON public.demo_rehab_reports FOR EACH ROW EXECUTE FUNCTION public.stamp_demo_rehab_report();
COMMENT ON TABLE public.demo_rehab_reports IS 'Synthetic-only structured rehab reports; immutable staff confirmations. Legacy demo_outcomes retained without duplicate writes.';