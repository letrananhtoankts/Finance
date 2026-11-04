-- Danh mục chuẩn Trường Thịnh (bảng giá 01/10/2026): thêm cột trọng lượng + lớp mạ,
-- thêm Xà gồ vuông L=1500, sửa trị giá XGH1500, gộp 2 cặp mã trùng, chuẩn hóa thứ tự.
alter table public.categories add column if not exists weight_kg numeric(8,2);
alter table public.categories add column if not exists coating text;

insert into public.categories (group_id, code, name, unit, ref_value, is_convertible, sort_order)
select 'D','XGV1500','Xà gồ vuông 50x50x1.8, L=1500','Cây',84000,true,2
where not exists (select 1 from public.categories where code='XGV1500');

update public.categories set ref_value=124000 where code='XGH1500';

do $$
declare p record; f uuid; t uuid;
begin
  for p in select * from (values ('XGH1500B','XGH1500'),('CD1200','NECD1200')) v(a,b) loop
    select id into f from public.categories where code=p.a;
    select id into t from public.categories where code=p.b;
    continue when f is null or t is null;
    delete from public.maintenance_flags m where m.category_id=f and exists (select 1 from public.maintenance_flags x where x.category_id=t and x.warehouse_id=m.warehouse_id);
    delete from public.project_equipment_needs m where m.category_id=f and exists (select 1 from public.project_equipment_needs x where x.category_id=t and x.project_id=m.project_id);
    delete from public.project_rate_overrides m where m.category_id=f and exists (select 1 from public.project_rate_overrides x where x.category_id=t and x.project_id=m.project_id and x.effective_from=m.effective_from);
    delete from public.partner_rates m where m.category_id=f and exists (select 1 from public.partner_rates x where x.category_id=t and x.partner_id=m.partner_id and x.effective_from=m.effective_from);
    update public.transfer_note_items set category_id=t where category_id=f;
    update public.partner_rates set category_id=t where category_id=f;
    update public.project_rate_overrides set category_id=t where category_id=f;
    update public.asset_units set category_id=t where category_id=f;
    update public.asset_conversions set category_id_from=t where category_id_from=f;
    update public.asset_conversions set category_id_to=t where category_id_to=f;
    update public.surplus_records set category_id=t where category_id=f;
    update public.maintenance_flags set category_id=t where category_id=f;
    update public.billing_statement_lines set category_id=t where category_id=f;
    update public.hao_hut_statements set category_id=t where category_id=f;
    update public.equipment_forecasts set category_id=t where category_id=f;
    update public.project_equipment_needs set category_id=t where category_id=f;
    update public.categories set bundle_qty=coalesce(bundle_qty,(select bundle_qty from public.categories where id=f)) where id=t;
    delete from public.categories where id=f;
  end loop;
end $$;

-- Thứ tự, trọng lượng (kg, +/-5%), lớp mạ theo bảng giá chuẩn
update public.categories c set sort_order=v.s, weight_kg=v.w, coating=v.m
from (values
 ('RL1000',1,4.6,'Kẽm nóng'),('RL1500',2,6.7,'Kẽm nóng'),('RL2000',3,9.0,'Kẽm nóng'),('RL2500',4,10.8,'Kẽm nóng'),
 ('RLCD1200',5,4.2,'Kẽm lạnh'),('RLCS1200',6,10.5,'Kẽm lạnh'),
 ('RLGN600',7,2.0,'Kẽm nóng'),('RLGN900',8,2.7,'Kẽm nóng'),('RLGN1200',9,3.2,'Kẽm nóng'),
 ('RLGX1580',10,3.9,'Kẽm nóng'),('RLGX1700',11,4.1,'Kẽm nóng'),('RLGX1830',12,4.5,'Kẽm nóng'),
 ('CN1000',1,3.5,'Kẽm lạnh'),('CN1500',2,4.7,'Kẽm lạnh'),('CN2000',3,5.8,'Kẽm lạnh'),('CN2500',4,7.5,'Kẽm lạnh'),
 ('NECD1200',5,4.0,'Kẽm lạnh'),('NECS1200',6,8.9,'Kẽm lạnh'),('GN600',7,1.4,'Kẽm lạnh'),('GN1200',8,2.5,'Kẽm lạnh'),
 ('GGHKN',1,15.0,'Kẽm nóng'),('GGH',2,13.0,'Kẽm lạnh'),('CHEO',3,2.8,'Kẽm lạnh'),('MAM',4,14.0,'Kẽm lạnh'),('THANG',5,24.0,'Kẽm lạnh'),
 ('DAMI1700',6,28.0,'Sơn dầu'),('DAMI3000',7,44.0,'Sơn dầu'),('DAMI3400',8,50.0,'Sơn dầu'),
 ('XGV1000',1,2.8,'Kẽm lạnh'),('XGV1500',2,4.2,'Kẽm lạnh'),('XGV2000',3,5.6,'Kẽm lạnh'),('XGV3000',4,8.4,'Kẽm lạnh'),('XGV4000',5,11.2,'Kẽm lạnh'),('XGV6000',6,16.8,'Kẽm lạnh'),
 ('XGH1000',7,4.1,'Kẽm lạnh'),('XGH1500',8,6.2,'Kẽm lạnh'),('XGH2000',9,8.2,'Kẽm lạnh'),('XGH3000',10,12.3,'Kẽm lạnh'),('XGH4000',11,16.4,'Kẽm lạnh'),('XGH6000',12,24.6,'Kẽm lạnh'),
 ('OT3000',13,6.9,'Kẽm lạnh'),('OT6000',14,13.8,'Kẽm lạnh'),
 ('KD34',1,2.1,'Sơn dầu'),('KU34',2,2.0,'Sơn dầu'),('KD38',3,3.4,'Sơn dầu'),('KU38',4,3.3,'Sơn dầu'),
 ('GONG1000',5,6.0,'Kẽm lạnh'),('BATD17',6,0.6,'Gang đúc'),('CX49',7,0.6,'Xi mạ')
) as v(code,s,w,m) where c.code=v.code;

refresh materialized view public.asset_summary;
