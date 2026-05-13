-- Fix 1: clock_control_settings - restrict to admin only
DROP POLICY "Authenticated can manage clock_control_settings" ON public.clock_control_settings;
CREATE POLICY "Admins can manage clock_control_settings" ON public.clock_control_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: schedule_ai_conversations - restrict to admin only
DROP POLICY "Authenticated can manage schedule_ai_conversations" ON public.schedule_ai_conversations;
CREATE POLICY "Admins can manage schedule_ai_conversations" ON public.schedule_ai_conversations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix 3: schedule_ai_memory - restrict to admin only
DROP POLICY "Allow all for authenticated" ON public.schedule_ai_memory;
CREATE POLICY "Admins can manage schedule_ai_memory" ON public.schedule_ai_memory
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix 4: invoice_supplier_chat_messages - restrict to admin only
DROP POLICY "Authenticated can manage supplier chat" ON public.invoice_supplier_chat_messages;
CREATE POLICY "Admins can manage supplier chat" ON public.invoice_supplier_chat_messages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));