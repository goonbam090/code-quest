FROM denoland/deno:alpine-2.9.4@sha256:13851184d6705150b8b230c5377f26c3bd182865d28700bb72bc0b2c271b504a

WORKDIR /app
COPY deno.json deno.lock ./
COPY src ./src
RUN deno cache --frozen src/server.js src/evaluator_test.js src/server_test.js \
    && deno test --frozen --no-prompt --allow-run=/bin/deno \
      src/evaluator_test.js src/server_test.js \
    && addgroup -S quest \
    && adduser -S -G quest -u 10002 quest

USER quest
ENV PORT=3003
ENV DENO_NO_UPDATE_CHECK=1
EXPOSE 3003
ENTRYPOINT ["deno", "run", "--cached-only", "--frozen", "--quiet", "--no-prompt", "--allow-net=0.0.0.0:3003", "--allow-run=/bin/deno", "--allow-env=PORT,JAVASCRIPT_RUNNER_TOKEN", "src/server.js"]
