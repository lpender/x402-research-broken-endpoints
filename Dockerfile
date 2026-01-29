FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    curl \
    git \
    bash

# Install taskfile.dev
RUN sh -c "$(curl -L https://taskfile.dev/install.sh)" -- -b /usr/local/bin

# Create developer user (UID 1000 to match typical host user)
RUN adduser -D -u 1000 developer

# Set working directory
WORKDIR /workspace

# Switch to developer user
USER developer

# Default command
CMD ["bash"]
