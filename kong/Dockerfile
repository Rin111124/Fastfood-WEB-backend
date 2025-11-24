FROM kong:3.6

# Install envsubst for runtime templating (no secrets baked into image)
USER root
RUN set -eux; \
    mkdir -p /var/lib/apt/lists/partial; \
    apt-get update; \
    apt-get install -y --no-install-recommends gettext-base; \
    rm -rf /var/lib/apt/lists/*
USER kong

# Copy the declarative config template (will be materialized at runtime)
USER root
COPY kong.yml /kong/declarative/kong.template.yml
# Ensure Kong user can write rendered config
RUN chown -R kong:kong /kong && chmod -R u+w /kong/declarative
USER kong

ENV KONG_DATABASE=off \
    KONG_DECLARATIVE_CONFIG=/kong/declarative/kong.yml \
    KONG_PROXY_ACCESS_LOG=/dev/stdout \
    KONG_PROXY_ERROR_LOG=/dev/stderr \
    KONG_ADMIN_LISTEN=off \
    KONG_NGINX_WORKER_PROCESSES=1 \
    KONG_NGINX_WORKER_CONNECTIONS=1024 \
    KONG_PROXY_LISTEN=0.0.0.0:8000 \
    KONG_CONSUMER_KEY= \
    KONG_BACKEND_URL=http://backend:3000

EXPOSE 8000

# Railway injects $PORT; materialize kong.yml from template with env vars, then start
CMD [ "sh", "-c", "envsubst < /kong/declarative/kong.template.yml > /kong/declarative/kong.yml && KONG_PROXY_LISTEN=0.0.0.0:${PORT:-8000} kong start" ]
