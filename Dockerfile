FROM caddy:2-alpine
COPY index.html /srv/index.html
COPY assets /srv/assets
COPY music /srv/music
CMD caddy file-server --root /srv --listen :${PORT:-8080}
