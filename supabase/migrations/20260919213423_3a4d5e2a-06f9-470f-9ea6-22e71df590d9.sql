
revoke all on function public.update_updated_at_column() from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_admin(uuid) from public, anon;
revoke all on function public.current_employee_id() from public, anon;
revoke all on function public.fortnight_is_closed(uuid) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.fortnight_is_closed(uuid) to authenticated;
