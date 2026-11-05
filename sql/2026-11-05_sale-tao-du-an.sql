-- Cho Sale tạo dự án (kể cả đối tác chưa được phân công) + tự gán dự án đó cho người tạo
-- để Sale vẫn nhìn thấy dự án mình vừa tạo. Đồng thời đổi tên "Kho lớn".

drop policy if exists projects_insert_scoped on projects;
create policy projects_insert_scoped on projects for insert
  with check (auth.uid() is not null);

create or replace function public.trg_project_assign_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if my_role() = 'sale' then
    insert into sale_project_assignments (user_id, project_id)
    values (auth.uid(), new.id) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists projects_assign_creator on projects;
create trigger projects_assign_creator after insert on projects
  for each row execute function public.trg_project_assign_creator();

update warehouses set name = 'Kho Trường Thịnh-BD' where code = 'KHO_LON';
