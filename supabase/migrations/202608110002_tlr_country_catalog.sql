begin;

-- TLR 지도 정본에 포함된 국가만 production DB의 canonical catalog로 등록한다.
-- LCW/NAVI의 과거 국가 데이터나 임의 경제 수치는 포함하지 않는다.
create table if not exists public.countries (
  country_key text primary key,
  map_id integer unique not null,
  display_name text not null,
  native_name text,
  short_name text,
  internal_name text,
  map_label text,
  flag_path text,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.countries (
  country_key,map_id,display_name,native_name,short_name,internal_name,map_label,flag_path,color
) values
  ('country-001',1,'컬럼비아 개척연방',null,null,null,'컬럼비아','/assets/country-panels/country-001/flag.png','#143272'),
  ('country-002',2,'대영제국','British Empire',null,null,null,'/assets/country-panels/country-002/flag.png','#2E3A6B'),
  ('country-003',3,'러시아 인민공화국',null,null,null,null,'/assets/country-panels/country-003/flag.png','#991520'),
  ('country-004',4,'러시아 제국',null,null,null,null,'/assets/country-panels/country-004/flag.png','#D5D8D8'),
  ('country-005',5,'노르드 연방',null,null,null,null,'/assets/country-panels/country-005/flag.png','#700F39'),
  ('country-006',6,'발트 연방',null,null,null,null,'/assets/country-panels/country-006/flag.png','#6A7774'),
  ('country-007',7,'오대호 연방',null,null,null,null,'/assets/country-panels/country-007/flag.png','#4C121F'),
  ('country-008',8,'독일민주공화국','Deutsche Demokratische Republik',null,'북독일','독일민주공화국','/assets/country-panels/country-008/flag.png','#7F0400'),
  ('country-009',9,'알라시 공화국',null,null,null,null,'/assets/country-panels/country-009/flag.png','#086858'),
  ('country-010',10,'황러시아',null,null,null,null,'/assets/country-panels/country-010/flag.png','#C1892E'),
  ('country-011',11,'폴란드 사회민주공화국',null,'폴란드',null,'폴란드 사회민주공화국','/assets/country-panels/country-011/flag.png','#A86966'),
  ('country-012',12,'대청제국',null,null,null,null,'/assets/country-panels/country-012/flag.png','#C19700'),
  ('country-013',13,'프랑스 인민공화국','République Populaire Française',null,null,null,'/assets/country-panels/country-013/flag.png','#710000'),
  ('country-014',14,'우크라이나 농민연방공화국',null,'우크라이나',null,'우크라이나 농민연방공화국','/assets/country-panels/country-014/flag.png','#9B0900'),
  ('country-015',15,'몽골국',null,null,null,null,'/assets/country-panels/country-015/flag.png','#7F4600'),
  ('country-016',16,'보헤미아 인민공화국',null,null,null,'보헤미아','/assets/country-panels/country-016/flag.png','#8E3044'),
  ('country-017',17,'바이에른사회주의공화국','Sozialistische Republik Bayern',null,'남독일','바이에른사회주의공화국','/assets/country-panels/country-017/flag.png','#BC0000'),
  ('country-018',18,'대일본제국',null,null,null,null,'/assets/country-panels/country-018/flag.png','#842B35'),
  ('country-019',19,'헝가리 인민공화국',null,null,null,null,'/assets/country-panels/country-019/flag.png','#771C28'),
  ('country-020',20,'신강 공화국',null,null,null,null,'/assets/country-panels/country-020/flag.png','#258986'),
  ('country-021',21,'오스트리아 인민공화국',null,null,null,'오스트리아','/assets/country-panels/country-021/flag.png','#91001F'),
  ('country-022',22,'루마니아 사회주의 공화국',null,null,null,'루마니아','/assets/country-panels/country-022/flag.png','#967C1C'),
  ('country-023',23,'스위스 연방',null,null,null,null,'/assets/country-panels/country-023/flag.png','#C62525'),
  ('country-024',24,'이탈리아 인민공화국',null,'이탈리아',null,'이탈리아 인민공화국','/assets/country-panels/country-024/flag.png','#B21F00'),
  ('country-025',25,'유고슬라비아 인민연방공화국',null,null,null,'유고슬라비아','/assets/country-panels/country-025/flag.png','#720003'),
  ('country-026',26,'캅카스 인민연방공화국',null,null,null,'캅카스','/assets/country-panels/country-026/flag.png','#702B39'),
  ('country-027',27,'투르키스탄 민주인민공화국',null,null,null,'투르키스탄','/assets/country-panels/country-027/flag.png','#99292E'),
  ('country-028',28,'대한제국',null,null,null,null,'/assets/country-panels/country-028/flag.png','#15294C'),
  ('country-029',29,'이베리아 사회주의 공화국',null,null,null,'이베리아','/assets/country-panels/country-029/flag.png','#A71818'),
  ('country-030',30,'아라곤 자유지대',null,'자유지대',null,'아라곤 자유지대','/assets/country-panels/country-030/flag.png','#2D2C2D'),
  ('country-031',31,'오스만 제국',null,null,null,null,'/assets/country-panels/country-031/flag.png','#063D0D'),
  ('country-032',32,'이란 입헌왕국',null,null,null,null,'/assets/country-panels/country-032/flag.png','#19562E'),
  ('country-033',33,'노바 메히코 연방',null,null,null,null,'/assets/country-panels/country-033/flag.png','#FFDCBA'),
  ('country-034',34,'작센-초 연합왕국',null,null,null,'작센-초','/assets/country-panels/country-034/flag.png','#0F6D3D'),
  ('country-035',35,'티베트 왕국',null,null,null,null,'/assets/country-panels/country-035/flag.png','#897351'),
  ('country-036',36,'신프로이센 왕국',null,null,null,null,'/assets/country-panels/country-036/flag.png','#494C4C'),
  ('country-037',37,'카리브 연방',null,null,null,'카리브','/assets/country-panels/country-037/flag.png','#2CA593'),
  ('country-038',38,'사천 공화국',null,null,null,'사천 공화국','/assets/country-panels/country-038/flag.png','#0D6496'),
  ('country-039',39,'신도나우 연합제국',null,null,null,null,'/assets/country-panels/country-039/flag.png','#79687F'),
  ('country-040',40,'사우디아라비아 제2국가',null,null,null,null,'/assets/country-panels/country-040/flag.png','#096013'),
  ('country-041',41,'네팔 왕국',null,null,null,null,'/assets/country-panels/country-041/flag.png','#A09C66'),
  ('country-042',42,'신프랑스 연방왕국',null,null,null,'신프랑스','/assets/country-panels/country-042/flag.png','#244E82'),
  ('country-043',43,'신사보이 왕국',null,null,null,null,'/assets/country-panels/country-043/flag.png','#0D7C18'),
  ('country-044',44,'만데 연방',null,null,null,null,'/assets/country-panels/country-044/flag.png','#246D65'),
  ('country-045',45,'광둥 해양공화국',null,null,null,null,'/assets/country-panels/country-045/flag.png','#1C3D70'),
  ('country-046',46,'그란콜롬비아 연방',null,null,null,null,'/assets/country-panels/country-046/flag.png','#D3B347'),
  ('country-047',47,'소코토 연방',null,null,null,null,'/assets/country-panels/country-047/flag.png','#546830'),
  ('country-048',48,'에티오피아 제국',null,null,null,null,'/assets/country-panels/country-048/flag.png','#AE96B7'),
  ('country-049',49,'대브라질 제국',null,null,null,null,'/assets/country-panels/country-049/flag.png','#244E46'),
  ('country-050',50,'아샨티 제국',null,null,null,null,'/assets/country-panels/country-050/flag.png','#A57B5D'),
  ('country-051',51,'벨기에-콩고 왕령',null,null,null,null,'/assets/country-panels/country-051/flag.png','#C4AA00'),
  ('country-052',52,'페루-볼리비아 연방',null,null,null,'페루-볼리비아','/assets/country-panels/country-052/flag.png','#9E5F5D'),
  ('country-053',53,'오라녜-누산타라 연합왕국',null,null,null,'오라녜-누산타라','/assets/country-panels/country-053/flag.png','#A8530D'),
  ('country-054',54,'칠레 공화국',null,null,null,'칠레','/assets/country-panels/country-054/flag.png','#9E8487'),
  ('country-055',55,'로디지아 인권동맹연방',null,null,null,'로디지아','/assets/country-panels/country-055/flag.png','#9F4E46'),
  ('country-056',56,'아르헨티나 공화국',null,null,null,null,'/assets/country-panels/country-056/flag.png','#6D9AA5'),
  ('country-057',57,'캐나다 자치령','Dominion of Canada',null,null,'캐나다 자치령','/assets/country-panels/country-057/flag.png','#465584'),
  ('country-058',58,'영국령 인도','British India',null,null,'영국령 인도','/assets/country-panels/country-058/flag.png','#53628F'),
  ('country-059',59,'필리핀 제도정부','Philippines',null,null,'필리핀','/assets/country-panels/country-059/flag.png','#315895'),
  ('country-060',60,'오스트레일리아 연방','Australia',null,null,'오스트레일리아','/assets/country-panels/country-060/flag.png','#3F507F'),
  ('country-061',61,'남아프리카 연방','Union of South Africa','남아프리카',null,'남아프리카 연방','/assets/country-panels/country-061/flag.png','#4B5C88'),
  ('country-062',62,'뉴질랜드 자치령','New Zealand',null,null,'뉴질랜드','/assets/country-panels/country-062/flag.png','#5B6996')
on conflict (country_key) do update set
  map_id=excluded.map_id,
  display_name=excluded.display_name,
  native_name=excluded.native_name,
  short_name=excluded.short_name,
  internal_name=excluded.internal_name,
  map_label=excluded.map_label,
  flag_path=excluded.flag_path,
  color=excluded.color,
  active=true,
  updated_at=now();

alter table public.countries enable row level security;
drop policy if exists countries_public_read on public.countries;
create policy countries_public_read on public.countries for select using (active);
grant select on public.countries to anon, authenticated;
revoke insert, update, delete on public.countries from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='country_ownerships_country_catalog_fk') then
    alter table public.country_ownerships add constraint country_ownerships_country_catalog_fk
      foreign key (country_key) references public.countries(country_key);
  end if;
  if not exists (select 1 from pg_constraint where conname='country_economies_country_catalog_fk') then
    alter table public.country_economies add constraint country_economies_country_catalog_fk
      foreign key (country_key) references public.countries(country_key);
  end if;
  if not exists (select 1 from pg_constraint where conname='country_resources_country_catalog_fk') then
    alter table public.country_resources add constraint country_resources_country_catalog_fk
      foreign key (country_key) references public.countries(country_key);
  end if;
  if not exists (select 1 from pg_constraint where conname='research_projects_country_catalog_fk') then
    alter table public.research_projects add constraint research_projects_country_catalog_fk
      foreign key (country_key) references public.countries(country_key);
  end if;
  if not exists (select 1 from pg_constraint where conname='research_investments_country_catalog_fk') then
    alter table public.research_investments add constraint research_investments_country_catalog_fk
      foreign key (country_key) references public.countries(country_key);
  end if;
  if not exists (select 1 from pg_constraint where conname='research_audit_logs_country_catalog_fk') then
    alter table public.research_audit_logs add constraint research_audit_logs_country_catalog_fk
      foreign key (country_key) references public.countries(country_key);
  end if;
end $$;

commit;
