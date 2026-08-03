-- ============================================================
-- Team Console — optional demo seed
-- Run AFTER schema.sql. Catalog data (services, categories) is
-- safe anytime. Contacts/tasks are seeded against the first
-- profile, so sign up at least one member first.
-- ============================================================

insert into services (name, default_price) values
  ('Website build', 1800),
  ('Branding package', 900),
  ('Social media management', 450),
  ('SEO audit', 300)
on conflict do nothing;

insert into expense_categories (name) values
  ('tools'),('ads'),('supplies'),('subscriptions'),('travel'),('other')
on conflict (name) do nothing;

do $$
declare owner uuid;
begin
  select id into owner from profiles order by created_at limit 1;
  if owner is null then
    raise notice 'No profiles yet — sign up first, then re-run to seed contacts/tasks.';
    return;
  end if;

  insert into contacts (name, instagram, whatsapp, email, stage, assigned_to, notes, created_by) values
    ('Layal Haddad','layal.studio','+9613111222','','negotiating',owner,'Runs a boutique, wants full rebrand.',owner),
    ('Karim Nassar','','+9617555888','karim@nassar.co','contacted',owner,'',owner),
    ('Maya Fares','maya.f','','','new',owner,'Referral from Karim.',owner);

  insert into tasks (title, created_by, assigned_to, due_date, priority, status) values
    ('Chase warm leads', owner, owner, current_date + 1, 'high', 'open');
end$$;
