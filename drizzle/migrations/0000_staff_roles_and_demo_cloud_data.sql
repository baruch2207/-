create type public.app_role as enum ('staff', 'admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select, insert on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create policy "Users can read own roles"
on public.user_roles for select to authenticated
using (auth.uid() = user_id);

-- Demo only: a signed-in user may self-grant the 'staff' role (never 'admin').
create policy "Demo self-grant staff role"
on public.user_roles for insert to authenticated
with check (auth.uid() = user_id and role = 'staff');

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create table public.demo_alerts (
  id text primary key,
  patient_id text not null,
  priority text not null,
  category text not null,
  created_at timestamptz not null,
  quote text not null,
  why text not null,
  uncertainty text not null default '',
  clinician_context text not null default '',
  target_role text not null,
  status text not null default 'open'
);
grant select, update on public.demo_alerts to authenticated;
grant all on public.demo_alerts to service_role;
alter table public.demo_alerts enable row level security;

create policy "Staff can read demo alerts"
on public.demo_alerts for select to authenticated
using (public.has_role(auth.uid(), 'staff'));

create policy "Staff can update demo alert status"
on public.demo_alerts for update to authenticated
using (public.has_role(auth.uid(), 'staff'))
with check (public.has_role(auth.uid(), 'staff'));

create table public.demo_outcomes (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  station text not null,
  outcome text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.demo_outcomes to authenticated;
grant all on public.demo_outcomes to service_role;
alter table public.demo_outcomes enable row level security;

create policy "Staff can read demo outcomes"
on public.demo_outcomes for select to authenticated
using (public.has_role(auth.uid(), 'staff'));

create policy "Staff can record demo outcomes"
on public.demo_outcomes for insert to authenticated
with check (public.has_role(auth.uid(), 'staff'));

-- Synthetic demo alerts (mirror of the client fixtures; no real patient data)
insert into public.demo_alerts (id, patient_id, priority, category, created_at, quote, why, uncertainty, clinician_context, target_role, status) values
  ('s1', 'p6', 'critical', 'chest_pain', now() - interval '27 days', $$יש לי לחץ בחזה מהבוקר$$, $$דיווח על כאב/לחץ בחזה$$, $$זיהוי מבוסס מילות מפתח; ייתכן פירוש שגוי.$$, $$מחלת לב ברקע$$, $$רופא/ה$$, 'open'),
  ('s2', 'p6', 'critical', 'breathing', now() - interval '26 days', $$קשה לי לנשום כשאני הולך$$, $$דיווח על קושי בנשימה$$, $$זיהוי מבוסס מילות מפתח; ייתכן פירוש שגוי.$$, $$שיקום אחרי דלקת ריאות$$, $$אח/ות$$, 'acknowledged'),
  ('s3', 'p2', 'critical', 'suicidality', now() - interval '25 days', $$לפעמים אני לא רוצה לחיות ככה$$, $$ביטוי למחשבות אובדניות$$, $$ביטוי עשוי להיות מטפורי – נדרשת הערכה אנושית.$$, $$מעקב פסיכולוגי שבועי$$, $$פסיכולוג/ית$$, 'acknowledged'),
  ('s4', 'p2', 'critical', 'neuro', now() - interval '24 days', $$פתאום היד שלי לא זזה$$, $$סימן אפשרי לשינוי נוירולוגי חד$$, $$ייתכן תיאור של חולשה קיימת.$$, $$חולשת צד ימין ידועה$$, $$רופא/ה$$, 'resolved'),
  ('s5', 'p4', 'high', 'abuse', now() - interval '23 days', $$הבן שלי לוקח לי את הכסף$$, $$חשד לניצול כלכלי$$, $$זיהוי מבוסס מילות מפתח; ייתכן פירוש שגוי.$$, $$מעט ביקורים$$, $$עובד/ת סוציאלי/ת$$, 'open'),
  ('s6', 'p1', 'high', 'fall', now() - interval '22 days', $$נפלתי ליד המיטה בלילה$$, $$דיווח על נפילה$$, $$זיהוי מבוסס מילות מפתח; ייתכן פירוש שגוי.$$, $$סיכון נפילה גבוה$$, $$אח/ות$$, 'resolved'),
  ('s7', 'p1', 'medium', 'verification', now() - interval '26 days', $$הלכתי היום 200 מטר לבד$$, $$סתירה למדד מאושר (25 מטר בהשגחה)$$, $$עדות סובייקטיבית; לא נדרס המדד המאושר.$$, $$הליכה בהשגחה בלבד$$, $$פיזיותרפיסט/ית$$, 'open'),
  ('s8', 'p3', 'medium', 'distress', now() - interval '27 days', $$הכאב נורא, אני לא אעמוד בזה$$, $$מצוקה סביב כאב$$, $$זיהוי מבוסס מילות מפתח; ייתכן פירוש שגוי.$$, $$קטסטרופיזציה מתועדת$$, $$אח/ות$$, 'open'),
  ('s9', 'p5', 'low', 'verification', now() - interval '25 days', $$אני כבר עולה מדרגות בלי מעקה$$, $$סתירה למטרה מאושרת$$, $$זיהוי מבוסס מילות מפתח; ייתכן פירוש שגוי.$$, $$מטרה: 3 מדרגות עם מעקה$$, $$פיזיותרפיסט/ית$$, 'acknowledged'),
  ('s10', 'p4', 'medium', 'distress', now() - interval '21 days', $$אף אחד לא בא אליי$$, $$בדידות בולטת$$, $$זיהוי מבוסס מילות מפתח; ייתכן פירוש שגוי.$$, $$עו"ס בודקת מתנדבת$$, $$עובד/ת סוציאלי/ת$$, 'resolved'),
  ('s11', 'p3', 'high', 'chest_pain', now() - interval '20 days', $$כואב לי בחזה כשאני מתכופף$$, $$דיווח על כאב בחזה$$, $$ייתכן כאב שרירי – נדרשת בדיקה.$$, $$ללא רקע לבבי ידוע$$, $$רופא/ה$$, 'resolved');