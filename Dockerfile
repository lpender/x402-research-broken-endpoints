FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    curl \
    git \
    bash

# Install taskfile.dev
RUN sh -c "$(curl -L https://taskfile.dev/install.sh)" -- -b /usr/local/bin

# Set working directory
WORKDIR /workspace

# Use existing node user (UID 1000)
USER node

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add alias for claude with skip permissions and ensure PATH includes claude
RUN echo 'export PATH="$HOME/.claude/local/bin:$PATH"' >> /home/node/.bashrc && \
    echo 'alias cc="claude --dangerously-skip-permissions"' >> /home/node/.bashrc

# Default command
CMD ["bash"]
