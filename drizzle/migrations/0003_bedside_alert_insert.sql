-- Bedside patient app: a staff-signed-in tablet handed to a (synthetic) patient
-- may add help requests / check-in alerts. Staff-only, synthetic patients only.
GRANT INSERT ON public.demo_alerts TO authenticated;
CREATE POLICY "Staff can add bedside demo alerts"
ON public.demo_alerts FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  AND patient_id IN ('p1','p2','p3','p4','p5','p6')
  AND status = 'open'
  AND priority IN ('critical','high','medium','low')
  AND char_length(quote) <= 1000
);
