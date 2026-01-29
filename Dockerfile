FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    curl \
    git \
    bash

# Install taskfile.dev
RUN sh -c "$(curl -L https://taskfile.dev/install.sh)" -- -b /usr/local/bin

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Add alias for claude with skip permissions
RUN echo 'alias cc="claude --dangerously-skip-permissions"' >> /home/node/.bashrc

# Set working directory
WORKDIR /workspace

# Use existing node user (UID 1000)
USER node

# Default command
CMD ["bash"]
