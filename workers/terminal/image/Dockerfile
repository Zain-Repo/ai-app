FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    bash \
    ca-certificates \
    coreutils \
    findutils \
    gawk \
    git \
    grep \
    jq \
    python3 \
    sed \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 1000 --shell /bin/bash sandbox \
  && mkdir -p /workspace \
  && chown sandbox:sandbox /workspace

USER sandbox
WORKDIR /workspace
CMD ["sleep", "infinity"]
