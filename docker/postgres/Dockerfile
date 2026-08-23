FROM postgres:17-alpine

# Local development needs TLS because the application rejects non-TLS database
# URLs. `sslmode=require` encrypts the connection without trusting this
# self-signed certificate. Production must use a certificate from its provider.
RUN apk add --no-cache openssl \
  && openssl req -new -x509 -nodes -days 3650 \
    -subj "/CN=digilicense-local-postgres" \
    -keyout /var/lib/postgresql/server.key \
    -out /var/lib/postgresql/server.crt \
  && chown postgres:postgres /var/lib/postgresql/server.key /var/lib/postgresql/server.crt \
  && chmod 600 /var/lib/postgresql/server.key

CMD ["postgres", "-c", "ssl=on", "-c", "ssl_cert_file=/var/lib/postgresql/server.crt", "-c", "ssl_key_file=/var/lib/postgresql/server.key"]
