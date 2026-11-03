-- Phân quyền Sale: nhiều khách hàng + gán riêng theo dự án; vá 2 lỗi bảo mật sẵn có.
-- Chạy 1 lần trên Supabase (SQL Editor). Toàn bộ nằm trong 1 giao dịch: lỗi ở đâu thì hoàn tác hết.
begin;

-- 1) Hai bảng gán -------------------------------------------------------------
create table if not exists public.sale_partner_assignments (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, partner_id)
);
create table if not exists public.sale_project_assignments (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
alter table public.sale_partner_assignments enable row level security;
alter table public.sale_project_assignments enable row level security;

create policy spa_select on public.sale_partner_assignments for select to authenticated
  using (is_admin() or user_id = auth.uid());
create policy spa_write on public.sale_partner_assignments for all to authenticated
  using (is_admin()) with check (is_admin());
create policy spra_select on public.sale_project_assignments for select to authenticated
  using (is_admin() or user_id = auth.uid());
create policy spra_write on public.sale_project_assignments for all to authenticated
  using (is_admin()) with check (is_admin());

-- chuyển phân công cũ (1 Sale – 1 khách hàng) sang bảng mới; giữ nguyên cột cũ để có đường lui
insert into public.sale_partner_assignments(user_id, partner_id)
select id, assigned_partner_id from public.profiles
where role::text = 'sale' and assigned_partner_id is not null
on conflict do nothing;

-- 2) Hàm kiểm tra quyền (SECURITY DEFINER: đọc thẳng bảng, không bị RLS làm rỗng kết quả) --
-- Sale được gán theo khách hàng
create or replace function public.partner_assigned(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when my_role() <> 'sale' then true
    when p is null then true
    else exists (select 1 from sale_partner_assignments a where a.user_id = auth.uid() and a.partner_id = p)
  end;
$$;

-- Dùng cho dữ liệu cấp khách hàng (giá khung, kỳ chốt bill): thấy nếu được gán khách hàng
-- HOẶC được gán riêng ít nhất 1 dự án của khách hàng đó (cần giá khung để hiểu giá dự án).
create or replace function public.partner_visible(p_partner_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when my_role() <> 'sale' then true
    when p_partner_id is null then true
    else exists (select 1 from sale_partner_assignments a where a.user_id = auth.uid() and a.partner_id = p_partner_id)
      or exists (select 1 from sale_project_assignments b join projects pr on pr.id = b.project_id
                 where b.user_id = auth.uid() and pr.partner_id = p_partner_id)
  end;
$$;

-- Dùng cho dữ liệu cấp dự án: thấy nếu được gán khách hàng của dự án HOẶC được gán riêng dự án đó.
create or replace function public.project_visible(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when my_role() <> 'sale' then true
    when pid is null then true
    else exists (
      select 1 from projects pr
      where pr.id = pid and (
        exists (select 1 from sale_partner_assignments a where a.user_id = auth.uid() and a.partner_id = pr.partner_id)
        or exists (select 1 from sale_project_assignments b where b.user_id = auth.uid() and b.project_id = pr.id))
    )
  end;
$$;

-- 3) Chuyển các policy cấp dự án sang project_visible (sửa luôn lỗi Sale thấy phiếu của khách khác) --
alter policy billing_adjustments_insert_scoped on public.billing_adjustments
  with check (auth.uid() is not null and project_visible(project_id));
alter policy billing_adjustments_select_scoped on public.billing_adjustments
  using (auth.uid() is not null and project_visible(project_id));

alter policy billing_statement_lines_select_scoped on public.billing_statement_lines
  using (auth.uid() is not null and exists (
    select 1 from billing_statements bs where bs.id = billing_statement_lines.statement_id and project_visible(bs.project_id)));

alter policy billing_statements_insert_scoped on public.billing_statements
  with check (auth.uid() is not null and project_visible(project_id));
alter policy billing_statements_select_scoped on public.billing_statements
  using (auth.uid() is not null and project_visible(project_id));
alter policy billing_statements_update_scoped on public.billing_statements
  using (auth.uid() is not null and status <> 'closed' and project_visible(project_id));

alter policy equipment_forecasts_delete_scoped on public.equipment_forecasts
  using (auth.uid() is not null and project_visible(project_id));
alter policy equipment_forecasts_insert_scoped on public.equipment_forecasts
  with check (auth.uid() is not null and project_visible(project_id));
alter policy equipment_forecasts_select_scoped on public.equipment_forecasts
  using (auth.uid() is not null and project_visible(project_id));
alter policy equipment_forecasts_update_scoped on public.equipment_forecasts
  using (auth.uid() is not null and project_visible(project_id));

alter policy hao_hut_statements_insert_scoped on public.hao_hut_statements
  with check (auth.uid() is not null and project_visible(project_id));
alter policy hao_hut_statements_select_scoped on public.hao_hut_statements
  using (auth.uid() is not null and project_visible(project_id));

alter policy project_equipment_needs_insert_scoped on public.project_equipment_needs
  with check (auth.uid() is not null and project_visible(project_id));
alter policy project_equipment_needs_select_scoped on public.project_equipment_needs
  using (auth.uid() is not null and project_visible(project_id));
alter policy project_equipment_needs_update_scoped on public.project_equipment_needs
  using (auth.uid() is not null and project_visible(project_id));

alter policy project_rate_overrides_insert_scoped on public.project_rate_overrides
  with check (auth.uid() is not null and project_visible(project_id));
alter policy project_rate_overrides_select_scoped on public.project_rate_overrides
  using (auth.uid() is not null and project_visible(project_id));

alter policy projects_select_scoped on public.projects
  using (auth.uid() is not null and project_visible(id));
alter policy projects_update_scoped on public.projects
  using (auth.uid() is not null and project_visible(id));
alter policy projects_insert_scoped on public.projects
  with check (auth.uid() is not null and partner_assigned(partner_id));

alter policy transfer_note_items_select_scoped on public.transfer_note_items
  using (auth.uid() is not null and exists (
    select 1 from transfer_notes tn where tn.id = transfer_note_items.transfer_note_id and project_visible(tn.project_id)));

alter policy transfer_notes_insert_scoped on public.transfer_notes
  with check (auth.uid() is not null and project_visible(project_id));
alter policy transfer_notes_select_scoped on public.transfer_notes
  using (auth.uid() is not null and project_visible(project_id));
alter policy transfer_notes_update_scoped on public.transfer_notes
  using (auth.uid() is not null and project_visible(project_id));
-- billing_periods, partner_rates: giữ nguyên, vẫn dùng partner_visible (cấp khách hàng).

-- 4) Vá lỗi: người dùng thường tự đổi vai trò / khách hàng phụ trách của chính mình --------------
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email
       or new.assigned_partner_id is distinct from old.assigned_partner_id then
      raise exception 'Chỉ Admin được đổi vai trò, trạng thái hoặc phân công của tài khoản.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

commit;
