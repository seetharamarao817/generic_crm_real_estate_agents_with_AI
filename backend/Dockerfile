# backend/Dockerfile
FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements or pyproject.toml
# Since we use hatchling and pyproject.toml, we can install the package directly
COPY pyproject.toml .
# If there are local dependencies or files needed for install
COPY app/ app/
COPY alembic/ alembic/
COPY alembic.ini .
COPY run.py .

# Install dependencies
RUN pip install .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8000

# Start command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
