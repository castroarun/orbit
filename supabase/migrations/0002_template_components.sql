-- Keep each template's full layout (heading, body, footer, buttons) for previews.
alter table orbit.templates add column if not exists components jsonb;
