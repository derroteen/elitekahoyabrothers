
DROP POLICY IF EXISTS "View attendance sheets" ON public.attendance_sheets;
CREATE POLICY "View attendance sheets" ON public.attendance_sheets
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.attendance_entries ae
    WHERE ae.sheet_id = attendance_sheets.id AND ae.member_id = auth.uid()
  )
);
