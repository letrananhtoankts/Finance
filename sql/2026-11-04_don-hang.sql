-- Tab Đơn hàng: đơn đặt hàng theo dự án (đơn 1, 2, 3...) có tiền cọc.
-- Đơn hàng TỔNG của dự án dùng lại bảng project_equipment_needs (Tổng dự án cần) — không tạo bảng mới.
create table if not exists public.project_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  order_no integer not null,
  ngay_dat date,
  ngay_giao_du_kien date,
  status text not null default 'da_dat' check (status in ('da_dat','da_coc','hoan_tat','huy')),
  deposit_amount numeric not null default 0,
  deposit_paid boolean not null default false,
  deposit_date date,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique (project_id, order_no)
);

create table if not exists public.project_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.project_orders(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  qty numeric not null check (qty > 0),
  unique (order_id, category_id)
);

alter table public.project_orders enable row level security;
alter table public.project_order_lines enable row level security;

drop policy if exists project_orders_select on public.project_orders;
drop policy if exists project_orders_write on public.project_orders;
create policy project_orders_select on public.project_orders for select to authenticated
  using (public.project_visible(project_id));
create policy project_orders_write on public.project_orders for all to authenticated
  using (public.project_visible(project_id) and public.my_role() in ('admin','sale','ke_toan'))
  with check (public.project_visible(project_id) and public.my_role() in ('admin','sale','ke_toan'));

drop policy if exists project_order_lines_select on public.project_order_lines;
drop policy if exists project_order_lines_write on public.project_order_lines;
create policy project_order_lines_select on public.project_order_lines for select to authenticated
  using (exists (select 1 from public.project_orders o where o.id = order_id and public.project_visible(o.project_id)));
create policy project_order_lines_write on public.project_order_lines for all to authenticated
  using (exists (select 1 from public.project_orders o where o.id = order_id and public.project_visible(o.project_id)) and public.my_role() in ('admin','sale','ke_toan'))
  with check (exists (select 1 from public.project_orders o where o.id = order_id and public.project_visible(o.project_id)) and public.my_role() in ('admin','sale','ke_toan'));
