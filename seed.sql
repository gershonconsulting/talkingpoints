-- Pilot client: Valos (Streak pipeline "Valos - LG")
INSERT OR IGNORE INTO clients (slug, name, pipeline_key, email_domains)
VALUES ('valos', 'Valos Srl', 'pipeline:aina.andriamangason@gmail.com:5165361957781504', '');

-- Gershon admin (sees the Valos view for testing; excluded from team matching)
INSERT OR IGNORE INTO members (client_id, email, name, title, is_admin, notify, can_manage)
SELECT id, 'oattia@gmail.com', 'Olivier Attia', 'Gershon Consulting', 1, 0, 1 FROM clients WHERE slug = 'valos';
INSERT OR IGNORE INTO members (client_id, email, name, title, is_admin, notify, can_manage)
SELECT id, 'olivier@gershonconsulting.com', 'Olivier Attia', 'Gershon Consulting', 1, 0, 1 FROM clients WHERE slug = 'valos';

INSERT OR IGNORE INTO client_settings (client_id) SELECT id FROM clients WHERE slug = 'valos';
