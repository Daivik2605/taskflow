-- User :'uid' made their own tags in phase 2 (Settings → Areas), some colliding with the new tree.
insert into taskflow_areas (user_id, name, kind, color, sort) values
  (:'uid', 'Reading', 'focus', '#111111', 20),
  (:'uid', 'Gym', 'wellbeing', '#222222', 21),
  (:'uid', 'Tableau Data Analyst Certification', 'focus', '#333333', 22),
  (:'uid', 'Errands', 'life', '#444444', 23),
  (:'uid', 'Friends', 'social', '#555555', 24);
insert into taskflow_tasks (user_id, title, area_id, sort)
  select :'uid', t.title, (select id from taskflow_areas where user_id = :'uid' and name = t.area), 200 + t.n
  from (values ('Read a book', 'Reading', 1), ('Leg day', 'Gym', 2), ('Tableau practice test', 'Tableau Data Analyst Certification', 3),
               ('Buy stamps', 'Errands', 4), ('Dinner with friends', 'Friends', 5), ('Read Tableau guide (B)', 'Tableau cert', 6)) as t(title, area, n);
