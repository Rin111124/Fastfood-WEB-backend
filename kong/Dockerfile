FROM kong:3.6

# Copy the declarative config (DB-less)
COPY kong.yml /kong/declarative/kong.yml

ENV KONG_DATABASE=off \
    KONG_DECLARATIVE_CONFIG=/kong/declarative/kong.yml \
    KONG_PROXY_ACCESS_LOG=/dev/stdout \
    KONG_PROXY_ERROR_LOG=/dev/stderr \
    KONG_ADMIN_LISTEN=off \
    KONG_NGINX_WORKER_PROCESSES=1 \
    KONG_NGINX_WORKER_CONNECTIONS=1024 \
    KONG_PROXY_LISTEN=0.0.0.0:8000

EXPOSE 8000

# Railway injects $PORT; forward it to Kong's proxy listener
CMD [ "sh", "-c", "KONG_PROXY_LISTEN=0.0.0.0:${PORT:-8000} kong start" ]
