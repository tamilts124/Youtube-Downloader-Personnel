# --- Stage 1: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Backend & Final Image ---
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Add a non-root user (Hugging Face recommendation)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

# Copy backend requirements and install
COPY --chown=user backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir --upgrade -r ./backend/requirements.txt

# Copy backend code
COPY --chown=user backend/ ./backend/

# Copy built frontend from Stage 1
COPY --chown=user --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ensure the temp directory exists and is writable (project root level)
RUN mkdir -p /app/temp && chmod 777 /app/temp
ENV TEMP_DIR=/app/temp

# Set the working directory to backend for the CMD
WORKDIR /app/backend

# Default port for Hugging Face is 7860
ENV PORT=8000
EXPOSE 8000

# Run the application
CMD ["python", "main.py"]
